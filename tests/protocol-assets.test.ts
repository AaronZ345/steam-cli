import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { deflateSync } from "node:zlib";
import {
  guardCode,
  guardFile,
  masterPacket,
  parseMaster,
  masterServers,
} from "../src/protocol.js";
import {
  imageInfo,
  validateAsset,
  auditAssets,
  uploadAsset,
} from "../src/assets.js";
import { Client } from "../src/http.js";
import { unified } from "../src/content.js";
import vdf from "../src/text-vdf.js";

function png(w: number, h: number): Buffer {
  function crc(b: Buffer): number {
    let n = 0xffffffff;
    for (const v of b) {
      n ^= v;
      for (let j = 0; j < 8; j++) n = n & 1 ? (n >>> 1) ^ 0xedb88320 : n >>> 1;
    }
    return (n ^ 0xffffffff) >>> 0;
  }
  const chunk = (type: string, body: Buffer) => {
    const header = Buffer.alloc(4),
      end = Buffer.alloc(4);
    header.writeUInt32BE(body.length);
    const payload = Buffer.concat([Buffer.from(type), body]);
    end.writeUInt32BE(crc(payload));
    return Buffer.concat([header, payload, end]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", head),
    chunk("IDAT", deflateSync(Buffer.alloc((w * 4 + 1) * h))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
test("text VDF round-trips quotes, Unicode, Windows paths and rejects ambiguous files", () => {
  const obj = {
    Config: {
      path: "C:\\Games\\Portal 2\\",
      options: 'PROTON_LOG=1 "日本語" %command%',
      str: "line\nnext",
    },
  };
  const r = vdf.parse(vdf.stringify(obj));
  assert.deepEqual(JSON.parse(JSON.stringify(r)), obj);
  for (const text of ['"a" "x" "a" "y"', '"a" {', '"a" "unterminated', "}"])
    assert.throws(() => vdf.parse(text));
  assert.equal(vdf.parse('"x" "y" //comment').x, "y");
});
test("master packet encodes filter and pagination safely; bounds never imply completion", async () => {
  const response = Buffer.from([
    255, 255, 255, 255, 102, 10, 1, 2, 3, 4, 0x69, 0x87, 0, 0, 0, 0, 0, 0,
  ]);
  assert.deepEqual(parseMaster(response), {
    items: ["1.2.3.4:27015"],
    complete: true,
  });
  assert.throws(() => masterPacket(255, "0.0.0.0:0", "bad\0filter"));
  assert.throws(() => parseMaster(Buffer.from([0])));
  const r = await masterServers(
    { limit: 1, filter: "\\appid\\620" },
    async (packet) => {
      assert.equal(packet[0], 0x31);
      return response;
    },
  );
  assert.equal(r.complete, true);
  assert.equal(r.items.length, 1);
  const partial = await masterServers({ limit: 1 }, async () =>
    response.subarray(0, -6),
  );
  assert.equal(partial.complete, false);
  assert.equal(partial.next_cursor, "1.2.3.4:27015");
});
test("Steam Guard uses synthetic secrets and UTC time windows without exporting shared secret", (t) => {
  const key = Buffer.alloc(20, 1),
    a = guardCode(key, 600),
    b = guardCode(key, 629),
    c = guardCode(key, 630);
  assert.equal(a.code, b.code);
  assert.notEqual(a.code, c.code);
  assert.equal(a.valid_until, 630);
  assert.match(a.code, /^[23456789BCDFGHJKMNPQRTVWXY]{5}$/);
  const dir = mkdtempSync(path.join(os.tmpdir(), "steam-guard-fixture-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "fixture.maFile");
  writeFileSync(
    file,
    JSON.stringify({ shared_secret: key.toString("base64") }),
    { mode: 0o600 },
  );
  assert.equal(guardFile(file, 600).code, a.code);
  assert.equal(guardFile(file, 600).secret_exported, false);
  chmodSync(file, 0o644);
  if (process.platform !== "win32") assert.throws(() => guardFile(file, 600));
});
test("image validation checks compressed PNG structure, size and CRC before upload preview", async (t) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "steam-assets-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, "headerCapsule.png"),
    data = png(920, 430);
  writeFileSync(file, data);
  assert.equal(imageInfo(data).pixel_stream_validated, true);
  assert.equal(validateAsset(file, "headerCapsule").ok, true);
  assert.equal(validateAsset(file, "mainCapsule").ok, false);
  const broken = Buffer.from(data);
  broken[20] ^= 1;
  assert.throws(() => imageInfo(broken), { code: "INVALID_IMAGE" });
  const audit = auditAssets(dir);
  assert.equal(audit.ok, false);
  assert(audit.missing_slots.includes("smallCapsule"));
  const client = new Client({ session: null });
  try {
    assert.equal(
      (await uploadAsset(client, "620", { file, slot: "headerCapsule" }))
        .dry_run,
      true,
    );
  } finally {
    await client.close();
  }
});
test("unified protocol reports authentication and write errors once without retry", async () => {
  let sent = 0;
  const user = {
    _sendUnified: (_m: any, _p: any, cb: any) => {
      sent++;
      cb({}, { proto: { eresult: 5 } });
    },
  };
  await assert.rejects(
    unified(user, "Cloud.ClientCommitFileUpload#1", {}, true),
    { code: "AUTH_FAILED" },
  );
  assert.equal(sent, 1);
});
