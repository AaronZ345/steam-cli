import { readFileSync } from "node:fs";
export function coverage(): any {
  const data = JSON.parse(
    readFileSync(new URL("../docs/parity.json", import.meta.url), "utf8"),
  );
  return {
    ...data,
    summary: Object.fromEntries(
      ["native", "partial", "guide", "client-dispatch"].map((s) => [
        s,
        data.entries.filter((e: any) => e.status === s).length,
      ]),
    ),
  };
}
