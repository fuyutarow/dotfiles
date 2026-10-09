import { describe, expect, test } from "bun:test";
import {
  lineageMasks,
  maskCandidates,
  replayStats,
  throughputStats,
} from "../src/throughput-stats.ts";

const now = Temporal.Instant.from("2026-10-08T00:00:00Z").epochMilliseconds;
const started = "2026-10-07T23:00:00Z";
const run = (values: Record<string, unknown>): string =>
  JSON.stringify({
    kind: "run",
    run_id: "r",
    host: "host-a",
    dispatcher_session: "session-a",
    started_at: started,
    ended_at: "2026-10-07T23:01:00Z",
    pick: { source: "jev", choice: "row-a", confidence: 0.4 },
    ticket: { schema: 1, capabilities: [] },
    ticket_grade: { verdict: "pass" },
    stats: {
      row: "row-a",
      effort: "medium",
      outcome: "ok",
      elapsed_s: 60,
      cost_usd: 0.1,
      tokens: { input: 100, cached_input: 20, output: 10, reasoning: 5 },
    },
    ...values,
  });

describe("throughputStats", () => {
  test("reuses the cached result for the same bounded log snapshot", () => {
    const options = { now: 1_000, sinceMs: 0, grading: false };
    const first = throughputStats("", options);
    expect(throughputStats("", options)).toBe(first);
  });
  test("masks after two lineage failures, but leaves a row after one", () => {
    const nowMs = Temporal.Now.instant().epochMilliseconds;
    const startedAt = Temporal.Instant.fromEpochMilliseconds(
      nowMs - 1_000,
    ).toString();
    const entries = ["a", "b"].flatMap((id) => [
      {
        kind: "run",
        run_id: id,
        started_at: startedAt,
        ticket: { schema: 2, name: "named" },
        pick: { choice: "luna-high" },
        stats: { row: "luna-high", outcome: "timeout" },
      },
      { kind: "grade", run_id: id, grade: "fail" },
    ]);
    const log = entries.map((entry) => JSON.stringify(entry)).join("\n");
    expect(lineageMasks(log, { name: "named", now: nowMs })).toMatchObject({
      "luna-high": { failures: 2 },
    });
    expect(
      lineageMasks(log.split("\n").slice(0, 1).join("\n"), {
        name: "named",
        now: nowMs,
      }),
    ).toEqual({});
  });
  test("all masked candidates retain the overall-record argmax", () => {
    const result = maskCandidates(
      ["slow", "fast"],
      {
        slow: { failures: 2, reason: "two" },
        fast: { failures: 2, reason: "two" },
      },
      {
        slow: { accepted_returns_per_worker_hour: 1 },
        fast: { accepted_returns_per_worker_hour: 3 },
      },
    );
    expect(result).toEqual({
      masked: { slow: { failures: 2, reason: "two" } },
      fallback: "fast",
    });
  });
  test("keeps per-capability row records separate from the overall record", () => {
    const startedAt = Temporal.Now.instant().toString();
    const log = [
      {
        kind: "run",
        run_id: "ts",
        started_at: startedAt,
        ticket: { schema: 2, capabilities: ["typescript"] },
        stats: {
          row: "luna-high",
          outcome: "returned",
          elapsed_s: 10,
          cost_usd: 1,
        },
      },
      { kind: "grade", run_id: "ts", grade: "pass" },
      {
        kind: "run",
        run_id: "gpu",
        started_at: startedAt,
        ticket: { schema: 2, capabilities: ["gpu-kernels"] },
        stats: {
          row: "luna-high",
          outcome: "timeout",
          elapsed_s: 100,
          cost_usd: 1,
        },
      },
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    const result = throughputStats(log, {
      now: Temporal.Now.instant().epochMilliseconds,
      sinceMs: 0,
      grading: false,
    });
    expect(result.per_row["luna-high"]?.runs).toBe(2);
    expect(result.per_tag["gpu-kernels"]?.["luna-high"]?.runs).toBe(1);
    expect(result.per_tag["gpu-kernels"]?.["luna-high"]?.timeout_rate).toBe(1);
    expect(result.per_tag["typescript"]?.["luna-high"]?.accepted_rate).toBe(1);
  });
  test("non_delivery is rejected even with a passing grade and counts as a row failure", () => {
    const nowMs = Temporal.Now.instant().epochMilliseconds;
    const startedAt = Temporal.Instant.fromEpochMilliseconds(
      nowMs - 1_000,
    ).toString();
    const log = ["non-delivery-a", "non-delivery-b"]
      .flatMap((run_id) => [
        {
          kind: "run",
          run_id,
          started_at: startedAt,
          ticket: {
            schema: 2,
            name: "named",
            capabilities: ["typescript"],
          },
          pick: { choice: "luna-high" },
          stats: {
            row: "luna-high",
            outcome: "non_delivery",
            elapsed_s: 10,
          },
        },
        { kind: "grade", run_id, grade: "pass" },
      ])
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    const report = throughputStats(log, {
      now: nowMs,
      sinceMs: 0,
      grading: false,
    });
    expect(report.per_row["luna-high"]).toMatchObject({
      runs: 2,
      accepted: 0,
      accepted_rate: 0,
    });
    expect(report.per_tag.typescript?.["luna-high"]).toMatchObject({
      runs: 2,
      accepted: 0,
      accepted_rate: 0,
    });
    expect(lineageMasks(log, { name: "named", now: nowMs })).toMatchObject({
      "luna-high": { failures: 2 },
    });
  });
  test("builds ticket-size cohorts from exact capability tags and caches them", () => {
    const startedAt = Temporal.Now.instant().toString();
    const entries = [
      {
        kind: "run",
        run_id: "comparable-pass",
        started_at: startedAt,
        ticket: {
          schema: 2,
          capabilities: ["gpu-kernels", "julia"],
          writes: ["src/**"],
        },
        brief: { chars: 400 },
        stats: {
          row: "row-a",
          outcome: "returned",
          elapsed_s: 20,
          cost_usd: 0.5,
        },
      },
      { kind: "grade", run_id: "comparable-pass", grade: "pass" },
      {
        kind: "run",
        run_id: "different-size",
        started_at: startedAt,
        ticket: {
          schema: 2,
          capabilities: ["gpu-kernels", "julia"],
          writes: ["src/**", "tests/**", "docs/**", "extra/**"],
        },
        brief: { chars: 400 },
        stats: { row: "row-a", outcome: "timeout", elapsed_s: 200 },
      },
    ].map((entry) => JSON.stringify(entry));
    const log = entries.join("\n");
    const options = {
      now: Temporal.Now.instant().epochMilliseconds,
      sinceMs: 0,
      grading: false,
    };
    const first = throughputStats(log, options);
    const key = JSON.stringify({
      capabilities: ["gpu-kernels", "julia"],
      writes: "1-3",
      brief: "0-500",
    });
    expect(first.per_row["row-a"]?.runs).toBe(2);
    expect(first.per_comparable_ticket[key]?.["row-a"]).toMatchObject({
      runs: 1,
      accepted_rate: 1,
      median_time_to_first_return_s: 20,
    });
    expect(throughputStats(log, options)).toBe(first);
  });
  test("uses observational first-return timing while retaining the legacy checkpoint shape", () => {
    const result = throughputStats(
      run({
        checkpoint: {
          mode: "observe",
          first_return_by_deadline: true,
          first_return_at_s: 12,
        },
      }),
      { now, sinceMs: now - 86_400_000, grading: false },
    );
    expect(result.per_row["row-a"]?.median_time_to_first_return_s).toBe(12);
  });

  test("accepts graded and consumed returns and counts only unconsumed, unaccepted tokens as wasted", () => {
    const log = [
      run({}),
      run({
        run_id: "returned",
        stats: {
          row: "row-a",
          effort: "medium",
          outcome: "returned",
          elapsed_s: 100,
          cost_usd: 0.2,
          tokens: { input: 5, cached_input: 2, output: 3, reasoning: 1 },
        },
        checkpoint: { supported: true, fired_at_s: 8, return_followed: true },
      }),
      run({
        run_id: "waste",
        stats: {
          row: "row-b",
          effort: "low",
          outcome: "timeout",
          elapsed_s: 200,
          cost_usd: 0.3,
          tokens: { input: 7, cached_input: 2, output: 3, reasoning: 1 },
        },
      }),
      JSON.stringify({ kind: "grade", run_id: "r", grade: "pass" }),
      JSON.stringify({ kind: "ack", run_id: "returned", consumed: true }),
    ].join("\n");
    const result = throughputStats(log, {
      now,
      sinceMs: now - 86_400_000,
      grading: false,
    });
    expect(result.per_row["row-a"]).toMatchObject({
      runs: 2,
      accepted: 2,
      median_time_to_first_return_s: 34,
    });
    expect(result.per_row["row-b"]?.wasted_tokens).toBe(11);
  });

  test("measures grading overhead and estimates savings from comparable unrefused runs", () => {
    const accepted = run({
      run_id: "accepted",
      ticket_grade: { verdict: "pass" },
    });
    const timeout = run({
      run_id: "timeout",
      stats: {
        row: "row-a",
        effort: "medium",
        outcome: "timeout",
        elapsed_s: 10,
        cost_usd: 0.1,
        tokens: { input: 20, cached_input: 0, output: 0, reasoning: 0 },
      },
    });
    const refusal = JSON.stringify({
      kind: "refusal",
      at: started,
      effort: "medium",
      pick: { choice: "row-a", confidence: 0.4, jev: { latency_ms: 500 } },
      ticket: { schema: 1, capabilities: [] },
      ticket_grade: {
        verdict: "clarify",
        grader: { elapsed_s: 2, usage: { cost_usd: 0.06 } },
      },
      verify: [{ elapsed_s: 4 }],
    });
    const result = throughputStats(
      [
        accepted,
        timeout,
        refusal,
        JSON.stringify({ kind: "grade", run_id: "accepted", grade: "pass" }),
      ].join("\n"),
      { now, sinceMs: now - 86_400_000, grading: true },
    );
    expect(result.grading).toMatchObject({
      refusals: 1,
      estimated_saves: 0.5,
      estimated_saved_worker_s: 5,
      estimated_saved_cost_usd: 0.05,
      overhead_s: 2.5,
      jev_pick_s: 0.5,
      grader_s: 2,
      grader_cost_usd: 0.06,
      refusal_rebrief_s: 0,
      verify_s: 4,
      overhead_cost_usd: 0.06,
      exceeds_saves: true,
    });
    expect(result.grading?.overhead_s).toBe(
      (result.grading?.jev_pick_s ?? 0) +
        (result.grading?.grader_s ?? 0) +
        (result.grading?.refusal_rebrief_s ?? 0),
    );
  });

  test("counts a matching no-grader override after a grader split refusal as a likely false split", () => {
    const hash = "same-brief-hash";
    const splitRefusal = JSON.stringify({
      kind: "refusal",
      at: "2026-10-07T23:00:30Z",
      brief: { sha256: hash },
      ticket_grade: { verdict: "split", grader: { status: "ok" } },
    });
    const override = run({
      run_id: "override",
      started_at: "2026-10-07T23:01:00Z",
      brief: { sha256: hash },
      ticket_grade: {
        verdict: "pass",
        grader: { status: "skipped", reason: "disabled by --no-grader" },
      },
    });
    const unrelatedOverride = run({
      run_id: "unrelated-override",
      started_at: "2026-10-07T23:02:00Z",
      brief: { sha256: "different-hash" },
      ticket_grade: {
        verdict: "pass",
        grader: { status: "skipped", reason: "disabled by --no-grader" },
      },
    });
    const result = throughputStats(
      [splitRefusal, override, unrelatedOverride].join("\n"),
      { now, sinceMs: now - 86_400_000, grading: true },
    );
    expect(result.grading).toMatchObject({
      splits: 1,
      likely_false_splits: 1,
      overridden_splits: { urgent: 0, no_grader: 1 },
    });
  });

  test("charges refusal-to-next-dispatch time and counts urgent overrides separately", () => {
    const refusal = JSON.stringify({
      kind: "refusal",
      at: "2026-10-07T23:00:00Z",
      dispatcher_session: "session-a",
      cwd: "/work",
      ticket_grade: { verdict: "split", grader: { status: "ok" } },
    });
    const urgent = run({
      run_id: "urgent",
      started_at: "2026-10-07T23:04:00Z",
      dispatcher_session: "session-a",
      cwd: "/work",
      ticket: {
        schema: 2,
        capabilities: [],
        urgent_reason: "Vast outage: mise is broken",
      },
      ticket_grade: {
        verdict: "split",
        grader: { status: "ok" },
      },
    });
    const result = throughputStats([refusal, urgent].join("\n"), {
      now,
      sinceMs: now - 86_400_000,
      grading: true,
    });
    expect(result.grading).toMatchObject({
      refusal_rebrief_s: 240,
      overhead_s: 240,
      overridden_splits: { urgent: 1, no_grader: 0 },
      urgent_override_reasons: ["Vast outage: mise is broken"],
    });
  });

  test("filters runs and grading components by the window and excludes verify from --check", () => {
    const recentRefusal = JSON.stringify({
      kind: "refusal",
      at: started,
      pick: { choice: "row-a", jev: { latency_ms: 1000 } },
      ticket_grade: { grader: { elapsed_s: 2, usage: { cost_usd: 0.1 } } },
      verify: [{ elapsed_s: 100 }],
    });
    const oldRun = run({
      run_id: "old",
      started_at: "2026-10-06T00:00:00Z",
      stats: { row: "old-row", elapsed_s: 10, outcome: "timeout" },
    });
    const result = throughputStats(
      [run({}), recentRefusal, oldRun].join("\n"),
      { now, sinceMs: now - 86_400_000, grading: true },
    );
    expect(result.window_ms).toBe(86_400_000);
    expect(result.per_row).not.toHaveProperty("old-row");
    expect(result.grading).toMatchObject({
      jev_pick_s: 1,
      grader_s: 2,
      refusal_rebrief_s: 0,
      verify_s: 100,
      overhead_s: 3,
      exceeds_saves: true,
    });
  });

  test("a large verify_s alone does not make grading exceed estimated saves", () => {
    const timeout = run({
      run_id: "timeout-for-check",
      stats: {
        row: "row-a",
        effort: "medium",
        outcome: "timeout",
        elapsed_s: 10,
        cost_usd: 0.1,
        tokens: { input: 1 },
      },
    });
    const refusal = JSON.stringify({
      kind: "refusal",
      at: started,
      effort: "medium",
      pick: { choice: "row-a", confidence: 0.4, jev: { latency_ms: 1000 } },
      ticket: { schema: 1, capabilities: [] },
      ticket_grade: {
        verdict: "clarify",
        grader: { elapsed_s: 1, usage: { cost_usd: 0.01 } },
      },
      verify: [{ elapsed_s: 1000 }],
    });
    const result = throughputStats([timeout, refusal].join("\n"), {
      now,
      sinceMs: now - 86_400_000,
      grading: true,
    });
    expect(result.grading).toMatchObject({
      overhead_s: 2,
      verify_s: 1000,
      estimated_saved_worker_s: 10,
      exceeds_saves: false,
    });
  });

  test("replays a two-row candidate using measured row acceptance rates", () => {
    const log = [
      run({
        run_id: "a1",
        stats: {
          row: "row-a",
          effort: "medium",
          outcome: "ok",
          elapsed_s: 100,
          cost_usd: 0.1,
          tokens: { input: 1 },
        },
      }),
      JSON.stringify({ kind: "grade", run_id: "a1", grade: "pass" }),
      run({
        run_id: "b1",
        pick: { source: "jev", choice: "row-b", confidence: 0.4 },
        stats: {
          row: "row-b",
          effort: "low",
          outcome: "ok",
          elapsed_s: 100,
          cost_usd: 0.1,
          tokens: { input: 1 },
        },
      }),
    ].join("\n");
    const result = replayStats(
      log,
      { rules: [{ when: { row: "row-b" }, row: "row-a" }] },
      { now, sinceMs: now - 86_400_000, grading: false },
    );
    expect(result).toMatchObject({
      runs: 2,
      matched_rules: 1,
      recorded_picks_accepted_returns_per_hour: 18,
      candidate_accepted_returns_per_hour: 36,
    });
    expect(result.assumption).toContain("row rates are independent of task");
  });
});
