import { afterAll, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "../../hooks/zod.ts";
import { ROSTER_PATH } from "../../models/roster.ts";
import { decodedJson } from "../../hooks/tests/decode.ts";

// agent-router: the one entry point. A fake codex-run stands in for the worker (it records its argv and
// prints a receipt), a local server stands in for Jev, and every state file goes to a scratch dir.

const CLI = join(import.meta.dir, "..", "agent-router.ts");
const scratch = mkdtempSync(join(tmpdir(), "agent-router-test-"));
// Every request body the fake Jev received, in order (what left the machine).
const bodies: string[] = [];
const server = Bun.serve({
  port: 0,
  fetch: async (req) => {
    const body = await req.text();
    bodies.push(body);
    const confidence = body.includes("LOWCONF") ? 0.2 : 0.9;
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
const exit = Number(process.env.FAKE_EXIT ?? "0");
console.log(JSON.stringify({ schema: 1, outcome: exit === 0 ? "ok" : "codex-failed", elapsed_s: 1.5, usage: { input_tokens: 100, output_tokens: 7 } }));
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
if (mode === "garbage") {
  console.log("not a relay");
  process.exit(1);
}
const at = Bun.argv.indexOf("--progress-file");
if (at !== -1)
  writeFileSync(Bun.argv[at + 1] ?? "", JSON.stringify({ schema: 1, at: "2026-10-06T00:00:00Z", last: "✎ kernel.ts", commands: 2, files: 1 }));
console.log(JSON.stringify({ exit_code: 0, timed_out: false, result: "done", total_cost_usd: 0.01 }));
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
async function router(args: string[], env: Record<string, string> = {}) {
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
    expect(readdirSync(join(r.state, "active"))).toEqual([]);
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
      const argv = readFileSync(join(scratch, "claude-argv.log"), "utf8")
        .trim()
        .split("\n")
        .at(-1);
      for (const word of [
        '"--model","sonnet"',
        '"--effort","high"',
        `"--permission-mode","${mode}"`,
        '"--max-budget-usd","2"',
        '"--max-turns","60"',
      ])
        expect(`${sandbox}: ${argv ?? ""}`).toContain(word);
    }
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
