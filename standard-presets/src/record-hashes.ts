import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { discoverPresets } from "./manifests.ts";
import recorded from "../template-hashes.json";

const root = resolve(import.meta.dir, "..");
const path = join(root, "template-hashes.json");
const catalog = await discoverPresets(root);
if (!catalog.ok) {
  process.stderr.write(`${catalog.error}\n`);
  process.exit(2);
}
const hashes: Record<string, string[]> = recorded;
for (const preset of catalog.presets) {
  for (const file of preset.files) {
    const source = join(preset.directory, file.source);
    const key = relative(root, source);
    const hash = createHash("sha256")
      .update(await Bun.file(source).bytes())
      .digest("hex");
    const versions = hashes[key] ?? [];
    hashes[key] = [...new Set([...versions, hash])];
  }
}
await Bun.write(
  path,
  `${JSON.stringify(Object.fromEntries(Object.entries(hashes).toSorted(([a], [b]) => a.localeCompare(b))), null, 2)}\n`,
);
