import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "../../shared/src/zod.ts";
import { decodedJson } from "./decode.ts";
import { capacityMessage, MODEL_WAIT_MS } from "../src/workers/capacity.ts";
import { CAPACITY_COOLDOWN_MS, capacityRows } from "../src/next/capacity.ts";
import { loadRoster } from "../../../agents/models/roster.ts";
import { prepareTicketRepo } from "./ticket-repo.ts";
import { runHealth } from "../src/next/health.ts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const Receipt = z.looseObject({
  outcome: z.string(),
  row: z.string().nullable().optional(),
  id: z.string().optional(),
});
const Event = z.looseObject({
  kind: z.string(),
  id: z.string(),
  row: z.string().optional(),
  outcome: z.string().optional(),
  continues: z.string().nullable().optional(),
  supersedes: z.string().nullable().optional(),
  verify: z.array(z.unknown()).optional(),
});
const fixture = async () => {
  const root = await mkdtemp(
    join(tmpdir(), `agx-test-${process.pid}-capacity-`),
  );
  roots.push(root);
  const bin = join(root, "vendor");
  await writeFile(
    bin,
    await readFile(new URL("fixtures/capacity-vendor.ts", import.meta.url)),
  );
  await chmod(bin, 0o755);
  const prompt = join(root, "brief.md");
  await writeFile(prompt, "Do work.");
  return { root, bin, prompt };
};
const execute = async (args: string[], env: NodeJS.ProcessEnv) => {
  const child = Bun.spawn([process.execPath, ...args], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
    timeout: 8_000,
  });
  const [exit, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exit, stdout, stderr };
};

test("vendor capacity errors are distinct from auth, rate limits, and quoted worker output", () => {
  expect(MODEL_WAIT_MS).toBe(120_000);
  expect(
    capacityMessage(
      "Selected model is at capacity. Please try a different model.",
      "codex",
    ),
  ).toBeDefined();
  expect(
    capacityMessage(
      '{"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
      "claude",
    ),
  ).toBeDefined();
  // Native Claude Code 2.1.306 emits this before retrying an HTTP 529 response.
  expect(
    capacityMessage(
      '{"type":"system","subtype":"api_retry","attempt":1,"max_retries":10,"error_status":529,"error":"overloaded"}',
      "claude",
    ),
  ).toBeDefined();
  expect(
    capacityMessage(
      '{"type":"system","subtype":"api_retry","error_status":429,"error":"rate_limited"}',
      "claude",
    ),
  ).toBeUndefined();
  expect(
    capacityMessage(
      '{"type":"assistant","error_status":529,"message":"overloaded_error is quoted text"}',
      "claude",
    ),
  ).toBeUndefined();
  expect(
    capacityMessage(
      '{"type":"turn.failed","error":{"message":"401 Unauthorized"}}',
      "codex",
    ),
  ).toBeUndefined();
  expect(
    runHealth(
      {
        state: "ended",
        ended_at: "2026-10-19T00:00:00Z",
        outcome: "capacity",
        returned: false,
        judgment: null,
      },
      false,
    ),
  ).toBeUndefined();
  expect(
    capacityMessage(
      '{"type":"error","error":{"type":"rate_limit_error"}}',
      "claude",
    ),
  ).toBeUndefined();
  expect(
    capacityMessage(
      '{"type":"item.completed","item":{"type":"agent_message","text":"Selected model is at capacity"}}',
      "codex",
    ),
  ).toBeUndefined();
});

test.each(["codex", "stderr", "stubborn", "wait", "claude", "claude-stderr"])(
  "%s capacity ends a hanging vendor within seconds",
  async (mode) => {
    const f = await fixture();
    const claude = mode.startsWith("claude");
    const args = claude
      ? [
          "tools/agx-worker/src/workers/run-claude.ts",
          "--target",
          f.root,
          "--model",
          "claude-sonnet-5-5",
          "--prompt-file",
          f.prompt,
          "--claude-bin",
          f.bin,
        ]
      : [
          "tools/agx-worker/src/workers/codex.ts",
          "--model",
          "gpt-6.1-sol",
          "--effort",
          "medium",
          "--sandbox",
          "none",
          "--cd",
          f.root,
          "--prompt-file",
          f.prompt,
          "--receipt-dir",
          f.root,
        ];
    const start = performance.now();
    const result = await execute(args, {
      AGX_CODEX_BIN: f.bin,
      AGX_CAPACITY_FIXTURE: mode,
      AGX_TEST_MODEL_WAIT_MS: mode === "wait" ? "100" : "2000",
      AGX_CODEX_HOST_FILE: join(f.root, "missing-host"),
    });
    expect(result.exit, result.stderr).toBe(75);
    expect(decodedJson(Receipt, result.stdout).outcome).toBe("capacity");
    expect(performance.now() - start).toBeLessThan(4_000);
    expect(result.stdout).toContain('"worker_fault":false');
  },
);

test("a worker doing real work can exceed the startup wait without capacity", async () => {
  const f = await fixture();
  const result = await execute(
    [
      "tools/agx-worker/src/workers/codex.ts",
      "--model",
      "gpt-6.1-sol",
      "--effort",
      "medium",
      "--sandbox",
      "none",
      "--cd",
      f.root,
      "--prompt-file",
      f.prompt,
      "--receipt-dir",
      f.root,
    ],
    {
      AGX_CODEX_BIN: f.bin,
      AGX_CAPACITY_FIXTURE: "working",
      AGX_TEST_MODEL_WAIT_MS: "1000",
    },
  );
  expect(result.exit, result.stderr).toBe(0);
  expect(decodedJson(Receipt, result.stdout).outcome).toBe("ok");
});

test("authentication failures remain worker errors rather than cooling a model", async () => {
  const f = await fixture();
  const result = await execute(
    [
      "tools/agx-worker/src/workers/codex.ts",
      "--model",
      "gpt-6.1-sol",
      "--effort",
      "medium",
      "--sandbox",
      "none",
      "--cd",
      f.root,
      "--prompt-file",
      f.prompt,
      "--receipt-dir",
      f.root,
    ],
    { AGX_CODEX_BIN: f.bin, AGX_CAPACITY_FIXTURE: "auth" },
  );
  expect(result.exit).toBe(1);
  expect(decodedJson(Receipt, result.stdout).outcome).toBe("codex-failed");
});

test("cool-down expires at 300 seconds and covers effort variants of that vendor model", async () => {
  const roster = await loadRoster();
  expect(roster.ok).toBe(true);
  if (!roster.ok) return;
  const at = Temporal.Now.instant().epochMilliseconds;
  const runs = [
    {
      row: "sol-medium",
      outcome: "capacity",
      ended_at: Temporal.Instant.fromEpochMilliseconds(at).toString(),
    },
  ] satisfies Parameters<typeof capacityRows>[0];
  const cooling = capacityRows(
    runs,
    roster.value.choice,
    at + CAPACITY_COOLDOWN_MS - 1,
  );
  expect(cooling.has("sol-medium")).toBe(true);
  expect(cooling.has("sol-low")).toBe(true);
  expect(cooling.has("luna-high")).toBe(false);
  expect(
    capacityRows(runs, roster.value.choice, at + CAPACITY_COOLDOWN_MS).size,
  ).toBe(0);
});

test("real dispatch records capacity; fresh and continued dispatches cannot reuse that model", async () => {
  const f = await fixture();
  await prepareTicketRepo(f.root);
  const ticket = join(f.root, "capacity.md");
  await writeFile(
    ticket,
    '+++\nschema = 2\nname = "capacity"\nwrites = []\ncapabilities = ["long-tool-loop"]\noutcome = "test capacity reroute"\nverify = ["exit 99"]\n[proposition]\nid = "CAPACITY"\nclaim = "reroute capacity"\nrefuted_by = "same model"\n+++\nWork.\n',
  );
  const state = join(f.root, "state");
  const server = Bun.serve({
    port: 0,
    fetch: () =>
      Response.json({
        answers: {
          worker: {
            choice: "sol-medium",
            probabilities: { "sol-medium": 1 },
          },
        },
      }),
  });
  await using _server = {
    [Symbol.asyncDispose]: async () => {
      await server.stop(true);
    },
  };
  const env = {
    AGX_STATE_DIR: state,
    JEV_URL: `http://127.0.0.1:${server.port}/`,
    TYPESAFE_API_KEY: "test-key",
    AGX_CODEX_BIN: f.bin,
    AGX_CAPACITY_FIXTURE: "sol-only",
    AGX_CAPACITY_LOG: join(f.root, "invocations.jsonl"),
    AGX_TMP_ROOT: join(f.root, "tmp"),
    DISPATCH_ROSTER_PATH: resolve("agents/models/dispatch-roster.toml"),
    AGX_DISPATCHER_SESSION: "test-dispatcher",
    HOME: f.root,
  };
  const run = (extra: string[] = []) =>
    execute(
      [
        "tools/agx-worker/src/next/cli.ts",
        "run",
        ticket,
        "--cd",
        f.root,
        "--sandbox",
        "none",
        ...extra,
      ],
      env,
    );
  const first = await run();
  expect(first.exit, first.stderr).toBe(75);
  const receipt = decodedJson(Receipt, first.stdout);
  expect(receipt).toMatchObject({ row: "sol-medium", outcome: "capacity" });
  const firstEvents = (await readFile(join(state, "records.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => decodedJson(Event, line));
  expect(firstEvents.find((event) => event.kind === "ended")).toMatchObject({
    outcome: "capacity",
    verify: [],
  });
  const fresh = decodedJson(Receipt, (await run()).stdout);
  expect(fresh.row).not.toStartWith("sol-");
  const continued = await run(["--continue", receipt.id ?? "missing"]);
  expect(continued.stderr).toContain("resuming");
  const resumed = decodedJson(Receipt, continued.stdout);
  expect(resumed.row).not.toStartWith("sol-");
  const calls = (await readFile(join(f.root, "invocations.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => decodedJson(z.array(z.string()), line));
  expect(calls).toHaveLength(3);
  expect(calls[2]).toContain("resume");
  expect(calls[2]).toContain("capacity-thread");
  expect(calls[2]?.[calls[2].indexOf("-m") + 1]).not.toBe("gpt-6.1-sol");
  // No vendor session means a fresh replacement, with explicit lineage rather than --resume.
  const records = join(state, "records.jsonl");
  const old = "sessionless-capacity";
  const at = Temporal.Now.instant().toString();
  const seeded = [
    {
      kind: "started",
      id: old,
      at,
      ticket: "capacity",
      writes: [],
      cwd: f.root,
      workspace: f.root,
      row: "sol-medium",
      dispatcher_session: null,
      vendor_session: null,
      pid: 0,
    },
    {
      kind: "ended",
      id: old,
      at,
      exit: 75,
      outcome: "capacity",
      report_path: null,
      vendor_session: null,
      verify: [],
    },
  ];
  await writeFile(
    records,
    `${await readFile(records, "utf8")}${seeded.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );
  const replaced = await run(["--continue", old]);
  expect(replaced.stderr).toContain(`supersedes ${old}`);
  const replacement = decodedJson(Receipt, replaced.stdout);
  const allEvents = (await readFile(records, "utf8"))
    .trim()
    .split("\n")
    .map((line) => decodedJson(Event, line));
  expect(
    allEvents.find(
      (event) => event.kind === "started" && event.id === replacement.id,
    ),
  ).toMatchObject({ continues: null, supersedes: old });
  // A persisted Claude session also supersedes rather than attempting an unverified model override.
  const claudeId = "claude-capacity";
  await writeFile(
    records,
    `${await readFile(records, "utf8")}${seeded.map((event) => JSON.stringify({ ...event, id: claudeId, row: "sonnet-high", vendor_session: "claude-thread" })).join("\n")}\n`,
  );
  const claudeReplacement = await run(["--continue", claudeId]);
  expect(claudeReplacement.stderr).toContain(`supersedes ${claudeId}`);
  // Expired cool-down does not license a capacity continuation to retry its old model.
  const staleAt = Temporal.Now.instant().subtract({ seconds: 301 }).toString();
  const historical = (await readFile(records, "utf8"))
    .trim()
    .split("\n")
    .map((line) => decodedJson(Event, line));
  await writeFile(
    records,
    `${historical.map((event) => JSON.stringify(event.outcome === "capacity" ? { ...event, at: staleAt } : event)).join("\n")}\n`,
  );
  const expired = await run(["--continue", receipt.id ?? "missing"]);
  expect(decodedJson(Receipt, expired.stdout).row).not.toStartWith("sol-");
}, 30_000);
