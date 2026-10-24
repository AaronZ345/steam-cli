import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

// These two runtime dependencies are bundled so installs retain the patched versions.
// Keep their bundled dependency declarations consistent with the tested overrides.
const require = createRequire(import.meta.url);
for (const [name, dependency, range] of [
  ["steam-user", "adm-zip", "^0.6.1"],
  ["steam-appticket", "protobufjs", "^7.6.3"],
]) {
  const file = require.resolve(`${name}/package.json`);
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  pkg.dependencies[dependency] = range;
  pkg.steamCliPatch = {
    purpose: "Align bundled dependency metadata with security fixes",
    dependency,
    range,
  };
  writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
}
