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
import { z } from "../../hooks/zod.ts";
import { ROSTER_PATH } from "../../models/roster.ts";
import { decodedJson } from "../../hooks/tests/decode.ts";
import { attemptOr } from "../../hooks/attempt.ts";

// agent-router: the one entry point. A fake codex-run stands in for the worker (it records its argv and
// prints a receipt), a local server stands in for Jev, and every state file goes to a scratch dir.

const CLI = join(import.meta.dir, "..", "agent-router.ts");
const scratch = mkdtempSync(join(tmpdir(), "agent-router-test-"));
// Every request body the fake Jev received, in order (what left the machine).
const bodies: string[] = [];
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: async (req) => {
    const body = await req.text();
    bodies.push(body);
    const confidence = body.includes("LOWCONF") ? 0.2 : 0.9;
    // A marker in the state makes the fake answer like a failing provider (the ask exit classes).
    const status = /HTTP(401|429|500)/u.exec(body)?.[1];
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
    const choice = /PICK=([\w-]+)/u.exec(body)?.[1] ?? "luna-max";
    return Response.json({
      model: "fake-jev",
      answers: {
        worker: {
          type: "choice",
          choice,
          confidence,
          probabilities: { [choice]: confidence },
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

const FAKE = join(scratch, "fake-codex-run.ts");
writeFileSync(
  FAKE,
  `import { appendFileSync } from "node:fs";
appendFileSync(${JSON.stringify(join(scratch, "argv.log"))}, JSON.stringify(Bun.argv.slice(2)) + "\\n");
const timedOut = process.env.FAKE_TIMEOUT === "1";
const exit = timedOut ? 3 : Number(process.env.FAKE_EXIT ?? "0");
const args = Bun.argv.slice(2);
const promptAt = args.indexOf("--prompt-file");
if (promptAt !== -1)
  appendFileSync(${JSON.stringify(join(scratch, "prompt.log"))}, "<<<" + await Bun.file(args[promptAt + 1] ?? "").text() + ">>>\\n");
const touch = process.env.FAKE_TOUCH;
if (touch !== undefined)
  await Bun.write((args[args.indexOf("--cd") + 1] ?? ".") + "/" + touch, "worker-was-here");
const runIdAt = args.indexOf("--run-id");
const runId = runIdAt === -1 ? "standalone-fake-run" : args[runIdAt + 1];
const lastMessage = process.env.FAKE_NO_REPORT === "1" ? "" : "final report from fake worker\\n";
const usage = process.env.FAKE_USAGE === "missing" ? { input_tokens: 100 } : { input_tokens: 100, cached_input_tokens: 20, output_tokens: 7, reasoning_output_tokens: 3 };
console.log(JSON.stringify({ schema: 1, run_id: runId, outcome: timedOut ? "timeout" : exit === 0 ? "ok" : "codex-failed", elapsed_s: 1.5, usage, ...(process.env.FAKE_NO_SESSION === "1" ? {} : { session: "thread-fake-0001" }), last_message: lastMessage, ...(exit === 0 ? {} : { cause: timedOut ? "fake worker timed out" : "fake worker failed" }) }));
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
    `[auto.jev]\napi = "reseller"\nurl = "${server.url.href}"\n`,
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
if (mode === "garbage") {
  console.log("not a relay");
  process.exit(1);
}
const at = Bun.argv.indexOf("--progress-file");
if (at !== -1)
  writeFileSync(Bun.argv[at + 1] ?? "", JSON.stringify({ schema: 1, at: "2026-10-06T00:00:00Z", last: "✎ kernel.ts", commands: 2, files: 1 }));
console.log(JSON.stringify({ exit_code: 0, timed_out: false, result: "done", session_id: "sess-claude-0001", total_cost_usd: 0.01, usage: { input_tokens: 80, cache_read_input_tokens: 10, cache_creation_input_tokens: 5, output_tokens: 7 } }));
`,
);
const NO_EGRESS = roster("no-egress", (t) =>
  withJev(t).replace(
    "no_egress = []",
    `no_egress = [${JSON.stringify(scratch)}]`,
  ),
);

const brief = (name: string, text: string): string => {
  const p = join(scratch, `${name}.md`);
  writeFileSync(p, text);
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
  const state =
    env.AGENT_ROUTER_STATE_DIR ?? join(scratch, `state-${stateSeq++}`);
  const r = Bun.spawn([process.execPath, CLI, ...args], {
    env: {
      ...process.env,
      AGENT_ROUTER_STATE_DIR: state,
      AGENT_ROUTER_CODEX_RUN: FAKE,
      DISPATCH_ROSTER_PATH: LIVE_JEV,
      TYPESAFE_API_KEY: "fixture-key",
      ...env,
    },
    stdout: "pipe",
    stderr: "pipe",
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
  pick: z.looseObject({
    source: z.string(),
    choice: z.string(),
    reason: z.string(),
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

describe("agent-router run", () => {
  const b = brief("task", "Fix the flaky test in scripts/tests.\n");

  test("Jev's row runs codex-run with that row, logs, and leaves no running marker", async () => {
    const r = await router([
      "run",
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
    expect(readFileSync(join(scratch, "argv.log"), "utf8")).toContain(
      '"--choice","luna-max"',
    );
    expect(readFileSync(join(r.state, "runs.jsonl"), "utf8")).toContain(
      '"kind":"run"',
    );
    const runRecord = decodedJson(
      RunLogRecord,
      readFileSync(join(r.state, "runs.jsonl"), "utf8").trim(),
    );
    expect(runRecord.stats).toMatchObject({
      row: "luna-max",
      family: "luna",
      route: "codex",
      model: "gpt-6-luna",
      effort: "max",
      outcome: "ok",
      exit: 0,
      tokens: { input: 100, cached_input: 20, output: 7, reasoning: 3 },
      cost_basis: "list_price_x_tokens",
      price: { in: 0.1, out: 0.5, as_of: "2026-10-06" },
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
      ["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"],
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

  test("the worker's exit code is agent-router's exit code", async () => {
    const r = await router(
      ["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"],
      { FAKE_EXIT: "1" },
    );
    expect(r.code).toBe(1);
    expect(decodedJson(Receipt, r.out.trim()).worker.outcome).toBe(
      "codex-failed",
    );
  });

  test("auto: a confident Jev answer picks its row", async () => {
    const r = await router([
      "run",
      "--prompt-file",
      b,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
    ]);
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.source).toBe("jev");
    expect(receipt.pick.choice).toBe("luna-max");
  });

  test("auto: a low-confidence answer is still Jev's choice, its confidence recorded", async () => {
    // Jev must name one row; its top choice is its decision however spread its probabilities are.
    const low = brief("low", "LOWCONF something vague\n");
    const r = await router([
      "run",
      "--prompt-file",
      low,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
    ]);
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.source).toBe("jev");
    expect(receipt.pick.choice).toBe("luna-max");
    expect(receipt.pick.reason).toContain("confidence 0.20");
  });

  test("auto: no key falls back to the default and names where it looked", async () => {
    const r = await router(
      ["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"],
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
      ["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"],
      { DISPATCH_ROSTER_PATH: NO_EGRESS },
    );
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.source).toBe("default");
    expect(receipt.pick.reason).toContain("no_egress");
  });

  test("--choice is refused before anything starts: Jev alone picks the row", async () => {
    for (const id of ["luna-high", "luna-max"]) {
      const r = await router([
        "run",
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

  test("Jev is asked for the cheapest sufficient row, with each row's measured numbers and cost", async () => {
    await router([
      "run",
      "--prompt-file",
      brief("table", "Fix one typo.\n"),
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
    ]);
    const sent = bodies.at(-1) ?? "";
    expect(sent).toContain("Choose the CHEAPEST worker");
    // every roster row reaches Jev with its benchmark numbers and price multiple, claude rows included
    expect(sent).toContain("TB4 43.9%");
    expect(sent).toContain("20x the cheapest row");
    expect(sent).toContain("40x the cheapest row");
    expect(sent).toContain("1x the cheapest row");
  });

  test("Jev naming a row that is not in the roster falls back to the default and says why", async () => {
    const pick = brief("pick-unknown", "PICK=gpt-nine do the thing\n");
    const r = await router([
      "run",
      "--prompt-file",
      pick,
      "--cd",
      scratch,
      "--sandbox",
      "read-only",
    ]);
    const receipt = decodedJson(Receipt, r.out.trim());
    expect(receipt.pick.source).toBe("default");
    expect(receipt.pick.reason).toContain("not a roster row");
  });

  test("a claude row Jev picks runs run-claude with the roster's bounds and is logged like luna", async () => {
    // The fake Jev rates only sonnet-high, so it wins even after the claude weight.
    const pick = brief("pick-claude", "PICK=sonnet-high do the thing\n");
    for (const [sandbox, mode] of [
      ["read-only", "plan"],
      ["workspace-write", "acceptEdits"],
    ] as const) {
      const r = await router(
        ["run", "--prompt-file", pick, "--cd", scratch, "--sandbox", sandbox],
        { AGENT_ROUTER_RUN_CLAUDE: FAKE_CLAUDE },
      );
      expect(r.code).toBe(0);
      const receipt = decodedJson(Receipt, r.out.trim());
      expect(receipt.pick.choice).toBe("sonnet-high");
      expect(receipt.worker.outcome).toBe("ok");
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
        '"--timeout-ms","1800000"',
      ])
        expect(`${sandbox}: ${argv ?? ""}`).toContain(word);
    }
  });

  test("--timeout-s overrides the Claude route default", async () => {
    const pick = brief(
      "pick-claude-timeout",
      "PICK=sonnet-high do the thing\n",
    );
    const r = await router(
      [
        "run",
        "--prompt-file",
        pick,
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
        "--timeout-s",
        "17",
      ],
      { AGENT_ROUTER_RUN_CLAUDE: FAKE_CLAUDE },
    );
    expect(r.code).toBe(0);
    const argv = readFileSync(join(scratch, "claude-argv.log"), "utf8")
      .trim()
      .split("\n")
      .at(-1);
    expect(argv).toContain('"--timeout-ms","17000"');
  });

  test("the router run_id is used by codex-run for its receipt file and receipt field", async () => {
    const dir = join(scratch, "real-codex-run");
    mkdirSync(dir, { recursive: true });
    const codex = join(dir, "codex");
    writeFileSync(
      codex,
      `#!/bin/sh\nout=""; prev=""\nfor a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done\nprintf 'router integration report\\n' > "$out"\nprintf '%s\\n' '{"type":"thread.started","thread_id":"thread-router-integration"}' '{"type":"turn.completed","usage":{"input_tokens":2,"cached_input_tokens":0,"output_tokens":3,"reasoning_output_tokens":0}}'\n`,
    );
    chmodSync(codex, 0o755);
    const r = await router(
      [
        "run",
        "--prompt-file",
        brief("real-run", "Use the real codex-run wrapper.\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      {
        AGENT_ROUTER_CODEX_RUN: join(
          import.meta.dir,
          "../workers/codex-run.ts",
        ),
        CODEX_RUN_BIN: codex,
        CODEX_RUN_HOST_FILE: join(dir, "no-host.toml"),
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

  test("a bad --sandbox is refused", async () => {
    const r = await router([
      "run",
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

describe("agent-router result", () => {
  test("prints the final report verbatim after the run header", async () => {
    const state = join(scratch, "result-report");
    const b = brief("result-report", "Do the work.\n");
    const run = await router(
      ["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"],
      { AGENT_ROUTER_STATE_DIR: state },
    );
    const id = decodedJson(RunIdSchema, run.out.trim()).run_id;
    const r = await router(["result", id], { AGENT_ROUTER_STATE_DIR: state });
    expect(r.code).toBe(0);
    expect(r.out).toContain("row=luna-max outcome=ok exit=0 elapsed=1.5s");
    expect(r.out.endsWith("final report from fake worker\n")).toBe(true);
  });

  test("an empty final report is explicit and exits 1", async () => {
    const state = join(scratch, "result-empty");
    const b = brief("result-empty", "Do the work.\n");
    const run = await router(
      ["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"],
      {
        AGENT_ROUTER_STATE_DIR: state,
        FAKE_EXIT: "1",
        FAKE_NO_REPORT: "1",
      },
    );
    const id = decodedJson(RunIdSchema, run.out.trim()).run_id;
    const r = await router(["result", id], { AGENT_ROUTER_STATE_DIR: state });
    expect(r.code).toBe(1);
    expect(r.out).toContain("outcome=codex-failed");
    expect(r.out).toContain("No final report");
    expect(r.out).toContain("cause=fake worker failed");
  });

  test("resolves a Claude vendor-session prefix and supports JSON", async () => {
    const state = join(scratch, "result-claude");
    const b = brief("result-claude", "PICK=sonnet-high do the thing\n");
    const run = await router(
      ["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"],
      {
        AGENT_ROUTER_STATE_DIR: state,
        AGENT_ROUTER_RUN_CLAUDE: FAKE_CLAUDE,
      },
    );
    expect(run.code).toBe(0);
    const r = await router(["result", "sess-claude", "--json"], {
      AGENT_ROUTER_STATE_DIR: state,
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
    const r = await router(["result", "unknown-run-id"]);
    expect(r.code).toBe(2);
    expect(r.err).toContain("no run unknown-run-id");
  });
});

describe("agent-router ls and stats", () => {
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
    const r = await router(["ls"], { AGENT_ROUTER_STATE_DIR: state });
    expect(r.err).toContain("STALE");
    expect(r.out).toContain('"alive":false');
    rmSync(join(active, "dead.json"));
  });

  test("stats counts picks by source and runs by row", async () => {
    const state = join(scratch, "state-stats");
    const b = brief("stats", "Fix the flaky test.\n");
    for (const env of [
      {},
      { TYPESAFE_API_KEY: "", PATH: "/usr/bin:/bin", HOME: scratch },
    ]) {
      const cwd = mkdtempSync(join(scratch, "stats-cwd-"));
      await router(
        ["run", "--prompt-file", b, "--cd", cwd, "--sandbox", "read-only"],
        {
          AGENT_ROUTER_STATE_DIR: state,
          ...env,
        },
      );
    }
    const r = await router(["stats"], { AGENT_ROUTER_STATE_DIR: state });
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
    expect(Object.keys(report.per_choice)).toContain("luna-max");
  });

  test("no state dir yet: ls and stats still answer", async () => {
    expect(existsSync(join(scratch, "empty"))).toBe(false);
    expect(
      (await router(["ls"], { AGENT_ROUTER_STATE_DIR: join(scratch, "empty") }))
        .err,
    ).toContain("nothing running");
    expect(
      (
        await router(["stats"], {
          AGENT_ROUTER_STATE_DIR: join(scratch, "empty"),
        })
      ).code,
    ).toBe(0);
  });
});

describe("agent-router export", () => {
  test("exports latest grade, waiver and legacy rows without dropping them", async () => {
    const state = join(scratch, "export-history");
    const evidence = join(scratch, "export-evidence.txt");
    writeFileSync(evidence, "GRADE=pass\n");
    const a = await router(
      [
        "run",
        "--prompt-file",
        brief("export-a", "first\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGENT_ROUTER_STATE_DIR: state },
    );
    const aId = decodedJson(RunIdSchema, a.out.trim()).run_id;
    await router(["grade", aId, "--evidence", evidence], {
      AGENT_ROUTER_STATE_DIR: state,
    });
    const b = await router(
      [
        "run",
        "--prompt-file",
        brief("export-b", "second\n"),
        "--cd",
        scratch,
        "--sandbox",
        "read-only",
      ],
      { AGENT_ROUTER_STATE_DIR: join(scratch, "export-waiver") },
    );
    const bId = decodedJson(RunIdSchema, b.out.trim()).run_id;
    await router(["grade", bId, "--waive", "insufficient evidence"], {
      AGENT_ROUTER_STATE_DIR: join(scratch, "export-waiver"),
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
    const out = await router(["export"], {
      AGENT_ROUTER_STATE_DIR: state,
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
      price: { in: 0.1, out: 0.5, as_of: "2026-10-06" },
    });
    expect(rows.find((row) => row.run_id === "legacy-run")).toMatchObject({
      grade: null,
      family: "luna",
      tokens: { input: 12, cached_input: 3, output: 4, reasoning: 1 },
      cost_usd: null,
    });

    const waiverState = join(scratch, "export-waiver");
    const waivedExport = await router(["export"], {
      AGENT_ROUTER_STATE_DIR: waiverState,
    });
    expect(waivedExport.out).toContain(`"run_id":"${bId}"`);
    expect(waivedExport.out).toContain('"waived":"insufficient evidence"');
  });

  test("--since filters on start time", async () => {
    const r = await router(["export", "--since", "2026-10-06T00:00:00Z"], {
      AGENT_ROUTER_STATE_DIR: join(scratch, "empty-export"),
    });
    expect(r.code).toBe(0);
    expect(r.out).toBe("");
  });
});

describe("agent-router grade", () => {
  // Each test gets its own state dir and one real (fake-worker) run to grade.
  async function oneRun(
    name: string,
  ): Promise<{ state: string; runId: string }> {
    const state = join(scratch, `grade-${name}`);
    const b = brief(`grade-${name}`, "Remove every throw from x.ts.\n");
    const r = await router(
      ["run", "--prompt-file", b, "--cd", scratch, "--sandbox", "read-only"],
      { AGENT_ROUTER_STATE_DIR: state },
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
    const g = await router(["grade", runId, "--evidence", ev], {
      AGENT_ROUTER_STATE_DIR: state,
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
    const s = await router(["stats"], { AGENT_ROUTER_STATE_DIR: state });
    const Report = z.looseObject({
      per_choice: z.record(
        z.string(),
        z.looseObject({ graded: z.record(z.string(), z.number()) }),
      ),
    });
    expect(
      decodedJson(Report, s.out.trim()).per_choice["luna-max"]?.graded,
    ).toEqual({ pass: 1, partial: 0, fail: 0 });
  });

  test("the grade history reaches Jev with each row when it next routes", async () => {
    const { state, runId } = await oneRun("history");
    await router(
      ["grade", runId, "--evidence", evidenceFile("history", "GRADE=fail\n")],
      {
        AGENT_ROUTER_STATE_DIR: state,
      },
    );
    await router(["pick", "--prompt-file", brief("next", "next task\n")], {
      AGENT_ROUTER_STATE_DIR: state,
    });
    expect(bodies.at(-1)).toContain(
      "graded runs here: 0 pass, 0 partial, 1 fail",
    );
  });

  test("a low-confidence grade is Jev's grade, its confidence recorded", async () => {
    const { state, runId } = await oneRun("low");
    const g = await router(
      [
        "grade",
        runId,
        "--evidence",
        evidenceFile("low", "LOWCONF GRADE=pass\n"),
      ],
      {
        AGENT_ROUTER_STATE_DIR: state,
      },
    );
    expect(g.code).toBe(0);
    expect(g.err).toContain(`${runId} graded pass (confidence 0.20)`);
  });

  test("refused, nothing recorded: unknown run, missing evidence, Jev unavailable", async () => {
    const { state, runId } = await oneRun("refused");
    const ev = evidenceFile("refused", "GRADE=pass\n");
    const cases: [string[], Record<string, string>, string][] = [
      [["grade", "no-such-run", "--evidence", ev], {}, "no run no-such-run"],
      [
        ["grade", runId, "--evidence", join(scratch, "missing.txt")],
        {},
        "no such evidence file",
      ],
      [["grade", runId], {}, "grade needs --evidence"],
      [
        ["grade", runId, "--evidence", ev],
        { TYPESAFE_API_KEY: "", PATH: "/usr/bin:/bin", HOME: scratch },
        "not graded: jev unavailable",
      ],
    ];
    for (const [args, env, why] of cases) {
      const r = await router(args, { AGENT_ROUTER_STATE_DIR: state, ...env });
      expect([why, r.code]).toEqual([why, 2]);
      expect(r.err).toContain(why);
    }
    expect(readFileSync(join(state, "runs.jsonl"), "utf8")).not.toContain(
      '"kind":"grade"',
    );
  });
});

// O3 (Tiger ledger, 2026-10-06): a finished run is owed a grade before more work is dispatched from
// the same cwd. On Vast 38 runs were logged and none graded, so Jev's "graded record" criterion was
// empty and the same mis-pick (luna on long edit-and-test loops, killed at its bound) repeated. The
// gate is at dispatch, before Jev is asked: nothing is spent on a run that will be refused.
describe("O3: no dispatch over ungraded work", () => {
  const evidence = (text: string): string => {
    const p = join(mkdtempSync(join(scratch, "ev-")), "evidence.txt");
    writeFileSync(p, text);
    return p;
  };
  const RunId = z.looseObject({ run_id: z.string() });
  async function first(state: string, cwd: string): Promise<string> {
    const r = await router(
      [
        "run",
        "--prompt-file",
        brief("o3", "Fix x.ts.\n"),
        "--cd",
        cwd,
        "--sandbox",
        "read-only",
      ],
      { AGENT_ROUTER_STATE_DIR: state },
    );
    expect(r.code).toBe(0);
    return decodedJson(RunId, r.out.trim()).run_id;
  }
  const again = (state: string, cwd: string) =>
    router(
      [
        "run",
        "--prompt-file",
        brief("o3b", "Fix y.ts.\n"),
        "--cd",
        cwd,
        "--sandbox",
        "read-only",
      ],
      { AGENT_ROUTER_STATE_DIR: state },
    );

  test("an ungraded run in the same cwd refuses the next dispatch before Jev or a worker is reached", async () => {
    const state = join(scratch, "o3-refuse");
    const cwd = mkdtempSync(join(scratch, "o3-cwd-"));
    const runId = await first(state, cwd);
    const asked = bodies.length;
    const workers = readFileSync(join(scratch, "argv.log"), "utf8").split(
      "\n",
    ).length;
    const r = await again(state, cwd);
    expect(r.code).toBe(2);
    expect(r.err).toContain("not graded");
    expect(r.err).toContain(runId);
    expect(r.err).toContain(`agent-router grade ${runId} --evidence`);
    expect(r.err).toContain("--waive");
    expect(bodies.length).toBe(asked); // Jev was not asked
    expect(
      readFileSync(join(scratch, "argv.log"), "utf8").split("\n").length,
    ).toBe(workers);
  });

  test("graded, the next dispatch goes ahead", async () => {
    const state = join(scratch, "o3-graded");
    const cwd = mkdtempSync(join(scratch, "o3-cwd-"));
    const runId = await first(state, cwd);
    const g = await router(
      ["grade", runId, "--evidence", evidence("GRADE=pass\n")],
      {
        AGENT_ROUTER_STATE_DIR: state,
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
        "grade",
        runId,
        "--waive",
        "codex failed before its first turn; no work to judge",
      ],
      { AGENT_ROUTER_STATE_DIR: state },
    );
    expect(w.code).toBe(0);
    const log = readFileSync(join(state, "runs.jsonl"), "utf8");
    expect(log).toContain('"kind":"grade-waived"');
    expect(log).toContain("no work to judge");
    expect((await again(state, cwd)).code).toBe(0);
    const stats = await router(["stats"], { AGENT_ROUTER_STATE_DIR: state });
    expect(stats.out).toContain('"graded":{"pass":0,"partial":0,"fail":0}');
  });

  test("refused: --waive with an empty reason, and --waive together with --evidence", async () => {
    const state = join(scratch, "o3-badwaive");
    const runId = await first(state, mkdtempSync(join(scratch, "o3-cwd-")));
    for (const args of [
      ["grade", runId, "--waive", ""],
      ["grade", runId, "--waive", "x", "--evidence", evidence("GRADE=pass\n")],
    ]) {
      const r = await router(args, { AGENT_ROUTER_STATE_DIR: state });
      expect([args.join(" "), r.code]).toEqual([args.join(" "), 2]);
    }
    expect(readFileSync(join(state, "runs.jsonl"), "utf8")).not.toContain(
      "grade-waived",
    );
  });

  test("an ungraded run in another cwd does not block this one", async () => {
    const state = join(scratch, "o3-othercwd");
    await first(state, mkdtempSync(join(scratch, "o3-cwd-")));
    expect(
      (await again(state, mkdtempSync(join(scratch, "o3-cwd-")))).code,
    ).toBe(0);
  });

  test("stats reports how many finished runs are still owed a grade", async () => {
    const state = join(scratch, "o3-stats");
    await first(state, mkdtempSync(join(scratch, "o3-cwd-")));
    const r = await router(["stats"], { AGENT_ROUTER_STATE_DIR: state });
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
      ["run", "--prompt-file", pick, "--cd", scratch, "--sandbox", "read-only"],
      {
        AGENT_ROUTER_RUN_CLAUDE: FAKE_CLAUDE,
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
// Found when agent-router came under the Bun floor (lint:bun) with the worker move, 2026-10-06.
test("an unexpected positional argument is refused, never ignored", async () => {
  for (const args of [
    ["stats", "extra"],
    ["ls", "extra"],
    ["grade", "some-run", "extra", "--waive", "why"],
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
      ["run", "--prompt-file", pick, "--cd", scratch, "--sandbox", "read-only"],
      { AGENT_ROUTER_STATE_DIR: state, AGENT_ROUTER_RUN_CLAUDE: FAKE_CLAUDE },
    );
    expect(r.code).toBe(0);
    expect(decodedJson(Worker, r.out.trim()).worker.session).toBe(
      "sess-claude-0001",
    );
    const g = await router(["grade", "sess-claude", "--waive", "fixture"], {
      AGENT_ROUTER_STATE_DIR: state,
    });
    expect(g.code).toBe(0);
    expect(g.err).toContain(decodedJson(Worker, r.out.trim()).run_id);
  });

  test("a prefix two runs share is refused, naming both", async () => {
    const state = join(scratch, "ids-ambiguous");
    const ids: string[] = [];
    for (const cwd of [
      mkdtempSync(join(scratch, "ids-a-")),
      mkdtempSync(join(scratch, "ids-b-")),
    ]) {
      const r = await router(
        ["run", "--prompt-file", pick, "--cd", cwd, "--sandbox", "read-only"],
        { AGENT_ROUTER_STATE_DIR: state, AGENT_ROUTER_RUN_CLAUDE: FAKE_CLAUDE },
      );
      ids.push(decodedJson(Worker, r.out.trim()).run_id);
    }
    const g = await router(["grade", "sess-claude", "--waive", "fixture"], {
      AGENT_ROUTER_STATE_DIR: state,
    });
    expect(g.code).toBe(2);
    expect(g.err).toContain("matches 2 runs");
    for (const id of ids) expect(g.err).toContain(id);
  });
});

// ask: a typed question to Jev. The request is validated before anything is sent; the answer is
// returned as Jev gave it (probabilities, no threshold).
describe("agent-router ask", () => {
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
    const r = await router(["ask", "--request", requestFile("ok", valid)]);
    expect(r.code).toBe(0);
    expect(decodedJson(AskOut, r.out.trim()).answers.q1?.choice).toBe("yes");
    const line = readFileSync(join(r.state, "runs.jsonl"), "utf8").trim();
    const logged = decodedJson(AskLine, line);
    expect(logged.kind).toBe("ask");
    expect(logged.questions).toEqual(["q1"]);
    expect(logged.status).toBe(200);
  });

  test("the request is read from stdin with '-'", async () => {
    const r = Bun.spawn([process.execPath, CLI, "ask", "--request", "-"], {
      env: {
        ...process.env,
        AGENT_ROUTER_STATE_DIR: join(scratch, "state-stdin"),
        DISPATCH_ROSTER_PATH: LIVE_JEV,
        TYPESAFE_API_KEY: "fixture-key",
      },
      stdin: new Blob([JSON.stringify(valid)]),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    });
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
        `[auto.jev]\napi = "typesafe"\nmodel = "m-from-roster"\nurl = "${server.url.href}"\n`,
      ),
    );
    const before = bodies.length;
    const r = await router(["ask", "--request", requestFile("model", valid)], {
      DISPATCH_ROSTER_PATH: typesafe,
    });
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
      const r = await router(["ask", "--request", requestFile("bad", value)]);
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
      const r = await router(["ask", "--request", path]);
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
        `[auto.jev]\napi = "reseller"\nurl = "http://127.0.0.1:1/"\n`,
      ),
    );
    const r = await router(["ask", "--request", requestFile("dead", valid)], {
      DISPATCH_ROSTER_PATH: dead,
    });
    expect(r.code).toBe(4);
    expect(r.err.trim()).not.toBe("");
  });

  test("no key: a non-zero exit naming where it looked, nothing sent", async () => {
    const before = bodies.length;
    const home = mkdtempSync(join(scratch, "nokey-home-"));
    const r = await router(["ask", "--request", requestFile("nokey", valid)], {
      TYPESAFE_API_KEY: "",
      HOME: home,
    });
    expect(r.code).not.toBe(0);
    expect(r.err).toContain("TYPESAFE_API_KEY");
    expect(r.err).toContain(".config/typesafe/.env");
    expect(bodies.length).toBe(before);
  });
});

// --- the typed work ticket: verify run by the router, automatic grade, a gate per write scope --------

const ticketText = (fields: string, prose = "Do the thing.\n"): string =>
  `+++\nschema = 1\n${fields}\n+++\n${prose}`;
const freshCwd = (): string => mkdtempSync(join(scratch, "cwd-"));
const runArgs = (
  promptFile: string,
  cwd: string,
  sandbox = "workspace-write",
): string[] => [
  "run",
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

describe("agent-router run: a brief with a ticket", () => {
  test("the worker gets the prose without the front matter, plus the verify line", async () => {
    const cwd = freshCwd();
    const b = brief(
      "t-prose",
      ticketText('writes = ["x/**"]\nverify = ["true"]', "PROSE-MARK do it\n"),
    );
    const r = await router(runArgs(b, cwd));
    expect(r.code).toBe(0);
    const seen = readFileSync(join(scratch, "prompt.log"), "utf8");
    const mine = seen.slice(seen.lastIndexOf("<<<"));
    expect(mine).toContain("PROSE-MARK do it");
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

  test("no front matter: legacy mode — no verify, no automatic grade, today's receipt", async () => {
    const r = await router(
      runArgs(brief("t-legacy", "plain brief\n"), freshCwd()),
    );
    expect(r.code).toBe(0);
    expect(r.out).not.toContain('"verify"');
    expect(logLines(r.state).map((l) => l.kind)).toEqual(["run"]);
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
    expect(pick).toContain("CAPS-MARK");
    expect(pick).not.toContain("schema = 1");
  });

  test("verify runs after the worker, in --cd, outputs recorded; auto-grade by the router", async () => {
    const cwd = freshCwd();
    const b = brief(
      "t-verify",
      ticketText(
        'writes = ["w/**"]\nverify = ["cat marker.txt && echo GRADE=pass", "pwd"]',
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
    const b = brief(
      "t-regrade",
      ticketText('writes = ["r/**"]\nverify = ["true"]'),
    );
    const first = await router(runArgs(b, cwd), {
      AGENT_ROUTER_STATE_DIR: state,
    });
    const id = decodedJson(RunIdSchema, first.out.trim()).run_id;
    const evidence = join(scratch, "regrade-evidence.txt");
    writeFileSync(evidence, "GRADE=fail\n");
    const g = await router(["grade", id, "--evidence", evidence], {
      AGENT_ROUTER_STATE_DIR: state,
    });
    expect(g.code).toBe(0);
    const grades = logLines(state).filter((l) => l.kind === "grade");
    expect(grades.map((l) => l.grade)).toEqual(["partial", "fail"]);
  });
});

describe("agent-router run: the gate per write scope", () => {
  let seq = 0;
  /** An ungraded finished run in `cwd`; `writes` undefined = a legacy run (no ticket). */
  function seed(
    state: string,
    cwd: string,
    writes: string[] | undefined,
  ): string {
    const runId = `seeded-${seq++}`;
    mkdirSync(state, { recursive: true });
    appendFileSync(
      join(state, "runs.jsonl"),
      `${JSON.stringify({
        schema: 1,
        kind: "run",
        run_id: runId,
        cwd,
        pick: { source: "jev", choice: "luna-high" },
        exit: 0,
        worker: { outcome: "ok" },
        ...(writes === undefined ? {} : { ticket: { schema: 1, writes } }),
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

  test("overlapping writes in the same cwd: blocked, naming the run and both globs", async () => {
    const cwd = freshCwd();
    const state = gate("overlap");
    const id = seed(state, cwd, ["agents/routing-control/**"]);
    const r = await router(
      ticketRun(cwd, '["agents/routing-control/tests/**"]'),
      {
        AGENT_ROUTER_STATE_DIR: state,
      },
    );
    expect(r.code).toBe(2);
    expect(r.err).toContain(id);
    expect(r.err).toContain("agents/routing-control/**");
    expect(r.err).toContain("agents/routing-control/tests/**");
  });

  test("disjoint writes in the same cwd: allowed", async () => {
    const cwd = freshCwd();
    const state = gate("disjoint");
    seed(state, cwd, ["agents/routing-control/**"]);
    const r = await router(ticketRun(cwd, '["agents/models/roster.ts"]'), {
      AGENT_ROUTER_STATE_DIR: state,
    });
    expect(r.code).toBe(0);
  });

  test("overlapping writes in another cwd: allowed (the gate is per cwd)", async () => {
    const state = gate("othercwd");
    seed(state, freshCwd(), ["a/**"]);
    const r = await router(ticketRun(freshCwd(), '["a/**"]'), {
      AGENT_ROUTER_STATE_DIR: state,
    });
    expect(r.code).toBe(0);
  });

  test("a read-only ticket is never blocked, and never blocks", async () => {
    const cwd = freshCwd();
    const state = gate("readonly");
    seed(state, cwd, ["a/**"]);
    const ro = await router(ticketRun(cwd, "[]", "read-only"), {
      AGENT_ROUTER_STATE_DIR: state,
    });
    expect(ro.code).toBe(0);
    const state2 = gate("readonly2");
    seed(state2, cwd, []);
    const rw = await router(ticketRun(cwd, '["a/**"]'), {
      AGENT_ROUTER_STATE_DIR: state2,
    });
    expect(rw.code).toBe(0);
    const legacy = await router(runArgs(brief(`g-${seq++}`, "legacy\n"), cwd), {
      AGENT_ROUTER_STATE_DIR: state2,
    });
    expect(legacy.code).toBe(0);
  });

  test("legacy mode unchanged: an ungraded legacy run blocks a legacy run and a writing ticket run in its cwd", async () => {
    const cwd = freshCwd();
    const state = gate("legacy");
    const id = seed(state, cwd, undefined);
    const legacy = await router(runArgs(brief(`g-${seq++}`, "legacy\n"), cwd), {
      AGENT_ROUTER_STATE_DIR: state,
    });
    expect(legacy.code).toBe(2);
    expect(legacy.err).toContain(id);
    const ticket = await router(ticketRun(cwd, '["z/**"]'), {
      AGENT_ROUTER_STATE_DIR: state,
    });
    expect(ticket.code).toBe(2);
    expect(ticket.err).toContain(id);
  });

  test("an ungraded writing ticket run blocks a legacy run in its cwd", async () => {
    const cwd = freshCwd();
    const state = gate("ticket-blocks-legacy");
    const id = seed(state, cwd, ["z/**"]);
    const legacy = await router(runArgs(brief(`g-${seq++}`, "legacy\n"), cwd), {
      AGENT_ROUTER_STATE_DIR: state,
    });
    expect(legacy.code).toBe(2);
    expect(legacy.err).toContain(id);
  });
});

// --- every brief's text is kept, content-addressed, under the state dir ------------------------------

const sha = (s: string): string =>
  new Bun.CryptoHasher("sha256").update(s).digest("hex");

describe("agent-router: the stored brief", () => {
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
    const text = ticketText(
      'writes = []\nverify = ["true"]',
      "STORE-MARK keep me\n",
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
    const text = "legacy STORE-LEGACY text\n";
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
      AGENT_ROUTER_STATE_DIR: state,
    });
    const file = join(state, "briefs", `${sha("STORE-ONCE twice\n")}.md`);
    const first = statSync(file).mtimeMs;
    await Bun.sleep(30);
    const second = await router(runArgs(b, freshCwd(), "read-only"), {
      AGENT_ROUTER_STATE_DIR: state,
    });
    expect(second.code).toBe(0);
    expect(readdirSync(join(state, "briefs"))).toEqual([basename(file)]);
    expect(statSync(file).mtimeMs).toBe(first);
    expect(logLines(state).filter((l) => l.kind === "run")).toHaveLength(2);
  });

  test("result --brief prints the stored brief, and still does once the original file is gone", async () => {
    const text = ticketText("writes = []\nverify = []", "STORE-PRINT body\n");
    const path = brief("s-print", text);
    const run = await router(runArgs(path, freshCwd(), "read-only"));
    const id = decodedJson(RunIdSchema, run.out.trim()).run_id;
    rmSync(path);
    const r = await router(["result", id, "--brief"], {
      AGENT_ROUTER_STATE_DIR: run.state,
    });
    expect(r.code).toBe(0);
    expect(r.out).toBe(text);
  });

  test("result --brief with no stored copy and no original file says so, exit 1", async () => {
    const path = brief("s-gone", "STORE-GONE\n");
    const run = await router(runArgs(path, freshCwd(), "read-only"));
    const id = decodedJson(RunIdSchema, run.out.trim()).run_id;
    rmSync(path);
    rmSync(join(run.state, "briefs", `${sha("STORE-GONE\n")}.md`));
    const r = await router(["result", id, "--brief"], {
      AGENT_ROUTER_STATE_DIR: run.state,
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

describe("agent-router resume", () => {
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
    expect(r.err).toContain(`agent-router resume ${id}`);
    expect(
      decodedJson(z.looseObject({ resume_with: z.string() }), r.out.trim())
        .resume_with,
    ).toBe(`agent-router resume ${id}`);
    expect(runsOf(r.state)[0]?.resume_with).toBe(`agent-router resume ${id}`);
    const failed = await stoppedRun("rs-hint-failed", { FAKE_EXIT: "1" });
    expect(failed.err).toContain("agent-router resume ");
    const none = await stoppedRun("rs-hint-none", {
      FAKE_TIMEOUT: "1",
      FAKE_NO_SESSION: "1",
    });
    expect(none.err).not.toContain("agent-router resume ");
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
    const r = await router(["resume", id], {
      AGENT_ROUTER_STATE_DIR: stopped.state,
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
    await router(["resume", firstId(other.state), "--prompt-file", msg], {
      AGENT_ROUTER_STATE_DIR: other.state,
    });
    expect(promptTail()).toContain("ONLY-THE-TAIL: check the lint");
    expect(promptTail()).not.toContain("You were stopped");
  });

  test("a session-id prefix names the run", async () => {
    const stopped = await stoppedRun("rs-prefix", { FAKE_EXIT: "1" });
    const r = await router(["resume", "thread-fake"], {
      AGENT_ROUTER_STATE_DIR: stopped.state,
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
    const r = await router(["resume", id], {
      AGENT_ROUTER_STATE_DIR: stopped.state,
    });
    expect(r.code).toBe(2);
    expect(r.err).toContain("no session id");
    expect(r.err).toContain(id);
    expect(argvLines("argv.log")).toHaveLength(argvBefore);
    const unknown = await router(["resume", "no-such-run"]);
    expect(unknown.code).toBe(2);
    expect(unknown.err).toContain("no run no-such-run");
  });

  test("claude: --resume <session> on the same row, model, effort and mode; sessions are persisted", async () => {
    const cwd = freshCwd();
    const claude = { AGENT_ROUTER_RUN_CLAUDE: FAKE_CLAUDE };
    const stopped = await router(
      runArgs(brief("rs-claude", "PICK=sonnet-medium do it\n"), cwd),
      { FAKE_CLAUDE_MODE: "timeout", ...claude },
    );
    expect(stopped.code).toBe(124);
    const id = firstId(stopped.state);
    expect(stopped.err).toContain(`agent-router resume ${id}`);
    const firstArgv = lastArgv("claude-argv.log");
    expect(firstArgv).toContain("--persist-session"); // router-dispatched sessions stay on disk
    expect(firstArgv).not.toContain("--resume");
    const r = await router(["resume", id], {
      AGENT_ROUTER_STATE_DIR: stopped.state,
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
      pick: { source: "resume", choice: "sonnet-medium" },
    });
  });

  test("the ticket applies again: verify and the router's grade run after the resumed worker", async () => {
    const b = brief(
      "rs-ticket",
      ticketText(
        'writes = ["rw/**"]\nverify = ["echo RESUMEVERIFY && echo GRADE=pass"]',
        "PICK=luna-high do it\n",
      ),
    );
    const stopped = await router(runArgs(b, freshCwd()), { FAKE_EXIT: "1" });
    const r = await router(["resume", firstId(stopped.state)], {
      AGENT_ROUTER_STATE_DIR: stopped.state,
    });
    expect(r.code).toBe(0);
    const receipt = decodedJson(TicketReceipt, r.out.trim());
    expect(receipt.verify_summary).toBe("1/1 passed");
    expect(receipt.verify[0]?.output_tail).toContain("RESUMEVERIFY");
    expect(receipt.grade).toMatchObject({ grade: "pass", graded_by: "router" });
    expect(runsOf(stopped.state)[1]?.ticket?.writes).toEqual(["rw/**"]); // the gate sees it
    expect(
      records(stopped.state).filter((x) => x.kind === "grade"),
    ).toHaveLength(2);
    expect(promptTail()).toContain("`echo RESUMEVERIFY");
  });
});

describe("agent-router: a stopped router stops its verify too", () => {
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
    expect(run?.worker?.outcome).toBe("stopped");
    expect(run?.worker?.cause).toContain("SIGTERM");
    expect(lines.some((l) => l.kind === "grade-waived")).toBe(true);
    expect(readdirSync(join(r.state, "active"))).toEqual([]);
  }, 40_000);
});
