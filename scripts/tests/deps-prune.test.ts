import { expect, test } from "bun:test";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pruneRepoBins } from "../deps-prune.ts";

test("prune removes dangling repo links, including Bun global links, and preserves foreign/live links", async () => {
  const temp = mkdtempSync(join(tmpdir(), "deps-prune-"));
  using _cleanup = {
    [Symbol.dispose]: () => {
      rmSync(temp, { recursive: true, force: true });
    },
  };
  const repo = join(temp, "repo");
  const bins = join(temp, "bin");
  const packages = join(temp, "global/node_modules");
  for (const path of [repo, bins, packages])
    mkdirSync(path, { recursive: true });
  writeFileSync(join(repo, "live.ts"), "live");
  symlinkSync(repo, join(packages, "dotfiles"));
  symlinkSync(join(repo, "removed.ts"), join(bins, "direct"));
  symlinkSync(
    "../global/node_modules/dotfiles/renamed.ts",
    join(bins, "global"),
  );
  symlinkSync(join(temp, "foreign/missing.ts"), join(bins, "foreign"));
  symlinkSync(join(repo, "live.ts"), join(bins, "live"));
  symlinkSync(join(temp, "repo-other/missing.ts"), join(bins, "prefix"));
  symlinkSync(join(temp, "foreign"), join(packages, "foreign"));
  symlinkSync(
    "../global/node_modules/foreign/missing.ts",
    join(bins, "foreign-global"),
  );
  writeFileSync(join(bins, "regular"), "keep");
  expect(await pruneRepoBins(repo, bins)).toEqual([
    join(bins, "direct"),
    join(bins, "global"),
  ]);
  for (const name of ["foreign", "prefix", "foreign-global"])
    expect(lstatSync(join(bins, name)).isSymbolicLink()).toBe(true);
  expect(existsSync(join(bins, "live"))).toBe(true);
  expect(existsSync(join(bins, "regular"))).toBe(true);
  expect(await pruneRepoBins(repo, bins)).toEqual([]);
});
