import { readCodexSessionStatus } from "./support/codex-session.ts";
import {
  afterEach,
  beforeEach,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";
import {
  appendFile,
  copyFile,
  mkdir,
  mkdtemp,
  rename,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readCodexRate } from "../src/codex-rate.ts";
import { codexRateSegment } from "../src/provider-display.ts";
import { jsonText } from "../src/zod.ts";
import {
  hashSettingsPrefix,
  readCodexSettingsEvents,
} from "../src/adapters/codex-settings-stream.ts";
import {
  readCodexThreadStatus,
  readCodexPinnedSessionStatus,
} from "../src/adapters/codex-rollout.ts";

const roots: string[] = [];
const fixtureDir = join(import.meta.dir, "fixtures");
// These tests exercise complete multi-MiB parsing, independent of scheduler delays. The zero
// deadline test below separately checks budget exhaustion. Bun resets defaults between files.
setDefaultTimeout(30_000);
const monotonicNow = performance.now.bind(performance);
beforeEach(() => {
  performance.now = () => 0;
});
afterEach(async () => {
  performance.now = monotonicNow;
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
  const result = await readCodexSessionStatus(
    "fixture-codex-session",
    "/fixture/codex",
    root,
  );
  expect(result).toMatchObject({
    cwd: "/fixture/codex",
    sessionId: "fixture-codex-session",
    model: { name: "gpt-6-luna" },
    effort: "medium",
    context: { inputTokens: 24000, usedPercent: 12 },
  });
  // This is a normalization fixture, not a wall-clock expiry test.
  const rate = await readCodexRate(
    root,
    "fixture-codex-session",
    Temporal.Instant.from("2026-10-11T01:00:00Z").epochMilliseconds,
  );
  expect(rate.isOk() ? rate.value?.windows : undefined).toEqual([
    { minutes: 10080, percent: 31, reset: 1792200971 },
    { minutes: 300, percent: 15, reset: 1791652800 },
  ]);
});

test("Codex rollout without token/rate data leaves those slots absent", async () => {
  const root = await fixtureRoot([
    { name: "codex-rollout-no-rate.jsonl", session: "fixture-codex-no-rate" },
  ]);
  const result = await readCodexSessionStatus(
    "fixture-codex-no-rate",
    "/fixture/codex",
    root,
  );
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

test("Codex rollout selects the explicit interactive thread, not a newer exec session", async () => {
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
  expect(
    await readCodexSessionStatus(
      "fixture-interactive-session",
      "/fixture/codex",
      root,
    ),
  ).toMatchObject({
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
  expect(
    await readCodexSessionStatus("missing-thread", "/missing/cwd", root),
  ).toBeUndefined();
});

const record = (type: string, payload: unknown) =>
  `${JSON.stringify({ type, payload })}\n`;
const settingsRecord = (model: unknown, effort: unknown) =>
  record("event_msg", {
    type: "thread_settings_applied",
    thread_settings: { model, reasoning_effort: effort },
  });
const gap = () => record("response_item", { text: "x".repeat(600 * 1024) });

async function generatedRollout(
  id: string,
  body: string,
  legacyModel?: unknown,
) {
  const root = await mkdtemp(join(tmpdir(), "statusline-codex-settings-"));
  roots.push(root);
  const date = Temporal.Now.plainDateISO();
  const day = join(
    root,
    String(date.year),
    String(date.month).padStart(2, "0"),
    String(date.day).padStart(2, "0"),
  );
  await mkdir(day, { recursive: true });
  const path = join(day, `rollout-fixture-${id}.jsonl`);
  await writeFile(
    path,
    record("session_meta", {
      id,
      cwd: "/fixture/settings",
      originator: "codex-tui",
      model: legacyModel,
    }) + body,
  );
  return { root, path, day };
}

async function freshThreadStatus(id: string, root: string) {
  const adapter = join(import.meta.dir, "../src/adapters/codex-rollout.ts");
  const code = `performance.now = () => 0;
    const {readCodexThreadStatus} = await import(${JSON.stringify(adapter)});
    process.stdout.write(JSON.stringify(await readCodexThreadStatus(${JSON.stringify(id)}, ${JSON.stringify(root)})));`;
  const child = Bun.spawn([process.execPath, "--eval", code], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 12_000,
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(status).toBe(0);
  expect(stderr).toBe("");
  const parsed = jsonText.safeParse(stdout);
  expect(parsed.success).toBe(true);
  return parsed.success ? parsed.data : undefined;
}

test("current schema survives a >512 KiB gap without a legacy model", async () => {
  const { root } = await generatedRollout(
    "long-thread",
    settingsRecord("gpt-6.1-sol", "medium") +
      record("turn_context", { model: "gpt-6.1-sol", effort: "medium" }) +
      gap(),
  );
  for (const result of [
    await readCodexThreadStatus("long-thread", root),
    await readCodexPinnedSessionStatus("long-thread", root),
    await readCodexSessionStatus("long-thread", "/fixture/settings", root),
  ]) {
    expect(result).toMatchObject({
      sessionId: "long-thread",
      model: { name: "gpt-6.1-sol" },
      effort: "medium",
    });
  }
});

test("newer /model settings in the middle and tail supersede older turns", async () => {
  const { root, path } = await generatedRollout(
    "switch-thread",
    settingsRecord("old-model", "low") +
      gap() +
      settingsRecord("new-model", "xhigh") +
      gap(),
  );
  expect(await readCodexThreadStatus("switch-thread", root)).toMatchObject({
    model: { name: "new-model" },
    effort: "xhigh",
  });
  await appendFile(
    path,
    record("turn_context", { model: "last-model", reasoning_effort: "high" }),
  );
  expect(await readCodexThreadStatus("switch-thread", root)).toMatchObject({
    model: { name: "last-model" },
    effort: "high",
  });
  await appendFile(path, settingsRecord("final-model", "medium"));
  expect(await readCodexThreadStatus("switch-thread", root)).toMatchObject({
    model: { name: "final-model" },
    effort: "medium",
  });
});

test("malformed and missing model fields do not poison independent valid effort", async () => {
  const { root, path } = await generatedRollout(
    "bad-model",
    settingsRecord(42, "high"),
    {
      malformed: true,
    },
  );
  expect(await readCodexThreadStatus("bad-model", root)).toMatchObject({
    effort: "high",
  });
  expect(
    (await readCodexThreadStatus("bad-model", root))?.model,
  ).toBeUndefined();
  await appendFile(path, settingsRecord(undefined, "medium"));
  expect(
    (await readCodexThreadStatus("bad-model", root))?.model,
  ).toBeUndefined();
  expect((await readCodexThreadStatus("bad-model", root))?.effort).toBe(
    "medium",
  );
  await appendFile(
    path,
    settingsRecord("good-model", "medium") +
      settingsRecord(" ", "xhigh") +
      record("turn_context", { model: null, effort: 42 }) +
      "{broken}\n",
  );
  expect(await readCodexThreadStatus("bad-model", root)).toMatchObject({
    model: { name: "good-model" },
    effort: "xhigh",
  });
});

test("settings selection validates exact metadata ID and never borrows a sibling", async () => {
  const { root, day } = await generatedRollout(
    "exact-thread",
    settingsRecord("target-model", "medium") + gap(),
  );
  await writeFile(
    join(day, "rollout-newer-sibling.jsonl"),
    record("session_meta", {
      id: "sibling",
      cwd: "/fixture/settings",
      originator: "codex-tui",
    }) + settingsRecord("sibling-model", "low"),
  );
  await writeFile(
    join(day, "rollout-imposter-missing-thread.jsonl"),
    record("session_meta", {
      id: "sibling",
      originator: "codex-tui",
    }) + settingsRecord("imposter", "low"),
  );
  expect(await readCodexThreadStatus("exact-thread", root)).toMatchObject({
    model: { name: "target-model" },
    effort: "medium",
  });
  expect(await readCodexThreadStatus("missing-thread", root)).toBeUndefined();
});

test("cache retains observed settings across long appends and resets on replacement", async () => {
  const { root, path } = await generatedRollout(
    "cached-thread",
    settingsRecord("cached-model", "high"),
  );
  expect((await readCodexThreadStatus("cached-thread", root))?.effort).toBe(
    "high",
  );
  for (let i = 0; i < 8; i++) {
    await appendFile(path, gap());
    expect(await readCodexThreadStatus("cached-thread", root)).toMatchObject({
      model: { name: "cached-model" },
      effort: "high",
    });
  }
  await writeFile(
    path,
    record("session_meta", { id: "cached-thread", originator: "codex-tui" }) +
      settingsRecord("replacement", "low"),
  );
  expect(await readCodexThreadStatus("cached-thread", root)).toMatchObject({
    model: { name: "replacement" },
    effort: "low",
  });
});

test("cold reads recover settings beyond 4 MiB and never present stale head settings", async () => {
  const { root, path } = await generatedRollout(
    "cold-thread",
    settingsRecord("head-model", "low") +
      gap() +
      settingsRecord("changed-model", "xhigh") +
      gap().repeat(8),
    "legacy-head-model",
  );
  const result = await readCodexThreadStatus("cold-thread", root);
  expect(result?.model?.name).toBe("changed-model");
  expect(result?.effort).toBe("xhigh");
  expect(await freshThreadStatus("cold-thread", root)).toMatchObject({
    sessionId: "cold-thread",
    model: { name: "changed-model" },
    effort: "xhigh",
  });
  // The parent has cached the older pair. A new pair followed by another >4 MiB
  // gap must win in both that process and an independent cold hook-like process.
  await appendFile(
    path,
    settingsRecord("later-model", "medium") + gap().repeat(8),
  );
  expect(await readCodexThreadStatus("cold-thread", root)).toMatchObject({
    model: { name: "later-model" },
    effort: "medium",
  });
  expect(await freshThreadStatus("cold-thread", root)).toMatchObject({
    model: { name: "later-model" },
    effort: "medium",
  });
});

test("large assistant strings cannot masquerade as settings and reordered escaped keys work", async () => {
  const assistant = record("response_item", {
    text: '{"type":"turn_context","payload":{"model":"fake-model","effort":"low"}}'.repeat(
      90_000,
    ),
  });
  const actual =
    '{"payload":{"instructions":[true,false,null,1e+20,-0.25],"thread_settings":{"mo\\u0064el":"real-model","reasoning_effort":"high"},"type":"thread_settings_applied"},"type":"event_msg"}\n';
  const { root } = await generatedRollout(
    "huge-assistant",
    settingsRecord("old-model", "low") + assistant + actual + gap().repeat(8),
  );
  expect(await freshThreadStatus("huge-assistant", root)).toMatchObject({
    model: { name: "real-model" },
    effort: "high",
  });
});

test("same-inode rewrite plus growth invalidates prior prefix and same-size mutations reparse", async () => {
  const id = "mutated-thread";
  const header = record("session_meta", {
    id,
    cwd: "/fixture/settings",
    originator: "codex-tui",
  });
  const { root, path } = await generatedRollout(
    id,
    settingsRecord("old-model", "high") + gap(),
  );
  expect((await readCodexThreadStatus(id, root))?.model?.name).toBe(
    "old-model",
  );
  await writeFile(
    path,
    header + settingsRecord("new-model", "low") + gap().repeat(8),
  );
  expect(await readCodexThreadStatus(id, root)).toMatchObject({
    model: { name: "new-model" },
    effort: "low",
  });
  await writeFile(
    path,
    header + settingsRecord("alt-model", "low") + gap().repeat(8),
  );
  expect((await readCodexThreadStatus(id, root))?.model?.name).toBe(
    "alt-model",
  );
  const replacement = `${path}.replacement`;
  await writeFile(
    replacement,
    header + settingsRecord("replacement", "medium") + gap().repeat(8),
  );
  await rename(replacement, path);
  expect(await readCodexThreadStatus(id, root)).toMatchObject({
    model: { name: "replacement" },
    effort: "medium",
  });
  await writeFile(path, header);
  expect((await readCodexThreadStatus(id, root))?.model).toBeUndefined();
});

test("cold long legacy schema and independently located setting fields remain compatible", async () => {
  const legacy = await generatedRollout(
    "long-legacy",
    gap().repeat(8),
    "legacy-model",
  );
  expect(await freshThreadStatus("long-legacy", legacy.root)).toMatchObject({
    model: { name: "legacy-model" },
  });
  const independent = await generatedRollout(
    "independent-fields",
    settingsRecord("known-model", undefined) +
      gap() +
      settingsRecord(undefined, "xhigh") +
      gap().repeat(8),
  );
  expect(
    await freshThreadStatus("independent-fields", independent.root),
  ).toMatchObject({
    model: { name: "known-model" },
    effort: "xhigh",
  });
});

test("malformed newer envelopes cannot override valid settings; duplicate keys use the last value", async () => {
  const invalid =
    '{"type":"event_msg","payload":{"type":"thread_settings_applied","thread_settings":{"model":"fake-model","reasoning_effort":"low"}},}\n';
  const duplicate =
    '{"type":"turn_context","payload":{"model":"fake-model","effort":"low"},"payload":{"model":"correct-model","effort":"xhigh"}}\n';
  const { root, path } = await generatedRollout(
    "grammar-thread",
    settingsRecord("first-model", "medium") + invalid + gap().repeat(8),
  );
  expect(await freshThreadStatus("grammar-thread", root)).toMatchObject({
    model: { name: "first-model" },
    effort: "medium",
  });
  await appendFile(path, duplicate + gap().repeat(8));
  expect(await freshThreadStatus("grammar-thread", root)).toMatchObject({
    model: { name: "correct-model" },
    effort: "xhigh",
  });
  await appendFile(
    path,
    '{"type":"turn_context","payload":{},"payload.model":"fake-model","payload.effort":"low"}\n',
  );
  expect(await freshThreadStatus("grammar-thread", root)).toMatchObject({
    model: { name: "correct-model" },
    effort: "xhigh",
  });
});

test("an exhausted source budget never emits scan completion or a partial head result", async () => {
  const { path } = await generatedRollout(
    "budget-thread",
    settingsRecord("known-model", "high") + gap().repeat(8),
  );
  const events: unknown[] = [];
  for await (const event of readCodexSettingsEvents(
    path,
    Bun.file(path).size,
    0,
  ))
    events.push(event);
  expect(events).toEqual([]);
});

test("native prefix hash copies preserve the original incremental SHA-256 state", async () => {
  const { path } = await generatedRollout("native-hash", "");
  await writeFile(path, "abc");
  const prefix = await hashSettingsPrefix(path, 3, performance.now() + 7500);
  expect(prefix?.digest).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  expect(prefix?.hash.copy().update("d").digest("hex")).toBe(
    "88d4266fd4e6338d13b845fcf289579d209c897823b9217da3e161936f031589",
  );
  expect(prefix?.hash.copy().digest("hex")).toBe(prefix?.digest);
});

test("a split settings line is reconsidered after completion", async () => {
  const line = settingsRecord("completed-model", "high");
  const { root, path } = await generatedRollout(
    "partial-thread",
    line.slice(0, -5),
  );
  expect(
    (await readCodexThreadStatus("partial-thread", root))?.model,
  ).toBeUndefined();
  await appendFile(path, line.slice(-5));
  expect(await readCodexThreadStatus("partial-thread", root)).toMatchObject({
    model: { name: "completed-model" },
    effort: "high",
  });
});

test("compatible valid final records need no newline and are reconsidered on append", async () => {
  const line = record("turn_context", {
    model: "no-newline-model",
    effort: "high",
  });
  const { root, path } = await generatedRollout(
    "no-newline-thread",
    line.trimEnd(),
  );
  for (let i = 0; i < 2; i++) {
    expect(
      await readCodexThreadStatus("no-newline-thread", root),
    ).toMatchObject({
      model: { name: "no-newline-model" },
      effort: "high",
    });
  }
  await appendFile(path, "\n" + settingsRecord("later-model", "low"));
  expect(await readCodexThreadStatus("no-newline-thread", root)).toMatchObject({
    model: { name: "later-model" },
    effort: "low",
  });
});
