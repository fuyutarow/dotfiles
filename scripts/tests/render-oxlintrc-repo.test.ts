// render-oxlintrc --repo: another repo's .oxlintrc.json from THIS policy plus that repo's
// oxlint-policy.local.toml, which may only add ignores. Real child processes, temp repos only.
import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "../../agents/hooks/zod.ts";
import { decodedJson } from "../../agents/hooks/tests/decode.ts";

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
  expect(render("--repo", dir, "--check").text).toContain("up to date");
});

test("a missing local file is refused with how to create it", () => {
  const r = render("--repo", repo(), "--check");
  expect(r.code).toBe(2);
  expect(r.text).toContain("create it: schema = 1");
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

test("a hand edit of the rendered file is drift", () => {
  const dir = repo("schema = 1\nignore = []\n");
  render("--repo", dir, "--write");
  writeFileSync(join(dir, ".oxlintrc.json"), "{}\n");
  const r = render("--repo", dir, "--check");
  expect(r.code).toBe(1);
  expect(r.text).toContain("DRIFT");
});
