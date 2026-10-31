import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join, relative, resolve } from "node:path";
import { discoverPresets } from "../src/manifests.ts";
import hashes from "../template-hashes.json";
import alphaHashes from "./alpha-template-hashes.json";

test("the released alpha template hashes remain available", () => {
  const known: Record<string, string[]> = hashes;
  for (const [path, versions] of Object.entries(alphaHashes))
    for (const hash of versions) expect(known[path]).toContain(hash);
});

test("each managed template has its release hash recorded", async () => {
  const root = resolve(import.meta.dir, "..");
  const catalog = await discoverPresets(root);
  expect(catalog.ok).toBe(true);
  if (!catalog.ok) return;
  const known: Record<string, string[]> = hashes;
  for (const preset of catalog.presets) {
    for (const file of preset.files) {
      const path = join(preset.directory, file.source);
      const hash = createHash("sha256")
        .update(await Bun.file(path).bytes())
        .digest("hex");
      expect(known[relative(root, path)]).toContain(hash);
    }
  }
});
