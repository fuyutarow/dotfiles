// render-oxlintrc --repo: another repo's .oxlintrc.json from THIS policy plus that repo's
// oxlint-policy.local.toml, which may only add ignores. Real child processes, temp repos only.
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "../../agents/hooks/zod.ts";
import { decodedJson } from "../../agents/hooks/tests/decode.ts";
import {
  loadCommittedPolicy,
  loadRepoPolicy,
  renderOxlintrc,
} from "../render-oxlintrc.ts";

const SCRIPT = join(import.meta.dir, "..", "render-oxlintrc.ts");
const render = (...args: string[]): { code: number; text: string } => {
  const r = Bun.spawnSync(["bun", SCRIPT, ...args], { timeout: 30_000 });
  return {
    code: r.exitCode ?? -1,
    text: `${r.stdout.toString()}${r.stderr.toString()}`,
  };
};
const repo = (local?: string): string => {
  const dir = mkdtempSync(join(tmpdir(), "oxlint-repo-"));
  if (local !== undefined)
    writeFileSync(join(dir, "oxlint-policy.local.toml"), local);
  return dir;
};

test("ignores are appended; the rules are this repo's, unchanged; --check then passes", () => {
  const dir = repo(
    'schema = 1\n[[ignore]]\npattern = "research_record"\nreason = "frozen apparatus copies"\n',
  );
  expect(render("--repo", dir, "--write").code).toBe(0);
  const Rc = z.looseObject({
    rules: z.record(z.string(), z.unknown()),
    ignorePatterns: z.array(z.string()),
  });
  const ours = decodedJson(
    Rc,
    readFileSync(join(import.meta.dir, "..", "..", ".oxlintrc.json"), "utf8"),
  );
  const theirs = decodedJson(
    Rc,
    readFileSync(join(dir, ".oxlintrc.json"), "utf8"),
  );
  // The house rules are dotfiles' own; only the dotfiles-scoped ones (the zod import
  // restriction: oxlint-policy.toml scope = "dotfiles") stay behind in dotfiles.
  const { "eslint/no-restricted-imports": ourImports, ...ourRest } = ours.rules;
  const { "eslint/no-restricted-imports": theirImports, ...theirRest } =
    theirs.rules;
  expect(theirRest).toEqual(ourRest);
  expect(JSON.stringify(ourImports)).toContain('"name":"zod"');
  expect(JSON.stringify(theirImports)).not.toContain('"name":"zod"');
  expect(theirs.ignorePatterns).toContain("research_record");
  expect(render("--repo", dir, "--check").text).toContain(
    "rendered from an unrecorded revision",
  );
});

test("missing and empty local policies render identical bytes", async () => {
  const dir = repo();
  expect(render("--repo", dir, "--write").code).toBe(0);
  const path = join(dir, ".oxlintrc.json");
  const absent = await Bun.file(path).text();
  await Bun.write(
    join(dir, "oxlint-policy.local.toml"),
    "schema = 1\nignore = []\n",
  );
  expect(render("--repo", dir, "--check").code).toBe(0);
  expect(render("--repo", dir, "--write").code).toBe(0);
  expect(await Bun.file(path).text()).toBe(absent);
  await unlink(join(dir, "oxlint-policy.local.toml"));
  expect(render("--repo", dir, "--check").code).toBe(0);
});

test("dotfiles' rendered config remains current", () => {
  expect(render("--check").code).toBe(0);
});

test("a consumer cwd without .jj reads the renderer owner's committed policy", async () => {
  const dir = repo();
  expect(await Bun.file(join(dir, ".jj")).exists()).toBe(false);
  for (const flags of [[], ["--write"], ["--check"]]) {
    const child = Bun.spawn(
      [process.execPath, SCRIPT, "--repo", dir, ...flags],
      {
        cwd: dir,
        env: { ...process.env, PWD: dir },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, stdout + stderr).toBe(0);
    if (flags.includes("--check"))
      expect(stdout).toContain("rendered from an unrecorded revision");
    if (flags.length === 0) expect(stdout).toContain('"presetRevision":');
  }
});

test("an unreadable local path or malformed TOML is refused", async () => {
  const dir = repo();
  await mkdir(join(dir, "oxlint-policy.local.toml"));
  expect(render("--repo", dir, "--check").code).toBe(2);
  const malformed = repo("schema = [");
  const result = render("--repo", malformed, "--write");
  expect(result.code).toBe(2);
  expect(result.text).toContain("oxlint-policy.local.toml");
});

test("a local file that tries to turn a rule off is refused, not merged", () => {
  const r = render(
    "--repo",
    repo(
      'schema = 1\nignore = []\n[[off]]\nrule = "eslint/no-console"\nreason = "z"\n',
    ),
    "--check",
  );
  expect(r.code).toBe(2);
  expect(r.text).toContain('Unrecognized key: \\"off\\"');
});

test("a hand edit of the rendered file is drift", async () => {
  const dir = repo("schema = 1\nignore = []\n");
  const base = await loadCommittedPolicy();
  if (!base.ok) expect.unreachable(base.error);
  const policy = await loadRepoPolicy(dir, base.value);
  if (!policy.ok) expect.unreachable(policy.error);
  await Bun.write(join(dir, ".oxlintrc.json"), renderOxlintrc(policy.value));
  const path = join(dir, ".oxlintrc.json");
  writeFileSync(
    path,
    readFileSync(path, "utf8").replace(
      '"correctness": "error"',
      '"correctness": "off"',
    ),
  );
  const r = render("--repo", dir, "--check");
  expect(r.code).toBe(1);
  expect(r.text).toContain("differs from preset sha256:");
  expect(r.text).toContain("run preset sync");
});
