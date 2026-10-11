import { afterEach, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { codexRateSegment, readCodexRate } from "../src/codex-rate.ts";
import {
  readCodexSessionStatus,
  readCodexThreadStatus,
} from "../src/adapters/codex-rollout.ts";

const roots: string[] = [];
const fixtureDir = join(import.meta.dir, "fixtures");
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

async function fixtureRoot(
  fixtures: { name: string; session: string }[],
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "statusline-codex-rollout-"));
  roots.push(root);
  const day = join(root, "2026", "10", "11");
  await mkdir(day, { recursive: true });
  for (const fixture of fixtures) {
    await copyFile(
      join(fixtureDir, fixture.name),
      join(day, `rollout-fixture-${fixture.session}.jsonl`),
    );
  }
  return root;
}

test("Codex rollout normalizes cwd, model, effort, context and token window", async () => {
  const root = await fixtureRoot([
    { name: "codex-rollout.jsonl", session: "fixture-codex-session" },
  ]);
  const result = await readCodexSessionStatus("/fixture/codex", root);
  expect(result).toMatchObject({
    cwd: "/fixture/codex",
    sessionId: "fixture-codex-session",
    model: { name: "gpt-6-luna" },
    effort: "medium",
    context: { inputTokens: 24000, usedPercent: 12 },
  });
  const rate = await readCodexRate(root, "fixture-codex-session");
  expect(rate.isOk() ? rate.value?.windows : undefined).toEqual([
    { minutes: 10080, percent: 31, reset: 1792200971 },
    { minutes: 300, percent: 15, reset: 1791652800 },
  ]);
});

test("Codex rollout without token/rate data leaves those slots absent", async () => {
  const root = await fixtureRoot([
    { name: "codex-rollout-no-rate.jsonl", session: "fixture-codex-no-rate" },
  ]);
  const result = await readCodexSessionStatus("/fixture/codex", root);
  expect(result).toMatchObject({
    model: { name: "gpt-6-luna" },
    effort: "medium",
  });
  expect(result?.context).toBeUndefined();
  expect(result?.rateLimits).toBeUndefined();
  const rate = await readCodexRate(root, "fixture-codex-no-rate");
  expect(rate.isOk() ? rate.value : "error").toBeUndefined();
  expect(codexRateSegment(undefined)).toContain("codex");
  expect(codexRateSegment(undefined)).toContain("n/a");
});

test("Codex rollout selects an interactive TUI session over a newer exec session", async () => {
  const root = await fixtureRoot([
    {
      name: "codex-rollout-interactive.jsonl",
      session: "fixture-interactive-session",
    },
    { name: "codex-rollout-exec.jsonl", session: "fixture-exec-session" },
  ]);
  const day = join(root, "2026", "10", "11");
  const interactive = join(
    day,
    "rollout-fixture-fixture-interactive-session.jsonl",
  );
  const exec = join(day, "rollout-fixture-fixture-exec-session.jsonl");
  await utimes(interactive, 1, 1);
  await utimes(exec, 2, 2);
  expect(await readCodexSessionStatus("/fixture/codex", root)).toMatchObject({
    sessionId: "fixture-interactive-session",
    model: { name: "gpt-6-luna" },
  });
  expect(
    await readCodexThreadStatus("fixture-interactive-session", root),
  ).toMatchObject({
    sessionId: "fixture-interactive-session",
    cwd: "/fixture/codex",
  });
  expect(
    await readCodexThreadStatus("fixture-exec-session", root),
  ).toBeUndefined();
});

test("missing rollout for a pane cwd returns no session facts", async () => {
  const root = await mkdtemp(join(tmpdir(), "statusline-codex-missing-"));
  roots.push(root);
  expect(await readCodexSessionStatus("/missing/cwd", root)).toBeUndefined();
});
