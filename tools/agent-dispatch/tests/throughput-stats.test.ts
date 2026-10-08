import { describe, expect, test } from "bun:test";
import { replayStats, throughputStats } from "../src/throughput-stats.ts";

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
      overhead_s: 6.5,
      overhead_cost_usd: 0.06,
      exceeds_saves: true,
    });
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
