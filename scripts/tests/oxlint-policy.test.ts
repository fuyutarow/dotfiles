import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import {
  loadPolicy,
  OXLINTRC_PATH,
  renderOxlintrc,
  type CustomRule,
} from "../render-oxlintrc.ts";

// oxlint-policy: every custom ban in oxlint-policy.toml must fire on its `bad` snippet and stay
// silent on its `good` one, linted through the GENERATED .oxlintrc.json. A selector with a typo
// matches nothing and the repo lint stays green, so only this test can tell a dead rule from a
// clean repo. Each run also asserts oxlint linted exactly the one file: a config it could not apply
// (observed 2026-10-05 with a config outside the repo) reports zero diagnostics and exits 0.

const Report = z.looseObject({
  diagnostics: z.array(
    z.looseObject({ message: z.string(), help: z.string().optional() }),
  ),
  number_of_files: z.number(),
});

const loaded = await loadPolicy();
if (!loaded.ok) expect.unreachable(`oxlint-policy.toml: ${loaded.error}`);
const policy = loaded.value;
const scratch = mkdtempSync(join(tmpdir(), "oxlint-policy-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function lint(rule: CustomRule, which: "bad" | "good", i: number) {
  const file = join(scratch, `${rule.id}.${which}.${i}.ts`);
  writeFileSync(file, rule[which][i] ?? "");
  const r = Bun.spawnSync(
    ["bunx", "--bun", "oxlint", "-c", OXLINTRC_PATH, "--format", "json", file],
    { stdout: "pipe", stderr: "pipe", timeout: 60_000 },
  );
  const parsed = jsonOf(Report).safeParse(r.stdout.toString());
  if (!parsed.success)
    return expect.unreachable(
      `oxlint gave no JSON report (exit ${r.exitCode}): ${r.stderr.toString()}`,
    );
  return {
    files: parsed.data.number_of_files,
    // no-restricted-imports carries the custom text in `help`, the others in `message`.
    hits: parsed.data.diagnostics.filter((d) =>
      `${d.message}\n${d.help ?? ""}`.includes(rule.message),
    ).length,
  };
}

describe("oxlint-policy: the committed .oxlintrc.json is a fresh render", () => {
  test("no drift", () => {
    expect(readFileSync(OXLINTRC_PATH, "utf8")).toBe(renderOxlintrc(policy));
  });
});

describe("oxlint-policy: every custom ban fires on each bad and is silent on each good", () => {
  const cases = policy.custom.flatMap((c) =>
    (["bad", "good"] as const).flatMap((which) =>
      c[which].map((_, i) => [`${c.id} ${which}[${i}]`, c, which, i] as const),
    ),
  );
  test.each(cases)(
    "%s",
    (_name, rule, which, i) => {
      const r = lint(rule, which, i);
      expect(r.files).toBe(1);
      if (which === "bad") expect(r.hits).toBeGreaterThan(0);
      else expect(r.hits).toBe(0);
    },
    60_000,
  ); // one oxlint run, bounded at 60 s
});
