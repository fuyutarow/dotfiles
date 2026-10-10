import { afterAll, describe, expect, test } from "bun:test";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { z } from "../../shared/src/zod.ts";
import { ROSTER_PATH } from "../../../agents/models/roster.ts";
import { decodedJson } from "./decode.ts";
import { attemptOr } from "../../shared/src/attempt.ts";

// agx: the one entry point. A fake agx stands in for the worker (it records its argv and
// prints a receipt), a local server stands in for Jev, and every state file goes to a scratch dir.

const CLI = join(import.meta.dir, "..", "src", "agx.ts");
const scratch = mkdtempSync(join(tmpdir(), "agx-test-"));
// Every request body the fake Jev received, in order (what left the machine).
const bodies: string[] = [];
let onJevRequest: ((body: string) => void) | undefined;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (req) => {
    const body = await req.text();
    bodies.push(body);
    const requestHook = onJevRequest;
    onJevRequest = undefined;
    requestHook?.(body);
    const confidence = body.includes("LOWCONF") ? 0.2 : 0.9;
    // A marker in the state makes the fake answer like a failing provider (the ask exit classes).
    const status = /HTTP(401|429|500|503)/u.exec(body)?.[1];
    if (status !== undefined)
      return new Response(`provider says ${status}`, {
        status: Number(status),
      });
    if (body.includes("NOTJSON")) return new Response("plain text, no json");
    // An ask: any question id other than the pick's and the grade's is echoed back as a choice.
    const asked = Object.keys(
      decodedJson(
        z.looseObject({ questions: z.record(z.string(), z.unknown()) }),
        body,
      ).questions,
    ).filter((id) => id !== "worker" && id !== "grade");
    if (asked.length > 0)
      return Response.json({
        model: "fake-jev",
        answers: Object.fromEntries(
          asked.map((id) => [
            id,
            {
              type: "choice",
              choice: "yes",
              confidence,
              probabilities: { yes: confidence, no: 1 - confidence },
            },
          ]),
        ),
        usage: { input_tokens: 10, output_tokens: 2 },
      });
    // A grade question is answered under "grade"; evidence saying GRADE=<g> picks that grade.
    if (body.includes('"grade":{"type":"choice"')) {
      const g = /GRADE=(\w+)/u.exec(body)?.[1] ?? "partial";
      return Response.json({
        answers: {
          grade: {
            type: "choice",
            choice: g,
            confidence,
            probabilities: { [g]: confidence },
          },
        },
      });
    }
    // A brief saying PICK=<id> makes the fake Jev choose that row (a disabled or Claude row too).
    const choice =
      /PICK=([\w-]+)/u.exec(body)?.[1] ??
      (body.includes("NOPROBS") ? "luna-max" : "luna-low");
    const probabilityText = /PROBS=([A-Za-z0-9:.,-]+)/u.exec(body)?.[1];
    const probabilities: Record<string, number> =
      probabilityText === undefined
        ? { [choice]: confidence }
        : Object.fromEntries(
            probabilityText.split(",").map((item): [string, number] => {
              const separator = item.indexOf(":");
              const row = item.slice(0, separator);
              const probability = Number(item.slice(separator + 1));
              return [row, probability];
            }),
          );
    return Response.json({
      model: "fake-jev",
      answers: {
        worker: {
          type: "choice",
          choice,
          confidence,
          ...(body.includes("NOPROBS") ? {} : { probabilities }),
        },
      },
      usage: { input_tokens: 10, output_tokens: 2 },
    });
  },
});
afterAll(() => {
  void server.stop(true);
  rmSync(scratch, { recursive: true, force: true });
});

const QUEUE = join(scratch, "fake-codex-queue");
writeFileSync(
  QUEUE,
  `#!/bin/sh\nprintf '%s\\n' "$@" >> "$AGX_STATE_DIR/queue.log"\n`,
);
chmodSync(QUEUE, 0o755);
const FAKE = join(scratch, "fake-agx.ts");
writeFileSync(
  FAKE,
  `import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
appendFileSync(${JSON.stringify(join(scratch, "argv.log"))}, JSON.stringify(Bun.argv.slice(2)) + "\\n");
const args = Bun.argv.slice(2);
const promptAt = args.indexOf("--prompt-file");
const promptText = promptAt === -1 ? "" : await Bun.file(args[promptAt + 1] ?? "").text();
const isGrader = promptText.includes("Grade this brief as a meaningful remand judgment");
const resuming = args.includes("--resume");
if (process.env.FAKE_CHECKPOINT === "1" && process.env.AGX_CODEX_PROGRESS_FILE !== undefined)
  appendFileSync(process.env.AGX_CODEX_PROGRESS_FILE, JSON.stringify({ schema: 1, at: "2026-10-08T00:00:00Z", last: "working", commands: 1, files: Number(process.env.FAKE_CHECKPOINT_FILES ?? "0"), session: "thread-fake-checkpoint" }));
if (process.env.FAKE_LIFECYCLE !== undefined && !isGrader) {
  const mode = process.env.FAKE_LIFECYCLE;
  const cwd = args[args.indexOf("--cd") + 1];
  const runId = args[args.indexOf("--run-id") + 1];
  await Bun.write(process.env.AGX_CODEX_PROGRESS_FILE, JSON.stringify({ schema: 1, at: "2026-10-10T00:00:00Z", last: "starting", commands: 0, files: 0, session: "thread-lifecycle" }));
  process.on("SIGUSR1", () => {
    console.log(JSON.stringify({ schema: 1, outcome: "timeout", session: "thread-lifecycle", last_message: "" }));
    process.exit(3);
  });
  let burning;
  if (mode === "cpu") burning = Bun.spawn([process.execPath, "-e", "const until = performance.now() + 2500; while (performance.now() < until) Math.sqrt(Math.random());"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  const until = performance.now() + 2500;
  let counter = 0;
  while (performance.now() < until) {
    if (mode === "writes") await Bun.write(cwd + "/delivered.txt", String(counter++));
    if (mode === "output") await Bun.write(process.env.AGX_WORKER_ACTIVITY_FILE, String(counter++));
    await Bun.sleep(80);
  }
  if (burning !== undefined) await burning.exited;
  console.log(JSON.stringify({ schema: 1, run_id: runId, outcome: "ok", session: "thread-lifecycle", last_message: "done" }));
  process.exit(0);
}
if (process.env.FAKE_STALL_MODE !== undefined && !isGrader) {
  const log = process.env.FAKE_STALL_LOG;
  const prior = existsSync(log) ? (await Bun.file(log).text()).trim().split("\\n").length : 0;
  const row = args[args.indexOf("--choice") + 1];
  appendFileSync(log, JSON.stringify({ pid: process.pid, row, resume: resuming }) + "\\n");
  const mode = process.env.FAKE_STALL_MODE;
  const files = mode === "files" || (prior > 0 && mode !== "twice" && mode !== "non_delivery_twice") ? 1 : 0;
  await Bun.write(process.env.AGX_CODEX_PROGRESS_FILE, JSON.stringify({ schema: 1, at: "2026-10-08T00:00:00Z", last: "working", commands: mode === "commands" ? 3 : 0, files }));
  const runId = args[args.indexOf("--run-id") + 1];
  if (mode === "return" || mode.startsWith("non_delivery")) {
    const last = process.env.AGX_STATE_DIR + "/worker-receipts/" + runId + ".last.txt";
    mkdirSync(dirname(last), { recursive: true });
    await Bun.write(last, mode === "return" ? process.env.FAKE_LAST : "done");
  }
  if (mode === "non_delivery" && prior > 0) {
    const cwd = args[args.indexOf("--cd") + 1] ?? ".";
    await Bun.write(cwd + "/delivered.txt", "delivered");
  }
  process.on("SIGUSR1", () => {
    appendFileSync(log + ".stopped", row + "\\n");
    console.log(JSON.stringify({ schema: 1, run_id: runId, outcome: "timeout", session: "thread-fake-stall", last_message: "" }));
    process.exit(3);
  });
  await Bun.sleep(files > 0 || mode === "return" || mode.startsWith("non_delivery") ? 450 : 3000);
  console.log(JSON.stringify({ schema: 1, run_id: runId, outcome: "ok", session: "thread-fake-stall", last_message: mode.startsWith("non_delivery") ? "done" : process.env.FAKE_LAST ?? "done" }));
  process.exit(0);
}
await Bun.sleep(Number(isGrader ? process.env.FAKE_GRADER_SLEEP_MS ?? "0" : resuming ? process.env.FAKE_RESUME_SLEEP_MS ?? "0" : process.env.FAKE_SLEEP_MS ?? "0"));
const releaseFile = process.env.FAKE_BLOCK_UNTIL_FILE;
while (releaseFile !== undefined && !existsSync(releaseFile)) await Bun.sleep(10);
const timedOut = isGrader ? process.env.FAKE_GRADER_TIMEOUT === "1" : process.env.FAKE_TIMEOUT === "1";
if (timedOut && process.env.AGX_CODEX_PROGRESS_FILE !== undefined)
  appendFileSync(process.env.AGX_CODEX_PROGRESS_FILE, JSON.stringify({ schema: 1, at: "2026-10-08T00:00:00Z", last: "checks complete", commands: 1, files: 0 }));
const exit = timedOut ? 3 : Number(process.env.FAKE_EXIT ?? "0");
if (process.env.FAKE_ORPHAN_PID_FILE !== undefined) {
  const orphan = Bun.spawn(["sleep", "60"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  await Bun.write(process.env.FAKE_ORPHAN_PID_FILE, String(orphan.pid));
}
if (promptAt !== -1)
  appendFileSync(${JSON.stringify(join(scratch, "prompt.log"))}, "<<<" + promptText + ">>>\\n");
const touch = process.env.FAKE_TOUCH;
if (touch !== undefined) {
  const path = (args[args.indexOf("--cd") + 1] ?? ".") + "/" + touch;
  mkdirSync(dirname(path), { recursive: true });
  await Bun.write(path, "worker-was-here");
}
const runIdAt = args.indexOf("--run-id");
const runId = runIdAt === -1 ? "standalone-fake-run" : args[runIdAt + 1];
const checkpointReturn = '{"summary":"checkpoint","changes":[],"checks":[],"for_coordinator":[],"open":[]}\\n\`\`\`agx-return\\n{"findings":[{"text":"checkpointed"}],"evidence":["fake"],"impact_on_brief":"none","proposed_next":"done","artifacts":[]}\\n\`\`\`';
const gradeReply = process.env.FAKE_GRADE ?? '{"verdict":"pass","violations":[]}';
const fence = String.fromCharCode(96).repeat(3);
const lastMessage = isGrader ? process.env.FAKE_GRADE_LAST ?? fence + "agx-grade\\n" + gradeReply + "\\n" + fence : process.env.FAKE_LAST ?? (process.env.FAKE_CHECKPOINT === "1" && resuming ? checkpointReturn : process.env.FAKE_NO_REPORT === "1" ? "" : "final report from fake worker\\n");
const usage = process.env.FAKE_USAGE === "missing" ? { input_tokens: 100 } : { input_tokens: 100, cached_input_tokens: 20, output_tokens: 7, reasoning_output_tokens: 3 };
console.log(JSON.stringify({ schema: 1, run_id: runId, sandbox: args[args.indexOf("--sandbox") + 1], outcome: timedOut ? "timeout" : exit === 0 ? "ok" : "codex-failed", elapsed_s: Number(process.env.FAKE_ELAPSED_S ?? "1.5"), usage, ...(process.env.FAKE_NO_SESSION === "1" ? {} : { session: "thread-fake-0001" }), last_message: lastMessage, ...(exit === 0 ? {} : { cause: timedOut ? "fake worker timed out" : "fake worker failed" }) }));
process.exit(exit);
`,
);

function roster(name: string, edit: (t: string) => string): string {
  const path = join(scratch, `${name}.toml`);
  writeFileSync(path, edit(readFileSync(ROSTER_PATH, "utf8")));
  return path;
}
const withJev = (t: string): string =>
  t.replace(
    /^\[auto\.jev\][\s\S]*?(?=\n\[)/mu,
    `[auto.jev]\napi = "reseller"\nurl = "${server.url.href}"\nprice_per_mtok_input = 0.042\nprice_per_mtok_output = 0.0\n`,
  );
const LIVE_JEV = roster("live", withJev);
// A fake run-claude: records its argv, prints the relay shape the real one prints.
const FAKE_CLAUDE = join(scratch, "fake-run-claude.ts");
writeFileSync(
  FAKE_CLAUDE,
  `import { appendFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
appendFileSync(${JSON.stringify(join(scratch, "claude-argv.log"))}, JSON.stringify(Bun.argv.slice(2)) + "\\n");
const mode = process.env.FAKE_CLAUDE_MODE ?? "ok";
if (mode === "fail") {
  console.log(JSON.stringify({ exit_code: 1, timed_out: false, error: "model rejected: sonnet", stderr: "boom" }));
  process.exit(1);
}
if (mode === "timeout") {
  console.log(JSON.stringify({ exit_code: 124, timed_out: true, session_id: "sess-claude-0001", stderr: "" }));
  process.exit(124);
}
const relays: Record<string, Record<string, unknown>> = {
  max_turns: { exit_code: 1, subtype: "error_max_turns", is_error: true, num_turns: 60, total_cost_usd: 0.5 },
  budget: { exit_code: 1, subtype: "error_max_budget_usd", is_error: true, num_turns: 12, total_cost_usd: 2.01 },
  exec_error: { exit_code: 1, subtype: "error_during_execution", is_error: true, num_turns: 3, result: "tool crashed" },
  exit0_error: { exit_code: 0, subtype: "error_max_turns", is_error: true, num_turns: 60 },
  no_result: { exit_code: 1, parse_error: "no result event in the stream-json output", stdout: "", stderr: "" },
};
const stopped = relays[mode];
if (stopped !== undefined) {
  console.log(JSON.stringify({ timed_out: false, session_id: "sess-claude-0001", stderr: "", ...stopped }));
  process.exit(Number(stopped.exit_code));
}
if (mode === "garbage") {
  console.log("not a relay");
  process.exit(1);
}
const at = Bun.argv.indexOf("--progress-file");
if (at !== -1)
  writeFileSync(Bun.argv[at + 1] ?? "", JSON.stringify({ schema: 1, at: "2026-10-06T00:00:00Z", last: "✎ kernel.ts", commands: 2, files: 1 }));
const typed = { summary: "typed", changes: [], checks: [], for_coordinator: [], open: [] };
if (mode === "structured") {
  console.log(JSON.stringify({ exit_code: 0, timed_out: false, subtype: "success", is_error: false, num_turns: 4, result: "", structured_output: typed, session_id: "sess-claude-0001", total_cost_usd: 0.01 }));
  process.exit(0);
}
console.log(JSON.stringify({ exit_code: 0, timed_out: false, result: process.env.FAKE_LAST ?? "done", session_id: "sess-claude-0001", total_cost_usd: 0.01, usage: { input_tokens: 80, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, output_tokens: 7 } }));
`,
);
const NO_EGRESS = roster("no-egress", (t) =>
  withJev(t).replace(
    "no_egress = []",
    `no_egress = [${JSON.stringify(scratch)}]`,
  ),
);

const fixtureBriefText = (text: string): string =>
  /RESOURCE-(?:CLASS|ENVELOPE)\(/u.test(text)
    ? text
    : `${text.trimEnd()}\nRESOURCE-CLASS(NONCOMPUTE): fixture CLI work\n`;
const brief = (name: string, text: string): string => {
  const p = join(scratch, `${name}.md`);
  writeFileSync(p, fixtureBriefText(text));
  return p;
};

// Async on purpose: the fake Jev server lives in THIS process, so a synchronous spawn would block
// the event loop it needs to answer.
let stateSeq = 0;
async function router(
  args: string[],
  env: Record<string, string> = {},
  during?: (proc: Bun.Subprocess) => Promise<void>,
) {
  // A fresh state dir per call unless the test names one: under O3 a second run in the same cwd and
  // state is refused while the first is ungraded — the rule under test below, not these tests' topic.
  const state = env.AGX_STATE_DIR ?? join(scratch, `state-${stateSeq++}`);
  const promptFileIndex = args.indexOf("--prompt-file");
  const promptText =
    promptFileIndex < 0
      ? ""
      : readFileSync(args[promptFileIndex + 1] ?? "", "utf8");
  const schemaOne = /^\+\+\+[\s\S]*?^schema\s*=\s*1\s*$/mu.test(promptText);
  const schemaOneNeedsEscape =
    schemaOne &&
    (!["outcome", "consumer", "first_return", "writes"].every((key) =>
      new RegExp(`^${key}\\s*=`, "mu").test(promptText),
    ) ||
      (!/^verify\s*=/mu.test(promptText) &&
        !/^read_only_diagnostic\s*=\s*true/mu.test(promptText)) ||
      !/^capabilities\s*=/mu.test(promptText));
  const needsLegacyEscape =
    args[0] === "dispatch" &&
    !args.includes("--resume") &&
    (!promptText.startsWith("+++") || schemaOneNeedsEscape) &&
    env.TEST_SKIP_LEGACY !== "1" &&
    !args.includes("--legacy-brief");
  const routedArgs = [...args];
  if (args[0] === "dispatch" && !args.includes("--resume") && needsLegacyEscape)
    routedArgs.push("--legacy-brief", "existing plain-brief fixture");
  if (
    args[0] === "dispatch" &&
    !args.includes("--resume") &&
    env.TEST_ENABLE_GRADER !== "1" &&
    !args.includes("--no-grader")
  )
    routedArgs.push("--no-grader");
  const r = Bun.spawn([process.execPath, CLI, ...routedArgs], {
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) =>
            !name.startsWith("AGX_") &&
            !name.startsWith("AGX_") &&
            !name.startsWith("FAKE_") &&
            name !== "DISPATCH_ROSTER_PATH",
        ),
      ),
      AGX_STATE_DIR: state,
      AGX_CODEX_WORKER: FAKE,
      AGX_CODEX_BIN: QUEUE,
      DISPATCH_ROSTER_PATH: LIVE_JEV,
      TYPESAFE_API_KEY: "fixture-key",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
    detached: true,
    timeout: 60_000,
  });
  const [out, err, code] = await Promise.all([
    new Response(r.stdout).text(),
    new Response(r.stderr).text(),
    r.exited,
    during?.(r),
  ]);
  return { code, out, err, state };
}

const Receipt = z.looseObject({
  exit: z.number(),
  checkpoint: z.unknown(),
  pick: z.looseObject({
    source: z.string(),
    choice: z.string(),
    reason: z.string(),
    mode: z.enum(["sample", "argmax", "fallback"]).optional(),
    argmax_row: z.string().optional(),
    sampled_row: z.string().optional(),
    temperature: z.number().optional(),
    seed: z.string().optional(),
    masked_rows: z.array(z.unknown()).optional(),
    sampled_probability: z.number().optional(),
    epsilon: z.number().optional(),
    epsilon_rows: z.array(z.string()).optional(),
    pick_fallback_reason: z.string().optional(),
  }),
  worker: z.looseObject({ outcome: z.string() }),
});
const RunLogRecord = z.looseObject({
  stats: z.looseObject({
    row: z.string(),
    family: z.string(),
    route: z.enum(["codex", "claude"]),
    model: z.string(),
    effort: z.string(),
    outcome: z.string(),
    exit: z.number(),
    tokens: z.looseObject({
      input: z.number().nullable(),
      cached_input: z.number().nullable(),
      output: z.number().nullable(),
      reasoning: z.number().nullable(),
    }),
    cost_usd: z.number().nullable(),
    cost_basis: z.string(),
    price: z.looseObject({
      in: z.number().nullable(),
      out: z.number().nullable(),
      as_of: z.string(),
    }),
    brief_chars: z.number(),
    cwd: z.string(),
    jev_confidence: z.number().nullable(),
    picked_by: z.string(),
  }),
});
const ExportRecord = z.looseObject({
  run_id: z.string(),
  family: z.string(),
  grade: z.enum(["pass", "partial", "fail"]).nullable(),
  confidence: z.number().nullable(),
  price: z.looseObject({
    in: z.number().nullable(),
    out: z.number().nullable(),
    as_of: z.string().nullable(),
  }),
  tokens: z.looseObject({
    input: z.number().nullable(),
    cached_input: z.number().nullable(),
    output: z.number().nullable(),
    reasoning: z.number().nullable(),
  }),
  cost_usd: z.number().nullable(),
  waived: z.string().optional(),
});
const RunIdSchema = z.looseObject({ run_id: z.string() });

describe("agx dispatch", () => {
  const b = brief("task", "Fix the flaky test in scripts/tests.\n");

  test("--row runs the named roster row without a Jev call and records approval", async () => {
    const before = bodies.length;
    const target = brief("approved-row", "Run the approved task.\n");
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        target,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
        "--row",
        "luna-max",
        "--approval",
        "owner approved this row",
      ],
      { AGX_STATE_DIR: join(scratch, "approved-row-state") },
    );
    expect(r.code, r.err).toBe(0);
    expect(bodies).toHaveLength(before);
    const logged = decodedJson(
      z.looseObject({
        pick: z.looseObject({
          source: z.string(),
          choice: z.string(),
          approval: z.string(),
        }),
      }),
      readFileSync(join(r.state, "runs.jsonl"), "utf8").trim().split("\n")[0] ??
        "",
    );
    expect(logged.pick).toEqual({
      source: "override",
      choice: "luna-max",
      approval: "owner approved this row",
      reason: "owner-approved row override",
    });
  });

  test("--row requires an approval", async () => {
    const r = await router([
      "dispatch",
      "--prompt-file",
      b,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
      "--row",
      "luna-max",
    ]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("--row requires a non-empty --approval");
  });

  test("--row rejects an unknown roster id", async () => {
    const r = await router([
      "dispatch",
      "--prompt-file",
      b,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
      "--row",
      "unknown-row",
      "--approval",
      "approved",
    ]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("'unknown-row' is not a roster row");
  });

  test("--choice refusal points to the approved --row override", async () => {
    const r = await router([
      "dispatch",
      "--prompt-file",
      b,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
      "--choice",
      "luna-max",
    ]);
    expect(r.code).toBe(2);
    expect(r.err).toContain('--row <id> --approval "<owner approval>"');
  });

  test("filters unavailable codex rows and records the claude fallback default", async () => {
    const state = join(scratch, "routes-codex-unavailable");
    const target = brief("routes-codex-unavailable", "HTTP500\n");
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        target,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {
        AGX_STATE_DIR: state,
        AGX_TEST_CODEX_ROUTE: "unavailable",
        AGX_RUN_CLAUDE: FAKE_CLAUDE,
      },
    );
    expect(r.code).toBe(0);
    const receipt = decodedJson(
      z.looseObject({
        pick: z.looseObject({
          choice: z.string(),
          routes_unavailable: z.record(z.string(), z.string()),
          default_fallback: z.string(),
        }),
      }),
      r.out.trim(),
    );
    expect(receipt.pick.choice).toBe("haiku-low");
    expect(receipt.pick.routes_unavailable.codex).toBe(
      "injected sandbox denial",
    );
    expect(receipt.pick.default_fallback).toContain("fallback default");
    const asked = decodedJson(
      z.looseObject({
        questions: z.looseObject({
          worker: z.looseObject({ criteria: z.record(z.string(), z.string()) }),
        }),
      }),
      bodies.at(-1) ?? "{}",
    );
    expect(
      Object.keys(asked.questions.worker.criteria).every(
        (id) =>
          !id.startsWith("luna-") &&
          !id.startsWith("terra-") &&
          !id.startsWith("sol-") &&
          !id.startsWith("astra-"),
      ),
    ).toBe(true);
  });

  test("Jev request carries the exact objective and recent throughput records", async () => {
    const state = join(scratch, "throughput-record-state");
    mkdirSync(state, { recursive: true });
    const started = Temporal.Now.instant().toString();
    const entries = [
      ...Array.from({ length: 5 }, (_, index) => {
        const runId = `record-luna-${index}`;
        return [
          JSON.stringify({
            kind: "run",
            run_id: runId,
            started_at: started,
            ticket: {
              schema: 2,
              capabilities: index === 4 ? ["gpu-kernels"] : ["typescript"],
            },
            stats: {
              row: "luna-max",
              outcome: index === 4 ? "timeout" : "ok",
              elapsed_s: (index + 1) * 20,
              cost_usd: 0.5,
            },
          }),
          ...(index === 4
            ? []
            : [
                JSON.stringify({ kind: "grade", run_id: runId, grade: "pass" }),
              ]),
        ];
      }),
      ...Array.from({ length: 2 }, (_, index) =>
        JSON.stringify({
          kind: "run",
          run_id: `record-terra-${index}`,
          started_at: started,
          stats: {
            row: "terra-max",
            outcome: "ok",
            elapsed_s: 45,
            cost_usd: 0.2,
          },
        }),
      ),
    ].flat();
    writeFileSync(join(state, "runs.jsonl"), `${entries.join("\n")}\n`);
    const requestBrief = brief(
      "throughput-record",
      '+++\nschema = 2\ncapabilities = ["gpu-kernels"]\n+++\nChoose a worker.\n',
    );
    const r = await router(
      ["pick", "--prompt-file", requestBrief, "--cd", scratch],
      {
        AGX_STATE_DIR: state,
      },
    );
    expect(r.code).toBe(0);
    const request = decodedJson(
      z.looseObject({
        questions: z.looseObject({
          worker: z.looseObject({
            instructions: z.string(),
            criteria: z.record(z.string(), z.string()),
          }),
        }),
        state: z.looseObject({ recent_throughput: z.string() }),
      }),
      lastJevBody(),
    );
    expect(request.questions.worker.instructions).toContain(
      "Objective: maximize this ticket's expected accepted-returns-per-hour",
    );
    expect(request.questions.worker.instructions).toContain(
      "Maximize expected accepted-returns-per-hour shown in each comparable-ticket tradeoff line",
    );
    expect(request.questions.worker.criteria["luna-max"]).toContain(
      "record for this kind of ticket: record thin for this kind of ticket",
    );
    expect(request.questions.worker.criteria["luna-max"]).toContain(
      "all tickets: runs 5",
    );
    expect(request.questions.worker.criteria["terra-max"]).toContain("n=0;");
    expect(request.questions.worker.criteria["terra-max"]).toContain(
      "all tickets: runs 0",
    );
    expect(request.questions.worker.instructions).toContain(
      "Judge by the record for this kind of ticket; where it is thin, rely on the benchmark columns, not the all-tickets record.",
    );
    expect(request.state.recent_throughput).toContain(
      "luna-max | runs 5 | accepted/h 48.00 | p50 first return 60.0s | accepted 80.0% | timeout 20.0%",
    );
    expect(request.state.recent_throughput).toContain(
      "terra-max | UNMEASURED | runs 0 | accepted/h unknown | p50 first return unknown | accepted 0.0% | timeout 0.0%",
    );
    expect(request.questions.worker.criteria["luna-max"]).toContain(
      "record for this kind of ticket: record thin for this kind of ticket",
    );
    expect(request.questions.worker.criteria["luna-max"]).toContain(
      "Comparable-ticket tradeoff: n=0;",
    );
    expect(request.questions.worker.criteria["luna-max"]).toContain(
      "Comparable-ticket tradeoff: n=0;",
    );
  });

  test("kind records use any shared capability tag and isolate unrelated tags", async () => {
    const state = join(scratch, "kind-records");
    mkdirSync(state, { recursive: true });
    const started = Temporal.Now.instant().toString();
    const kindCwd = freshCwd();
    writeFileSync(
      join(state, "runs.jsonl"),
      Array.from({ length: 3 }, (_, index) =>
        JSON.stringify({
          kind: "run",
          run_id: `ts-kind-${index}`,
          started_at: started,
          cwd: kindCwd,
          ticket: { schema: 2, capabilities: ["typescript"] },
          pick: { choice: "luna-max" },
          stats: { row: "luna-max", outcome: "ok", elapsed_s: 30 },
        }),
      ).join("\n") + "\n",
    );
    const juliaBrief = brief(
      "julia-kind",
      '+++\nschema = 2\noutcome = "choose a worker"\nconsumer = "test"\nfirst_return = "decision"\nwrites = []\nverify = ["true"]\ncapabilities = ["julia", "gpu-kernels"]\n+++\nChoose a worker.\n',
    );
    const julia = await router(
      ["pick", "--prompt-file", juliaBrief, "--cd", kindCwd],
      { AGX_STATE_DIR: state },
    );
    expect(julia.code, julia.err).toBe(0);
    expect(lastJevBody()).toContain(
      "record for this kind of ticket: record thin",
    );
    const tsBrief = brief(
      "typescript-kind",
      '+++\nschema = 2\noutcome = "choose a worker"\nconsumer = "test"\nfirst_return = "decision"\nwrites = []\nverify = ["true"]\ncapabilities = ["typescript"]\n+++\nChoose a worker.\n',
    );
    const ts = await router(
      ["pick", "--prompt-file", tsBrief, "--cd", kindCwd],
      { AGX_STATE_DIR: state },
    );
    expect(ts.code).toBe(0);
    expect(lastJevBody()).toContain("record for this kind of ticket: n=3;");
  });

  test("throughput stats failure is recorded while the worker still runs", async () => {
    const state = join(scratch, "throughput-record-failure");
    mkdirSync(join(state, "runs.jsonl"), { recursive: true });
    onJevRequest = () => {
      rmSync(join(state, "runs.jsonl"), { recursive: true, force: true });
    };
    const failureBrief = brief(
      "throughput-record-failure",
      '+++\nschema = 2\noutcome = "complete the task"\nconsumer = "caller"\nfirst_return = "result"\nwrites = []\nverify = ["true"]\ncapabilities = ["deep-reasoning"]\n+++\nDo this.\n',
    );
    const requestStart = bodies.length;
    const r = await router(
      [...runArgs(failureBrief, freshCwd()), "--no-grader"],
      {
        AGX_STATE_DIR: state,
      },
    );
    expect(r.code).toBe(0);
    expect(bodies.slice(requestStart).at(-1)).not.toContain(
      "recent_throughput",
    );
    expect(r.err).toContain(
      "recent throughput log unavailable; continuing pick:",
    );
    const receipt = decodedJson(
      z.looseObject({
        pick: z.looseObject({ selection_record_unavailable: z.string() }),
        worker: z.looseObject({ outcome: z.string() }),
      }),
      r.out.trim(),
    );
    expect(receipt.pick.selection_record_unavailable.length).toBeGreaterThan(0);
    expect(receipt.worker.outcome).toBe("ok");
    const workerRequest =
      bodies.slice(requestStart).find((body) => body.includes('"worker"')) ??
      "";
    expect(workerRequest).toContain("Recent measured record unavailable.");
  });

  test("record export has the compact schema and import validates/replaces the saved record", async () => {
    const state = join(scratch, "record-commands");
    mkdirSync(state, { recursive: true });
    const log = Array.from({ length: 3 }, (_, i) =>
      JSON.stringify({
        kind: "run",
        run_id: `record-export-${i}`,
        started_at: Temporal.Now.instant().subtract({ hours: i }).toString(),
        pick: { choice: "terra-max" },
        stats: { row: "terra-max", outcome: "ok", elapsed_s: 60 },
      }),
    ).join("\n");
    writeFileSync(join(state, "runs.jsonl"), `${log}\n`);
    const exported = await router(
      ["ledger", "record", "export", "--since", "7d"],
      {
        AGX_STATE_DIR: state,
      },
    );
    expect(exported.code).toBe(0);
    const record = decodedJson(
      z.strictObject({
        schema: z.literal(1),
        host: z.string(),
        exported_at: z.string(),
        window: z.string(),
        per_row: z.record(
          z.string(),
          z.strictObject({
            runs: z.number(),
            accepted_returns_per_worker_hour: z.number().nullable(),
            median_time_to_first_return_s: z.number().nullable(),
            accepted_rate: z.number(),
            timeout_rate: z.number(),
          }),
        ),
        per_tag: z.record(
          z.string(),
          z.record(z.string(), z.looseObject({ runs: z.number() })),
        ),
      }),
      exported.out,
    );
    expect(record.window).toBe("7d");
    expect(record.per_row["terra-max"]?.runs).toBe(3);
    expect(record.per_tag).toEqual({});
    const file = join(scratch, "record-import.json");
    writeFileSync(file, exported.out);
    const imported = await router(["ledger", "record", "import", file], {
      AGX_STATE_DIR: state,
    });
    expect(imported.code).toBe(0);
    expect(imported.out.trim().split("\n")).toHaveLength(1);
    expect(existsSync(join(state, "imported-record.json"))).toBe(true);
    const legacy = {
      schema: 1,
      host: "legacy-host",
      exported_at: "2026-10-08T12:00:00Z",
      window: "7d",
      per_row: {
        "terra-max": {
          runs: 4,
          accepted_returns_per_worker_hour: 2,
          median_time_to_first_return_s: 45,
          accepted_rate: 0.5,
          timeout_rate: 0,
        },
      },
    };
    writeFileSync(file, JSON.stringify(legacy));
    expect(
      (
        await router(["ledger", "record", "import", file], {
          AGX_STATE_DIR: state,
        })
      ).code,
    ).toBe(0);
    writeFileSync(file, "{bad json");
    const rejected = await router(["ledger", "record", "import", file], {
      AGX_STATE_DIR: state,
    });
    expect(rejected.code).toBe(2);
  });

  test("imported rows fill thin local rows and corrupt imports do not block picks", async () => {
    const state = join(scratch, "record-merge");
    mkdirSync(state, { recursive: true });
    const imported = {
      schema: 1,
      host: "source-host",
      exported_at: "2026-10-08T12:00:00Z",
      window: "7d",
      per_row: {
        "terra-max": {
          runs: 9,
          accepted_returns_per_worker_hour: 4,
          median_time_to_first_return_s: 30,
          accepted_rate: 0.5,
          timeout_rate: 0.1,
        },
      },
    };
    writeFileSync(
      join(state, "imported-record.json"),
      JSON.stringify(imported),
    );
    const requestBrief = brief("imported-record-pick", "Choose a worker.\n");
    const r = await router(
      ["pick", "--prompt-file", requestBrief, "--cd", scratch],
      { AGX_STATE_DIR: state },
    );
    expect(r.code).toBe(0);
    expect(lastJevBody()).toContain("all tickets: runs 9");

    const corruptState = join(scratch, "record-corrupt-merge");
    mkdirSync(corruptState, { recursive: true });
    writeFileSync(join(corruptState, "imported-record.json"), "not json");
    const corrupt = await router(
      ["pick", "--prompt-file", requestBrief, "--cd", scratch],
      { AGX_STATE_DIR: corruptState },
    );
    expect(corrupt.code).toBe(0);
    expect(
      corrupt.err.match(/ignoring unreadable imported record/gu)?.length,
    ).toBe(1);
    expect(lastJevBody()).toContain(
      "terra-max | UNMEASURED | runs 0 | accepted/h unknown",
    );
  });

  test("three local runs take precedence over an imported row", async () => {
    const state = join(scratch, "record-local-precedence");
    mkdirSync(state, { recursive: true });
    const started = Temporal.Now.instant().toString();
    writeFileSync(
      join(state, "runs.jsonl"),
      Array.from({ length: 3 }, (_, i) =>
        JSON.stringify({
          kind: "run",
          run_id: `local-${i}`,
          started_at: started,
          pick: { choice: "terra-max" },
          stats: { row: "terra-max", outcome: "ok", elapsed_s: 60 },
        }),
      ).join("\n") + "\n",
    );
    writeFileSync(
      join(state, "imported-record.json"),
      JSON.stringify({
        schema: 1,
        host: "source-host",
        exported_at: "2026-10-08T12:00:00Z",
        window: "7d",
        per_row: {
          "terra-max": {
            runs: 9,
            accepted_returns_per_worker_hour: 4,
            median_time_to_first_return_s: 30,
            accepted_rate: 0.5,
            timeout_rate: 0.1,
          },
        },
      }),
    );
    const requestBrief = brief("local-precedence-pick", "Choose a worker.\n");
    const r = await router(
      ["pick", "--prompt-file", requestBrief, "--cd", scratch],
      { AGX_STATE_DIR: state },
    );
    expect(r.code).toBe(0);
    expect(lastJevBody()).toContain("all tickets: runs 3");
    expect(lastJevBody()).not.toContain("imported from source-host");
  });

  test("refuses with exit 2 when neither worker route is available", async () => {
    const target = brief("routes-none", "Do this.\n");
    const r = await router(["pick", "--prompt-file", target, "--cd", scratch], {
      AGX_STATE_DIR: join(scratch, "routes-none"),
      AGX_TEST_CODEX_ROUTE: "unavailable",
      AGX_TEST_CLAUDE_ROUTE: "unavailable",
    });
    expect(r.code).toBe(2);
    expect(r.err).toContain("no worker route is available");
    expect(r.err).toContain("codex: injected sandbox denial");
    expect(r.err).toContain("claude: claude is not on PATH");
  });

  test("the active marker and run record carry the Claude dispatcher session", async () => {
    const state = join(scratch, "dispatcher-session-state");
    let markerText = "";
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {
        AGX_STATE_DIR: state,
        CLAUDE_CODE_SESSION_ID: "claude-session-test",
        FAKE_SLEEP_MS: "100",
      },
      async () => {
        const active = join(state, "active");
        for (let attempt = 0; attempt < 1000 && markerText === ""; attempt++) {
          const file = existsSync(active)
            ? readdirSync(active).find((name) => name.endsWith(".json"))
            : undefined;
          if (file !== undefined)
            markerText = readFileSync(join(active, file), "utf8");
          else await Bun.sleep(5);
        }
      },
    );
    expect(markerText).toContain('"dispatcher_session":"claude-session-test"');
    expect(readFileSync(join(r.state, "runs.jsonl"), "utf8")).toContain(
      '"dispatcher_session":"claude-session-test"',
    );
  });

  test("Jev's row runs agx with that row, logs, and leaves no running marker", async () => {
    const r = await router([
      "dispatch",
      "--prompt-file",
      b,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
    ]);
    expect(r.code).toBe(0);
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.source).toBe("jev");
    expect(receipt.worker.outcome).toBe("ok");
    expect(receipt).toMatchObject({
      timeout_s: 600,
      timeout_source: "default",
    });
    expect(readFileSync(join(scratch, "argv.log"), "utf8")).toContain(
      '"--choice","luna-low"',
    );
    expect(readFileSync(join(r.state, "runs.jsonl"), "utf8")).toContain(
      '"kind":"run"',
    );
    const runRecord = decodedJson(
      RunLogRecord,
      readFileSync(join(r.state, "runs.jsonl"), "utf8").trim(),
    );
    expect(runRecord.stats).toMatchObject({
      row: "luna-low",
      family: "luna",
      route: "codex",
      model: "gpt-6-luna",
      effort: "low",
      outcome: "ok",
      exit: 0,
      tokens: { input: 100, cached_input: 20, output: 7, reasoning: 3 },
      cost_basis: "list_price_x_tokens",
      price: { in: 0.1, out: 0.5, as_of: "2026-10-08" },
      brief_chars: readFileSync(b, "utf8").length,
      cwd: scratch,
      jev_confidence: 0.9,
      picked_by: "jev",
    });
    expect(runRecord.stats.cost_usd).toBeCloseTo(13.2 / 1_000_000);
    expect(readdirSync(join(r.state, "active"))).toEqual([]);
  });

  test("codex cost is unknown when any token count is absent", async () => {
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { FAKE_USAGE: "missing" },
    );
    const record = decodedJson(
      RunLogRecord,
      readFileSync(join(r.state, "runs.jsonl"), "utf8").trim(),
    );
    expect(record.stats.cost_usd).toBeNull();
    expect(record.stats.cost_basis).toContain("unknown:");
    expect(record.stats.tokens).toEqual({
      input: 100,
      cached_input: null,
      output: null,
      reasoning: null,
    });
  });

  test("the worker's exit code is agx's exit code", async () => {
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { FAKE_EXIT: "1" },
    );
    expect(r.code).toBe(1);
    expect(decodedJson(Receipt, r.out.trim()).worker.outcome).toBe(
      "codex-failed",
    );
  });

  test("an extended CLI time box requires and records its reason", async () => {
    const target = brief("timeout-reason", "Do bounded work.\n");
    const refused = await router([
      "dispatch",
      "--prompt-file",
      target,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
      "--timeout-s",
      "2000",
    ]);
    expect(refused.code).toBe(2);
    expect(refused.err).toContain(
      "--timeout-s above 600 seconds requires --timeout-reason",
    );

    const accepted = await router([
      "dispatch",
      "--prompt-file",
      target,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
      "--timeout-s",
      "2000",
      "--timeout-reason",
      "long integration check",
    ]);
    expect(accepted.code).toBe(0);
    expect(
      decodedJson(
        z.looseObject({
          timeout_s: z.number(),
          timeout_source: z.string(),
          timeout_reason: z.string(),
        }),
        accepted.out.trim(),
      ),
    ).toMatchObject({
      timeout_s: 2000,
      timeout_source: "cli",
      timeout_reason: "long integration check",
    });
    expect(readFileSync(join(accepted.state, "runs.jsonl"), "utf8")).toContain(
      '"timeout_reason":"long integration check"',
    );
  });

  test("a ticket's extended timeout reason is recorded with its effective bound", async () => {
    const target = brief(
      "ticket-timeout-reason",
      '+++\nschema = 1\nwrites = []\ntimeout_s = 1801\ntimeout_reason = "extended integration checks"\n+++\nDo bounded work.\n',
    );
    const r = await router([
      "dispatch",
      "--prompt-file",
      target,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
    ]);
    expect(r.code).toBe(0);
    expect(
      decodedJson(
        z.looseObject({
          timeout_s: z.number(),
          timeout_source: z.string(),
          timeout_reason: z.string(),
        }),
        r.out.trim(),
      ),
    ).toMatchObject({
      timeout_s: 1801,
      timeout_source: "ticket",
      timeout_reason: "extended integration checks",
    });
  });

  test("a valid RETURN is successful, verified, and does not gate a later dispatch", async () => {
    const state = join(scratch, "returned-state");
    const returnRecord = {
      findings: [
        { text: "The brief's premise conflicts with the source", fleet: true },
      ],
      evidence: ["src/actual.ts: the premise is false"],
      impact_on_brief: "The requested change would encode the wrong behavior",
      proposed_next: "Choose whether to revise the premise or scope",
      artifacts: ["src/actual.ts"],
    };
    const message = `{
  "summary": "Returned with a finding",
  "changes": [],
  "checks": [],
  "for_coordinator": [],
  "open": []
}\n\n\`\`\`agx-return\n${JSON.stringify(returnRecord)}\n\`\`\``;
    const ticket = brief(
      "returned-verified",
      '+++\nschema = 1\nwrites = []\nverify = ["true"]\n+++\nWork until a return trigger.\n',
    );
    const first = await router(
      [
        "dispatch",
        "--prompt-file",
        ticket,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {
        AGX_STATE_DIR: state,
        FAKE_LAST: message,
        CLAUDE_CODE_SESSION_ID: "return-test",
      },
    );
    expect(first.code).toBe(0);
    expect(
      decodedJson(
        z.looseObject({
          exit: z.number(),
          worker: z.looseObject({ outcome: z.string() }),
          return: z.unknown(),
          verify_summary: z.string(),
        }),
        first.out.trim(),
      ),
    ).toMatchObject({
      exit: 0,
      worker: { outcome: "returned" },
      return: returnRecord,
      verify_summary: "1/1 passed",
    });
    expect(
      decodedJson(
        RunLogRecord,
        readFileSync(join(state, "runs.jsonl"), "utf8").split("\n")[0] ?? "",
      ).stats,
    ).toMatchObject({ outcome: "returned", exit: 0 });
    const runId = decodedJson(
      z.looseObject({ run_id: z.string() }),
      first.out.trim(),
    ).run_id;
    const shown = await router(["ledger", "result", runId], {
      AGX_STATE_DIR: state,
    });
    expect(shown.out).toContain("RETURN:");
    const second = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: state, CLAUDE_CODE_SESSION_ID: "return-test" },
    );
    expect(second.code).toBe(0);
  });

  test("a RETURN without ticket verification does not gate a later dispatch", async () => {
    const state = join(scratch, "returned-unverified-state");
    const returned = `{
  "summary": "Returned",
  "changes": [],
  "checks": [],
  "for_coordinator": [],
  "open": []
}\n\n\`\`\`agx-return\n${JSON.stringify({
      findings: [{ text: "A premise is contradicted" }],
      evidence: ["source"],
      impact_on_brief: "The task must change",
      proposed_next: "Coordinator chooses scope",
      artifacts: [],
    })}\n\`\`\``;
    const first = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: state, FAKE_LAST: returned },
    );
    expect(first.code).toBe(0);
    expect(
      decodedJson(
        z.looseObject({ worker: z.looseObject({ outcome: z.string() }) }),
        first.out.trim(),
      ).worker.outcome,
    ).toBe("returned");
    const second = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: state },
    );
    expect(second.code).toBe(0);
  });

  test("a malformed RETURN is named and keeps the existing outcome", async () => {
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { FAKE_LAST: '```agx-return\n{"findings":[]}\n```' },
    );
    expect(r.code).toBe(0);
    const receipt = decodedJson(
      z.looseObject({
        worker: z.looseObject({ outcome: z.string() }),
        return_error: z.string(),
      }),
      r.out.trim(),
    );
    expect(receipt.worker.outcome).toBe("ok");
    expect(receipt.return_error).toContain(
      "agx-return block has the wrong shape",
    );
  });

  test("Claude final messages are parsed for RETURN blocks", async () => {
    const record = {
      findings: [{ text: "Method conflicts with the brief" }],
      evidence: ["source proves the conflict"],
      impact_on_brief: "The requested result would be invalid",
      proposed_next: "Select the intended method",
      artifacts: [],
    };
    const message = `\n\`\`\`agx-return\n${JSON.stringify(record)}\n\`\`\``;
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        brief("claude-return", "PICK=sonnet-high\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGX_RUN_CLAUDE: FAKE_CLAUDE, FAKE_LAST: message },
    );
    expect(r.code).toBe(0);
    expect(
      decodedJson(
        z.looseObject({
          worker: z.looseObject({ outcome: z.string() }),
          return: z.unknown(),
        }),
        r.out.trim(),
      ),
    ).toMatchObject({ worker: { outcome: "returned" }, return: record });
  });

  test("auto: a confident Jev answer with one nonzero row samples it", async () => {
    const sampleBrief = brief("sample", "PICK=luna-high\n");
    const r = await router([
      "dispatch",
      "--prompt-file",
      sampleBrief,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
    ]);
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.source).toBe("jev");
    expect(receipt.pick.choice).toBe("luna-high");
    expect(receipt.pick).toMatchObject({
      mode: "sample",
      argmax_row: "luna-high",
      sampled_row: "luna-high",
      temperature: 1,
      sampled_probability: 1,
      epsilon: 0.1,
    });
    expect(typeof receipt.pick.seed).toBe("string");
    expect(receipt.pick.masked_rows).toContainEqual({
      row: "luna-max",
      reason: "xhigh/max lacks a free-text justification",
    });
  });

  test("auto: a low-confidence answer is still Jev's choice, its confidence recorded", async () => {
    const low = brief("low", "LOWCONF NOPROBS something vague\n");
    const r = await router([
      "dispatch",
      "--prompt-file",
      low,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
    ]);
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.source).toBe("default");
    expect(receipt.pick.choice).toBe("luna-high");
    expect(receipt.pick.mode).toBe("fallback");
    expect(receipt.pick.pick_fallback_reason).toBe(
      "no probabilities; Jev choice 'luna-max' is unavailable, using default",
    );
    expect(receipt.pick.confidence).toBe(0.2);
  });

  test("auto: fake Jev distribution is recorded and zero temperature is argmax", async () => {
    const target = brief(
      "distribution-cold",
      "PICK=luna-high PROBS=luna-high:0.75,luna-low:0.25\n",
    );
    const cold = await router([
      "dispatch",
      "--prompt-file",
      target,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
      "--pick-temperature",
      "0",
      "--pick-seed",
      "cold-seed",
    ]);
    const coldPick = decodedJson(Receipt, cold.out.trim()).pick;
    expect(coldPick.choice).toBe("luna-high");
    expect(coldPick.mode).toBe("argmax");
    expect(coldPick.temperature).toBe(0);
    expect(coldPick.sampled_probability).toBe(1);

    const ticket = brief(
      "distribution-ticket-temperature",
      ticketText(
        "writes = []\nverify = []\npick_temperature = 0",
        "PICK=luna-high PROBS=luna-high:0.75,luna-low:0.25\n",
      ),
    );
    const ticketRun = await router([
      ...runArgs(ticket, scratch, "read-only"),
      "--pick-seed",
      "ticket-seed",
    ]);
    const ticketPick = decodedJson(Receipt, ticketRun.out.trim()).pick;
    expect(ticketPick.temperature).toBe(0);
    expect(ticketPick.choice).toBe("luna-high");
    expect(ticketPick.mode).toBe("argmax");

    const repeated = async () => {
      const r = await router([
        "dispatch",
        "--prompt-file",
        target,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
        "--pick-seed",
        "repeatable-seed",
      ]);
      return decodedJson(Receipt, r.out.trim()).pick;
    };
    const [first, second] = await Promise.all([repeated(), repeated()]);
    expect(first.choice).toBe(second.choice);
    expect(first.mode).toBe("sample");
    expect(first.seed).toBe("repeatable-seed");
    expect(first.sampled_probability).toBeCloseTo(
      first.choice === "luna-high" ? 0.725 : 0.275,
      12,
    );
  });

  test("auto: route masking renormalizes surviving Jev probability", async () => {
    const target = brief(
      "distribution-masked",
      "PICK=sonnet-medium PROBS=luna-high:0.25,sonnet-medium:0.75\n",
    );
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        target,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {
        AGX_TEST_CODEX_ROUTE: "unavailable",
        AGX_RUN_CLAUDE: FAKE_CLAUDE,
      },
    );
    expect(r.code).toBe(0);
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.choice).toBe("sonnet-medium");
    expect(receipt.pick.sampled_probability).toBe(1);
    expect(receipt.pick.masked_rows).toContainEqual({
      row: "luna-high",
      reason: "route unavailable: injected sandbox denial",
    });
  });

  test("pick hard-masks Claude rows for tickets outside their run bound", async () => {
    const cases = [
      [
        "long-tool-loop",
        'writes = []\nverify = []\ncapabilities = ["long-tool-loop"]',
      ],
      ["five-writes", 'writes = ["a", "b", "c", "d", "e"]\nverify = []'],
      [
        "long-timeout",
        'writes = []\nverify = []\ntimeout_s = 1200\ntimeout_reason = "long task"',
      ],
    ] as const;
    for (const [name, fields] of cases) {
      const target = brief(name, ticketText(fields, "PICK=sonnet-high\n"));
      const r = await router([
        "pick",
        "--prompt-file",
        target,
        "--cd",
        scratch,
      ]);
      expect(r.code).toBe(0);
      const pick = decodedJson(
        z.looseObject({ masked_rows: z.array(z.unknown()) }),
        r.out.trim(),
      );
      const claudeRows = pick.masked_rows.flatMap((item) => {
        const parsed = z.looseObject({ row: z.string() }).safeParse(item);
        return parsed.success &&
          /^(haiku|sonnet|opus|fable)-/u.test(parsed.data.row)
          ? [item]
          : [];
      });
      expect(claudeRows.length).toBe(20);
      let specificReason = "ticket timeout_s exceeds 600 seconds";
      if (name === "long-tool-loop")
        specificReason =
          "capability requires a long tool loop, long terminal task, multi-file work, or device refactor";
      else if (name === "five-writes")
        specificReason = "ticket declares 5 or more write globs";
      expect(claudeRows[0]).toMatchObject({
        reason: `claude row bound ($2, 60 turns) cannot fit this ticket: ${specificReason}`,
      });
    }
  });

  test("pick keeps Claude rows eligible for a small ticket and tells Jev the bound", async () => {
    const target = brief(
      "small-claude",
      ticketText("writes = []\nverify = []", "PICK=sonnet-high\n"),
    );
    const r = await router(["pick", "--prompt-file", target, "--cd", scratch]);
    expect(r.code).toBe(0);
    expect(lastJevBody()).toContain(
      "Claude rows are bounded at $2 and 60 turns per run; do not prefer them for long multi-file implementation.",
    );
    const masked = decodedJson(
      z.looseObject({
        masked_rows: z.array(z.looseObject({ row: z.string() })),
      }),
      r.out.trim(),
    ).masked_rows;
    expect(
      masked.some(({ row }) =>
        /^(haiku|sonnet|opus|fable)-(low|medium|high)$/u.test(row),
      ),
    ).toBe(false);
  });

  test("pick requires free-text justification and limits epsilon by relative cost", async () => {
    const pick = async (name: string, capabilities: string, jev: string) => {
      const target = brief(
        name,
        ticketText(
          `writes = []\nverify = []\ncapabilities = ["${capabilities}"]`,
          jev,
        ),
      );
      const result = await router([
        "pick",
        "--prompt-file",
        target,
        "--cd",
        scratch,
      ]);
      expect(result.code).toBe(0);
      return decodedJson(
        z.looseObject({
          masked_rows: z.array(z.looseObject({ row: z.string() })),
          epsilon_rows: z.array(z.string()),
        }),
        result.out.trim(),
      );
    };

    const bareTag = await pick(
      "bare-capability",
      "typescript",
      "PICK=luna-low PROBS=luna-low:1,luna-max:0,opus-max:0",
    );
    expect(bareTag.masked_rows.map((row) => row.row)).toContain("luna-max");
    expect(bareTag.masked_rows.map((row) => row.row)).toContain("opus-max");

    const justified =
      "debugging a hang across a 4000-line file where four luna attempts failed";
    const lowArgmax = await pick(
      "cheap-argmax",
      justified,
      "PICK=luna-low PROBS=luna-low:1,opus-max:0,fable-max:0",
    );
    expect(lowArgmax.masked_rows).toEqual([]);
    expect(lowArgmax.epsilon_rows).toEqual(["luna-low"]);
    expect(lowArgmax.epsilon_rows).not.toContain("opus-max");
    expect(lowArgmax.epsilon_rows).not.toContain("fable-max");

    const sonnetArgmax = await pick(
      "sonnet-argmax",
      justified,
      "PICK=sonnet-high PROBS=sonnet-high:1,opus-max:0,fable-max:0",
    );
    expect(sonnetArgmax.epsilon_rows).toContain("sonnet-high");
    expect(sonnetArgmax.epsilon_rows).toContain("opus-max");
    expect(sonnetArgmax.epsilon_rows).not.toContain("fable-max");
  });

  test("pick falls back to the roster default when Claude is the only available route and is masked", async () => {
    const target = brief(
      "all-claude-masked",
      ticketText('writes = []\nverify = []\ncapabilities = ["long-tool-loop"]'),
    );
    const r = await router(["pick", "--prompt-file", target, "--cd", scratch], {
      AGX_TEST_CODEX_ROUTE: "unavailable",
      AGX_RUN_CLAUDE: FAKE_CLAUDE,
    });
    expect(r.code).toBe(0);
    expect(
      decodedJson(
        z.looseObject({ choice: z.string(), source: z.string() }),
        r.out.trim(),
      ),
    ).toMatchObject({
      choice: "luna-high",
      source: "default",
    });
  });

  test("auto: zero Jev probabilities remain eligible through smoothing", async () => {
    const target = brief(
      "distribution-zero",
      "PICK=luna-high PROBS=luna-high:1,luna-low:0\n",
    );
    const r = await router([
      "dispatch",
      "--prompt-file",
      target,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
    ]);
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(["luna-high", "luna-low"]).toContain(receipt.pick.choice);
    expect(receipt.pick.mode).toBe("sample");
    expect(receipt.pick.epsilon).toBe(0.1);
    expect(receipt.pick.sampled_probability).toBeGreaterThan(0);
    expect(receipt.pick.masked_rows).toContainEqual({
      row: "luna-max",
      reason: "xhigh/max lacks a free-text justification",
    });
  });

  test("auto: no key falls back to the default and names where it looked", async () => {
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {
        TYPESAFE_API_KEY: "",
        PATH: "/usr/bin:/bin",
        HOME: scratch,
      },
    );
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.source).toBe("default");
    expect(receipt.pick.reason).toContain("no TYPESAFE_API_KEY");
  });

  test("auto: a cwd under no_egress never calls Jev", async () => {
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { DISPATCH_ROSTER_PATH: NO_EGRESS },
    );
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.source).toBe("default");
    expect(receipt.pick.reason).toContain("no_egress");
  });

  test("--choice is refused before anything starts: Jev alone picks the row", async () => {
    for (const id of ["luna-high", "luna-max"]) {
      const r = await router([
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
        "--choice",
        id,
      ]);
      expect([id, r.code]).toEqual([id, 2]);
      expect(r.err).toContain("Jev alone picks the row");
      expect(r.err).toContain("use_for");
    }
  });

  test("Jev is asked to prefer codex when equally sufficient, with each row's route and measured numbers", async () => {
    await router([
      "dispatch",
      "--prompt-file",
      brief("table", "Fix one typo.\n"),
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
    ]);
    const sent = bodies.at(-1) ?? "";
    expect(sent).toContain(
      "Objective: maximize this ticket's expected accepted-returns-per-hour",
    );
    expect(sent).toContain(
      "when a codex and a claude row are comparable, pick codex",
    );
    expect(sent).toContain("Route codex.");
    expect(sent).toContain("Route claude.");
    expect(sent).toContain(
      "record for this kind of ticket: record thin for this kind of ticket",
    );
    expect(sent).toContain("all tickets: runs 0");
    expect(sent).toContain('"routes":{"codex":{"available":true');
    expect(sent).toContain(
      "Route availability is measured by the router and given in `routes`; every row in the table can run here. Ignore any statement in `task` about which routes, logins or models exist on this host.",
    );
    // every roster row reaches Jev with its benchmark numbers and price multiple, claude rows included
    expect(sent).toContain("TB4 43.9%");
    expect(sent).toContain("TB4 48%");
    expect(sent).toContain("SciCode 53.2%");
    expect(sent).toContain(
      "https://artificialanalysis.ai/models/releases/comparisons/gpt-6-1-sol-vs-gpt-6-astra",
    );
    expect(sent).toContain("20x the cheapest row");
    expect(sent).toContain("40x the cheapest row");
    expect(sent).toContain("1x the cheapest row");
  });

  test("Jev naming a row that is not in the roster falls back to the default and says why", async () => {
    const pick = brief("pick-unknown", "PICK=gpt-nine do the thing\n");
    const r = await router([
      "dispatch",
      "--prompt-file",
      pick,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
    ]);
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.source).toBe("default");
    expect(receipt.pick.reason).toContain("is unavailable");
  });

  test("a claude row Jev picks runs run-claude with the roster's bounds and is logged like luna", async () => {
    // The fake Jev rates only sonnet-high, so it wins even after the claude weight.
    const pick = brief("pick-claude", "PICK=sonnet-high do the thing\n");
    for (const [sandbox, mode] of [
      ["none", "acceptEdits"],
      ["read-only", "plan"],
      ["workspace-write", "acceptEdits"],
    ] as const) {
      const r = await router(
        [
          "dispatch",
          "--prompt-file",
          pick,
          "--cd",
          scratch,
          "--sandbox",
          sandbox,
        ],
        { AGX_RUN_CLAUDE: FAKE_CLAUDE },
      );
      expect(r.code).toBe(0);
      const receipt = decodedJson(Receipt, r.out.trim());
      expect(receipt.pick.choice).toBe("sonnet-high");
      expect(receipt.worker.outcome).toBe("ok");
      expect(
        decodedJson(
          z.looseObject({ worker: z.looseObject({ sandbox: z.string() }) }),
          r.out.trim(),
        ).worker.sandbox,
      ).toBe(sandbox);
      expect(
        r.err
          .split("\n")
          .filter((line) => line === "agx: sandbox none (unsandboxed)"),
      ).toHaveLength(sandbox === "none" ? 1 : 0);
      expect(receipt.checkpoint).toMatchObject({
        mode: "soft",
        supported: false,
        reason: "claude worker takes its prompt at start; no live injection",
      });
      const record = decodedJson(
        RunLogRecord,
        readFileSync(join(r.state, "runs.jsonl"), "utf8").trim(),
      );
      expect(record.stats).toMatchObject({
        route: "claude",
        cost_usd: 0.01,
        cost_basis: "billed",
        tokens: { input: 80, cached_input: 15, output: 7, reasoning: null },
      });
      const argv = readFileSync(join(scratch, "claude-argv.log"), "utf8")
        .trim()
        .split("\n")
        .at(-1);
      for (const word of [
        '"--model","claude-sonnet-5-5"',
        '"--effort","high"',
        `"--permission-mode","${mode}"`,
        '"--max-budget-usd","2"',
        '"--max-turns","60"',
        '"--timeout-ms","600000"',
      ])
        expect(`${sandbox}: ${argv ?? ""}`).toContain(word);
    }
  });

  test("a Haiku row passes its model id and effort to Claude unchanged", async () => {
    const pick = brief("pick-haiku", "PICK=haiku-low do the thing\n");
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        pick,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGX_RUN_CLAUDE: FAKE_CLAUDE },
    );
    expect(r.code).toBe(0);
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.choice).toBe("haiku-low");
    const argv = readFileSync(join(scratch, "claude-argv.log"), "utf8")
      .trim()
      .split("\n")
      .at(-1);
    expect(argv).toContain('"--model","claude-haiku-5-5"');
    expect(argv).toContain('"--effort","low"');
  });

  test("--timeout-s overrides the Claude route default", async () => {
    const pick = brief(
      "pick-claude-timeout",
      "PICK=sonnet-high do the thing\n",
    );
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        pick,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
        "--timeout-s",
        "60",
      ],
      { AGX_RUN_CLAUDE: FAKE_CLAUDE },
    );
    expect(r.code).toBe(0);
    const argv = readFileSync(join(scratch, "claude-argv.log"), "utf8")
      .trim()
      .split("\n")
      .at(-1);
    expect(argv).toContain('"--timeout-ms","60000"');
  });

  test("the router run_id is used by agx for its receipt file and receipt field", async () => {
    const dir = join(scratch, "real-agx");
    mkdirSync(dir, { recursive: true });
    const codex = join(dir, "codex");
    writeFileSync(
      codex,
      `#!/bin/sh\nout=""; prev=""\nfor a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done\nprintf 'router integration report\\n' > "$out"\nprintf '%s\\n' '{"type":"thread.started","thread_id":"thread-router-integration"}' '{"type":"turn.completed","usage":{"input_tokens":2,"cached_input_tokens":0,"output_tokens":3,"reasoning_output_tokens":0}}'\n`,
    );
    chmodSync(codex, 0o755);
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        brief("real-run", "Use the real agx wrapper.\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {
        AGX_CODEX_WORKER: join(import.meta.dir, "../src/workers/codex.ts"),
        AGX_CODEX_BIN: codex,
        AGX_CODEX_HOST_FILE: join(dir, "no-host.toml"),
        TMPDIR: dir,
      },
    );
    expect(r.code).toBe(0);
    const receipt = decodedJson(
      z.looseObject({
        run_id: z.string(),
        worker: z.looseObject({ run_id: z.string(), receipt_file: z.string() }),
      }),
      r.out.trim(),
    );
    expect(receipt.worker.run_id).toBe(receipt.run_id);
    expect(receipt.worker.receipt_file.split("/").at(-1)).toBe(
      `${receipt.run_id}.json`,
    );
    expect(existsSync(receipt.worker.receipt_file)).toBe(true);
    expect(readFileSync(receipt.worker.receipt_file, "utf8")).toContain(
      `"run_id":"${receipt.run_id}"`,
    );
  });

  test("five identical Codex tool errors stop early and retain a named harness partial report", async () => {
    const dir = join(scratch, "real-codex-spin");
    mkdirSync(dir, { recursive: true });
    const codex = join(dir, "codex");
    const argvLog = join(dir, "argv.log");
    writeFileSync(
      codex,
      `#!/bin/sh
printf '%s\\n' "$@" > "${argvLog}"
echo '{"type":"thread.started","thread_id":"thread-spin-test"}'
i=0
while [ "$i" -lt 5 ]; do
  echo '{"type":"item.completed","item":{"type":"tool_call","name":"apply_patch","status":"failed","error":"apply_patch verification failed: invalid patch: multiple operations target <same file>"}}'
  i=$((i + 1))
done
sleep 30
`,
    );
    chmodSync(codex, 0o755);
    const t0 = performance.now();
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        brief("real-codex-spin", "PICK=luna-high Keep working.\\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {
        AGX_CODEX_WORKER: join(import.meta.dir, "../src/workers/codex.ts"),
        AGX_CODEX_BIN: codex,
        AGX_CODEX_HOST_FILE: join(dir, "no-host.toml"),
        TMPDIR: dir,
      },
    );
    expect(performance.now() - t0).toBeLessThan(10_000);
    expect(r.code).toBe(3);
    const receipt = decodedJson(
      z.looseObject({
        worker: z.looseObject({ outcome: z.string(), cause: z.string() }),
        report_partial: z.looseObject({
          cause: z.string(),
          return: z.looseObject({ received: z.boolean(), note: z.string() }),
        }),
        resume_with: z.string(),
      }),
      r.out.trim(),
    );
    const cause =
      "stopped: 5 identical consecutive tool errors: apply_patch verification failed: invalid patch: multiple operations target <same file>";
    expect(receipt.worker.outcome).toBe("timeout");
    expect(receipt.worker.cause).toBe(cause);
    expect(receipt.report_partial.cause).toBe(cause);
    expect(receipt.resume_with).toContain("agx dispatch --resume ");
    const codexArgs = readFileSync(argvLog, "utf8");
    expect(codexArgs).toContain(
      "For apply_patch, use at most one operation per file in a call",
    );
    expect(codexArgs).toContain("After a tool error, change approach");
  }, 20_000);

  test("omitting --sandbox stays refused rather than defaulting to none", async () => {
    const before = existsSync(join(scratch, "argv.log"))
      ? readFileSync(join(scratch, "argv.log"), "utf8")
      : "";
    const r = await router(["dispatch", "--prompt-file", b, "--cd", scratch]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("dispatch needs --prompt-file, --cd and --sandbox");
    expect(readFileSync(join(scratch, "argv.log"), "utf8")).toBe(before);
  });

  test.each(["none", "read-only", "workspace-write"])(
    "explicit %s passes through the Codex route and resume",
    async (sandbox) => {
      const lastArgs = (): string[] =>
        decodedJson(
          z.array(z.string()),
          readFileSync(join(scratch, "argv.log"), "utf8")
            .trim()
            .split("\n")
            .at(-1) ?? "",
        );
      const r = await router([
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        sandbox,
      ]);
      expect(r.code).toBe(0);
      const argv = lastArgs();
      expect(argv[argv.indexOf("--sandbox") + 1]).toBe(sandbox);
      const id = decodedJson(
        z.looseObject({ run_id: z.string() }),
        r.out.trim(),
      ).run_id;
      expect(
        decodedJson(
          z.looseObject({ worker: z.looseObject({ sandbox: z.string() }) }),
          r.out.trim(),
        ).worker.sandbox,
      ).toBe(sandbox);
      const resumed = await router(["dispatch", "--resume", id], {
        AGX_STATE_DIR: r.state,
      });
      expect(resumed.code).toBe(0);
      const resumedArgs = lastArgs();
      expect(resumedArgs[resumedArgs.indexOf("--sandbox") + 1]).toBe(sandbox);
    },
  );

  test("a bad --sandbox is refused", async () => {
    const r = await router([
      "dispatch",
      "--prompt-file",
      b,
      "--cd",
      scratch,
      "--sandbox",
      "danger-full-access",
    ]);
    expect(r.code).toBe(2);
  });
});

describe("agx ledger result", () => {
  test("prints the final report verbatim after the run header", async () => {
    const state = join(scratch, "result-report");
    const b = brief("result-report", "Do the work.\n");
    const run = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: state },
    );
    const id = decodedJson(RunIdSchema, run.out.trim()).run_id;
    const r = await router(["ledger", "result", id], { AGX_STATE_DIR: state });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      /row=luna-low outcome=ok exit=0 elapsed=\d+(?:\.\d+)?s/u,
    );
    expect(r.out.endsWith("final report from fake worker\n")).toBe(true);
  });

  test("prints the harness-written partial report for a timed-out worker", async () => {
    const b = brief(
      "result-partial",
      ticketText("writes = []\nverify = []", "Do bounded work.\n"),
    );
    const run = await router(runArgs(b, freshCwd()), { FAKE_TIMEOUT: "1" });
    const receipt = decodedJson(
      z.looseObject({
        run_id: z.string(),
        report_partial: z.looseObject({
          last_progress: z.string(),
          commands: z.number(),
          files_changed: z.array(z.string()),
          last_message_tail: z.string(),
          cause: z.string(),
        }),
      }),
      run.out.trim(),
    );
    expect(receipt.report_partial.cause).toContain("timed out");
    expect(receipt.report_partial.return).toEqual({
      received: false,
      note: "no RETURN was received before timeout",
    });
    const shown = await router(["ledger", "result", receipt.run_id], {
      AGX_STATE_DIR: run.state,
    });
    expect(shown.out).toContain("Partial (harness-written):");
  });

  test("timeout keeps the harness partial report even when verify passes and the worker has no final report", async () => {
    const b = brief(
      "result-timeout-verified-no-report",
      ticketText('writes = []\nverify = ["true"]', "Do bounded work.\n"),
    );
    const run = await router(runArgs(b, freshCwd()), {
      FAKE_TIMEOUT: "1",
      FAKE_NO_REPORT: "1",
    });
    const receipt = decodedJson(
      z.looseObject({
        report_partial: z.looseObject({ cause: z.string() }),
        verify_summary: z.string(),
        worker: z.looseObject({ last_message: z.string() }),
      }),
      run.out.trim(),
    );
    expect(receipt.report_partial.cause).toContain("timed out");
    expect(receipt.verify_summary).toBe("1/1 passed");
    expect(receipt.worker.last_message).toBe("");
  });

  test("an empty final report is explicit and exits 1", async () => {
    const state = join(scratch, "result-empty");
    const b = brief("result-empty", "Do the work.\n");
    const run = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {
        AGX_STATE_DIR: state,
        FAKE_EXIT: "1",
        FAKE_NO_REPORT: "1",
      },
    );
    const id = decodedJson(RunIdSchema, run.out.trim()).run_id;
    const r = await router(["ledger", "result", id], { AGX_STATE_DIR: state });
    expect(r.code).toBe(1);
    expect(r.out).toContain("outcome=codex-failed");
    expect(r.out).toContain("No final report");
    expect(r.out).toContain("cause=fake worker failed");
  });

  test("resolves a Claude vendor-session prefix and supports JSON", async () => {
    const state = join(scratch, "result-claude");
    const b = brief("result-claude", "PICK=sonnet-high do the thing\n");
    const run = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {
        AGX_STATE_DIR: state,
        AGX_RUN_CLAUDE: FAKE_CLAUDE,
      },
    );
    expect(run.code).toBe(0);
    const r = await router(["ledger", "result", "sess-claude", "--json"], {
      AGX_STATE_DIR: state,
    });
    expect(r.code).toBe(0);
    const parsed = decodedJson(
      z.looseObject({
        run_id: z.string(),
        worker: z.looseObject({ last_message: z.string() }),
      }),
      r.out.trim(),
    );
    expect(parsed.run_id).toBe(decodedJson(RunIdSchema, run.out.trim()).run_id);
    expect(parsed.worker.last_message).toBe("done");
  });

  test("an unknown id says there is no run", async () => {
    const r = await router(["ledger", "result", "unknown-run-id"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("no run unknown-run-id");
  });
});

describe("agx ledger ls and stats", () => {
  test("a marker whose process is gone is reported as stale, not hidden", async () => {
    const state = join(scratch, "state-stale");
    const active = join(state, "active");
    mkdirSync(active, { recursive: true });
    writeFileSync(
      join(active, "dead.json"),
      JSON.stringify({
        schema: 1,
        run_id: "dead",
        pid: 2_147_483_000,
        label: "gone",
        choice: "luna-high",
        pick_source: "explicit",
        started_at: "2026-10-05T00:00:00Z",
        cwd: scratch,
      }),
    );
    const r = await router(["ledger", "ls"], { AGX_STATE_DIR: state });
    expect(r.err).toContain("STALE");
    expect(r.out).toContain('"alive":false');
    rmSync(join(active, "dead.json"));
  });

  test("stats counts picks by source and runs by row", async () => {
    const state = join(scratch, "state-stats");
    const b = brief("stats", "Fix the flaky test.\n");
    for (const [index, env] of [
      {},
      { TYPESAFE_API_KEY: "", PATH: "/usr/bin:/bin", HOME: scratch },
    ].entries()) {
      const cwd = mkdtempSync(join(scratch, "stats-cwd-"));
      await router(
        ["dispatch", "--prompt-file", b, "--cd", cwd, "--sandbox", "read-only"],
        {
          AGX_STATE_DIR: state,
          CLAUDE_CODE_SESSION_ID: `stats-session-${index}`,
          ...env,
        },
      );
    }
    const r = await router(["ledger", "stats"], { AGX_STATE_DIR: state });
    expect(r.code).toBe(0);
    const report = decodedJson(
      z.looseObject({
        by_source: z.record(z.string(), z.number()),
        per_choice: z.record(z.string(), z.unknown()),
      }),
      r.out.trim(),
    );
    // No run is explicit any more (--choice is refused); old logs may still hold some.
    expect(report.by_source.explicit).toBe(0);
    expect(report.by_source.jev).toBeGreaterThan(0);
    expect(report.by_source.default).toBeGreaterThan(0);
    expect(Object.keys(report.per_choice)).toContain("luna-low");
  });

  test("no state dir yet: ls and stats still answer", async () => {
    expect(existsSync(join(scratch, "empty"))).toBe(false);
    expect(
      (
        await router(["ledger", "ls"], {
          AGX_STATE_DIR: join(scratch, "empty"),
        })
      ).err,
    ).toContain("nothing running");
    expect(
      (
        await router(["ledger", "stats"], {
          AGX_STATE_DIR: join(scratch, "empty"),
        })
      ).code,
    ).toBe(0);
  });
});

describe("agx ledger note and throughput CLI", () => {
  test("ack records consumed and rejected outcomes; unknown run writes nothing", async () => {
    const state = join(scratch, "ack-fixture");
    mkdirSync(state, { recursive: true });
    const log = join(state, "runs.jsonl");
    writeFileSync(
      log,
      `${JSON.stringify({ kind: "run", run_id: "ack-run", pick: { source: "jev", choice: "row-a" } })}\n`,
    );
    const consumed = await router(
      ["ledger", "note", "ack-run", "--consumed", "--note", "used"],
      {
        AGX_STATE_DIR: state,
        CLAUDE_CODE_SESSION_ID: "dispatcher-test",
      },
    );
    expect(consumed.code).toBe(0);
    expect(consumed.out).toContain('"consumed":true');
    expect(consumed.out).toContain('"dispatcher_session":"dispatcher-test"');
    const rejected = await router(["ledger", "note", "ack-run", "--rejected"], {
      AGX_STATE_DIR: state,
    });
    expect(rejected.code).toBe(0);
    expect(rejected.out).toContain('"consumed":false');
    const before = readFileSync(log, "utf8");
    const unknown = await router(["ledger", "note", "missing", "--consumed"], {
      AGX_STATE_DIR: state,
    });
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain("no acknowledgement recorded");
    expect(readFileSync(log, "utf8")).toBe(before);
  });

  test("stats check exits 1 when grading overhead exceeds saves and 0 otherwise", async () => {
    const state = join(scratch, "grading-check-fixture");
    mkdirSync(state, { recursive: true });
    const log = join(state, "runs.jsonl");
    writeFileSync(
      log,
      `${JSON.stringify({
        kind: "refusal",
        run_id: "refused",
        at: Temporal.Now.instant().toString(),
        effort: "medium",
        pick: {
          source: "jev",
          choice: "row-a",
          confidence: 0.4,
          jev: { latency_ms: 500 },
        },
        ticket: { schema: 1, capabilities: [] },
        ticket_grade: {
          verdict: "clarify",
          grader: { elapsed_s: 2, usage: { cost_usd: 0.06 } },
        },
      })}\n`,
    );
    const over = await router(
      ["ledger", "stats", "--since", "7d", "--grading", "--check"],
      { AGX_STATE_DIR: state },
    );
    expect(over.code).toBe(1);
    expect(over.out).toContain('"legacy"');
    expect(over.out).toContain('"estimated_saved_worker_s":0');
    expect(over.out).toContain('"estimated_saved_cost_usd":0');

    writeFileSync(log, "");
    const okay = await router(["ledger", "stats", "--grading", "--check"], {
      AGX_STATE_DIR: state,
    });
    expect(okay.code).toBe(0);
    expect(okay.out).toContain('"per_row":{}');
  });

  test("plain floor violations refuse; --legacy-brief records its reason", async () => {
    const b = brief(
      "plain-floor-refusal",
      "A plain brief with no measurable first return.\n",
    );
    const refused = await router(runArgs(b, freshCwd()), {
      TEST_SKIP_LEGACY: "1",
    });
    expect(refused.code).toBe(2);
    expect(refused.err).toContain("remand verify:");
    expect(refused.err).toContain("read_only_diagnostic");
    expect(logLines(refused.state).map((line) => line.kind)).toEqual([
      "refusal",
    ]);
    const escaped = await router([
      ...runArgs(b, freshCwd()),
      "--legacy-brief",
      "exception for this release",
    ]);
    expect(escaped.code).toBe(0);
    expect(escaped.out).toContain(
      '"legacy_brief_reason":"exception for this release"',
    );
  });
});

describe("agx ledger export", () => {
  test("exports latest grade, waiver and legacy rows without dropping them", async () => {
    const state = join(scratch, "export-history");
    const evidence = join(scratch, "export-evidence.txt");
    writeFileSync(evidence, "GRADE=pass\n");
    const a = await router(
      [
        "dispatch",
        "--prompt-file",
        brief("export-a", "first\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: state },
    );
    const aId = decodedJson(RunIdSchema, a.out.trim()).run_id;
    await router(["ticket", "grade", aId, "--evidence", evidence], {
      AGX_STATE_DIR: state,
    });
    const b = await router(
      [
        "dispatch",
        "--prompt-file",
        brief("export-b", "second\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: join(scratch, "export-waiver") },
    );
    const bId = decodedJson(RunIdSchema, b.out.trim()).run_id;
    await router(["ticket", "grade", bId, "--waive", "insufficient evidence"], {
      AGX_STATE_DIR: join(scratch, "export-waiver"),
    });
    const legacy = {
      schema: 1,
      kind: "run",
      run_id: "legacy-run",
      started_at: "2026-10-01T00:00:00Z",
      pick: { source: "default", choice: "luna-high", reason: "old" },
      exit: 0,
      cwd: scratch,
      brief: { path: evidence, chars: 5 },
      worker: {
        outcome: "ok",
        model: "gpt-6-luna",
        effort: "high",
        elapsed_s: 2,
        usage: {
          input_tokens: 12,
          cached_input_tokens: 3,
          output_tokens: 4,
          reasoning_output_tokens: 1,
        },
      },
    };
    writeFileSync(
      join(state, "runs.jsonl"),
      `${readFileSync(join(state, "runs.jsonl"), "utf8")}${JSON.stringify(legacy)}\n`,
    );
    const changedPrices = roster("changed-prices", (text) =>
      text.replaceAll("price_in = 0.10", "price_in = 99.00"),
    );
    const out = await router(["ledger", "export"], {
      AGX_STATE_DIR: state,
      DISPATCH_ROSTER_PATH: changedPrices,
    });
    expect(out.code).toBe(0);
    const rows = out.out
      .trim()
      .split("\n")
      .map((line) => decodedJson(ExportRecord, line));
    expect(rows.find((row) => row.run_id === aId)).toMatchObject({
      grade: "pass",
      confidence: 0.9,
      price: { in: 0.1, out: 0.5, as_of: "2026-10-08" },
    });
    expect(rows.find((row) => row.run_id === "legacy-run")).toMatchObject({
      grade: null,
      family: "luna",
      tokens: { input: 12, cached_input: 3, output: 4, reasoning: 1 },
      cost_usd: null,
    });

    const waiverState = join(scratch, "export-waiver");
    const waivedExport = await router(["ledger", "export"], {
      AGX_STATE_DIR: waiverState,
    });
    expect(waivedExport.out).toContain(`"run_id":"${bId}"`);
    expect(waivedExport.out).toContain('"waived":"insufficient evidence"');
  });

  test("--since filters on start time", async () => {
    const r = await router(
      ["ledger", "export", "--since", "2026-10-06T00:00:00Z"],
      {
        AGX_STATE_DIR: join(scratch, "empty-export"),
      },
    );
    expect(r.code).toBe(0);
    expect(r.out).toBe("");
  });
});

describe("agx ticket grade", () => {
  // Each test gets its own state dir and one real (fake-worker) run to grade.
  async function oneRun(
    name: string,
  ): Promise<{ state: string; runId: string }> {
    const state = join(scratch, `grade-${name}`);
    const b = brief(`grade-${name}`, "Remove every throw from x.ts.\n");
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        b,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: state },
    );
    const runId = decodedJson(
      z.looseObject({ run_id: z.string() }),
      r.out.trim(),
    ).run_id;
    return { state, runId };
  }
  const evidenceFile = (name: string, text: string): string => {
    const p = join(scratch, `evidence-${name}.txt`);
    writeFileSync(p, text);
    return p;
  };

  test("Jev's grade is appended beside the run, and stats counts it per row", async () => {
    const { state, runId } = await oneRun("pass");
    const ev = evidenceFile(
      "pass",
      "lint 0 errors; tsgo 0; bun test 24 pass 0 fail. GRADE=pass\n",
    );
    const g = await router(["ticket", "grade", runId, "--evidence", ev], {
      AGX_STATE_DIR: state,
    });
    expect(g.code).toBe(0);
    expect(g.err).toContain(`${runId} graded pass`);
    const Graded = z.looseObject({
      kind: z.literal("grade"),
      grade: z.string(),
      confidence: z.number(),
    });
    expect(decodedJson(Graded, g.out.trim())).toMatchObject({
      grade: "pass",
      confidence: 0.9,
    });
    // what Jev read: the evidence, the worker's report, the brief
    const sent = bodies.at(-1) ?? "";
    expect(sent).toContain("GRADE=pass");
    expect(sent).toContain("Remove every throw");
    const s = await router(["ledger", "stats"], { AGX_STATE_DIR: state });
    const Report = z.looseObject({
      per_choice: z.record(
        z.string(),
        z.looseObject({ graded: z.record(z.string(), z.number()) }),
      ),
    });
    expect(
      decodedJson(Report, s.out.trim()).per_choice["luna-low"]?.graded,
    ).toEqual({ pass: 1, partial: 0, fail: 0 });
  });

  test("the grade history reaches Jev with each row when it next routes", async () => {
    const { state, runId } = await oneRun("history");
    await router(
      [
        "ticket",
        "grade",
        runId,
        "--evidence",
        evidenceFile("history", "GRADE=fail\n"),
      ],
      {
        AGX_STATE_DIR: state,
      },
    );
    await router(["pick", "--prompt-file", brief("next", "next task\n")], {
      AGX_STATE_DIR: state,
    });
    expect(bodies.at(-1)).toContain(
      "graded runs here: 0 pass, 0 partial, 1 fail",
    );
  });

  test("a low-confidence grade is Jev's grade, its confidence recorded", async () => {
    const { state, runId } = await oneRun("low");
    const g = await router(
      [
        "ticket",
        "grade",
        runId,
        "--evidence",
        evidenceFile("low", "LOWCONF GRADE=pass\n"),
      ],
      {
        AGX_STATE_DIR: state,
      },
    );
    expect(g.code).toBe(0);
    expect(g.err).toContain(`${runId} graded pass (confidence 0.20)`);
  });

  test("refused, nothing recorded: unknown run and missing evidence", async () => {
    const { state, runId } = await oneRun("refused");
    const ev = evidenceFile("refused", "GRADE=pass\n");
    const cases: [string[], Record<string, string>, string][] = [
      [
        ["ticket", "grade", "no-such-run", "--evidence", ev],
        {},
        "no run no-such-run",
      ],
      [
        ["ticket", "grade", runId, "--evidence", join(scratch, "missing.txt")],
        {},
        "no such evidence file",
      ],
      [["ticket", "grade", runId], {}, "grade needs --evidence"],
    ];
    for (const [args, env, why] of cases) {
      const r = await router(args, { AGX_STATE_DIR: state, ...env });
      expect([why, r.code]).toEqual([why, 2]);
      expect(r.err).toContain(why);
    }
    expect(readFileSync(join(state, "runs.jsonl"), "utf8")).not.toContain(
      '"kind":"grade"',
    );
  });

  test("Jev 503 is automatically waived and releases the dispatcher-session gate", async () => {
    const state = join(scratch, "grade-auto-waive-503");
    const cwd = freshCwd();
    const session = "grade-auto-waive-503";
    const first = await router(
      [
        "dispatch",
        "--prompt-file",
        brief("grade-auto-waive-503-first", "First ungraded run.\n"),
        "--cd",
        cwd,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: state, CLAUDE_CODE_SESSION_ID: session },
    );
    const runId = decodedJson(RunIdSchema, first.out.trim()).run_id;
    const evidence = evidenceFile("auto-waive-503", "HTTP503\n");
    const graded = await router(
      ["ticket", "grade", runId, "--evidence", evidence],
      {
        AGX_STATE_DIR: state,
        CLAUDE_CODE_SESSION_ID: session,
      },
    );
    expect(graded.code).toBe(0);
    const waiver = logLines(state).find(
      (line) => line.kind === "grade-waived" && line.run_id === runId,
    );
    expect(waiver?.reason).toContain("503");
    const next = await router(
      runArgs(brief("grade-auto-waive-503-next", "Next run.\n"), cwd),
      { AGX_STATE_DIR: state, CLAUDE_CODE_SESSION_ID: session },
    );
    expect(next.code).toBe(0);
    expect(next.err).not.toContain(runId);
  });
});

// An ungraded run without verify is advisory: dispatch warns once and continues.
describe("ungraded runs without verify", () => {
  const evidence = (text: string): string => {
    const p = join(mkdtempSync(join(scratch, "ev-")), "evidence.txt");
    writeFileSync(p, text);
    return p;
  };
  const RunId = z.looseObject({ run_id: z.string() });
  async function first(
    state: string,
    cwd: string,
    session = "o3-session",
  ): Promise<string> {
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        brief("o3", "Fix x.ts.\n"),
        "--cd",
        cwd,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: state, CLAUDE_CODE_SESSION_ID: session },
    );
    expect(r.code).toBe(0);
    return decodedJson(RunId, r.out.trim()).run_id;
  }
  const again = (state: string, cwd: string, session = "o3-session") =>
    router(
      [
        "dispatch",
        "--prompt-file",
        brief("o3b", "Fix y.ts.\n"),
        "--cd",
        cwd,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: state, CLAUDE_CODE_SESSION_ID: session },
    );

  test("an ungraded run warns once and the next dispatch reaches Jev and a worker", async () => {
    const state = join(scratch, "o3-refuse");
    const cwd = mkdtempSync(join(scratch, "o3-cwd-"));
    await first(state, cwd);
    const asked = bodies.length;
    const workers = readFileSync(join(scratch, "argv.log"), "utf8").split(
      "\n",
    ).length;
    const r = await again(state, cwd);
    expect(r.code).toBe(0);
    const warnings = r.err
      .split("\n")
      .filter(
        (line) => line.includes("warning:") && line.includes("remain ungraded"),
      );
    expect(warnings).toHaveLength(1);
    expect(bodies.length).toBeGreaterThan(asked);
    expect(
      readFileSync(join(scratch, "argv.log"), "utf8").split("\n").length,
    ).toBeGreaterThan(workers);
  });

  test("graded, the next dispatch goes ahead", async () => {
    const state = join(scratch, "o3-graded");
    const cwd = mkdtempSync(join(scratch, "o3-cwd-"));
    const runId = await first(state, cwd);
    const g = await router(
      ["ticket", "grade", runId, "--evidence", evidence("GRADE=pass\n")],
      {
        AGX_STATE_DIR: state,
      },
    );
    expect(g.code).toBe(0);
    expect((await again(state, cwd)).code).toBe(0);
  });

  test("a waiver needs a reason, is recorded as such, lets the next dispatch go, and is not a grade", async () => {
    const state = join(scratch, "o3-waived");
    const cwd = mkdtempSync(join(scratch, "o3-cwd-"));
    const runId = await first(state, cwd);
    const w = await router(
      [
        "ticket",
        "grade",
        runId,
        "--waive",
        "codex failed before its first turn; no work to judge",
      ],
      { AGX_STATE_DIR: state },
    );
    expect(w.code).toBe(0);
    const log = readFileSync(join(state, "runs.jsonl"), "utf8");
    expect(log).toContain('"kind":"grade-waived"');
    expect(log).toContain("no work to judge");
    expect((await again(state, cwd)).code).toBe(0);
    const stats = await router(["ledger", "stats"], { AGX_STATE_DIR: state });
    expect(stats.out).toContain('"graded":{"pass":0,"partial":0,"fail":0}');
  });

  test("refused: --waive with an empty reason, and --waive together with --evidence", async () => {
    const state = join(scratch, "o3-badwaive");
    const runId = await first(state, mkdtempSync(join(scratch, "o3-cwd-")));
    for (const args of [
      ["ticket", "grade", runId, "--waive", ""],
      [
        "ticket",
        "grade",
        runId,
        "--waive",
        "x",
        "--evidence",
        evidence("GRADE=pass\n"),
      ],
    ]) {
      const r = await router(args, { AGX_STATE_DIR: state });
      expect([args.join(" "), r.code]).toEqual([args.join(" "), 2]);
    }
    expect(readFileSync(join(state, "runs.jsonl"), "utf8")).not.toContain(
      "grade-waived",
    );
  });

  test("a different dispatcher session is not blocked, even in another cwd", async () => {
    const state = join(scratch, "o3-othercwd");
    await first(state, mkdtempSync(join(scratch, "o3-cwd-")), "session-one");
    expect(
      (await again(state, mkdtempSync(join(scratch, "o3-cwd-")), "session-two"))
        .code,
    ).toBe(0);
  });

  test("stats reports how many finished runs are still owed a grade", async () => {
    const state = join(scratch, "o3-stats");
    await first(state, mkdtempSync(join(scratch, "o3-cwd-")), "session-stats");
    const r = await router(["ledger", "stats"], { AGX_STATE_DIR: state });
    expect(r.out).toContain('"ungraded":1');
  });
});

// O1/O2 for the claude route (Tiger ledger, 2026-10-06): the same receipt obligations as luna. A
// failed claude worker names its cause, an unreadable relay is a failure with that said (it used to
// leave a receipt with no outcome at all), and every receipt keeps what the worker did — read from
// the progress file before it is removed.
describe("claude worker receipts: never silent", () => {
  const pick = brief("o1c", "PICK=sonnet-medium do the thing\n");
  const go = (mode: string) =>
    router(
      [
        "dispatch",
        "--prompt-file",
        pick,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {
        AGX_RUN_CLAUDE: FAKE_CLAUDE,
        FAKE_CLAUDE_MODE: mode,
      },
    );
  const Worker = z.looseObject({
    worker: z.looseObject({
      outcome: z.string(),
      cause: z.string().optional(),
      progress: z
        .looseObject({
          last: z.string(),
          commands: z.number(),
          files: z.number(),
        })
        .optional(),
    }),
  });

  test("a failed claude worker carries run-claude's error as its cause", async () => {
    const r = await go("fail");
    expect(r.code).toBe(1);
    const w = decodedJson(Worker, r.out.trim()).worker;
    expect(w.outcome).toBe("claude-failed");
    expect(w.cause).toBe("model rejected: sonnet");
  });

  test("an unreadable relay is a failure that says so, never a receipt without an outcome", async () => {
    const r = await go("garbage");
    const w = decodedJson(Worker, r.out.trim()).worker;
    expect(w.outcome).toBe("claude-failed");
    expect(w.cause).toContain("run-claude printed no relay");
    expect(w.cause).toContain("not a relay");
  });

  test("the receipt keeps what the worker did, from its progress file", async () => {
    const r = await go("ok");
    expect(decodedJson(Worker, r.out.trim()).worker.progress).toEqual({
      last: "✎ kernel.ts",
      commands: 2,
      files: 1,
    });
  });
});

// Excess positionals are refused (writing-bun-scripts BG1: Cleye leaves extras in argv._ silently).
// Found when agx came under the Bun floor (lint:bun) with the worker move, 2026-10-06.
test("an unexpected positional argument is refused, never ignored", async () => {
  for (const args of [
    ["ledger", "stats", "extra"],
    ["ledger", "ls", "extra"],
    ["ticket", "grade", "some-run", "extra", "--waive", "why"],
  ]) {
    const r = await router(args);
    expect([args.join(" "), r.code]).toEqual([args.join(" "), 2]);
    expect(r.err).toContain("unexpected argument: extra");
  }
});

// I4 (owner 2026-10-06): a coordinator names a worker the way its vendor does. The receipt keeps
// the vendor's session id, and the commands that take a run accept it (a unique prefix) as well
// as the router's own run_id.
describe("a worker is named by its vendor session id", () => {
  const pick = brief("ids", "PICK=sonnet-medium do the thing\n");
  const Worker = z.looseObject({
    run_id: z.string(),
    worker: z.looseObject({ session: z.string().optional() }),
  });

  test("the claude relay's session_id is the receipt's worker.session, and grade takes its prefix", async () => {
    const state = join(scratch, "ids-claude");
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        pick,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: state, AGX_RUN_CLAUDE: FAKE_CLAUDE },
    );
    expect(r.code).toBe(0);
    expect(decodedJson(Worker, r.out.trim()).worker.session).toBe(
      "sess-claude-0001",
    );
    const g = await router(
      ["ticket", "grade", "sess-claude", "--waive", "fixture"],
      {
        AGX_STATE_DIR: state,
      },
    );
    expect(g.code).toBe(0);
    expect(g.err).toContain(decodedJson(Worker, r.out.trim()).run_id);
  });

  test("a prefix two runs share is refused, naming both", async () => {
    const state = join(scratch, "ids-ambiguous");
    const ids: string[] = [];
    for (const [index, cwd] of [
      mkdtempSync(join(scratch, "ids-a-")),
      mkdtempSync(join(scratch, "ids-b-")),
    ].entries()) {
      const r = await router(
        [
          "dispatch",
          "--prompt-file",
          pick,
          "--cd",
          cwd,
          "--sandbox",
          "read-only",
        ],
        {
          AGX_STATE_DIR: state,
          AGX_RUN_CLAUDE: FAKE_CLAUDE,
          CLAUDE_CODE_SESSION_ID: `ids-session-${index}`,
        },
      );
      ids.push(decodedJson(Worker, r.out.trim()).run_id);
    }
    const g = await router(
      ["ticket", "grade", "sess-claude", "--waive", "fixture"],
      {
        AGX_STATE_DIR: state,
      },
    );
    expect(g.code).toBe(2);
    expect(g.err).toContain("matches 2 runs");
    for (const id of ids) expect(g.err).toContain(id);
  });
});

// ask: a typed question to Jev. The request is validated before anything is sent; the answer is
// returned as Jev gave it (probabilities, no threshold).
describe("agx pick ask", () => {
  const choiceQuestion = {
    type: "choice",
    instructions: "Is `task` about tests?",
    criteria: { yes: "it is", no: "it is not" },
  };
  const valid = {
    state: { task: "write a test" },
    questions: { q1: choiceQuestion },
  };
  const requestFile = (name: string, value: unknown): string => {
    const p = join(scratch, `ask-${name}.json`);
    writeFileSync(p, JSON.stringify(value));
    return p;
  };
  const AskOut = z.looseObject({
    answers: z.record(z.string(), z.looseObject({ choice: z.string() })),
  });
  const AskLine = z.looseObject({
    kind: z.string(),
    request_sha256: z.string(),
    questions: z.array(z.string()),
    status: z.number(),
    latency_ms: z.number(),
    jev: z.looseObject({ endpoint: z.string() }),
  });

  test("a valid choice request: the answer JSON on stdout, one ask line logged", async () => {
    const r = await router([
      "pick",
      "ask",
      "--request",
      requestFile("ok", valid),
    ]);
    expect(r.code).toBe(0);
    expect(decodedJson(AskOut, r.out.trim()).answers.q1?.choice).toBe("yes");
    const line = readFileSync(join(r.state, "runs.jsonl"), "utf8").trim();
    const logged = decodedJson(AskLine, line);
    expect(logged.kind).toBe("ask");
    expect(logged.questions).toEqual(["q1"]);
    expect(logged.status).toBe(200);
  });

  test("the request is read from stdin with '-'", async () => {
    const r = Bun.spawn(
      [process.execPath, CLI, "pick", "ask", "--request", "-"],
      {
        env: {
          ...process.env,
          AGX_STATE_DIR: join(scratch, "state-stdin"),
          DISPATCH_ROSTER_PATH: LIVE_JEV,
          TYPESAFE_API_KEY: "fixture-key",
        },
        stdin: new Blob([JSON.stringify(valid)]),
        stdout: "pipe",
        stderr: "pipe",
        timeout: 60_000,
      },
    );
    const [out, code] = await Promise.all([
      new Response(r.stdout).text(),
      r.exited,
    ]);
    expect(code).toBe(0);
    expect(decodedJson(AskOut, out.trim()).answers.q1?.choice).toBe("yes");
  });

  test("a typesafe roster sets the model; the request does not carry it", async () => {
    const typesafe = roster("typesafe", (t) =>
      t.replace(
        /^\[auto\.jev\][\s\S]*?(?=\n\[)/mu,
        `[auto.jev]\napi = "typesafe"\nmodel = "m-from-roster"\nurl = "${server.url.href}"\nprice_per_mtok_input = 0.042\nprice_per_mtok_output = 0.0\n`,
      ),
    );
    const before = bodies.length;
    const r = await router(
      ["pick", "ask", "--request", requestFile("model", valid)],
      {
        DISPATCH_ROSTER_PATH: typesafe,
      },
    );
    expect(r.code).toBe(0);
    expect(bodies.at(-1)).toContain('"model":"m-from-roster"');
    expect(bodies.length).toBe(before + 1);
  });

  const bad: [string, unknown][] = [
    ["state is a number", { state: 3, questions: { q: choiceQuestion } }],
    ["no questions", { state: "s", questions: {} }],
    ["questions is an array", { state: "s", questions: [choiceQuestion] }],
    [
      "unknown type",
      { state: "s", questions: { q: { ...choiceQuestion, type: "rank" } } },
    ],
    [
      "instructions is a number",
      { state: "s", questions: { q: { ...choiceQuestion, instructions: 1 } } },
    ],
    [
      "choice with one option",
      {
        state: "s",
        questions: { q: { ...choiceQuestion, criteria: { only: "x" } } },
      },
    ],
    [
      "choice criteria is an array",
      {
        state: "s",
        questions: { q: { ...choiceQuestion, criteria: ["a", "b"] } },
      },
    ],
    [
      "choice with 256 options",
      {
        state: "s",
        questions: {
          q: {
            ...choiceQuestion,
            criteria: Object.fromEntries(
              Array.from({ length: 256 }, (_, i) => [`o${i}`, "x"]),
            ),
          },
        },
      },
    ],
    [
      "score with one level",
      {
        state: "s",
        questions: { q: { type: "score", instructions: "i", criteria: ["a"] } },
      },
    ],
    [
      "score with 11 levels",
      {
        state: "s",
        questions: {
          q: {
            type: "score",
            instructions: "i",
            criteria: Array.from({ length: 11 }, (_, i) => `l${i}`),
          },
        },
      },
    ],
    [
      "score criteria is an object",
      {
        state: "s",
        questions: {
          q: { type: "score", instructions: "i", criteria: { a: 1, b: 2 } },
        },
      },
    ],
    [
      "noul criteria is a string",
      {
        state: "s",
        questions: { q: { type: "noul", instructions: "i", criteria: "x" } },
      },
    ],
  ];
  test.each(bad)(
    "invalid request (%s): exit 2, the reason on stderr, nothing sent",
    async (name, value) => {
      const before = bodies.length;
      const r = await router([
        "pick",
        "ask",
        "--request",
        requestFile("bad", value),
      ]);
      expect([name, r.code]).toEqual([name, 2]);
      expect(r.err.trim()).not.toBe("");
      expect(bodies.length).toBe(before);
    },
  );

  test("a request that is not JSON, or a missing file: exit 2, nothing sent", async () => {
    const before = bodies.length;
    const notJson = join(scratch, "ask-notjson.json");
    writeFileSync(notJson, "{nope");
    for (const path of [notJson, join(scratch, "ask-absent.json")]) {
      const r = await router(["pick", "ask", "--request", path]);
      expect(r.code).toBe(2);
      expect(r.err.trim()).not.toBe("");
    }
    expect(bodies.length).toBe(before);
  });

  test.each([
    ["HTTP401", 3],
    ["HTTP429", 4],
    ["HTTP500", 5],
    ["NOTJSON", 5],
  ])(
    "provider failure (%s) exits %d with the reason on stderr",
    async (marker, code) => {
      const r = await router([
        "pick",
        "ask",
        "--request",
        requestFile("fail", { ...valid, state: { task: marker } }),
      ]);
      expect(r.code).toBe(code);
      expect(r.err.trim()).not.toBe("");
      expect(r.out).toBe("");
    },
  );

  test("an unreachable Jev exits 4", async () => {
    const dead = roster("dead", (t) =>
      t.replace(
        /^\[auto\.jev\][\s\S]*?(?=\n\[)/mu,
        `[auto.jev]\napi = "reseller"\nurl = "http://127.0.0.1:1/"\nprice_per_mtok_input = 0.042\nprice_per_mtok_output = 0.0\n`,
      ),
    );
    const r = await router(
      ["pick", "ask", "--request", requestFile("dead", valid)],
      {
        DISPATCH_ROSTER_PATH: dead,
      },
    );
    expect(r.code).toBe(4);
    expect(r.err.trim()).not.toBe("");
  });

  test("no key: a non-zero exit naming where it looked, nothing sent", async () => {
    const before = bodies.length;
    const home = mkdtempSync(join(scratch, "nokey-home-"));
    const r = await router(
      ["pick", "ask", "--request", requestFile("nokey", valid)],
      {
        TYPESAFE_API_KEY: "",
        HOME: home,
      },
    );
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("TYPESAFE_API_KEY");
    expect(r.err).toContain(".config/typesafe/.env");
    expect(bodies.length).toBe(before);
  });
});

// --- the typed work ticket: verify run by the router, automatic grade, a gate per write scope --------

const ticketText = (fields: string, prose = "Do the thing.\n"): string =>
  `+++\nschema = 1\n${fields}\n+++\n${prose}`;
const splitGrade = {
  verdict: "split",
  violations: [
    {
      rule: "multiple-deliverables",
      quote_from_brief: "Deliver A and B.",
      why_it_blocks_a_6min_first_return:
        "A and B can be checked independently, so one ticket hides two decisions.",
      fix: "Run the two bounded tickets in dependency order.",
    },
  ],
  pieces: [
    {
      title: "A decision",
      outcome: "Choose A",
      consumer: "A owner",
      first_return: "a.md within six minutes",
      writes: ["a/**"],
      verify: ["true"],
      depends_on: [],
    },
    {
      title: "B decision",
      outcome: "Choose B",
      consumer: "B owner",
      first_return: "b.md within six minutes",
      writes: ["b/**"],
      verify: ["true"],
      depends_on: [],
    },
  ],
  estimated_first_return_s: 180,
  basis: "Two independent checkable outcomes.",
};
const graderClarify = {
  verdict: "clarify",
  violations: [
    {
      rule: "implementation-detail",
      quote_from_brief: "Choose A.",
      why_it_blocks_a_6min_first_return:
        "The preferred retry policy is unclear.",
      fix: "Tell the worker which policy to choose.",
    },
  ],
  questions: [
    {
      question: "Which retry policy should be chosen?",
      unblocks: "The implementation recommendation.",
    },
  ],
};
const passWithQuestion = {
  verdict: "pass",
  violations: [],
  questions: [
    {
      question: "Which retry policy should be chosen?",
      unblocks: "The implementation recommendation.",
    },
  ],
};
const freshCwd = (): string => mkdtempSync(join(scratch, "cwd-"));
const runArgs = (
  promptFile: string,
  cwd: string,
  sandbox = "workspace-write",
): string[] => [
  "dispatch",
  "--prompt-file",
  promptFile,
  "--cd",
  cwd,
  "--sandbox",
  sandbox,
];
const VerifyEntry = z.looseObject({
  cmd: z.string(),
  exit: z.number(),
  elapsed_s: z.number(),
  timed_out: z.boolean(),
  output_tail: z.string(),
});
const TicketReceipt = z.looseObject({
  exit: z.number(),
  verify: z.array(VerifyEntry),
  verify_summary: z.string(),
  grade: z.looseObject({ grade: z.string(), graded_by: z.string() }).optional(),
  grade_waived: z.string().optional(),
});
const AnyLine = z.looseObject({
  kind: z.string(),
  run_id: z.string().optional(),
  grade: z.string().optional(),
  graded_by: z.string().optional(),
  reason: z.string().optional(),
  verify_summary: z.string().optional(),
  verify: z.array(VerifyEntry).optional(),
  evidence: z.looseObject({ path: z.string() }).optional(),
});
const logLines = (state: string): z.output<typeof AnyLine>[] =>
  readFileSync(join(state, "runs.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => decodedJson(AnyLine, l));
const lastJevBody = (): string => bodies.at(-1) ?? "";

describe("agx dispatch: a brief with a ticket", () => {
  test.each([
    ["RESOURCE-CLASS(NONCOMPUTE): CLI work", "token"],
    [
      "RESOURCE-ENVELOPE(/tmp/envelope.json): agent-resource-run only",
      "compute",
    ],
  ])(
    "%s persists kind and opaque labels in prompt, marker and ledger",
    async (resource, kind) => {
      const state = join(scratch, `metadata-${kind}`);
      const labels = ["Exact Case", "", "a/b", "Exact Case"];
      const b = brief(
        `metadata-${kind}`,
        ticketText(
          `writes = []\nverify = ["true"]\nlabels = ${JSON.stringify(labels)}`,
          `${resource}\nInspect.`,
        ),
      );
      const r = await router(
        runArgs(b, freshCwd()),
        {
          AGX_STATE_DIR: state,
          FAKE_SLEEP_MS: "250",
        },
        async () => {
          const home = join(state, "active");
          let marker: string | undefined;
          for (let i = 0; i < 200; i++) {
            marker = existsSync(home)
              ? readdirSync(home).find(
                  (name) =>
                    name.endsWith(".json") && !name.endsWith(".progress.json"),
                )
              : undefined;
            if (marker !== undefined) break;
            await Bun.sleep(10);
          }
          expect(marker).toBeDefined();
          const active = decodedJson(
            z.looseObject({ kind: z.string(), labels: z.array(z.string()) }),
            readFileSync(join(home, marker ?? "missing"), "utf8"),
          );
          expect(active).toMatchObject({ kind, labels });
        },
      );
      expect(r.code).toBe(0);
      const receipt = decodedJson(
        z.looseObject({
          resource: z.looseObject({
            kind: z.string(),
            labels: z.array(z.string()),
          }),
        }),
        r.out.trim(),
      );
      expect(receipt.resource).toEqual({ kind, labels });
      expect(logLines(state)[0]?.resource).toEqual({ kind, labels });
      const prompts = readFileSync(join(scratch, "prompt.log"), "utf8");
      expect(prompts.slice(prompts.lastIndexOf("<<<"))).toContain(
        `labels: ${JSON.stringify(labels)}`,
      );
    },
  );

  test("dispatch and offline lint print the same collected hard-floor violations before Jev", async () => {
    const cwd = freshCwd();
    const b = brief(
      "batched-floor",
      '+++\nschema = 2\ntimeout_s = 2\npremises = ["file:absent"]\n+++\nDo the work.',
    );
    // Deliberately remove the fixture's automatic RESOURCE declaration.
    writeFileSync(
      b,
      readFileSync(b, "utf8").replace(/\nRESOURCE-CLASS[^\n]*\n/u, "\n"),
    );
    const before = bodies.length;
    const lint = await router(["ticket", "lint", b, "--cd", cwd]);
    const dispatch = await router(runArgs(b, cwd), { TEST_SKIP_LEGACY: "1" });
    expect(lint.code).toBe(1);
    expect(dispatch.code).toBe(2);
    expect(dispatch.err).toBe(lint.out);
    expect(bodies.length).toBe(before);
    for (const rule of ["schema", "resource", "verify", "premise"])
      expect(lint.out).toContain(`remand ${rule}:`);
  });

  test("ticket new/ls use the repository root and repeated labels without Jev", async () => {
    const root = freshCwd();
    const nested = join(root, "nested");
    const bin = join(root, "bin");
    mkdirSync(nested);
    mkdirSync(bin);
    const jj = join(bin, "jj");
    writeFileSync(
      jj,
      `#!/usr/bin/env bun\nprocess.stdout.write(${JSON.stringify(root)} + "\\n");\n`,
    );
    chmodSync(jj, 0o755);
    const env = {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      AGX_STATE_DIR: join(root, "state"),
    };
    const before = bodies.length;
    const made = await router(
      [
        "ticket",
        "new",
        "retry",
        "--label",
        "Exact",
        "--label",
        "x/y",
        "--cd",
        nested,
      ],
      env,
    );
    expect(made.code).toBe(0);
    const path = made.out.trim();
    expect(path).toMatch(/\/\.agents\/tickets\/\d{6}-retry\.md$/u);
    mkdirSync(env.AGX_STATE_DIR, { recursive: true });
    writeFileSync(
      join(env.AGX_STATE_DIR, "runs.jsonl"),
      `${JSON.stringify({ kind: "run", run_id: "last-run", brief: { path }, cwd: root, worker: { outcome: "returned" }, pick: { source: "test", choice: "luna-low", reason: "fixture" } })}\n`,
    );
    const listed = await router(["ticket", "ls", "--cd", nested], env);
    expect(listed.code).toBe(0);
    expect(
      decodedJson(
        z.array(
          z.looseObject({
            labels: z.array(z.string()),
            kind: z.string(),
            last_run_id: z.string(),
            outcome: z.string(),
          }),
        ),
        listed.out.trim(),
      )[0],
    ).toMatchObject({
      labels: ["Exact", "x/y"],
      kind: "token",
      last_run_id: "last-run",
      outcome: "returned",
    });
    expect(
      (await router(["ticket", "new", "retry", "--cd", nested], env)).code,
    ).toBe(2);
    expect(bodies.length).toBe(before);
  });

  test("the worker gets the prose without the front matter, plus the verify line", async () => {
    const cwd = freshCwd();
    const b = brief(
      "t-prose",
      ticketText('writes = []\nverify = ["true"]', "PROSE-MARK do it\n"),
    );
    const r = await router(runArgs(b, cwd));
    expect(r.code).toBe(0);
    const seen = readFileSync(join(scratch, "prompt.log"), "utf8");
    const mine = seen.slice(seen.lastIndexOf("<<<"));
    expect(mine).toContain("PROSE-MARK do it");
    expect(mine).toContain("Promise:");
    expect(mine).toContain("first_return: useful interim RETURN (360 seconds)");
    expect(mine).toContain("kind: token");
    expect(mine).toContain("labels: []");
    expect(mine.indexOf("Promise:")).toBeLessThan(mine.indexOf("PROSE-MARK"));
    expect(mine).not.toContain("+++");
    expect(mine).not.toContain("schema = 1");
    expect(mine).toContain(
      "The router runs these verify commands after you exit",
    );
    expect(mine).toContain("`true`");
    expect(mine).toContain("do not background anything you need to see");
    // the receipt still names the original brief file
    expect(r.out).toContain(b);
  });

  test("invalid ticket: refused with the reason, exit 2, Jev never asked, no worker", async () => {
    const before = bodies.length;
    const argvBefore = existsSync(join(scratch, "argv.log"))
      ? readFileSync(join(scratch, "argv.log"), "utf8")
      : "";
    const b = brief("t-bad", ticketText('writes = "not-a-list"'));
    const r = await router(runArgs(b, freshCwd()));
    expect(r.code).toBe(2);
    expect(r.err).toContain("ticket");
    expect(r.err).toContain("writes");
    expect(bodies.length).toBe(before);
    expect(
      existsSync(join(scratch, "argv.log"))
        ? readFileSync(join(scratch, "argv.log"), "utf8")
        : "",
    ).toBe(argvBefore);
  });

  test("budget_usd is parsed into the ticket and passed to Jev; non-positive budget is refused", async () => {
    const budget = brief(
      "t-budget",
      ticketText('writes = []\nverify = ["true"]\nbudget_usd = 2.5'),
    );
    const before = bodies.length;
    const good = await router(runArgs(budget, freshCwd()), {
      CLAUDE_CODE_SESSION_ID: "",
    });
    expect(good.code).toBe(0);
    expect(good.out).toContain('"budget_usd":2.5');
    const sent =
      bodies.slice(before).find((body) => body.includes('"budget_usd":2.5')) ??
      "{}";
    const request = decodedJson(
      z.looseObject({ state: z.looseObject({ budget_usd: z.number() }) }),
      sent,
    );
    expect(request.state.budget_usd).toBe(2.5);

    const requestCount = bodies.length;
    const invalid = brief(
      "t-budget-invalid",
      ticketText('writes = []\nverify = ["true"]\nbudget_usd = 0'),
    );
    const bad = await router(runArgs(invalid, freshCwd()));
    expect(bad.code).toBe(2);
    expect(bad.err).toContain("budget_usd");
    expect(bodies.length).toBe(requestCount);
  });

  test("schema 2 remand is recorded and refuses before a worker starts", async () => {
    const before = existsSync(join(scratch, "argv.log"))
      ? readFileSync(join(scratch, "argv.log"), "utf8")
      : "";
    const b = brief(
      "t-schema2-remand",
      "+++\nschema = 2\nwrites = []\n+++\nDecide.\n",
    );
    const r = await router(runArgs(b, freshCwd()), {
      CLAUDE_CODE_SESSION_ID: "",
    });
    expect(r.code).toBe(2);
    expect(r.err).toContain("remand verify:");
    expect(r.err).toContain('verify = ["<foreground check>"]');
    const after = existsSync(join(scratch, "argv.log"))
      ? readFileSync(join(scratch, "argv.log"), "utf8")
      : "";
    expect(after).toBe(before);
    expect(readFileSync(join(r.state, "runs.jsonl"), "utf8")).toContain(
      '"kind":"refusal"',
    );
  });

  test.each([
    ["file", 'premises = ["file:src/missing.ts"]', "file:src/missing.ts"],
    [
      "symbol",
      'premises = ["symbol:routeThatDoesNotExist"]',
      "symbol:routeThatDoesNotExist",
    ],
  ])(
    "absent %s premise refuses before Jev or a worker",
    async (_kind, declaration, premise) => {
      const before = bodies.length;
      const argvBefore = existsSync(join(scratch, "argv.log"))
        ? readFileSync(join(scratch, "argv.log"), "utf8")
        : "";
      const cwd = freshCwd();
      const b = brief(
        `t-missing-premise-${_kind}`,
        `+++\nschema = 2\nwrites = []\n${declaration}\n+++\nDecide.\n`,
      );
      const r = await router(runArgs(b, cwd), { CLAUDE_CODE_SESSION_ID: "" });
      expect(r.code).toBe(2);
      expect(r.err).toContain(`${premise} is absent`);
      expect(r.err).toContain("correct the brief's premise or remove it");
      expect(bodies.length).toBe(before);
      expect(
        existsSync(join(scratch, "argv.log"))
          ? readFileSync(join(scratch, "argv.log"), "utf8")
          : "",
      ).toBe(argvBefore);
      const refusal = logLines(r.state)[0];
      expect(refusal?.ticket_grade).toMatchObject({
        verdict: "clarify",
        source: "floor",
      });
    },
  );

  test("an existing schema 1 ticket without optional promise fields runs", async () => {
    const b = brief(
      "t-schema1-compatible",
      ticketText('writes = []\nverify = ["true"]'),
    );
    const r = await router(runArgs(b, freshCwd()), { TEST_SKIP_LEGACY: "1" });
    expect(r.code).toBe(0);
    expect(r.out).toContain('"labels":[]');
  });

  test("schema 2 grader clarify is recorded and warned without refusing", async () => {
    const b = brief(
      "t-grader-clarify-warning",
      '+++\nschema = 2\noutcome = "choose retry behavior"\nconsumer = "runtime owner"\nfirst_return = "decision.md"\nwrites = []\nverify = ["true"]\ncapabilities = ["bounded-judgment"]\n+++\nChoose a retry policy.\n',
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
      FAKE_GRADE: JSON.stringify(graderClarify),
    });
    expect(r.code).toBe(0);
    expect(r.err).toContain("remand implementation-detail:");
    expect(r.err).toContain("clarify: Which retry policy should be chosen?");
    expect(r.out).toContain('"verdict":"clarify"');
    expect(logLines(r.state).map((line) => line.kind)).toEqual([
      "run",
      "grade",
    ]);
  });

  test("pass questions are printed as warnings", async () => {
    const b = brief(
      "t-grader-pass-question",
      '+++\nschema = 2\noutcome = "choose retry behavior"\nconsumer = "runtime owner"\nfirst_return = "decision.md"\nwrites = []\nverify = ["true"]\ncapabilities = ["bounded-judgment"]\n+++\nChoose a retry policy.\n',
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
      FAKE_GRADE: JSON.stringify(passWithQuestion),
    });
    expect(r.code).toBe(0);
    expect(r.err).toContain("clarify: Which retry policy should be chosen?");
    expect(r.out).toContain('"verdict":"pass"');
  });

  test("valid split warns, runs, and prints ready-to-paste pieces", async () => {
    const b = brief(
      "t-grader-split",
      '+++\nschema = 2\noutcome = "choose A and B"\nconsumer = "coordinator"\nfirst_return = "decision.md"\nwrites = []\nverify = ["true"]\ncapabilities = ["bounded-judgment"]\n+++\nDeliver A and B.\n',
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
      FAKE_GRADE: JSON.stringify(splitGrade),
    });
    expect(r.code).toBe(0);
    expect(r.err).toContain("remand multiple-deliverables:");
    expect(r.err).toContain("split piece 1: A decision");
    expect(r.err).toContain('first_return = "a.md within six minutes"');
    const refusal = decodedJson(
      z.looseObject({
        ticket_grade: z.looseObject({
          verdict: z.string(),
          source: z.string(),
          grader: z.looseObject({
            status: z.string(),
            pick: z.looseObject({ choice: z.string() }),
            row: z.looseObject({ id: z.string(), route: z.string() }),
            elapsed_s: z.number(),
            usage: z.looseObject({
              input_tokens: z.number(),
              cost_usd: z.number().nullable(),
            }),
          }),
        }),
      }),
      r.out.trim(),
    );
    expect(refusal.ticket_grade).toMatchObject({
      verdict: "split",
      source: "floor+grader",
      grader: { status: "ok", row: { id: "luna-low", route: "codex" } },
    });
    expect(logLines(r.state).map((line) => line.kind)).toEqual([
      "run",
      "grade",
    ]);
  });

  test("split pieces that only differ by target file are rejected and recorded", async () => {
    const repeatedOperation = {
      ...splitGrade,
      pieces: [
        {
          ...splitGrade.pieces[0],
          title: "Format src/a.ts",
          outcome: "Apply the formatter rule to src/a.ts",
          writes: ["src/a.ts"],
        },
        {
          ...splitGrade.pieces[1],
          title: "Format src/b.ts",
          outcome: "Apply the formatter rule to src/b.ts",
          writes: ["src/b.ts"],
        },
      ],
    };
    const b = brief(
      "t-grader-file-only-split",
      '+++\nschema = 2\noutcome = "apply one rule across the source files"\nconsumer = "owner"\nfirst_return = "formatted files"\nwrites = []\nverify = ["true"]\ncapabilities = ["bounded-judgment"]\n+++\nApply the formatter rule across the listed files.\n',
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
      FAKE_GRADE: JSON.stringify(repeatedOperation),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "split pieces repeat one operation over different file lists",
    );
    expect(r.out).toContain('"verdict":"pass"');
    expect(r.out).toContain('"status":"failed"');
  });

  test("urgent_reason lets a schema 2 grader remand proceed while preserving its split", async () => {
    const b = brief(
      "t-urgent-grader-split",
      '+++\nschema = 2\noutcome = "restore the development environment"\nconsumer = "on-call owner"\nfirst_return = "diagnosis.md within 6 min"\nwrites = []\nverify = ["true"]\ncapabilities = ["bounded-judgment"]\nurgent_reason = "Vast outage: mise is broken"\n+++\nRestore the environment and document the fix.\n',
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
      FAKE_GRADE: JSON.stringify(splitGrade),
    });
    expect(r.code).toBe(0);
    expect(r.err).toContain("split piece 1: A decision");
    expect(r.err).toContain("warning: grader split; proceeding with the run");
    const receipt = decodedJson(
      z.looseObject({
        ticket: z.looseObject({ urgent_reason: z.string() }),
        ticket_grade: z.looseObject({ verdict: z.string() }),
      }),
      r.out.trim(),
    );
    expect(receipt.ticket.urgent_reason).toBe("Vast outage: mise is broken");
    expect(receipt.ticket_grade.verdict).toBe("split");
    expect(logLines(r.state).map((line) => line.kind)).toEqual([
      "run",
      "grade",
    ]);
  });

  test("urgent_reason does not override schema 2 floor violations", async () => {
    const b = brief(
      "t-urgent-floor-remand",
      '+++\nschema = 2\nwrites = []\nurgent_reason = "Vast outage"\n+++\nRestore the environment.\n',
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
    });
    expect(r.code).toBe(2);
    expect(r.err).toContain("remand verify:");
    expect(r.err).not.toContain("urgent override");
    expect(logLines(r.state).map((line) => line.kind)).toEqual(["refusal"]);
  });

  test("piece missing first_return invalidates the grade and falls back to the floor", async () => {
    const invalid = {
      ...splitGrade,
      pieces: splitGrade.pieces.map((piece, index) =>
        index === 0 ? { ...piece, first_return: undefined } : piece,
      ),
    };
    const b = brief(
      "t-grader-invalid-piece",
      '+++\nschema = 2\noutcome = "choose A"\nconsumer = "owner"\nfirst_return = "decision.md"\nwrites = []\nverify = ["true"]\ncapabilities = ["bounded-judgment"]\n+++\nChoose A.\n',
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
      FAKE_GRADE: JSON.stringify(invalid),
    });
    expect(r.code).toBe(0);
    const receipt = decodedJson(
      z.looseObject({
        ticket_grade: z.looseObject({
          verdict: z.string(),
          source: z.string(),
          grader: z.looseObject({ status: z.string(), reason: z.string() }),
        }),
      }),
      r.out.trim(),
    );
    expect(receipt.ticket_grade).toMatchObject({
      verdict: "pass",
      source: "floor",
      grader: { status: "failed" },
    });
  });

  test("overlapping piece writes without depends_on invalidate the grade", async () => {
    const overlap = {
      ...splitGrade,
      pieces: splitGrade.pieces.map((piece, index) =>
        index === 1 ? { ...piece, writes: ["a/file.txt"] } : piece,
      ),
    };
    const b = brief(
      "t-grader-overlap",
      '+++\nschema = 2\noutcome = "choose A"\nconsumer = "owner"\nfirst_return = "decision.md"\nwrites = []\nverify = ["true"]\ncapabilities = ["bounded-judgment"]\n+++\nChoose A.\n',
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
      FAKE_GRADE: JSON.stringify(overlap),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("overlapping writes without a depends_on order");
    expect(r.out).toContain('"status":"failed"');
  });

  test.each([
    ["malformed block", { FAKE_GRADE_LAST: "no grade fence" }],
    [
      "timeout",
      {
        FAKE_GRADER_SLEEP_MS: "200",
        AGX_TEST_GRADER_TIMEOUT_MS: "30",
      },
    ],
  ])("%s grader failure never refuses the run", async (_label, extraEnv) => {
    const b = brief(
      `t-grader-${_label}`,
      '+++\nschema = 2\noutcome = "choose A"\nconsumer = "owner"\nfirst_return = "decision.md"\nwrites = []\nverify = ["true"]\ncapabilities = ["bounded-judgment"]\n+++\nChoose A.\n',
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
      ...extraEnv,
    });
    expect(r.code).toBe(0);
    const receipt = decodedJson(
      z.looseObject({
        ticket_grade: z.looseObject({
          verdict: z.string(),
          grader: z.looseObject({ status: z.string() }),
        }),
      }),
      r.out.trim(),
    );
    expect(receipt.ticket_grade.verdict).toBe("pass");
    expect(receipt.ticket_grade.grader.status).toBe("failed");
  });

  test("schema 1 split is warned and runs", async () => {
    const b = brief(
      "t-grader-schema1",
      ticketText("writes = []", "Deliver A and B.\n"),
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
      FAKE_GRADE: JSON.stringify(splitGrade),
    });
    expect(r.code).toBe(0);
    expect(r.err).not.toContain("schema 1/plain refusal is planned for 1.4.0");
    expect(r.err).toContain("split piece 1: A decision");
    expect(r.err).toMatch(/split_from = "[^"]+"/u);
  });

  test("a first-return checkpoint is not accepted as a separate final split piece", async () => {
    const b = brief(
      "t-grader-first-return-piece",
      '+++\nschema = 2\noutcome = "complete inventory and implementation"\nconsumer = "owner"\nfirst_return = "inventory within 6 min"\nwrites = []\nverify = ["true"]\ncapabilities = ["bounded-judgment"]\n+++\nComplete the inventory and implementation.\n',
    );
    const checkpointSplit = {
      ...splitGrade,
      pieces: [
        { ...splitGrade.pieces[0], outcome: "inventory" },
        { ...splitGrade.pieces[1], outcome: "implement the inventory" },
      ],
    };
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
      FAKE_GRADE: JSON.stringify(checkpointSplit),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "piece A decision outcome is the parent's first_return checkpoint",
    );
    expect(r.out).toContain('"verdict":"pass"');
    const promptLog = readFileSync(join(scratch, "prompt.log"), "utf8");
    expect(promptLog).toContain(
      "first_return is the early checkpoint of the same final deliverable",
    );
    expect(promptLog).toContain("FINAL deliverables");
  });

  test("a ticket marked split_from cannot be split recursively", async () => {
    const b = brief(
      "t-grader-recursive-split",
      '+++\nschema = 2\nsplit_from = "parent-run"\noutcome = "complete A"\nconsumer = "owner"\nfirst_return = "A decision"\nwrites = []\nverify = ["true"]\ncapabilities = ["bounded-judgment"]\n+++\nComplete A.\n',
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      TEST_ENABLE_GRADER: "1",
      FAKE_GRADE: JSON.stringify(splitGrade),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "ticket is already a split piece (split_from=parent-run) and cannot be split again",
    );
    expect(r.out).toContain('"verdict":"pass"');
  });

  test("--no-grader is recorded in the parent receipt", async () => {
    const b = brief("t-no-grader", "plain brief\n");
    const r = await router([
      ...runArgs(b, freshCwd(), "read-only"),
      "--no-grader",
    ]);
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      '"status":"skipped","reason":"disabled by --no-grader"',
    );
  });

  test("grade-replay reports agreement and false-refusal rate without running brief workers", async () => {
    const dir = mkdtempSync(join(scratch, "grade-replay-"));
    writeFileSync(join(dir, "a.md"), "A and B are separate decisions.\n");
    writeFileSync(join(dir, "b.md"), "Another two-part decision.\n");
    const expected = join(dir, "expected.tsv");
    writeFileSync(expected, "a.md\tclarify\nb.md\tpass\n");
    const before = existsSync(join(scratch, "argv.log"))
      ? readFileSync(join(scratch, "argv.log"), "utf8").trim().split("\n")
          .length
      : 0;
    const r = await router(["ticket", "replay", dir, "--expect", expected], {
      FAKE_GRADE: JSON.stringify(splitGrade),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "a.md\tmerged=split\tfloor_violations=5\tgrader_status=ok\tgrader_verdict=split\tn_pieces=2\tpieces_valid=true\tgrader_reason=-",
    );
    expect(r.out).toContain("merged_agreement=0/2 (0%)");
    expect(r.out).toContain("merged_false_refusal_rate=1/1 (100%)");
    expect(r.out).toContain("grader_agreement=0/2 (0%)");
    expect(r.out).toContain("grader_false_refusal_rate=1/1 (100%)");
    expect(r.out).toContain("grader_excluded=0");
    const after = existsSync(join(scratch, "argv.log"))
      ? readFileSync(join(scratch, "argv.log"), "utf8").trim().split("\n")
          .length
      : 0;
    expect(after - before).toBe(2);
  });

  test("grade-replay reports why graders were skipped or failed and excludes them from grader metrics", async () => {
    const dir = mkdtempSync(join(scratch, "grade-replay-diagnostics-"));
    writeFileSync(
      join(dir, "skipped.md"),
      "+++\nschema = 2\nwrites = []\n+++\nDecide.\n",
    );
    writeFileSync(join(dir, "failed.md"), "Legacy brief.\n");
    const expected = join(dir, "expected.tsv");
    writeFileSync(expected, "failed.md\tpass\nskipped.md\tclarify\n");
    const r = await router(["ticket", "replay", dir, "--expect", expected], {
      FAKE_GRADE_LAST: "no grade fence",
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain(
      "failed.md\tmerged=clarify\tfloor_violations=5\tgrader_status=failed\tgrader_verdict=n/a\tn_pieces=0\tpieces_valid=false\tgrader_reason=missing agx-grade block",
    );
    expect(r.out).toContain("skipped.md\tmerged=clarify");
    expect(r.out).toContain("grader_status=skipped");
    expect(r.out).toContain(
      "grader_reason=schema 2 floor has 4 violation(s); grader not run",
    );
    expect(r.out).toContain("grader_excluded=2");
    expect(r.out).toContain("grader_agreement=n/a");
  });

  test("grade-replay accepts a valid CRLF grade fence with trailing whitespace", async () => {
    const dir = mkdtempSync(join(scratch, "grade-replay-crlf-"));
    writeFileSync(join(dir, "legacy.md"), "Legacy brief.\n");
    const grade = JSON.stringify({ verdict: "pass", violations: [] });
    const fence = String.fromCodePoint(96).repeat(3);
    const r = await router(["ticket", "replay", dir], {
      FAKE_GRADE_LAST: `${fence}agx-grade\r\n${grade}\r\n${fence}  `,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("grader_status=ok");
    expect(r.out).toContain("grader_verdict=pass");
  });

  test.each([59, 14401, 60.5])(
    "invalid timeout_s %s is refused with its field name and exit 2",
    async (seconds) => {
      const b = brief(
        `t-timeout-invalid-${seconds}`,
        ticketText(`writes = []\ntimeout_s = ${seconds}`),
      );
      const r = await router(runArgs(b, freshCwd()));
      expect(r.code).toBe(2);
      expect(r.err).toContain("timeout_s");
    },
  );

  test.each([
    [undefined, undefined, 600, "default"],
    [1000, undefined, 1000, "ticket"],
    [1000, 1500, 1500, "cli"],
  ] as const)(
    "timeout precedence and receipt record: ticket=%s cli=%s → %s (%s)",
    async (ticketTimeout, cliTimeout, expectedSeconds, expectedSource) => {
      const cwd = freshCwd();
      const ticketLine =
        ticketTimeout === undefined ? "" : `\ntimeout_s = ${ticketTimeout}`;
      const b = brief(
        `t-timeout-${expectedSource}`,
        ticketText(
          `writes = []\nverify = []${ticketLine}${ticketTimeout !== undefined && ticketTimeout > 600 ? '\ntimeout_reason = "long verify"' : ""}`,
        ),
      );
      const args = runArgs(b, cwd);
      if (cliTimeout !== undefined)
        args.push(
          "--timeout-s",
          String(cliTimeout),
          "--timeout-reason",
          "long verify",
        );
      const r = await router(args, { CLAUDE_CODE_SESSION_ID: "" });
      expect(r.code).toBe(0);
      const receipt = decodedJson(
        z.looseObject({
          timeout_s: z.number(),
          timeout_source: z.string(),
        }),
        r.out.trim(),
      );
      expect(receipt).toMatchObject({
        timeout_s: expectedSeconds,
        timeout_source: expectedSource,
      });
      const record = logLines(r.state)[0];
      expect(record).toMatchObject({
        timeout_s: expectedSeconds,
        timeout_source: expectedSource,
      });
      const workerArgs = decodedJson(
        z.array(z.string()),
        readFileSync(join(scratch, "argv.log"), "utf8")
          .trim()
          .split("\n")
          .at(-1) ?? "[]",
      );
      expect(
        workerArgs.slice(
          workerArgs.indexOf("--timeout-s"),
          workerArgs.indexOf("--timeout-s") + 2,
        ),
      ).toEqual(["--timeout-s", String(expectedSeconds)]);
    },
  );

  test.each([
    [undefined, 1000, "ticket"],
    [1500, 1500, "cli"],
  ] as const)(
    "resume uses the declared timeout unless overridden: cli=%s → %s (%s)",
    async (cliTimeout, expectedSeconds, expectedSource) => {
      const state = join(scratch, `resume-timeout-${expectedSource}`);
      const ticket = brief(
        `resume-timeout-${expectedSource}`,
        ticketText(
          'writes = []\ntimeout_s = 1000\ntimeout_reason = "long task"',
          "Continue the work.\n",
        ),
      );
      const first = await router(runArgs(ticket, freshCwd()), {
        AGX_STATE_DIR: state,
        CLAUDE_CODE_SESSION_ID: "",
      });
      const runId = decodedJson(RunIdSchema, first.out.trim()).run_id;
      const args = ["dispatch", "--resume", runId];
      if (cliTimeout !== undefined)
        args.push(
          "--timeout-s",
          String(cliTimeout),
          "--timeout-reason",
          "long continuation",
        );
      const resumed = await router(args, {
        AGX_STATE_DIR: state,
        CLAUDE_CODE_SESSION_ID: "",
      });
      expect(resumed.code).toBe(0);
      const receipt = decodedJson(
        z.looseObject({
          timeout_s: z.number(),
          timeout_source: z.string(),
          resumed_from: z.string(),
        }),
        resumed.out.trim(),
      );
      expect(receipt).toMatchObject({
        timeout_s: expectedSeconds,
        timeout_source: expectedSource,
        resumed_from: runId,
      });
    },
  );

  test("no front matter: legacy mode — no verify, no automatic grade, today's receipt", async () => {
    const r = await router(
      runArgs(brief("t-legacy", "plain brief\n"), freshCwd()),
    );
    expect(r.code).toBe(0);
    expect(r.out).not.toContain('"verify_summary"');
    expect(logLines(r.state).map((l) => l.kind)).toEqual(["run"]);
  });

  test("first-return deadline observes file progress without signaling or resuming Codex", async () => {
    const b = brief(
      "t-checkpoint",
      ticketText("writes = []\nverify = []\nfirst_return_s = 60"),
    );
    const before = existsSync(join(scratch, "argv.log"))
      ? readFileSync(join(scratch, "argv.log"), "utf8").trim().split("\n")
          .length
      : 0;
    const r = await router(runArgs(b, freshCwd()), {
      AGX_CHECKPOINT_MS: "250",
      FAKE_CHECKPOINT: "1",
      FAKE_CHECKPOINT_FILES: "1",
      FAKE_SLEEP_MS: "2000",
      FAKE_ELAPSED_S: "0.01",
    });
    expect(r.code).toBe(0);
    const receipt = decodedJson(
      z.looseObject({
        checkpoint: z.looseObject({
          mode: z.literal("soft"),
          first_return_by_deadline: z.boolean(),
          first_return_at_s: z.number().nullable(),
        }),
        worker: z.looseObject({ outcome: z.string() }),
      }),
      r.out.trim(),
    );
    expect(receipt.checkpoint).toMatchObject({
      mode: "soft",
      first_return_by_deadline: true,
    });
    expect(typeof receipt.checkpoint.first_return_at_s).toBe("number");
    expect(receipt.worker.outcome).toBe("ok");
    const args = readFileSync(join(scratch, "argv.log"), "utf8")
      .trim()
      .split("\n")
      .slice(before)
      .map((line) => decodedJson(z.array(z.string()), line));
    expect(args).toHaveLength(1);
    expect(args[0]).not.toContain("--resume");
    expect(readFileSync(join(scratch, "prompt.log"), "utf8")).not.toContain(
      "time box checkpoint: stop new work and RETURN now",
    );
  }, 45_000);

  test("slow CPU sampling is canceled instead of delaying worker exit", async () => {
    const bin = join(scratch, `slow-ps-${stateSeq++}`);
    mkdirSync(bin);
    writeFileSync(
      join(bin, "ps"),
      '#!/bin/sh\ncase "$*" in *time=*) exec sleep 30;; esac\nexec /bin/ps "$@"\n',
    );
    chmodSync(join(bin, "ps"), 0o755);
    const r = await router(
      runArgs(brief("slow-ps-exit", "finish\n"), freshCwd()),
      {
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        AGX_CHECKPOINT_MS: "80",
        FAKE_SLEEP_MS: "350",
      },
    );
    expect(r.code).toBe(0);
    const receipt = decodedJson(
      z.looseObject({
        worker: z.looseObject({ elapsed_s: z.number() }),
        checkpoint: z.looseObject({ fired: z.boolean() }),
      }),
      r.out.trim(),
    );
    expect(receipt.checkpoint.fired).toBe(true);
    expect(receipt.worker.elapsed_s).toBeLessThan(2);
  });

  test("a pending soft request is canceled instead of delaying router shutdown", async () => {
    const bin = join(scratch, `slow-queue-${stateSeq++}`);
    writeFileSync(bin, "#!/bin/sh\nexec sleep 30\n");
    chmodSync(bin, 0o755);
    const r = await router(
      runArgs(brief("slow-queue-exit", "finish\n"), freshCwd()),
      {
        AGX_CODEX_BIN: bin,
        AGX_CHECKPOINT_MS: "80",
        FAKE_CHECKPOINT: "1",
        FAKE_SLEEP_MS: "350",
      },
    );
    expect(r.code).toBe(0);
    const receipt = decodedJson(
      z.looseObject({
        worker: z.looseObject({ elapsed_s: z.number() }),
        checkpoint: z.looseObject({
          fired: z.boolean(),
          request: z.looseObject({ sent: z.boolean() }),
        }),
      }),
      r.out.trim(),
    );
    expect(receipt.checkpoint).toMatchObject({
      fired: true,
      request: { sent: false },
    });
    expect(receipt.worker.elapsed_s).toBeLessThan(2);
  });

  const stalledRun = async (mode: string, override = false) => {
    const cwd = freshCwd();
    const log = join(cwd, "spawns.jsonl");
    const b = brief(
      `stall-${mode}`,
      ticketText("writes = []\nverify = []\nfirst_return_s = 60") +
        "\nPICK=luna-high PROBS=luna-low:0.2,luna-medium:0.2,luna-high:0.3,luna-xhigh:0.2,terra-high:0.1\n",
    );
    const args = runArgs(b, cwd);
    args.push("--pick-temperature", "0");
    if (override)
      args.push("--row", "luna-high", "--approval", "test owner approval");
    const started = performance.now();
    const r = await router(args, {
      AGX_CHECKPOINT_MS: "250",
      AGX_STALL_MS: "1000",
      FAKE_STALL_MODE: mode,
      FAKE_STALL_LOG: log,
      FAKE_LAST:
        '```agx-return\n{"findings":[],"evidence":[],"impact_on_brief":"done","proposed_next":"none","artifacts":[]}\n```',
    });
    expect(performance.now() - started).toBeLessThan(5000);
    const spawns = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) =>
        decodedJson(z.object({ pid: z.number(), row: z.string() }), line),
      );
    const incidentFile = join(r.state, "incidents.jsonl");
    const incidents = existsSync(incidentFile)
      ? readFileSync(incidentFile, "utf8")
          .trim()
          .split("\n")
          .map((line) =>
            decodedJson(
              z.looseObject({
                kind: z.string(),
                commands: z.number(),
                row: z.string(),
                stall_s: z.number(),
                run_id: z.string(),
                display_id: z.string(),
                at: z.string(),
              }),
              line,
            ),
          )
      : [];
    return {
      r,
      spawns,
      incidents,
      stopped: existsSync(`${log}.stopped`)
        ? readFileSync(`${log}.stopped`, "utf8").trim().split("\n")
        : [],
    };
  };

  test.each(["writes", "cpu", "output"])(
    "%s activity passes first_return_s and survives stall_s to completion",
    async (mode) => {
      const cwd = freshCwd();
      const b = brief(
        `lifecycle-${mode}`,
        ticketText(
          `writes = ${mode === "writes" ? '["delivered.txt"]' : "[]"}\nverify = []\nfirst_return_s = 60\nstall_s = 1`,
        ),
      );
      const start = performance.now();
      const r = await router(runArgs(b, cwd), {
        FAKE_LIFECYCLE: mode,
        AGX_CHECKPOINT_MS: "200",
      });
      expect(r.code).toBe(0);
      expect(performance.now() - start).toBeGreaterThan(2500);
      expect(
        logLines(r.state).filter((line) => line.kind === "run"),
      ).toHaveLength(1);
      const receipt = decodedJson(
        z.looseObject({
          checkpoint: z.looseObject({
            fired: z.boolean(),
            request: z.looseObject({ sent: z.boolean() }),
          }),
          worker: z.looseObject({ outcome: z.string() }),
          stall: z.unknown().optional(),
        }),
        r.out.trim(),
      );
      expect(receipt.worker.outcome).toBe("ok");
      expect(receipt.stall).toBeUndefined();
      expect(receipt.checkpoint).toMatchObject({
        fired: true,
        request: { sent: true },
      });
      expect(readFileSync(join(r.state, "queue.log"), "utf8")).toContain(
        "Never stop running jobs",
      );
    },
    15_000,
  );

  test("fully idle worker stops after ticket stall_s with all predicate inputs", async () => {
    const b = brief(
      "lifecycle-idle",
      ticketText("writes = []\nverify = []\nfirst_return_s = 60\nstall_s = 1"),
    );
    const r = await router(runArgs(b, freshCwd()), {
      FAKE_LIFECYCLE: "idle",
      AGX_CHECKPOINT_MS: "200",
    });
    const firstRun = logLines(r.state).find((line) => line.kind === "run");
    expect(firstRun).toMatchObject({
      worker: { outcome: "stalled" },
      stall: { stall_s: 1 },
    });
    const receipt = decodedJson(
      z.looseObject({
        stall: z.looseObject({
          flat_s: z.number(),
          inputs: z.looseObject({
            cpu_s: z.number(),
            pids: z.array(z.number()),
            writes: z.array(z.unknown()),
            output: z.string(),
          }),
        }),
      }),
      JSON.stringify(firstRun),
    );
    expect(receipt.stall.flat_s).toBeGreaterThanOrEqual(1);
    expect(r.err).toContain("ALL flat:");
    expect(r.err).toContain('"cpu_s":');
    expect(r.err).toContain('"writes":');
    expect(r.err).toContain('"output":');
  }, 15_000);

  const expectEscalation = (result: Awaited<ReturnType<typeof stalledRun>>) => {
    expect(result.r.code).toBe(0);
    expect(result.spawns).toHaveLength(2);
    expect(result.spawns[0]?.row).toBe("luna-high");
    expect(["luna-low", "luna-medium", "luna-high"]).not.toContain(
      result.spawns[1]?.row,
    );
    expect(result.stopped).toEqual(["luna-high"]);
    expect(result.incidents).toHaveLength(1);
    expect(result.incidents[0]).toMatchObject({
      kind: "stalled",
      row: "luna-high",
      stall_s: 600,
    });
    const receipt = decodedJson(
      z.looseObject({
        escalated_from: z.string(),
        pick: z.looseObject({ source: z.string() }),
      }),
      result.r.out.trim(),
    );
    expect(receipt.escalated_from).toBe("luna-high");
    expect(receipt.pick.source).toBe("escalation");
    expect(
      logLines(result.r.state)
        .filter((line) => line.kind === "run")
        .map(
          (line) => decodedJson(Receipt, JSON.stringify(line)).worker.outcome,
        ),
    ).toEqual(["stalled", "returned"]);
  };

  test("all-flat stall window stops worker and escalates once outside hard masks", async () => {
    expectEscalation(await stalledRun("stall"));
  });

  test("files at first return prevent stall and escalation", async () => {
    const result = await stalledRun("files");
    expect(result.r.code).toBe(0);
    expect(result.spawns).toHaveLength(1);
    expect(result.incidents).toEqual([]);
    expect(result.stopped).toEqual([]);
  });

  test("valid RETURN at first return prevents stall and escalation", async () => {
    const result = await stalledRun("return");
    expect(result.r.code).toBe(0);
    expect(result.spawns).toHaveLength(1);
    expect(result.incidents).toEqual([]);
    expect(result.stopped).toEqual([]);
  });

  test("idle after earlier commands stalls after the independent window even on an override row", async () => {
    const result = await stalledRun("commands", true);
    expect(result.r.code).toBe(0);
    expect(result.spawns.map((spawn) => spawn.row)).toEqual([
      "luna-high",
      "luna-high",
    ]);
    expect(
      decodedJson(
        z.looseObject({
          pick: z.looseObject({ source: z.string() }),
          resumed_from: z.string(),
        }),
        result.r.out.trim(),
      ).pick.source,
    ).toBe("override");
    expect(result.incidents[0]?.commands).toBe(3);
  });

  test("second all-flat stall exits nonzero without a third spawn", async () => {
    const result = await stalledRun("twice");
    expect(result.r.code).toBe(1);
    expect(result.spawns).toHaveLength(2);
    expect(result.stopped).toHaveLength(2);
    expect(result.incidents).toHaveLength(2);
    expect(
      logLines(result.r.state)
        .filter((line) => line.kind === "run")
        .map(
          (line) => decodedJson(Receipt, JSON.stringify(line)).worker.outcome,
        ),
    ).toEqual(["stalled", "stalled"]);
  });

  const nonDeliveryRun = async (
    mode: "non_delivery" | "non_delivery_twice",
    row = "luna-high",
    override = false,
  ) => {
    const cwd = freshCwd();
    const log = join(cwd, "spawns.jsonl");
    const gitBin = join(scratch, `non-delivery-git-${stateSeq++}`);
    mkdirSync(gitBin, { recursive: true });
    writeFileSync(
      join(gitBin, "git"),
      "#!/bin/sh\nif [ -f \"$FAKE_CWD/delivered.txt\" ]; then printf '?? delivered.txt\\n'; fi\n",
    );
    writeFileSync(join(gitBin, "jj"), "#!/bin/sh\nexit 1\n");
    chmodSync(join(gitBin, "git"), 0o755);
    chmodSync(join(gitBin, "jj"), 0o755);
    const b = brief(
      `non-delivery-${mode}`,
      ticketText(
        'outcome = "deliver file"\nconsumer = "owner"\nfirst_return = "RETURN"\nwrites = ["delivered.txt"]\nverify = []\ncapabilities = ["typescript"]\nfirst_return_s = 60',
      ) + `\nPICK=${row} PROBS=${row}:1\n`,
    );
    const args = runArgs(b, cwd);
    args.push("--pick-temperature", "0");
    if (override) args.push("--row", row, "--approval", "test owner approval");
    const r = await router(args, {
      PATH: `${gitBin}:${process.env.PATH ?? ""}`,
      FAKE_CWD: cwd,
      AGX_CHECKPOINT_MS: "250",
      FAKE_STALL_MODE: mode,
      FAKE_STALL_LOG: log,
      FAKE_LAST:
        '```agx-return\n{"findings":[],"evidence":[],"impact_on_brief":"done","proposed_next":"none","artifacts":[]}\n```',
    });
    return { r, cwd, log };
  };

  test("true non_delivery escalates deterministically without Jev sampling", async () => {
    const { r, log } = await nonDeliveryRun("non_delivery");
    expect(r.code).toBe(0);
    const spawns = readFileSync(log, "utf8").trim().split("\n");
    expect(spawns).toHaveLength(2);
    const spawnedRows = spawns.map(
      (line) => decodedJson(z.looseObject({ row: z.string() }), line).row,
    );
    expect(spawnedRows[0]).toBe("luna-high");
    expect(["luna-low", "luna-medium", "luna-high"]).not.toContain(
      spawnedRows[1],
    );
    const runs = logLines(r.state).filter((line) => line.kind === "run");
    expect(
      runs.map(
        (line) => decodedJson(Receipt, JSON.stringify(line)).worker.outcome,
      ),
    ).toEqual(["non_delivery", "ok"]);
    expect(runs[1]).toMatchObject({ escalated_from: "luna-high" });
    const incident = decodedJson(
      z.looseObject({
        kind: z.string(),
        at: z.string(),
        run_id: z.string(),
        display_id: z.string(),
        row: z.string(),
        returned: z.boolean(),
      }),
      readFileSync(join(r.state, "incidents.jsonl"), "utf8").trim(),
    );
    expect(incident).toMatchObject({
      kind: "non_delivery",
      returned: false,
      row: "luna-high",
    });
    expect(r.out).toContain('"escalated_from":"luna-high"');
  });

  test("owner-approved non_delivery resumes the same row and session", async () => {
    const before = bodies.length;
    const { r, log } = await nonDeliveryRun("non_delivery", "sol-high", true);
    expect(r.code).toBe(0);
    const spawns = readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) =>
        decodedJson(z.object({ row: z.string(), resume: z.boolean() }), line),
      );
    expect(spawns).toEqual([
      { row: "sol-high", resume: false },
      { row: "sol-high", resume: true },
    ]);
    const receipt = decodedJson(
      z.looseObject({
        pick: z.looseObject({
          source: z.string(),
          choice: z.string(),
          approval: z.string(),
        }),
        resumed_from: z.string(),
        escalation: z.looseObject({
          rule: z.string(),
          failed_aa_index: z.number(),
          selected_aa_index: z.number(),
        }),
      }),
      r.out.trim(),
    );
    expect(receipt.pick).toMatchObject({
      source: "override",
      choice: "sol-high",
      approval: "test owner approval",
    });
    expect(receipt.escalation.selected_aa_index).toBe(
      receipt.escalation.failed_aa_index,
    );
    expect(receipt.escalation.rule).toContain(
      "resume the same row and session",
    );
    expect(
      bodies
        .slice(before)
        .filter((body) => body.includes('"worker":{"type":"choice"')),
    ).toEqual([]);
  });

  test.each(["sol-high", "luna-low"])(
    "non-override %s escalation never lowers AA capability",
    async (row) => {
      const before = bodies.length;
      const { r, log } = await nonDeliveryRun("non_delivery", row);
      expect(r.code).toBe(0);
      const spawns = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map(
          (line) => decodedJson(z.looseObject({ row: z.string() }), line).row,
        );
      expect(spawns).toEqual([
        row,
        row === "sol-high" ? "sol-xhigh" : "luna-medium",
      ]);
      const receipt = decodedJson(
        z.looseObject({
          pick: z.looseObject({
            source: z.string(),
            epsilon: z.number().optional(),
            jev: z.unknown().optional(),
          }),
          escalation: z.looseObject({
            rule: z.string(),
            failed_aa_index: z.number(),
            selected_aa_index: z.number(),
          }),
        }),
        r.out.trim(),
      );
      expect(receipt.pick.source).toBe("escalation");
      expect(receipt.pick.epsilon).toBeUndefined();
      expect(receipt.pick.jev).toBeUndefined();
      expect(receipt.escalation.selected_aa_index).toBeGreaterThanOrEqual(
        receipt.escalation.failed_aa_index,
      );
      expect(receipt.escalation.rule).toContain("AA index >= failed row");
      expect(
        bodies
          .slice(before)
          .filter((body) => body.includes('"worker":{"type":"choice"')),
      ).toHaveLength(1);
    },
  );

  test("valid RETURN with no changes and failing verify needs the coordinator and never escalates", async () => {
    const cwd = freshCwd();
    const question = "Clarify whether to extend the command-recognition hook.";
    const report = {
      summary: "RETURN: contradiction in the brief",
      changes: [],
      checks: [],
      for_coordinator: [question],
      open: [],
    };
    const returned = {
      findings: [{ text: "The hook handles only Agent, Task and Workflow." }],
      evidence: ["hook source"],
      impact_on_brief: "Requested behavior exceeds the rename scope",
      proposed_next: "Choose hook scope",
      artifacts: [],
    };
    const b = brief(
      "returned-failing-verify",
      ticketText('writes = ["src/**"]\nverify = ["false"]'),
    );
    const r = await router(runArgs(b, cwd), {
      FAKE_LAST: `${JSON.stringify(report)}\n\n\`\`\`agx-return\n${JSON.stringify(returned)}\n\`\`\``,
    });
    expect(r.code).toBe(0);
    const receipt = decodedJson(
      z.looseObject({
        worker: z.looseObject({ outcome: z.string() }),
        outcome_summary: z.string(),
        verify: z.array(z.looseObject({ exit: z.number() })),
      }),
      r.out.trim(),
    );
    expect(receipt.worker.outcome).toBe("returned");
    expect(receipt.verify[0]?.exit).toBe(1);
    expect(receipt.outcome_summary).toBe(
      `returned — needs the coordinator: ${question}`,
    );
    expect(r.err).toContain(receipt.outcome_summary);
    expect(
      logLines(r.state).filter((line) => line.kind === "run"),
    ).toHaveLength(1);
    expect(existsSync(join(r.state, "incidents.jsonl"))).toBe(false);
  });

  test("second non_delivery exits nonzero without a third spawn", async () => {
    const { r, log } = await nonDeliveryRun("non_delivery_twice");
    expect(r.code).toBe(1);
    expect(readFileSync(log, "utf8").trim().split("\n")).toHaveLength(2);
    expect(
      logLines(r.state)
        .filter((line) => line.kind === "run")
        .map(
          (line) => decodedJson(Receipt, JSON.stringify(line)).worker.outcome,
        ),
    ).toEqual(["non_delivery", "non_delivery"]);
  });

  test("read_only_diagnostic RETURN remains normal for declared writes", async () => {
    const cwd = freshCwd();
    const b = brief(
      "non-delivery-read-only",
      ticketText(
        'outcome = "diagnose"\nconsumer = "owner"\nfirst_return = "RETURN"\nwrites = ["delivered.txt"]\nverify = []\ncapabilities = ["typescript"]\nread_only_diagnostic = true',
      ),
    );
    const r = await router(runArgs(b, cwd), {
      FAKE_LAST:
        '```agx-return\n{"findings":[],"evidence":[],"impact_on_brief":"done","proposed_next":"none","artifacts":[]}\n```',
    });
    expect(r.code).toBe(0);
    expect(
      logLines(r.state).filter((line) => line.kind === "run"),
    ).toHaveLength(1);
    expect(existsSync(join(r.state, "incidents.jsonl"))).toBe(false);
  });

  test("declared writes with a changed file remain normal", async () => {
    const cwd = freshCwd();
    const b = brief(
      "non-delivery-with-files",
      ticketText(
        'outcome = "deliver file"\nconsumer = "owner"\nfirst_return = "RETURN"\nwrites = ["delivered.txt"]\nverify = []\ncapabilities = ["typescript"]',
      ),
    );
    const r = await router(runArgs(b, cwd), {
      FAKE_TOUCH: "delivered.txt",
      FAKE_LAST:
        '```agx-return\n{"findings":[],"evidence":[],"impact_on_brief":"done","proposed_next":"none","artifacts":[]}\n```',
    });
    expect(r.code).toBe(0);
    expect(readFileSync(join(cwd, "delivered.txt"), "utf8")).toBe(
      "worker-was-here",
    );
    expect(existsSync(join(r.state, "incidents.jsonl"))).toBe(false);
  });

  test("non-repo mtime scan counts a file matching declared writes", async () => {
    const cwd = freshCwd();
    const b = brief(
      "scan-matching-write",
      ticketText('writes = ["notes/*.md"]\nverify = []'),
    );
    const r = await router(runArgs(b, cwd), { FAKE_TOUCH: "notes/a.md" });
    expect(r.code).toBe(0);
    const run = logLines(r.state).find((line) => line.kind === "run");
    expect(run).toMatchObject({ writes_check: ["notes/a.md"] });
    expect(JSON.stringify(run)).not.toContain("non_delivery");
    expect(JSON.stringify(run)).not.toContain("stalled");
  });

  test("non-repo mtime scan ignores files outside declared writes", async () => {
    const cwd = freshCwd();
    const b = brief(
      "scan-outside-write",
      ticketText('writes = ["notes/*.md"]\nverify = []'),
    );
    const r = await router(runArgs(b, cwd), { FAKE_TOUCH: "other/b.md" });
    const run = logLines(r.state).find((line) => line.kind === "run");
    expect(r.code).toBe(1);
    expect(run).toMatchObject({ writes_check: "vcs: none; mtime scan" });
    expect(JSON.stringify(run)).not.toContain("other/b.md");
    expect(run).toMatchObject({
      worker: {
        outcome: "non_delivery",
        cause: "ticket declared writes but no files changed",
      },
    });
    expect(JSON.stringify(run)).not.toContain("stalled");
  });

  test("mtime scan includes an ignored write inside a jj workspace", async () => {
    const cwd = freshCwd();
    mkdirSync(join(cwd, ".jj"));
    const fakeBin = join(scratch, `ignored-jj-${stateSeq++}`);
    mkdirSync(fakeBin);
    writeFileSync(join(fakeBin, "jj"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(fakeBin, "jj"), 0o755);
    const b = brief(
      "scan-ignored-write",
      ticketText('writes = [".agent-notes/*.md"]\nverify = []'),
    );
    const r = await router(runArgs(b, cwd), {
      PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
      FAKE_TOUCH: ".agent-notes/n.md",
    });
    const run = logLines(r.state).find((line) => line.kind === "run");
    expect(r.code).toBe(0);
    expect(run).toMatchObject({ writes_check: [".agent-notes/n.md"] });
    expect(JSON.stringify(run)).not.toContain("non_delivery");
    expect(JSON.stringify(run)).not.toContain("stalled");
  });

  test("RETURN before the deadline is recorded as observed", async () => {
    const b = brief(
      "t-no-checkpoint-after-return",
      "plain task that returns\n",
    );
    const r = await router(runArgs(b, freshCwd()), {
      AGX_CHECKPOINT_MS: "500",
      FAKE_LAST:
        '{"summary":"done","changes":[],"checks":[],"for_coordinator":[],"open":[]}\n```agx-return\n{"findings":[],"evidence":[],"impact_on_brief":"done","proposed_next":"none","artifacts":[]}\n```',
    });
    expect(r.code).toBe(0);
    const receipt = decodedJson(
      z.looseObject({
        checkpoint: z.looseObject({
          mode: z.literal("soft"),
          first_return_by_deadline: z.boolean(),
          first_return_at_s: z.number().nullable(),
        }),
      }),
      r.out.trim(),
    );
    expect(receipt.checkpoint.mode).toBe("soft");
    expect(receipt.checkpoint.first_return_by_deadline).toBe(true);
    expect(receipt.checkpoint.first_return_at_s).not.toBeNull();
  });

  test("a new resume starts a fresh first-return timer at its worker start", async () => {
    const state = join(scratch, "fresh-resume-checkpoint");
    const b = brief("t-fresh-resume", "plain task that initially fails\n");
    const first = await router(runArgs(b, freshCwd(), "read-only"), {
      AGX_STATE_DIR: state,
      FAKE_EXIT: "1",
    });
    expect(first.code).toBe(1);
    const original = decodedJson(RunIdSchema, first.out.trim()).run_id;
    const resumed = await router(["dispatch", "--resume", original], {
      AGX_STATE_DIR: state,
      AGX_CHECKPOINT_MS: "250",
      FAKE_CHECKPOINT: "1",
      FAKE_RESUME_SLEEP_MS: "1000",
      FAKE_ELAPSED_S: "0.01",
    });
    expect(resumed.code).toBe(0);
    const receipt = decodedJson(
      z.looseObject({
        resumed_from: z.string(),
        checkpoint: z.looseObject({
          mode: z.literal("soft"),
          first_return_by_deadline: z.boolean(),
          first_return_at_s: z.number().nullable(),
        }),
        worker: z.looseObject({ elapsed_s: z.number() }),
      }),
      resumed.out.trim(),
    );
    expect(receipt.resumed_from).toBe(original);
    expect(receipt.checkpoint.mode).toBe("soft");
    expect(receipt.checkpoint.first_return_by_deadline).toBe(true);
    expect(receipt.checkpoint.first_return_at_s).not.toBeNull();
    expect(receipt.worker.elapsed_s).toBeGreaterThanOrEqual(
      receipt.checkpoint.first_return_at_s ?? 0,
    );
  });

  test("capabilities reach Jev as required_capabilities in the request state", async () => {
    const b = brief(
      "t-caps",
      ticketText(
        'writes = []\nverify = []\ncapabilities = ["long-tool-loop"]',
        "CAPS-MARK\n",
      ),
    );
    const before = bodies.length;
    await router(runArgs(b, freshCwd(), "read-only"));
    const pick = bodies.slice(before).find((x) => x.includes('"worker"'));
    expect(pick).toContain('"required_capabilities":["long-tool-loop"]');
    expect(pick).toContain('"first_return_s":360');
    expect(pick).toContain(
      "xhigh/max only when the ticket names a capability lower effort measurably lacks",
    );
    expect(pick).toContain("CAPS-MARK");
    expect(pick).not.toContain("schema = 1");
  });

  test("verify runs after the worker, in --cd, outputs recorded; auto-grade by the router", async () => {
    const cwd = freshCwd();
    const b = brief(
      "t-verify",
      ticketText(
        'writes = ["marker.txt"]\nverify = ["cat marker.txt && echo GRADE=pass", "pwd"]',
      ),
    );
    const r = await router(runArgs(b, cwd), { FAKE_TOUCH: "marker.txt" });
    expect(r.code).toBe(0);
    const receipt = decodedJson(TicketReceipt, r.out.trim());
    expect(receipt.verify_summary).toBe("2/2 passed");
    expect(receipt.verify.map((v) => v.exit)).toEqual([0, 0]);
    expect(receipt.verify[0]?.output_tail).toContain("worker-was-here");
    expect(receipt.verify[0]?.timed_out).toBe(false);
    expect(receipt.verify[1]?.output_tail.trim()).toContain(
      cwd.split("/").at(-1),
    );
    expect(receipt.grade).toMatchObject({ grade: "pass", graded_by: "router" });
    const lines = logLines(r.state);
    expect(lines.map((l) => l.kind)).toEqual(["run", "grade"]);
    expect(lines[0]?.verify_summary).toBe("2/2 passed");
    expect(lines[1]).toMatchObject({ grade: "pass", graded_by: "router" });
    expect(existsSync(lines[1]?.evidence?.path ?? "/nonexistent")).toBe(true);
    expect(r.err).toContain("2/2 passed");
    expect(r.err).toContain("pass");
    // the evidence Jev read carried the verify output
    expect(lastJevBody()).toContain("worker-was-here");
  });

  test("a failing verify is recorded, named in the summary, shown to Jev; exit stays the worker's", async () => {
    const b = brief(
      "t-fail",
      ticketText(
        'writes = []\nverify = ["echo FAILMARK; exit 3", "echo second ok"]',
      ),
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"));
    expect(r.code).toBe(0);
    const receipt = decodedJson(TicketReceipt, r.out.trim());
    expect(receipt.verify.map((v) => v.exit)).toEqual([3, 0]);
    expect(receipt.verify_summary).toBe("1 failed: echo FAILMARK; exit 3");
    expect(receipt.verify[0]?.output_tail).toContain("FAILMARK");
    expect(lastJevBody()).toContain("FAILMARK");
  });

  test("a failed worker is still verified and graded", async () => {
    const b = brief("t-wfail", ticketText('writes = []\nverify = ["true"]'));
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      FAKE_EXIT: "1",
    });
    expect(r.code).toBe(1);
    const receipt = decodedJson(TicketReceipt, r.out.trim());
    expect(receipt.verify_summary).toBe("1/1 passed");
    expect(receipt.grade?.graded_by).toBe("router");
  });

  test("a verify that outlives the shared verify_timeout_s is killed and recorded as timed out", async () => {
    const b = brief(
      "t-timeout",
      ticketText(
        'writes = []\nverify = ["echo before; sleep 30", "echo never"]\nverify_timeout_s = 1',
      ),
    );
    const t0 = performance.now();
    const r = await router(runArgs(b, freshCwd(), "read-only"));
    expect((performance.now() - t0) / 1000).toBeLessThan(25);
    const receipt = decodedJson(TicketReceipt, r.out.trim());
    expect(receipt.verify[0]?.timed_out).toBe(true);
    expect(receipt.verify[0]?.output_tail).toContain("before");
    // the second command had no time left: recorded, not silently dropped
    expect(receipt.verify).toHaveLength(2);
    expect(receipt.verify[1]?.timed_out).toBe(true);
    expect(receipt.verify_summary).toContain("2 failed");
  });

  test("Jev unavailable: the run is waived with the reason, never left ungraded, never invented", async () => {
    const b = brief(
      "t-nojev",
      ticketText('writes = []\nverify = ["true"]', "HTTP500 brief\n"),
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"));
    expect(r.code).toBe(0);
    const receipt = decodedJson(TicketReceipt, r.out.trim());
    expect(receipt.grade).toBeUndefined();
    expect(receipt.grade_waived).toStartWith("auto-grade: jev unavailable:");
    const lines = logLines(r.state);
    expect(lines.map((l) => l.kind)).toEqual(["run", "grade-waived"]);
    expect(lines[1]?.reason).toStartWith("auto-grade: jev unavailable:");
  });

  test("a cwd under no_egress is not graded by Jev: waived, nothing sent", async () => {
    const b = brief("t-egress", ticketText('writes = []\nverify = ["true"]'));
    const before = bodies.length;
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      DISPATCH_ROSTER_PATH: NO_EGRESS,
    });
    expect(bodies.length).toBe(before);
    const receipt = decodedJson(TicketReceipt, r.out.trim());
    expect(receipt.grade_waived).toContain("no_egress");
  });

  test("a hand grade after the automatic one wins (latest grade)", async () => {
    const cwd = freshCwd();
    const state = join(scratch, "state-regrade");
    const b = brief("t-regrade", ticketText('writes = []\nverify = ["true"]'));
    const first = await router(runArgs(b, cwd), {
      AGX_STATE_DIR: state,
    });
    const id = decodedJson(RunIdSchema, first.out.trim()).run_id;
    const evidence = join(scratch, "regrade-evidence.txt");
    writeFileSync(evidence, "GRADE=fail\n");
    const g = await router(["ticket", "grade", id, "--evidence", evidence], {
      AGX_STATE_DIR: state,
    });
    expect(g.code).toBe(0);
    const grades = logLines(state).filter((l) => l.kind === "grade");
    expect(grades.map((l) => l.grade)).toEqual(["partial", "fail"]);
  });
});

describe("agx ticket write enforcement", () => {
  let gitSeq = 0;
  const gitStatus = (status: string): Record<string, string> => {
    const bin = join(scratch, `fake-git-${gitSeq++}`);
    mkdirSync(bin, { recursive: true });
    const git = join(bin, "git");
    writeFileSync(git, "#!/bin/sh\nprintf '%s' \"$FAKE_STATUS_OUTPUT\"\n");
    chmodSync(git, 0o755);
    const jj = join(bin, "jj");
    writeFileSync(jj, "#!/bin/sh\necho 'not a jj workspace' >&2\nexit 1\n");
    chmodSync(jj, 0o755);
    return {
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      FAKE_STATUS_OUTPUT: status,
    };
  };
  const scopeRun = (
    name: string,
    writes: string,
    env: Record<string, string> = {},
    status = "",
    cwd = freshCwd(),
  ) =>
    router(
      runArgs(
        brief(
          name,
          ticketText(`writes = ${writes}\nverify = ["echo VERIFY-RAN"]`),
        ),
        cwd,
      ),
      { ...gitStatus(status), ...env },
    );

  test("allowed changed paths are recorded and do not fail the run", async () => {
    const r = await scopeRun(
      "writes-inside",
      '["allowed/**"]',
      { FAKE_TOUCH: "allowed/file.ts" },
      "?? allowed/file.ts\n",
    );
    const receipt = decodedJson(
      z.looseObject({
        writes_check: z.array(z.string()),
        writes_violations: z.array(z.string()).optional(),
        verify: z.array(z.looseObject({ output_tail: z.string() })),
      }),
      r.out.trim(),
    );
    expect(receipt.writes_check).toContain("allowed/file.ts");
    expect(receipt.writes_violations).toBeUndefined();
    expect(receipt.verify[0]?.output_tail).toContain("VERIFY-RAN");
    expect(r.code).toBe(0);
  });

  test("out-of-scope path is recorded, reported, and graded fail after verify", async () => {
    const r = await scopeRun(
      "writes-outside",
      '["allowed/**"]',
      { FAKE_TOUCH: "scripts/hook-registry.ts" },
      "?? scripts/hook-registry.ts\n",
    );
    const receipt = decodedJson(
      z.looseObject({
        writes_violations: z.array(z.string()),
        verify: z.array(z.looseObject({ output_tail: z.string() })),
        grade: z.looseObject({ grade: z.string(), reason: z.string() }),
      }),
      r.out.trim(),
    );
    expect(receipt.writes_violations).toEqual(["scripts/hook-registry.ts"]);
    expect(receipt.verify[0]?.output_tail).toContain("VERIFY-RAN");
    expect(receipt.grade.grade).toBe("fail");
    expect(receipt.grade.reason).toContain("scripts/hook-registry.ts");
    expect(r.err).toContain("scripts/hook-registry.ts");
    expect(logLines(r.state)[0]).toMatchObject({
      writes_violations: ["scripts/hook-registry.ts"],
    });
    const grade = logLines(r.state).find((line) => line.kind === "grade");
    expect(grade?.grade).toBe("fail");
    expect(grade?.reason).toContain("scripts/hook-registry.ts");
  });

  test("claimed changes with an empty writes diff are flagged and graded fail when verify fails", async () => {
    const cwd = freshCwd();
    const b = brief(
      "writes-claimed-no-diff",
      ticketText('writes = ["src/**"]\nverify = ["false"]'),
    );
    const claimedReport = {
      summary: "resolved the conflict",
      changes: [{ path: "src/fix.ts", what: "fixed the conflict" }],
      checks: [],
      for_coordinator: [],
      open: [],
    };
    const r = await router(runArgs(b, cwd), {
      ...gitStatus(""),
      FAKE_LAST: JSON.stringify(claimedReport),
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain("ticket writes diff is empty");
    const receipt = decodedJson(
      z.looseObject({
        claims_without_diff: z.looseObject({
          claimed: z.array(z.string()),
          diff_empty: z.boolean(),
        }),
        worker: z.looseObject({ outcome: z.string() }),
      }),
      r.out.trim(),
    );
    expect(receipt.claims_without_diff).toEqual({
      claimed: ["src/fix.ts"],
      diff_empty: true,
    });
    expect(receipt.worker.outcome).toBe("non_delivery");
    expect(
      logLines(r.state).filter((line) => line.kind === "run"),
    ).toHaveLength(2);
  });

  test("a passing verify can prove claimed changes despite an empty writes diff", async () => {
    const cwd = freshCwd();
    const b = brief(
      "writes-claimed-no-diff-verified",
      ticketText('writes = ["src/**"]\nverify = ["echo GRADE=pass"]'),
    );
    const claimedReport = {
      summary: "resolved the conflict",
      changes: [{ path: "src/fix.ts", what: "fixed the conflict" }],
      checks: [],
      for_coordinator: [],
      open: [],
    };
    const r = await router(runArgs(b, cwd), {
      ...gitStatus(""),
      FAKE_LAST: JSON.stringify(claimedReport),
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain("ticket writes diff is empty");
    const receipt = decodedJson(
      z.looseObject({
        claims_without_diff: z.looseObject({
          claimed: z.array(z.string()),
          diff_empty: z.boolean(),
        }),
        worker: z.looseObject({ outcome: z.string() }),
      }),
      r.out.trim(),
    );
    expect(receipt.claims_without_diff).toEqual({
      claimed: ["src/fix.ts"],
      diff_empty: true,
    });
    expect(receipt.worker.outcome).toBe("non_delivery");
  });

  test("pre-existing dirty files are not attributed to this run", async () => {
    const cwd = freshCwd();
    writeFileSync(join(cwd, "already-dirty.ts"), "existing content");
    const r = await scopeRun(
      "writes-preexisting",
      "[]",
      {},
      " M already-dirty.ts\n",
      cwd,
    );
    const receipt = decodedJson(
      z.looseObject({
        writes_check: z.array(z.string()),
        writes_violations: z.array(z.string()).optional(),
      }),
      r.out.trim(),
    );
    expect(receipt.writes_check).toEqual([]);
    expect(receipt.writes_violations).toBeUndefined();
    expect(r.code).toBe(0);
  });

  test("repo-root writes from a subdirectory exclude unchanged pre-existing matching files", async () => {
    const root = freshCwd();
    mkdirSync(join(root, ".jj"));
    mkdirSync(join(root, "child"));
    mkdirSync(join(root, "notes"));
    writeFileSync(join(root, "notes", "existing.txt"), "already here");
    const r = await scopeRun(
      "root-relative-write",
      '["notes/**"]',
      { FAKE_TOUCH: "../notes/new.txt" },
      "?? notes/new.txt\n",
      join(root, "child"),
    );
    const receipt = decodedJson(
      z.looseObject({
        writes_check: z.array(z.string()),
        writes_violations: z.array(z.string()).optional(),
      }),
      r.out.trim(),
    );
    expect(receipt.writes_check).toEqual(["notes/new.txt"]);
    expect(receipt.writes_violations).toBeUndefined();
    expect(r.code).toBe(0);
  });

  test("a concurrently live sibling ticket path is recorded as unattributed without failing", async () => {
    const cwd = freshCwd();
    const state = join(scratch, "writes-sibling");
    mkdirSync(state, { recursive: true });
    appendFileSync(
      join(state, "runs.jsonl"),
      `${JSON.stringify({
        schema: 1,
        kind: "run",
        run_id: "sibling-live",
        cwd,
        started_at: "2000-01-01T00:00:00Z",
        ended_at: "2999-01-01T00:00:00Z",
        pick: { source: "jev", choice: "luna-high" },
        ticket: { schema: 1, writes: ["tools/reclaim/**"] },
        worker: { outcome: "ok" },
      })}\n`,
    );
    const r = await router(
      runArgs(
        brief(
          "writes-sibling",
          ticketText('writes = ["tools/statusline/**"]\nverify = ["true"]'),
        ),
        cwd,
      ),
      {
        ...gitStatus("?? tools/reclaim/file.ts\n"),
        AGX_STATE_DIR: state,
        FAKE_TOUCH: "tools/reclaim/file.ts",
        FAKE_LAST:
          '```agx-return\n{"findings":[],"evidence":[],"impact_on_brief":"sibling observed","proposed_next":"none","artifacts":[]}\n```',
      },
    );
    const receipt = decodedJson(
      z.looseObject({
        writes_unattributed: z.array(z.string()),
        writes_violations: z.array(z.string()).optional(),
      }),
      r.out.trim(),
    );
    expect(receipt.writes_unattributed).toContain("tools/reclaim/file.ts");
    expect(receipt.writes_violations).toBeUndefined();
    expect(r.code).toBe(0);
  });

  test("read-only ticket with changes is a violation", async () => {
    const b = brief(
      "writes-readonly",
      ticketText('writes = []\nverify = ["true"]'),
    );
    const r = await router(runArgs(b, freshCwd(), "read-only"), {
      ...gitStatus("?? changed.txt\n"),
      FAKE_TOUCH: "changed.txt",
    });
    const receipt = decodedJson(
      z.looseObject({ writes_violations: z.array(z.string()) }),
      r.out.trim(),
    );
    expect(receipt.writes_violations).toEqual(["changed.txt"]);
    expect(r.code).not.toBe(0);
  });

  test("a live sibling owns an overlapping write even from another subdirectory of the workspace", async () => {
    const cwd = freshCwd();
    mkdirSync(join(cwd, ".jj"));
    mkdirSync(join(cwd, "child"));
    const state = join(scratch, `live-overlap-${stateSeq++}`);
    mkdirSync(join(state, "active"), { recursive: true });
    writeFileSync(
      join(state, "active", "sibling.json"),
      JSON.stringify({
        schema: 1,
        run_id: "sibling",
        pid: process.pid,
        label: "other",
        choice: "luna-high",
        pick_source: "jev",
        started_at: Temporal.Now.instant().toString(),
        cwd: join(cwd, "child"),
        ticket: { writes: ["shared.txt"] },
      }),
    );
    const r = await router(
      runArgs(
        brief(
          "live-overlap",
          ticketText('writes = ["shared.txt"]\nverify = []'),
        ),
        cwd,
      ),
      {
        ...gitStatus("?? shared.txt\n"),
        AGX_STATE_DIR: state,
        FAKE_TOUCH: "shared.txt",
        FAKE_LAST:
          '```agx-return\n{"findings":[],"evidence":[],"impact_on_brief":"other writer","proposed_next":"none","artifacts":[]}\n```',
      },
    );
    const receipt = decodedJson(
      z.looseObject({
        writes_check: z.array(z.string()),
        writes_unattributed: z.array(z.string()),
        writes_violations: z.array(z.string()).optional(),
      }),
      r.out.trim(),
    );
    expect(receipt.writes_check).toEqual([]);
    expect(receipt.writes_unattributed).toEqual(["shared.txt"]);
    expect(receipt.writes_violations).toBeUndefined();
    expect(r.err).toContain("changed by others (not attributed): shared.txt");
    expect(r.code).toBe(0);
  });

  test("unavailable change listing is recorded with its cause", async () => {
    const noVcs = join(scratch, "no-write-list-vcs");
    mkdirSync(noVcs, { recursive: true });
    for (const tool of ["jj", "git"]) {
      const stub = join(noVcs, tool);
      writeFileSync(
        stub,
        `#!/bin/sh\necho "${tool} disabled by test" >&2\nexit 127\n`,
      );
      chmodSync(stub, 0o755);
    }
    const r = await scopeRun("writes-unavailable", '["allowed/**"]', {
      PATH: `${noVcs}:${process.env.PATH ?? ""}`,
    });
    const receipt = decodedJson(
      z.looseObject({ writes_check: z.string() }),
      r.out.trim(),
    );
    expect(receipt.writes_check).toBe("vcs: none; mtime scan");
  });
});

describe("agx worker teardown", () => {
  test("reaps a process left in the worker process group and records it", async () => {
    const pidFile = join(scratch, "orphan-pid.txt");
    const r = await router(
      runArgs(
        brief("orphan-group", "Finish and exit.\n"),
        freshCwd(),
        "read-only",
      ),
      { FAKE_ORPHAN_PID_FILE: pidFile },
    );
    const receipt = decodedJson(
      z.looseObject({
        orphans_reaped: z.array(
          z.looseObject({ pid: z.number(), cmd: z.string() }),
        ),
      }),
      r.out.trim(),
    );
    const pid = Number(readFileSync(pidFile, "utf8"));
    expect(receipt.orphans_reaped.length).toBeGreaterThan(0);
    await attemptOr(() => process.kill(pid, "SIGKILL"), undefined);
  });
});

describe("agx dispatch: ungraded no-verify warnings", () => {
  let seq = 0;
  /** An ungraded finished run in `cwd`; `writes` undefined = a legacy run (no ticket). */
  function seed(
    state: string,
    cwd: string,
    writes: string[] | undefined,
    verify?: string[],
    dispatcherSession: string | null = process.env.CLAUDE_CODE_SESSION_ID ??
      null,
  ): string {
    const runId = `seeded-${seq++}`;
    const seededTicket = (): Record<string, unknown> | undefined => {
      if (writes === undefined) return undefined;
      if (verify !== undefined) return { schema: 1, writes, verify };
      return { schema: 1, writes };
    };
    mkdirSync(state, { recursive: true });
    appendFileSync(
      join(state, "runs.jsonl"),
      `${JSON.stringify({
        schema: 1,
        kind: "run",
        run_id: runId,
        label: "seeded side worker",
        cwd,
        ended_at: "2026-10-08T01:02:03Z",
        ...(dispatcherSession === null
          ? {}
          : { dispatcher_session: dispatcherSession }),
        pick: { source: "jev", choice: "luna-high" },
        exit: 0,
        worker: { outcome: "ok" },
        ...(seededTicket() === undefined ? {} : { ticket: seededTicket() }),
      })}\n`,
    );
    return runId;
  }
  const gate = (name: string): string => join(scratch, `gate-${name}-${seq++}`);
  const ticketRun = (
    cwd: string,
    writes: string,
    sandbox = "workspace-write",
  ) =>
    runArgs(
      brief(`g-${seq++}`, ticketText(`writes = ${writes}\nverify = []`)),
      cwd,
      sandbox,
    );

  test("ungraded no-verify ticket warns and continues by same cwd fallback", async () => {
    const cwd = freshCwd();
    const state = gate("overlap");
    seed(state, cwd, ["tools/agx/**"]);
    const r = await router(ticketRun(cwd, "[]"), {
      AGX_STATE_DIR: state,
    });
    expect(r.code).toBe(0);
    expect(r.err).toContain("warning:");
    expect(r.err).toContain("remain ungraded");
    expect(
      r.err.split("\n").filter((line) => line.includes("warning:")),
    ).toHaveLength(1);
  });

  test("one warning summarizes multiple ungraded runs", async () => {
    const cwd = freshCwd();
    const state = gate("all-blockers");
    for (let index = 0; index < 12; index += 1) seed(state, cwd, ["a/**"]);
    const r = await router(ticketRun(cwd, "[]"), {
      AGX_STATE_DIR: state,
    });
    expect(r.code).toBe(0);
    expect(
      r.err.split("\n").filter((line) => line.includes("warning:")),
    ).toHaveLength(1);
    expect(r.err).toContain("12 finished run(s)");
  });

  test("disjoint write globs do not block when a no-verify run is ungraded", async () => {
    const cwd = freshCwd();
    const state = gate("disjoint");
    seed(state, cwd, ["tools/agx/**"]);
    const r = await router(ticketRun(cwd, '["agents/models/roster.ts"]'), {
      AGX_STATE_DIR: state,
      FAKE_TOUCH: "agents/models/roster.ts",
    });
    expect(r.code).toBe(0);
    expect(r.err).toContain("warning:");
  });

  test("dispatcher-session warning spans cwd boundaries", async () => {
    const state = gate("othercwd");
    seed(state, freshCwd(), ["a/**"]);
    const r = await router(ticketRun(freshCwd(), "[]"), {
      AGX_STATE_DIR: state,
    });
    expect(r.code).toBe(0);
    expect(r.err).toContain("warning:");
  });

  test("read-only and writing no-verify tickets warn and continue", async () => {
    const cwd = freshCwd();
    const state = gate("readonly");
    seed(state, cwd, ["a/**"]);
    const ro = await router(ticketRun(cwd, "[]", "read-only"), {
      AGX_STATE_DIR: state,
    });
    expect(ro.code).toBe(0);
    expect(ro.err).toContain("warning:");
    const state2 = gate("readonly2");
    seed(state2, cwd, []);
    const rw = await router(ticketRun(cwd, "[]"), {
      AGX_STATE_DIR: state2,
    });
    expect(rw.code).toBe(0);
    expect(rw.err).toContain("warning:");
    const legacy = await router(runArgs(brief(`g-${seq++}`, "legacy\n"), cwd), {
      AGX_STATE_DIR: state2,
    });
    expect(legacy.code).toBe(0);
    expect(legacy.err).toContain("warning:");
  });

  test("an ungraded ticket with verify never gates a later dispatch", async () => {
    const cwd = freshCwd();
    const state = gate("verified-ticket");
    seed(state, cwd, ["a/**"], ["true"]);
    const r = await router(ticketRun(cwd, "[]"), {
      AGX_STATE_DIR: state,
    });
    expect(r.code).toBe(0);
  });

  test("an ungraded run in another dispatcher session does not block", async () => {
    const cwd = freshCwd();
    const state = gate("dispatcher-session");
    const id = seed(state, cwd, undefined);
    const r = await router(runArgs(brief(`g-${seq++}`, "plain\n"), cwd), {
      AGX_STATE_DIR: state,
      CLAUDE_CODE_SESSION_ID: "session-b",
    });
    expect(r.code).toBe(0);
    expect(r.err).not.toContain(id);
  });

  test("cwd is the warning key when no dispatcher session is available", async () => {
    const cwd = freshCwd();
    const state = gate("cwd-fallback");
    seed(state, cwd, undefined, undefined, null);
    const r = await router(runArgs(brief(`g-${seq++}`, "plain\n"), cwd), {
      AGX_STATE_DIR: state,
      CLAUDE_CODE_SESSION_ID: "",
    });
    expect(r.code).toBe(0);
    expect(r.err).toContain("warning:");
  });

  test("legacy mode also warns and continues for later legacy and writing-ticket runs", async () => {
    const cwd = freshCwd();
    const state = gate("legacy");
    seed(state, cwd, undefined);
    const legacy = await router(runArgs(brief(`g-${seq++}`, "legacy\n"), cwd), {
      AGX_STATE_DIR: state,
    });
    expect(legacy.code).toBe(0);
    expect(legacy.err).toContain("warning:");
    const ticket = await router(ticketRun(cwd, "[]"), {
      AGX_STATE_DIR: state,
    });
    expect(ticket.code).toBe(0);
    expect(ticket.err).toContain("warning:");
  });

  test("an ungraded writing ticket run warns before a legacy run", async () => {
    const cwd = freshCwd();
    const state = gate("ticket-blocks-legacy");
    seed(state, cwd, ["z/**"]);
    const legacy = await router(runArgs(brief(`g-${seq++}`, "legacy\n"), cwd), {
      AGX_STATE_DIR: state,
    });
    expect(legacy.code).toBe(0);
    expect(legacy.err).toContain("warning:");
  });
});

// --- every brief's text is kept, content-addressed, under the state dir ------------------------------

const sha = (s: string): string =>
  new Bun.CryptoHasher("sha256").update(s).digest("hex");

describe("agx: the stored brief", () => {
  const BriefLine = z.looseObject({
    kind: z.string(),
    brief: z.looseObject({ sha256: z.string() }),
  });
  const keyOf = (state: string): string =>
    decodedJson(
      BriefLine,
      readFileSync(join(state, "runs.jsonl"), "utf8").split("\n")[0] ?? "",
    ).brief.sha256;

  test("the full original text, ticket included, is at briefs/<sha256>.md after the run", async () => {
    const text = fixtureBriefText(
      ticketText('writes = []\nverify = ["true"]', "STORE-MARK keep me\n"),
    );
    const r = await router(
      runArgs(brief("s-store", text), freshCwd(), "read-only"),
    );
    expect(r.code).toBe(0);
    const key = keyOf(r.state);
    expect(key).toBe(sha(text));
    const stored = join(r.state, "briefs", `${key}.md`);
    expect(readFileSync(stored, "utf8")).toBe(text);
    // the per-run worker copy is gone; the content-addressed one stays
    expect(readdirSync(join(r.state, "briefs"))).toEqual([`${key}.md`]);
  });

  test("a legacy brief (no ticket) is stored too", async () => {
    const text = fixtureBriefText("legacy STORE-LEGACY text\n");
    const r = await router(
      runArgs(brief("s-legacy", text), freshCwd(), "read-only"),
    );
    expect(
      readFileSync(join(r.state, "briefs", `${sha(text)}.md`), "utf8"),
    ).toBe(text);
  });

  test("two runs of the same brief store it once, the first copy never rewritten", async () => {
    const state = join(scratch, "s-once");
    const b = brief("s-once", "STORE-ONCE twice\n");
    await router(runArgs(b, freshCwd(), "read-only"), {
      AGX_STATE_DIR: state,
      CLAUDE_CODE_SESSION_ID: "store-once-first",
    });
    const file = join(
      state,
      "briefs",
      `${sha(fixtureBriefText("STORE-ONCE twice\n"))}.md`,
    );
    const first = statSync(file).mtimeMs;
    await Bun.sleep(30);
    const second = await router(runArgs(b, freshCwd(), "read-only"), {
      AGX_STATE_DIR: state,
      CLAUDE_CODE_SESSION_ID: "store-once-second",
    });
    expect(second.code).toBe(0);
    expect(readdirSync(join(state, "briefs"))).toEqual([basename(file)]);
    expect(statSync(file).mtimeMs).toBe(first);
    expect(logLines(state).filter((l) => l.kind === "run")).toHaveLength(2);
  });

  test("result --brief prints the stored brief, and still does once the original file is gone", async () => {
    const text = fixtureBriefText(
      ticketText("writes = []\nverify = []", "STORE-PRINT body\n"),
    );
    const path = brief("s-print", text);
    const run = await router(runArgs(path, freshCwd(), "read-only"));
    const id = decodedJson(RunIdSchema, run.out.trim()).run_id;
    rmSync(path);
    const r = await router(["ledger", "result", id, "--brief"], {
      AGX_STATE_DIR: run.state,
    });
    expect(r.code).toBe(0);
    expect(r.out).toBe(text);
  });

  test("result --brief with no stored copy and no original file says so, exit 1", async () => {
    const path = brief("s-gone", "STORE-GONE\n");
    const run = await router(runArgs(path, freshCwd(), "read-only"));
    const id = decodedJson(RunIdSchema, run.out.trim()).run_id;
    rmSync(path);
    rmSync(
      join(run.state, "briefs", `${sha(fixtureBriefText("STORE-GONE\n"))}.md`),
    );
    const r = await router(["ledger", "result", id, "--brief"], {
      AGX_STATE_DIR: run.state,
    });
    expect(r.code).toBe(1);
    expect(r.err).toContain("no stored brief");
  });
});

const after = (argv: string[], flag: string): string | undefined =>
  argv[argv.indexOf(flag) + 1];
const isAlive = (pid: number): Promise<boolean> =>
  attemptOr(() => process.kill(pid, 0), false);
const readPids = (file: string): number[] =>
  existsSync(file)
    ? readFileSync(file, "utf8")
        .trim()
        .split(/\s+/u)
        .filter((x) => x !== "")
        .map(Number)
    : [];

// --- resume: continue a stopped worker in its own vendor session -----------------------------------

describe("agx dispatch --resume", () => {
  const argvLines = (file: string): string[][] =>
    readFileSync(join(scratch, file), "utf8")
      .trim()
      .split("\n")
      .map((l) => decodedJson(z.array(z.string()), l));
  const lastArgv = (file: string): string[] => argvLines(file).at(-1) ?? [];
  const RunRec = z.looseObject({
    run_id: z.string(),
    kind: z.string(),
    resumed_from: z.string().optional(),
    resume_with: z.string().optional(),
    pick: z.looseObject({ source: z.string(), choice: z.string() }).optional(),
    ticket: z.looseObject({ writes: z.array(z.string()) }).optional(),
    worker: z
      .looseObject({
        outcome: z.string().optional(),
        cause: z.string().optional(),
      })
      .optional(),
  });
  const records = (state: string): z.output<typeof RunRec>[] =>
    readFileSync(join(state, "runs.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => decodedJson(RunRec, l));
  const runsOf = (state: string): z.output<typeof RunRec>[] =>
    records(state).filter((x) => x.kind === "run");
  const firstId = (state: string): string => runsOf(state)[0]?.run_id ?? "";
  const promptTail = (): string => {
    const seen = readFileSync(join(scratch, "prompt.log"), "utf8");
    return seen.slice(seen.lastIndexOf("<<<"));
  };
  const stoppedRun = (
    name: string,
    env: Record<string, string>,
    text = "do it\n",
  ) => router(runArgs(brief(name, text), freshCwd()), env);

  test("a timed-out run with a session: the receipt and stderr name the resume command; without a session they do not", async () => {
    const r = await stoppedRun("rs-hint", { FAKE_TIMEOUT: "1" });
    expect(r.code).toBe(3);
    const id = firstId(r.state);
    expect(r.err).toContain(`agx dispatch --resume ${id}`);
    expect(
      decodedJson(z.looseObject({ resume_with: z.string() }), r.out.trim())
        .resume_with,
    ).toBe(`agx dispatch --resume ${id}`);
    expect(runsOf(r.state)[0]?.resume_with).toBe(`agx dispatch --resume ${id}`);
    const failed = await stoppedRun("rs-hint-failed", { FAKE_EXIT: "1" });
    expect(failed.err).toContain("agx dispatch --resume ");
    const none = await stoppedRun("rs-hint-none", {
      FAKE_TIMEOUT: "1",
      FAKE_NO_SESSION: "1",
    });
    expect(none.err).not.toContain("agx dispatch --resume ");
  });

  test("codex: same row, sandbox and cwd, continuing the thread; no Jev pick; logged as resumed; the default message", async () => {
    const cwd = freshCwd();
    const stopped = await router(
      runArgs(brief("rs-codex", "PICK=luna-high do it\n"), cwd),
      {
        FAKE_TIMEOUT: "1",
      },
    );
    const id = firstId(stopped.state);
    const before = bodies.length;
    const r = await router(["dispatch", "--resume", id], {
      AGX_STATE_DIR: stopped.state,
    });
    expect(r.code).toBe(0);
    expect(bodies.length).toBe(before); // Jev was not asked: the row is the original's
    const argv = lastArgv("argv.log");
    expect(after(argv, "--resume")).toBe("thread-fake-0001");
    expect(after(argv, "--choice")).toBe("luna-high");
    expect(after(argv, "--sandbox")).toBe("workspace-write");
    expect(after(argv, "--cd")).toBe(cwd);
    const runs = runsOf(stopped.state);
    expect(runs).toHaveLength(2);
    expect(runs[1]?.run_id).not.toBe(id);
    expect(runs[1]?.resumed_from).toBe(id);
    expect(runs[1]?.pick).toMatchObject({
      source: "resume",
      choice: "luna-high",
    });
    expect(r.err).toContain(id);
    expect(promptTail()).toContain(
      "You were stopped before you finished (timeout: fake worker timed out). Continue the same task from where you stopped; finish it, run its checks in the foreground, and write your final report.",
    );
    // --prompt-file replaces the default message
    // (a second stopped run: the first resumed run is itself ungraded and owed a grade first)
    const other = await stoppedRun("rs-msg-other", { FAKE_TIMEOUT: "1" });
    const msg = brief("rs-msg-own", "ONLY-THE-TAIL: check the lint\n");
    await router(
      ["dispatch", "--resume", firstId(other.state), "--prompt-file", msg],
      {
        AGX_STATE_DIR: other.state,
      },
    );
    expect(promptTail()).toContain("ONLY-THE-TAIL: check the lint");
    expect(promptTail()).not.toContain("You were stopped");
  });

  test("a session-id prefix names the run", async () => {
    const stopped = await stoppedRun("rs-prefix", { FAKE_EXIT: "1" });
    const r = await router(["dispatch", "--resume", "thread-fake"], {
      AGX_STATE_DIR: stopped.state,
    });
    expect(r.code).toBe(0);
    expect(runsOf(stopped.state)).toHaveLength(2);
  });

  test("a run without a session id, or an unknown run, is refused: exit 2, the reason, no worker", async () => {
    const stopped = await stoppedRun("rs-nosession", {
      FAKE_TIMEOUT: "1",
      FAKE_NO_SESSION: "1",
    });
    const id = firstId(stopped.state);
    const argvBefore = argvLines("argv.log").length;
    const r = await router(["dispatch", "--resume", id], {
      AGX_STATE_DIR: stopped.state,
    });
    expect(r.code).toBe(2);
    expect(r.err).toContain("no session id");
    expect(r.err).toContain(id);
    expect(argvLines("argv.log")).toHaveLength(argvBefore);
    const unknown = await router(["dispatch", "--resume", "no-such-run"]);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain("no run no-such-run");
  });

  test("claude: --resume <session> on the same row, model, effort and mode; sessions are persisted", async () => {
    const cwd = freshCwd();
    const home = join(scratch, "resume-claude-home");
    const projectDir = join(
      home,
      ".claude",
      "projects",
      cwd.replaceAll(/[/.]/gu, "-"),
    );
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "sess-claude-0001.jsonl"), "{}\n");
    const claude = { AGX_RUN_CLAUDE: FAKE_CLAUDE, HOME: home };
    const stopped = await router(
      [
        ...runArgs(
          brief(
            "rs-claude",
            "PICK=sonnet-medium PROBS=sonnet-medium:0.6,sonnet-high:0.4 do it\n",
          ),
          cwd,
        ),
        "--pick-seed",
        "resume-seed",
      ],
      { FAKE_CLAUDE_MODE: "timeout", ...claude },
    );
    expect(stopped.code).toBe(124);
    const id = firstId(stopped.state);
    expect(stopped.err).toContain(`agx dispatch --resume ${id}`);
    const firstArgv = lastArgv("claude-argv.log");
    expect(firstArgv).toContain("--persist-session"); // router-dispatched sessions stay on disk
    expect(firstArgv).not.toContain("--resume");
    const jevCallsBeforeResume = bodies.length;
    const firstPick = runsOf(stopped.state)[0]?.pick;
    const r = await router(["dispatch", "--resume", id], {
      AGX_STATE_DIR: stopped.state,
      ...claude,
    });
    expect(r.code).toBe(0);
    const argv = lastArgv("claude-argv.log");
    expect(after(argv, "--resume")).toBe("sess-claude-0001");
    expect(after(argv, "--model")).toBe(after(firstArgv, "--model"));
    expect(after(argv, "--effort")).toBe(after(firstArgv, "--effort"));
    expect(after(argv, "--permission-mode")).toBe("acceptEdits");
    expect(after(argv, "--target")).toBe(cwd);
    expect(runsOf(stopped.state)[1]).toMatchObject({
      resumed_from: id,
      pick: {
        source: "resume",
        choice: firstPick?.choice,
        seed: "resume-seed",
      },
    });
    expect(bodies).toHaveLength(jevCallsBeforeResume);
  });

  test("claude without its persisted transcript is not advertised or resumed", async () => {
    const cwd = freshCwd();
    const home = join(scratch, "resume-claude-missing-home");
    const claude = { AGX_RUN_CLAUDE: FAKE_CLAUDE, HOME: home };
    const stopped = await router(
      runArgs(brief("rs-claude-missing", "PICK=sonnet-medium do it\n"), cwd),
      { FAKE_CLAUDE_MODE: "timeout", ...claude },
    );
    const id = firstId(stopped.state);
    expect(stopped.err).not.toContain(`agx dispatch --resume ${id}`);
    expect(runsOf(stopped.state)[0]?.resume_with).toBeUndefined();
    const before = readFileSync(join(scratch, "claude-argv.log"), "utf8")
      .trim()
      .split("\n").length;
    const transcript = join(
      home,
      ".claude",
      "projects",
      cwd.replaceAll(/[/.]/gu, "-"),
      "sess-claude-0001.jsonl",
    );
    const r = await router(["dispatch", "--resume", id], {
      AGX_STATE_DIR: stopped.state,
      ...claude,
    });
    expect(r.code).toBe(2);
    expect(r.err).toContain(transcript);
    expect(r.err).toContain("fresh run with a continuation brief");
    expect(
      readFileSync(join(scratch, "claude-argv.log"), "utf8").trim().split("\n"),
    ).toHaveLength(before);
  });

  test("the ticket applies again: verify and the router's grade run after the resumed worker", async () => {
    const b = brief(
      "rs-ticket",
      ticketText(
        'writes = []\nverify = ["echo RESUMEVERIFY && echo GRADE=pass"]',
        "PICK=luna-high do it\n",
      ),
    );
    const stopped = await router(runArgs(b, freshCwd()), { FAKE_EXIT: "1" });
    const r = await router(["dispatch", "--resume", firstId(stopped.state)], {
      AGX_STATE_DIR: stopped.state,
    });
    expect(r.code).toBe(0);
    const receipt = decodedJson(TicketReceipt, r.out.trim());
    expect(receipt.verify_summary).toBe("1/1 passed");
    expect(receipt.verify[0]?.output_tail).toContain("RESUMEVERIFY");
    expect(receipt.grade).toMatchObject({ grade: "pass", graded_by: "router" });
    expect(runsOf(stopped.state)[1]?.ticket?.writes).toEqual([]); // the gate sees it
    expect(
      records(stopped.state).filter((x) => x.kind === "grade"),
    ).toHaveLength(2);
    expect(promptTail()).toContain("`echo RESUMEVERIFY");
  });
});

describe("agx: a stopped router stops its verify too", () => {
  test("SIGTERM while verify runs kills the verify group and records the run as stopped", async () => {
    const pidFile = join(scratch, "stop-pids");
    const script = join(scratch, "stop-grand.sh");
    // two grandchildren of the verify shell: one backgrounded, one in the foreground
    writeFileSync(
      script,
      `sleep 60 &\necho $! > ${pidFile}\nsleep 60 &\necho $! >> ${pidFile}\nwait\n`,
    );
    const b = brief(
      "rs-stop",
      ticketText(`writes = ["s/**"]\nverify = ["sh ${script}; true"]`),
    );
    let pids: number[] = [];
    const r = await router(runArgs(b, freshCwd()), {}, async (proc) => {
      for (let i = 0; i < 200 && pids.length < 2; i++) {
        await Bun.sleep(100);
        pids = readPids(pidFile);
      }
      proc.kill("SIGTERM");
    });
    expect(pids).toHaveLength(2);
    expect(r.code).toBe(143);
    await Bun.sleep(300);
    const alive = await Promise.all(pids.map((p) => isAlive(p)));
    const survivors = pids.filter((_, n) => alive[n] === true);
    for (const p of survivors) process.kill(p, "SIGKILL");
    expect(survivors).toEqual([]);
    // recorded as stopped, with a waiver (nothing to grade); the marker is gone
    const lines = readFileSync(join(r.state, "runs.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) =>
        decodedJson(
          z.looseObject({
            kind: z.string(),
            worker: z
              .looseObject({ outcome: z.string(), cause: z.string() })
              .optional(),
          }),
          l,
        ),
      );
    const run = lines.find((l) => l.kind === "run");
    expect(lines.filter((l) => l.kind === "run")).toHaveLength(1);
    expect(run?.worker?.outcome).toBe("stopped");
    expect(run?.worker?.cause).toContain("SIGTERM");
    expect(lines.some((l) => l.kind === "grade-waived")).toBe(true);
    expect(readdirSync(join(r.state, "active"))).toEqual([]);
  }, 40_000);
});

// --- the stop reason of a claude worker, and the typed final report ----------------------------------

const REPORT = {
  summary: "did the thing",
  changes: [{ path: "a.ts", what: "added" }],
  checks: [{ cmd: "bun test", exit: 0, result: "all pass" }],
  for_coordinator: ["run bun test"],
  open: [],
};
const claudeBrief = (name: string): string =>
  brief(name, "PICK=sonnet-high do the thing\n");
const runIn = (b: string, env: Record<string, string>) =>
  router(
    ["dispatch", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"],
    {
      AGX_RUN_CLAUDE: FAKE_CLAUDE,
      ...env,
    },
  );
const Worker = z.looseObject({
  worker: z.looseObject({
    outcome: z.string(),
    cause: z.string().optional(),
    last_message: z.string().optional(),
  }),
  report: z.unknown().optional(),
  report_error: z.string().optional(),
  report_partial: z
    .looseObject({
      last_progress: z.string(),
      commands: z.number(),
      files_changed: z.array(z.string()),
      last_message_tail: z.string(),
      cause: z.string(),
    })
    .optional(),
});

describe("agx: a claude worker's stop reason", () => {
  const cases = [
    [
      "max_turns",
      "stopped at the turn bound (error_max_turns, 60 turns of 60)",
    ],
    [
      "budget",
      "stopped at the budget bound (error_max_budget_usd, $2.01 spent, bound $2)",
    ],
    [
      "exec_error",
      "claude stopped with error_during_execution (is_error=true, 3 turns): tool crashed",
    ],
    // claude exiting 0 with an error result is still a failure, and says why
    [
      "exit0_error",
      "stopped at the turn bound (error_max_turns, 60 turns of 60)",
    ],
    ["no_result", "claude produced no result event"],
  ] as const;
  for (const [mode, cause] of cases)
    test(`${mode}: claude-failed, cause names it`, async () => {
      const r = await runIn(claudeBrief(`stop-${mode}`), {
        FAKE_CLAUDE_MODE: mode,
      });
      const parsed = decodedJson(Worker, r.out.trim());
      expect(parsed.worker.outcome).toBe("claude-failed");
      expect(parsed.worker.cause ?? "").toContain(cause);
      expect(parsed.worker.cause ?? "").not.toContain("reported no cause");
      if (mode === "max_turns" || mode === "budget")
        expect(parsed.report_partial?.cause).toContain(
          cause.split(" ")[3] ?? "stopped",
        );
    });
});

describe("agx: the typed final report", () => {
  const instruction = "## Final report (required)";

  test("every worker prompt gets the report instruction after the verify line", async () => {
    const ticket = brief(
      "report-ticket",
      '+++\nschema = 1\nwrites = []\nverify = ["true"]\n+++\nDo the work.\n',
    );
    const cwd = join(scratch, "report-ticket-cwd");
    mkdirSync(cwd, { recursive: true });
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        ticket,
        "--cd",
        cwd,
        "--sandbox",
        "read-only",
      ],
      {},
    );
    expect(r.code).toBe(0);
    const prompts = readFileSync(join(scratch, "prompt.log"), "utf8");
    const mine = prompts.slice(prompts.lastIndexOf("Do the work."));
    expect(mine.indexOf("true")).toBeGreaterThan(-1);
    expect(mine.indexOf(instruction)).toBeGreaterThan(mine.indexOf("true"));
    // a legacy brief (no ticket) gets it too
    const legacy = await router(
      [
        "dispatch",
        "--prompt-file",
        brief("report-legacy", "Plain brief.\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {},
    );
    expect(legacy.code).toBe(0);
    const written = readFileSync(join(scratch, "prompt.log"), "utf8");
    expect(written.slice(written.lastIndexOf("Plain brief."))).toContain(
      instruction,
    );
  }, 45_000);

  test("worker output allows a final report followed by the fenced RETURN block", async () => {
    await router(
      [
        "dispatch",
        "--prompt-file",
        brief("schema-codex", "Do it.\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {},
    );
    const codexArgv =
      readFileSync(join(scratch, "argv.log"), "utf8")
        .trim()
        .split("\n")
        .at(-1) ?? "";
    expect(codexArgv).not.toContain('"--output-schema"');
    const codexPrompt = readFileSync(join(scratch, "prompt.log"), "utf8");
    expect(codexPrompt).toContain("agx-return");
    await runIn(claudeBrief("schema-claude"), {});
    const claudeArgv =
      readFileSync(join(scratch, "claude-argv.log"), "utf8")
        .trim()
        .split("\n")
        .at(-1) ?? "";
    expect(claudeArgv).not.toContain('"--json-schema-file"');
  });

  test("a valid report from the codex route is stored in the receipt and the run record", async () => {
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        brief("report-codex", "Do it.\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { FAKE_LAST: JSON.stringify(REPORT) },
    );
    const receipt = decodedJson(Worker, r.out.trim());
    expect(receipt.report).toEqual(REPORT);
    expect(receipt.report_error).toBeUndefined();
    const logged = decodedJson(
      Worker,
      readFileSync(join(r.state, "runs.jsonl"), "utf8").trim().split("\n")[0] ??
        "",
    );
    expect(logged.report).toEqual(REPORT);
  });

  test("a valid report from the claude route: as text, and as structured output", async () => {
    const asText = await runIn(claudeBrief("report-claude-text"), {
      FAKE_LAST: JSON.stringify(REPORT),
    });
    expect(decodedJson(Worker, asText.out.trim()).report).toEqual(REPORT);
    const structured = await runIn(claudeBrief("report-claude-struct"), {
      FAKE_CLAUDE_MODE: "structured",
    });
    const parsed = decodedJson(Worker, structured.out.trim());
    expect(parsed.report).toMatchObject({ summary: "typed" });
    expect(parsed.worker.last_message).toContain('"summary":"typed"');
  });

  test("an invalid report is report_error, the raw message is kept, the run still succeeds", async () => {
    for (const bad of ['{"summary":1}', "all done, no JSON here"]) {
      const r = await router(
        [
          "dispatch",
          "--prompt-file",
          brief("report-bad", "Do it.\n"),
          "--cd",
          scratch,
          "--sandbox",
          "read-only",
        ],
        { FAKE_LAST: bad },
      );
      expect(r.code).toBe(0);
      const parsed = decodedJson(Worker, r.out.trim());
      expect(parsed.worker.outcome).toBe("ok");
      expect(parsed.report).toBeUndefined();
      expect(parsed.report_error ?? "").toContain("the final message is");
      expect(parsed.worker.last_message).toBe(bad);
    }
  });

  test("no report at all is explicit", async () => {
    const r = await router(
      [
        "dispatch",
        "--prompt-file",
        brief("report-none", "Do it.\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { FAKE_NO_REPORT: "1" },
    );
    const parsed = decodedJson(Worker, r.out.trim());
    expect(parsed.report).toBeUndefined();
    expect(parsed.report_error).toBe("the worker's final message is empty");
  });

  test("result prints the sections; an invalid or missing report is said plainly", async () => {
    const state = join(scratch, "report-result");
    const env = { AGX_STATE_DIR: state };
    const id = async (
      name: string,
      extra: Record<string, string>,
    ): Promise<string> =>
      decodedJson(
        RunIdSchema,
        (
          await router(
            [
              "dispatch",
              "--prompt-file",
              brief(name, "Do it.\n"),
              "--cd",
              join(scratch, name),
              "--sandbox",
              "read-only",
            ],
            { ...env, CLAUDE_CODE_SESSION_ID: name, ...extra },
          )
        ).out.trim(),
      ).run_id;
    for (const name of ["rr-ok", "rr-bad", "rr-none"])
      mkdirSync(join(scratch, name), { recursive: true });
    const ok = await router(
      [
        "ledger",
        "result",
        await id("rr-ok", { FAKE_LAST: JSON.stringify(REPORT) }),
      ],
      env,
    );
    expect(ok.code).toBe(0);
    for (const section of [
      "## Summary",
      "did the thing",
      "## Changes",
      "a.ts: added",
      "## Checks",
      "[exit 0] bun test — all pass",
      "## For the coordinator",
      "run bun test",
      "## Open",
    ])
      expect(ok.out).toContain(section);
    const bad = await router(
      ["ledger", "result", await id("rr-bad", { FAKE_LAST: "just prose" })],
      env,
    );
    expect(bad.code).toBe(0);
    expect(bad.out).toContain("the typed final report is missing or invalid");
    expect(bad.out).toContain("just prose");
    const none = await router(
      ["ledger", "result", await id("rr-none", { FAKE_NO_REPORT: "1" })],
      env,
    );
    expect(none.code).toBe(1);
    expect(none.out).toContain("No final report");
    expect(none.out).toContain("the typed final report is missing or invalid");
  }, 60_000);

  test("a run recorded before typed reports still shows in result, and export is unaffected", async () => {
    const state = join(scratch, "report-old");
    mkdirSync(state, { recursive: true });
    const old = {
      kind: "run",
      run_id: "2026-10-05T00-00-00Z-1",
      cwd: scratch,
      started_at: "2026-10-05T00:00:00Z",
      pick: { source: "jev", choice: "luna-high" },
      exit: 0,
      worker: {
        outcome: "ok",
        elapsed_s: 2,
        last_message: "old prose report\n",
      },
    };
    writeFileSync(join(state, "runs.jsonl"), `${JSON.stringify(old)}\n`);
    const env = { AGX_STATE_DIR: state };
    const r = await router(["ledger", "result", old.run_id], env);
    expect(r.code).toBe(0);
    expect(r.out).toContain("no typed final report");
    expect(r.out).toContain("old prose report");
    const exported = await router(["ledger", "export"], env);
    expect(exported.code).toBe(0);
    expect(
      decodedJson(z.looseObject({ run_id: z.string() }), exported.out.trim())
        .run_id,
    ).toBe(old.run_id);
    expect(exported.out).not.toContain("report");
  });

  test("display names come from the CLI or ticket, with CLI precedence", async () => {
    const ticket = brief(
      "ticket-display-name",
      '+++\nschema = 1\nname = "MIX"\nwrites = []\nverify = ["true"]\n+++\nDo the work.\n',
    );
    const ticketRun = await router(
      [
        "dispatch",
        "--prompt-file",
        ticket,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {},
    );
    expect(ticketRun.code).toBe(0);
    expect(
      decodedJson(
        z.looseObject({ display_id: z.string() }),
        ticketRun.out.trim(),
      ).display_id,
    ).toBe("agt_MIX");

    const cliRun = await router(
      [
        "dispatch",
        "--prompt-file",
        ticket,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
        "--name",
        "cli_name",
      ],
      {},
    );
    expect(cliRun.code).toBe(0);
    expect(
      decodedJson(z.looseObject({ display_id: z.string() }), cliRun.out.trim())
        .display_id,
    ).toBe("agt_cli_name");

    const hyphenRun = await router(
      [
        "dispatch",
        "--prompt-file",
        ticket,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
        "--name",
        "gy-pressure",
      ],
      {},
    );
    expect(hyphenRun.code).toBe(0);
    expect(hyphenRun.err).toContain(
      "normalized worker name 'gy-pressure' to 'gy_pressure'",
    );
    expect(
      decodedJson(
        z.looseObject({ display_id: z.string() }),
        hyphenRun.out.trim(),
      ).display_id,
    ).toBe("agt_gy_pressure");
  });

  test("invalid and duplicate live names are refused with the reason and holder", async () => {
    const prompt = brief("invalid-display-name", "Plain brief.\n");
    const invalid = await router([
      "dispatch",
      "--prompt-file",
      prompt,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
      "--name",
      "bad.name",
    ]);
    expect(invalid.code).toBe(2);
    expect(invalid.err).toContain("invalid --name/name 'bad.name'");

    const state = join(scratch, "duplicate-display-id");
    const releaseFile = join(state, "release-worker");
    let duplicate: Awaited<ReturnType<typeof router>> | undefined;
    const first = await router(
      [
        "dispatch",
        "--prompt-file",
        prompt,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
        "--name",
        "a-b",
      ],
      { AGX_STATE_DIR: state, FAKE_BLOCK_UNTIL_FILE: releaseFile },
      async () => {
        const activeDir = join(state, "active");
        for (let attempt = 0; attempt < 200; attempt += 1) {
          const markers = existsSync(activeDir) ? readdirSync(activeDir) : [];
          if (
            markers.some(
              (file) =>
                file.endsWith(".json") &&
                !file.endsWith(".progress.json") &&
                readFileSync(join(activeDir, file), "utf8").includes(
                  '"display_id":"agt_a_b"',
                ),
            )
          )
            break;
          await Bun.sleep(10);
        }
        duplicate = await router(
          [
            "dispatch",
            "--prompt-file",
            prompt,
            "--cd",
            scratch,
            "--sandbox",
            "read-only",
            "--name",
            "a_b",
          ],
          { AGX_STATE_DIR: state },
        );
        writeFileSync(releaseFile, "release");
      },
    );
    expect(first.code).toBe(0);
    expect(duplicate?.code).toBe(2);
    expect(duplicate?.err).toContain("display id agt_a_b is held by live run ");
  });

  test("finished runs release names and unnamed runs get four lowercase base36 characters", async () => {
    const prompt = brief(
      "released-display-name",
      '+++\nschema = 1\nwrites = []\nverify = ["true"]\n+++\nDo the work.\n',
    );
    const state = join(scratch, "released-display-name");
    const args = [
      "dispatch",
      "--prompt-file",
      prompt,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
      "--name",
      "reused",
    ];
    expect((await router(args, { AGX_STATE_DIR: state })).code).toBe(0);
    expect((await router(args, { AGX_STATE_DIR: state })).code).toBe(0);
    const automatic = await router(
      [
        "dispatch",
        "--prompt-file",
        prompt,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGX_STATE_DIR: join(scratch, "automatic-display-name") },
    );
    expect(automatic.code).toBe(0);
    expect(
      decodedJson(
        z.looseObject({ display_id: z.string() }),
        automatic.out.trim(),
      ).display_id,
    ).toMatch(/^agt_[0-9a-z]{4}$/u);
  });

  test("resume, grade and ack accept the display ID; resume retains it", async () => {
    const prompt = brief(
      "display-id-resume",
      '+++\nschema = 1\nwrites = []\nverify = ["true"]\n+++\nDo the work.\n',
    );
    const state = join(scratch, "display-id-commands");
    const first = await router(
      [
        "dispatch",
        "--prompt-file",
        prompt,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
        "--name",
        "resume_me",
      ],
      { AGX_STATE_DIR: state, FAKE_TIMEOUT: "1" },
    );
    expect(first.code).toBe(3);
    const resumed = await router(["dispatch", "--resume", "agt-resume-me"], {
      AGX_STATE_DIR: state,
    });
    expect(resumed.code).toBe(0);
    expect(
      decodedJson(z.looseObject({ display_id: z.string() }), resumed.out.trim())
        .display_id,
    ).toBe("agt_resume_me");
    expect(
      (
        await router(
          ["ticket", "grade", "agt-resume-me", "--waive", "not needed"],
          {
            AGX_STATE_DIR: state,
          },
        )
      ).code,
    ).toBe(0);
    expect(
      (
        await router(["ledger", "note", "agt-resume-me"], {
          AGX_STATE_DIR: state,
        })
      ).code,
    ).toBe(0);
  });

  test("resume resolves a legacy hyphenated display ID stored before 1.5.4", async () => {
    const prompt = brief(
      "legacy-hyphen-display-id",
      '+++\nschema = 1\nwrites = []\nverify = ["true"]\n+++\nDo the work.\n',
    );
    const state = join(scratch, "legacy-hyphen-display-id");
    const first = await router(
      [
        "dispatch",
        "--prompt-file",
        prompt,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
        "--name",
        "rust-gc",
      ],
      { AGX_STATE_DIR: state, FAKE_TIMEOUT: "1" },
    );
    expect(first.code).toBe(3);
    const original = decodedJson(RunIdSchema, first.out.trim()).run_id;
    const logPath = join(state, "runs.jsonl");
    const [line = ""] = readFileSync(logPath, "utf8").trim().split("\n");
    const legacy = {
      ...decodedJson(z.looseObject({ display_id: z.string() }), line),
      display_id: "agt_rust-gc",
    };
    writeFileSync(logPath, `${JSON.stringify(legacy)}\n`);

    const resumed = await router(["dispatch", "--resume", "agt_rust-gc"], {
      AGX_STATE_DIR: state,
    });
    expect(resumed.code).toBe(0);
    expect(
      decodedJson(
        z.looseObject({ resumed_from: z.string() }),
        resumed.out.trim(),
      ).resumed_from,
    ).toBe(original);
  });
});
