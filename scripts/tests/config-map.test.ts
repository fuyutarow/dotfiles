// bun test for scripts/config-map.ts — the completeness gate over scripts/config-registry.ts.
// The negative half matters: an unregistered config file and a row naming a missing source must
// each be reported, all in one run; exclusions must stay narrow.
import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { surfaces, type Surface } from "../config-registry.ts";
import { findings, workingTreeConfigFiles } from "../config-map.ts";

const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0))
    rmSync(path, { recursive: true, force: true });
});

test("working-tree inventory follows moves and new files without any VCS metadata", () => {
  const root = mkdtempSync(join(tmpdir(), "config-map-worktree-"));
  scratch.push(root);
  mkdirSync(join(root, "tools/old"), { recursive: true });
  writeFileSync(join(root, "tools/old/package.json"), "{}");
  renameSync(join(root, "tools/old"), join(root, "tools/new"));
  writeFileSync(join(root, "new.toml"), "");
  mkdirSync(join(root, "node_modules/dependency"), { recursive: true });
  writeFileSync(join(root, "node_modules/dependency/package.json"), "{}");
  const listing = workingTreeConfigFiles(root);
  expect(listing.isOk()).toBe(true);
  const files = listing.unwrapOr<string[]>([]);
  expect(files).toEqual(["new.toml", "tools/new/package.json"]);
  expect(
    findings(
      [row(["tools/new", "new.toml"])],
      files,
      (source) => source === "tools/new" || source === "new.toml",
    ),
  ).toEqual([]);
});

test("ignored cache files and deleted configuration files are not reported in a temp checkout", () => {
  const root = mkdtempSync(join(tmpdir(), "config-map-ignore-"));
  scratch.push(root);
  // A non-colocated workspace has no .git directory; .gitignore must still be honored.
  mkdirSync(join(root, ".jj"));
  writeFileSync(
    join(root, ".gitignore"),
    ".rumdl_cache/\n/cache/*.json\n!/cache/keep.json\n",
  );
  mkdirSync(join(root, ".rumdl_cache/0.2.78"), { recursive: true });
  writeFileSync(join(root, ".rumdl_cache/0.2.78/hash.json"), "{}");
  mkdirSync(join(root, "cache"));
  writeFileSync(join(root, "cache/ignored.json"), "{}");
  writeFileSync(join(root, "cache/keep.json"), "{}");
  mkdirSync(join(root, "nested"));
  writeFileSync(join(root, "nested/.gitignore"), "*.json\n!keep.json\n");
  writeFileSync(join(root, "nested/ignored.json"), "{}");
  writeFileSync(join(root, "nested/keep.json"), "{}");
  writeFileSync(join(root, "deleted-tracked.toml"), "");
  expect(workingTreeConfigFiles(root).unwrapOr<string[]>([])).toContain(
    "deleted-tracked.toml",
  );
  rmSync(join(root, "deleted-tracked.toml"));
  const listing = workingTreeConfigFiles(root);
  expect(listing.isOk()).toBe(true);
  const files = listing.unwrapOr<string[]>([]);
  expect(files).toEqual(["cache/keep.json", "nested/keep.json"]);
  expect(
    findings([row(files)], files, (source) => files.includes(source)),
  ).toEqual([]);
  expect(findings([], files)).toHaveLength(2);
});

const row = (sources: string[]): Surface => ({
  kind: "in-place",
  when: "all",
  sources,
  deployed: "the checkout",
  consumer: "test",
  writer: "test",
  verify: "none",
});

describe("config-map findings", () => {
  test("a file under a registered directory or equal to a source is covered", () => {
    expect(
      findings(
        [row(["mise.toml", "karabiner"])],
        ["mise.toml", "karabiner/karabiner.json"],
      ),
    ).toEqual([]);
  });

  test("an unregistered config file is reported", () => {
    const f = findings(
      [row(["mise.toml"])],
      ["mise.toml", "new-tool/config.toml"],
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toStartWith("unregistered: new-tool/config.toml");
  });

  test("a prefix that is not a path segment does not cover (karabiner ≠ karabiner-old)", () => {
    expect(
      findings([row(["karabiner"])], ["karabiner-old/a.json"]),
    ).toHaveLength(1);
  });

  test("tests, fixtures, examples and archives are excluded; a sibling of them is not", () => {
    expect(
      findings(
        [row(["mise.toml"])],
        [
          "a/tests/x.json",
          "a/fixtures/y.json",
          "a/examples/z.json",
          "archives/w.toml",
          "goal.example.json",
        ],
      ),
    ).toEqual([]);
    expect(findings([row(["mise.toml"])], ["a/testsuite/x.json"])).toHaveLength(
      1,
    );
  });

  test("a row naming a missing source is reported, with the unregistered file, in one run", () => {
    const f = findings([row(["no/such/file.toml"])], ["other.json"]);
    expect(
      f
        .map((l) => l.split(":")[0])
        .toSorted((x, y) => (x ?? "").localeCompare(y ?? "")),
    ).toEqual(["missing", "unregistered"]);
  });
});

describe("the live registry", () => {
  test("every source a row names exists in this checkout", () => {
    expect(
      findings(surfaces(), []).filter((l) => l.startsWith("missing:")),
    ).toEqual([]);
  });

  test("every row states a verifier, or the explicit gap `none`", () => {
    expect(surfaces().filter((s) => s.verify.trim() === "")).toEqual([]);
  });

  test("the gate passes on this checkout (mise run lint:config-map)", () => {
    const r = Bun.spawnSync(
      ["bun", join(import.meta.dir, "..", "config-map.ts"), "--check"],
      {
        timeout: 60_000,
      },
    );
    expect(r.stdout.toString()).toContain("every config file is registered");
    expect(r.exitCode).toBe(0);
  });
});
