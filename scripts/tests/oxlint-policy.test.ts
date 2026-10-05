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

const policy = loadPolicy();
const scratch = mkdtempSync(join(tmpdir(), "oxlint-policy-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function lint(rule: CustomRule, which: "bad" | "good") {
  const file = join(scratch, `${rule.id}.${which}.ts`);
  writeFileSync(file, rule[which]);
  const r = Bun.spawnSync(
    ["bunx", "--bun", "oxlint", "-c", OXLINTRC_PATH, "--format", "json", file],
    { stdout: "pipe", stderr: "pipe", timeout: 60_000 },
  );
  const parsed = jsonOf(Report).safeParse(r.stdout.toString());
  if (!parsed.success)
    throw new Error(
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

describe("oxlint-policy: every custom ban fires on bad and is silent on good", () => {
  test.each(policy.custom.map((c) => [c.id, c] as const))("%s", (_id, rule) => {
    const bad = lint(rule, "bad");
    expect(bad.files).toBe(1);
    expect(bad.hits).toBeGreaterThan(0);
    const good = lint(rule, "good");
    expect(good.files).toBe(1);
    expect(good.hits).toBe(0);
  });
});
