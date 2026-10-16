import { afterEach, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  copyCloneSources,
  freshCloneGateFindings,
  ignoreFindings,
} from "../lint-ignore.ts";

const scratch: string[] = [];
const temporary = () => {
  const path = mkdtempSync(join(realpathSync(tmpdir()), "ignore-symlink-"));
  scratch.push(path);
  return path;
};
afterEach(() => {
  for (const path of scratch.splice(0))
    rmSync(path, { recursive: true, force: true });
});

function compatibilityFixture(root: string): void {
  mkdirSync(join(root, "presets/typescript"), { recursive: true });
  mkdirSync(join(root, "presets/empty"), { recursive: true });
  writeFileSync(join(root, "presets/typescript/package.json"), "preset\n");
  symlinkSync("presets/typescript", join(root, "consumer-repo"));
  symlinkSync("presets/empty", join(root, "empty-link"));
  symlinkSync("presets/typescript/package.json", join(root, "file-link"));
}

test("tracked directory, empty-directory and file symlinks are checked by their own names", () => {
  const root = temporary();
  compatibilityFixture(root);
  mkdirSync(join(root, "git"));
  writeFileSync(
    join(root, "git/gitconfig"),
    "[core]\nexcludesfile = ~/.config/git/ignore\n",
  );
  writeFileSync(join(root, "git/ignore"), "# Owner: fixture\n");
  writeFileSync(join(root, ".gitignore"), "# Owner: fixture\n/unused\n");
  const init = Bun.spawnSync(["jj", "git", "init", "--no-colocate", root], {
    cwd: root,
    timeout: 30_000,
  });
  expect(init.exitCode).toBe(0);
  const baseline = Bun.spawnSync(["jj", "new"], { cwd: root, timeout: 30_000 });
  expect(baseline.exitCode).toBe(0);
  expect(ignoreFindings(root)).toEqual([]);

  // A directory-only rule must not hide the symlink leaf, even when its target is a directory.
  writeFileSync(
    join(root, ".gitignore"),
    "# Owner: fixture\n/consumer-repo/\n",
  );
  expect(ignoreFindings(root)).toEqual([]);
  writeFileSync(
    join(root, ".gitignore"),
    "# Owner: fixture\n/consumer-repo\n/empty-link\n/file-link\n",
  );
  expect(ignoreFindings(root)).toEqual([
    "tracked path is ignored: consumer-repo",
    "tracked path is ignored: empty-link",
    "tracked path is ignored: file-link",
  ]);
});

test("clone copying preserves relative compatibility links and omits their enumerated descendants", () => {
  const root = temporary();
  const clone = temporary();
  compatibilityFixture(root);
  copyCloneSources(root, clone, [
    "consumer-repo",
    "consumer-repo/package.json",
    "presets/typescript/package.json",
    "file-link",
  ]);
  expect(lstatSync(join(clone, "consumer-repo")).isSymbolicLink()).toBe(true);
  expect(readlinkSync(join(clone, "consumer-repo"))).toBe("presets/typescript");
  expect(readlinkSync(join(clone, "file-link"))).toBe(
    "presets/typescript/package.json",
  );
  expect(realpathSync(join(clone, "consumer-repo/package.json"))).toBe(
    join(clone, "presets/typescript/package.json"),
  );
  writeFileSync(join(clone, "consumer-repo/package.json"), "clone only\n");
  expect(
    readFileSync(join(root, "presets/typescript/package.json"), "utf8"),
  ).toBe("preset\n");
});

test("declared ignore rules do not hide tracked files", () => {
  expect(ignoreFindings()).toEqual([]);
});

test("a fresh clone stays clean after representative land-gate tasks", () => {
  expect(freshCloneGateFindings()).toEqual([]);
}, 300_000);
