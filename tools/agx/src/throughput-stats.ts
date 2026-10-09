import { jsonOf, z } from "../../shared/src/zod.ts";
import { fromThrowable } from "neverthrow";

const Line = z.looseObject({
  kind: z.string(),
  run_id: z.string().optional(),
  host: z.string().optional(),
  cwd: z.string().optional(),
  started_at: z.string().optional(),
  ended_at: z.string().optional(),
  dispatcher_session: z.string().optional(),
  ticket: z
    .looseObject({
      schema: z.number(),
      name: z.string().optional(),
      capabilities: z.array(z.string()).optional(),
      writes: z.array(z.string()).optional(),
      urgent_reason: z.string().optional(),
    })
    .optional(),
  pick: z
    .looseObject({
      choice: z.string(),
      confidence: z.number().optional(),
      jev: z.looseObject({ latency_ms: z.number().optional() }).optional(),
    })
    .optional(),
  brief: z
    .looseObject({
      sha256: z.string().optional(),
      chars: z.number().optional(),
    })
    .optional(),
  ticket_grade: z
    .looseObject({
      verdict: z.string().optional(),
      grader: z
        .looseObject({
          status: z.string().optional(),
          reason: z.string().optional(),
          elapsed_s: z.number().optional(),
          usage: z
            .looseObject({ cost_usd: z.number().nullable().optional() })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  effort: z.string().optional(),
  verify: z
    .array(z.looseObject({ elapsed_s: z.number().optional() }))
    .optional(),
  checkpoint: z
    .looseObject({
      first_return_by_deadline: z.boolean().optional(),
      first_return_at_s: z.number().nullable().optional(),
      fired_at_s: z.number().nullable().optional(),
      return_followed: z.boolean().optional(),
    })
    .optional(),
  return: z.unknown().optional(),
  stats: z
    .looseObject({
      row: z.string().optional(),
      effort: z.string().optional(),
      outcome: z.string().optional(),
      elapsed_s: z.number().optional(),
      cost_usd: z.number().nullable().optional(),
      tokens: z
        .looseObject({
          input: z.number().nullable().optional(),
          cached_input: z.number().nullable().optional(),
          output: z.number().nullable().optional(),
          reasoning: z.number().nullable().optional(),
        })
        .optional(),
    })
    .optional(),
  worker: z.looseObject({ elapsed_s: z.number().optional() }).optional(),
  grade: z.string().optional(),
  consumed: z.boolean().optional(),
  at: z.string().optional(),
  resumed_from: z.string().optional(),
});

type Entry = z.output<typeof Line>;
type Run = Entry & {
  run_id: string;
  started_ms: number;
  row: string;
  outcome: string;
  elapsed_s: number;
  tokens: number;
  first_return_s: number;
};

const epoch = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined;
  const parsed = fromThrowable(
    () => Temporal.Instant.from(value).epochMilliseconds,
    (error) => error,
  )();
  return parsed.isOk() ? parsed.value : undefined;
};
const confidenceBin = (
  confidence: number | undefined,
): "low" | "medium" | "high" => {
  if (confidence === undefined || confidence < 0.5) return "low";
  return confidence < 0.8 ? "medium" : "high";
};
const comparable = (run: Run, decision: Entry): boolean => {
  const runCapabilities = [...(run.ticket?.capabilities ?? [])].toSorted();
  const decisionCapabilities = [
    ...(decision.ticket?.capabilities ?? []),
  ].toSorted();
  return (
    run.row === (decision.pick?.choice ?? "unknown") &&
    (run.effort ?? run.stats?.effort) ===
      (decision.effort ?? decision.stats?.effort) &&
    run.ticket?.schema === decision.ticket?.schema &&
    JSON.stringify(runCapabilities) === JSON.stringify(decisionCapabilities) &&
    confidenceBin(run.pick?.confidence) ===
      confidenceBin(decision.pick?.confidence)
  );
};
const tokenTotal = (run: Entry): number => {
  const t = run.stats?.tokens;
  // input is the total input count; cached_input is a subset used to price that total.
  return [t?.input, t?.output, t?.reasoning].reduce<number>(
    (total, n) => total + (n ?? 0),
    0,
  );
};
const median = (xs: number[]): number | null => {
  const sorted = xs.toSorted((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
};
const writesClass = (count: number): string => {
  if (count === 0) return "0";
  if (count <= 3) return "1-3";
  return "4+";
};
const briefClass = (chars: number): string => {
  if (chars <= 500) return "0-500";
  if (chars <= 1500) return "501-1500";
  return "1501+";
};
export const comparableTicketKey = (
  capabilities: string[],
  writesCount: number,
  briefChars: number,
): string =>
  JSON.stringify({
    capabilities: [...capabilities].toSorted(),
    writes: writesClass(writesCount),
    brief: briefClass(briefChars),
  });
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
const dispatcherKey = (entry: Entry): string | undefined =>
  entry.dispatcher_session ??
  (entry.cwd === undefined ? undefined : `cwd:${entry.cwd}`);

export type ThroughputOptions = Readonly<{
  now: number;
  sinceMs: number;
  grading: boolean;
}>;

/** The compact, shareable subset used by pick requests and record exports. */
export function perRowRecord(log: string, options: ThroughputOptions) {
  const report = throughputStats(log, options);
  return Object.fromEntries(
    Object.entries(report.per_row).map(([row, stats]) => [
      row,
      {
        runs: stats.runs,
        accepted_returns_per_worker_hour:
          stats.accepted_returns_per_worker_hour,
        median_time_to_first_return_s: stats.median_time_to_first_return_s,
        accepted_rate: stats.accepted_rate,
        timeout_rate: stats.timeout_rate,
      },
    ]),
  );
}

export function perTagRecord(log: string, options: ThroughputOptions) {
  const report = throughputStats(log, options);
  return Object.fromEntries(
    Object.entries(report.per_tag).map(([tag, rows]) => [
      tag,
      Object.fromEntries(
        Object.entries(rows).map(([row, stats]) => [
          row,
          {
            runs: stats.runs,
            accepted_returns_per_worker_hour:
              stats.accepted_returns_per_worker_hour,
            median_time_to_first_return_s: stats.median_time_to_first_return_s,
            accepted_rate: stats.accepted_rate,
            timeout_rate: stats.timeout_rate,
          },
        ]),
      ),
    ]),
  );
}

export function perKindRecord(
  log: string,
  row: string,
  capabilities: string[],
  repo: string,
  options: ThroughputOptions,
) {
  const entries = log.split("\n").flatMap((line) => {
    const parsed = jsonOf(Line).safeParse(line);
    if (
      !parsed.success ||
      parsed.data.kind !== "run" ||
      parsed.data.run_id === undefined ||
      parsed.data.started_at === undefined
    )
      return [];
    const started = epoch(parsed.data.started_at);
    if (
      started === undefined ||
      started < options.sinceMs ||
      started > options.now
    )
      return [];
    const tags = parsed.data.ticket?.capabilities ?? [];
    let match = false;
    if (capabilities.length > 0)
      match = tags.some((tag) => capabilities.includes(tag));
    else
      match =
        (parsed.data.cwd?.split(/[\\/]/u).findLast(Boolean) ?? "") === repo;
    if (!match || (parsed.data.stats?.row ?? parsed.data.pick?.choice) !== row)
      return [];
    return [JSON.stringify(parsed.data)];
  });
  return throughputStats(entries.join("\n"), options).per_row[row];
}

function calculateThroughputStats(
  log: string,
  { now, sinceMs, grading }: ThroughputOptions,
) {
  const entries = log
    .split("\n")
    .filter((line) => line !== "")
    .flatMap((line) => {
      const parsed = jsonOf(Line).safeParse(line);
      return parsed.success ? [parsed.data] : [];
    });
  const acks = new Map<string, Entry>();
  const grades = new Map<string, string>();
  for (const entry of entries) {
    if (entry.kind === "ack" && entry.run_id !== undefined)
      acks.set(entry.run_id, entry);
    if (
      entry.kind === "grade" &&
      entry.run_id !== undefined &&
      entry.grade !== undefined
    )
      grades.set(entry.run_id, entry.grade);
  }
  const runs: Run[] = entries.flatMap((entry) => {
    if (entry.kind !== "run" || entry.run_id === undefined) return [];
    const started = epoch(entry.started_at);
    if (started === undefined || started < sinceMs || started > now) return [];
    const checkpointReturn =
      entry.checkpoint?.return_followed === true &&
      entry.checkpoint.fired_at_s !== undefined &&
      entry.checkpoint.fired_at_s !== null;
    const observedFirstReturn =
      entry.checkpoint?.first_return_by_deadline === true &&
      entry.checkpoint.first_return_at_s !== undefined &&
      entry.checkpoint.first_return_at_s !== null;
    const elapsed = entry.stats?.elapsed_s ?? entry.worker?.elapsed_s ?? 0;
    let firstReturnS = elapsed;
    if (checkpointReturn)
      firstReturnS = entry.checkpoint?.fired_at_s ?? elapsed;
    if (observedFirstReturn)
      firstReturnS = entry.checkpoint?.first_return_at_s ?? elapsed;
    return [
      {
        ...entry,
        run_id: entry.run_id,
        started_ms: started,
        row: entry.stats?.row ?? entry.pick?.choice ?? "unknown",
        outcome: entry.stats?.outcome ?? "unknown",
        elapsed_s: elapsed,
        tokens: tokenTotal(entry),
        first_return_s: firstReturnS,
      },
    ];
  });
  const groups = new Map<string, Run[]>();
  for (const run of runs) {
    const key = run.row;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  const summarize = (group: Run[]) => {
    const accepted = group.filter(
      (run) =>
        run.outcome !== "non_delivery" &&
        (grades.get(run.run_id) === "pass" ||
          (run.outcome === "returned" &&
            acks.get(run.run_id)?.consumed === true)),
    );
    const acceptedIds = new Set(accepted.map((run) => run.run_id));
    const time = sum(group.map((run) => run.elapsed_s));
    const costs = group.flatMap((run) => run.stats?.cost_usd ?? []);
    const tokens = group
      .filter(
        (run) =>
          !acceptedIds.has(run.run_id) &&
          acks.get(run.run_id)?.consumed !== true,
      )
      .map((run) => run.tokens);
    return {
      runs: group.length,
      accepted: accepted.length,
      accepted_returns_per_worker_hour:
        time === 0 ? null : accepted.length / (time / 3600),
      median_time_to_first_return_s: median(
        group.map((run) => run.first_return_s),
      ),
      timeout_rate:
        group.length === 0
          ? 0
          : group.filter((run) => run.outcome === "timeout").length /
            group.length,
      accepted_rate: group.length === 0 ? 0 : accepted.length / group.length,
      cost_per_accepted_usd:
        accepted.length === 0 ? null : sum(costs) / accepted.length,
      wasted_tokens: sum(tokens),
    };
  };
  const perTag = Object.fromEntries(
    [...new Set(runs.flatMap((run) => run.ticket?.capabilities ?? []))]
      .toSorted()
      .map((tag) => [
        tag,
        Object.fromEntries(
          [
            ...new Set(
              runs
                .filter(
                  (run) => run.ticket?.capabilities?.includes(tag) === true,
                )
                .map((run) => run.row),
            ),
          ]
            .toSorted()
            .map((row) => [
              row,
              summarize(
                runs.filter(
                  (run) =>
                    run.row === row &&
                    run.ticket?.capabilities?.includes(tag) === true,
                ),
              ),
            ]),
        ),
      ]),
  );
  const ticketCohorts = new Map<string, Run[]>();
  for (const run of runs) {
    const writesCount = run.ticket?.writes?.length;
    const briefChars = run.brief?.chars;
    if (writesCount === undefined || briefChars === undefined) continue;
    const key = comparableTicketKey(
      run.ticket?.capabilities ?? [],
      writesCount,
      briefChars,
    );
    ticketCohorts.set(key, [...(ticketCohorts.get(key) ?? []), run]);
  }
  const perComparableTicket = Object.fromEntries(
    [...ticketCohorts].map(([key, cohort]) => [
      key,
      Object.fromEntries(
        [...new Set(cohort.map((run) => run.row))]
          .toSorted()
          .map((row) => [
            row,
            summarize(cohort.filter((run) => run.row === row)),
          ]),
      ),
    ]),
  );
  const gradingRows = entries.filter(
    (entry) =>
      (entry.kind === "run" || entry.kind === "refusal") &&
      (epoch(entry.started_at ?? entry.at) ?? -Infinity) >= sinceMs &&
      (epoch(entry.started_at ?? entry.at) ?? Infinity) <= now,
  );
  const refused = gradingRows.filter((entry) => entry.kind === "refusal");
  const dispatchTime = (entry: Entry): number | undefined =>
    epoch(entry.kind === "run" ? entry.started_at : entry.at);
  const refusalRebriefSeconds = sum(
    refused.flatMap((refusal) => {
      const refusalTime = dispatchTime(refusal);
      const dispatcher = dispatcherKey(refusal);
      if (refusalTime === undefined || dispatcher === undefined) return [];
      const nextTime = entries
        .flatMap((entry) => {
          const time = dispatchTime(entry);
          return (entry.kind === "run" || entry.kind === "refusal") &&
            dispatcherKey(entry) === dispatcher &&
            time !== undefined &&
            time > refusalTime &&
            time <= now
            ? [time]
            : [];
        })
        .toSorted((a, b) => a - b)[0];
      return nextTime === undefined ? [] : [(nextTime - refusalTime) / 1000];
    }),
  );
  const likelyFalseSplits = runs.filter((run) => {
    if (
      run.ticket_grade?.grader?.reason !== "disabled by --no-grader" ||
      run.brief?.sha256 === undefined
    )
      return false;
    const runStarted = epoch(run.started_at);
    return gradingRows.some(
      (entry) =>
        entry.kind === "refusal" &&
        entry.ticket_grade?.verdict === "split" &&
        entry.ticket_grade.grader?.status === "ok" &&
        entry.brief?.sha256 === run.brief?.sha256 &&
        (epoch(entry.at) ?? Infinity) <= (runStarted ?? -Infinity),
    );
  }).length;
  const urgentOverrides = runs.filter(
    (run) =>
      run.ticket?.urgent_reason !== undefined &&
      run.ticket_grade?.grader?.status === "ok" &&
      (run.ticket_grade.verdict === "split" ||
        run.ticket_grade.verdict === "clarify"),
  );
  const splitCount = gradingRows.filter(
    (entry) => entry.ticket_grade?.verdict === "split",
  ).length;
  const decisionCounts = {
    refused: refused.filter((entry) => entry.ticket_grade?.verdict !== "split")
      .length,
    split: splitCount,
  };
  const overheadSeconds =
    refusalRebriefSeconds +
    sum(
      gradingRows.map(
        (entry) =>
          (entry.pick?.jev?.latency_ms ?? 0) / 1000 +
          (entry.ticket_grade?.grader?.elapsed_s ?? 0),
      ),
    );
  const jevPickSeconds = sum(
    gradingRows.map((entry) => (entry.pick?.jev?.latency_ms ?? 0) / 1000),
  );
  const graderSeconds = sum(
    gradingRows.map((entry) => entry.ticket_grade?.grader?.elapsed_s ?? 0),
  );
  const verifySeconds = sum(
    gradingRows.map((entry) =>
      sum((entry.verify ?? []).map((v) => v.elapsed_s ?? 0)),
    ),
  );
  const overheadCost = sum(
    gradingRows.map(
      (entry) => entry.ticket_grade?.grader?.usage?.cost_usd ?? 0,
    ),
  );
  const totalWall = sum(runs.map((run) => run.elapsed_s));
  const totalCost = sum(
    runs.map((run) =>
      Math.max(
        0,
        (run.stats?.cost_usd ?? 0) -
          (run.ticket_grade?.grader?.usage?.cost_usd ?? 0),
      ),
    ),
  );
  const changedDecisions = gradingRows.filter(
    (entry) =>
      entry.kind === "refusal" || entry.ticket_grade?.verdict === "split",
  );
  const saveEstimates = changedDecisions.map((decision) => {
    const cohort = runs.filter((run) => comparable(run, decision));
    const bad = cohort.filter(
      (run) =>
        run.outcome === "timeout" ||
        (grades.get(run.run_id) !== "pass" &&
          !(
            run.outcome === "returned" &&
            acks.get(run.run_id)?.consumed === true
          ) &&
          acks.get(run.run_id)?.consumed !== true),
    );
    const rate = cohort.length === 0 ? 0 : bad.length / cohort.length;
    return {
      rate,
      time:
        bad.length === 0
          ? 0
          : sum(bad.map((run) => run.elapsed_s)) / bad.length,
      cost:
        bad.length === 0
          ? 0
          : sum(
              bad.map((run) =>
                Math.max(
                  0,
                  (run.stats?.cost_usd ?? 0) -
                    (run.ticket_grade?.grader?.usage?.cost_usd ?? 0),
                ),
              ),
            ) / bad.length,
    };
  });
  const expectedSaves = sum(saveEstimates.map((estimate) => estimate.rate));
  const estimatedSavedTime = sum(
    saveEstimates.map((estimate) => estimate.rate * estimate.time),
  );
  const estimatedSavedCost = sum(
    saveEstimates.map((estimate) => estimate.rate * estimate.cost),
  );
  const gradingReport = {
    overhead_s: overheadSeconds,
    jev_pick_s: jevPickSeconds,
    grader_s: graderSeconds,
    grader_cost_usd: overheadCost,
    overhead_cost_usd: overheadCost,
    overhead_share_wall_time:
      totalWall === 0 ? null : overheadSeconds / (totalWall + overheadSeconds),
    overhead_share_cost:
      totalCost + overheadCost === 0
        ? null
        : overheadCost / (totalCost + overheadCost),
    refusals: decisionCounts.refused,
    splits: decisionCounts.split,
    likely_false_splits: likelyFalseSplits,
    refusal_rebrief_s: refusalRebriefSeconds,
    verify_s: verifySeconds,
    overhead_excludes:
      "verify_s is reported but excluded from grading overhead and --check",
    overridden_splits: {
      urgent: urgentOverrides.length,
      no_grader: likelyFalseSplits,
    },
    urgent_override_reasons: [
      ...new Set(urgentOverrides.map((run) => run.ticket?.urgent_reason ?? "")),
    ].toSorted(),
    decision_changed: decisionCounts,
    estimator:
      "each refusal/split matches same-window runs on row, effort, ticket schema, capability tags, and confidence bin; matching timeout-or-waste rate × decision count estimates saves; saved time/cost use the cohort's average timeout-or-waste worker time/cost; no matching cohort contributes zero",
    baseline_timeout_or_waste_rate:
      saveEstimates.length === 0
        ? 0
        : sum(saveEstimates.map((estimate) => estimate.rate)) /
          saveEstimates.length,
    estimated_saves: expectedSaves,
    estimated_saved_worker_s: estimatedSavedTime,
    estimated_saved_cost_usd: estimatedSavedCost,
    exceeds_saves:
      overheadSeconds > estimatedSavedTime || overheadCost > estimatedSavedCost,
  };
  return {
    window_ms: now - sinceMs,
    per_row: Object.fromEntries(
      [...groups].map(([row, group]) => [row, summarize(group)]),
    ),
    per_tag: perTag,
    per_repo: (() => {
      const repoGroups = new Map<string, Run[]>();
      for (const run of runs) {
        const repo = run.cwd?.split(/[\\/]/u).findLast(Boolean) ?? "";
        repoGroups.set(repo, [...(repoGroups.get(repo) ?? []), run]);
      }
      return Object.fromEntries(
        [...repoGroups].map(([repo, repoRuns]) => [
          repo,
          Object.fromEntries(
            [...new Set(repoRuns.map((run) => run.row))].map((row) => [
              row,
              summarize(repoRuns.filter((run) => run.row === row)),
            ]),
          ),
        ]),
      );
    })(),
    per_comparable_ticket: perComparableTicket,
    per_dispatcher: Object.fromEntries(
      [...new Set(runs.map((run) => run.dispatcher_session ?? "unknown"))]
        .toSorted()
        .map((session) => [
          session,
          summarize(
            runs.filter(
              (run) => (run.dispatcher_session ?? "unknown") === session,
            ),
          ),
        ]),
    ),
    grading: grading ? gradingReport : undefined,
    replay_assumption:
      "row rates are independent of task; candidate picks use the recorded window rate for each alternative row",
    note: "accepted counts returned runs only when acked (agx ledger note <run_id> --consumed)",
  };
}

// Routing reuses the same bounded log snapshot for a pick and its audit fields. Keep only the
// latest snapshot: a changed log or time window invalidates it without growing state over time.
let statsCache:
  | {
      log: string;
      now: number;
      sinceMs: number;
      grading: boolean;
      value: ReturnType<typeof calculateThroughputStats>;
    }
  | undefined;

export function throughputStats(log: string, options: ThroughputOptions) {
  if (
    statsCache?.log === log &&
    statsCache.now === options.now &&
    statsCache.sinceMs === options.sinceMs &&
    statsCache.grading === options.grading
  )
    return statsCache.value;
  const value = calculateThroughputStats(log, options);
  statsCache = { log, ...options, value };
  return value;
}

export function lineageMasks(
  log: string,
  {
    name,
    resumeFrom,
    now,
  }: { name?: string; resumeFrom?: string; now: number },
): Record<string, { failures: number; reason: string }> {
  const entries = log.split("\n").flatMap((line) => {
    const parsed = jsonOf(Line).safeParse(line);
    return parsed.success ? [parsed.data] : [];
  });
  const runs = entries.filter(
    (entry) => entry.kind === "run" && entry.run_id !== undefined,
  );
  const selected = new Set<string>();
  if (resumeFrom !== undefined) selected.add(resumeFrom);
  const namedRuns =
    name === undefined
      ? []
      : runs.filter((run) => {
          const started = epoch(run.started_at);
          return (
            run.ticket?.name === name &&
            started !== undefined &&
            started >= now - 24 * 60 * 60 * 1000 &&
            started <= now
          );
        });
  namedRuns.forEach((run) => {
    selected.add(run.run_id!);
  });
  const expandLineage = (): number => {
    const before = selected.size;
    const linkedRuns = runs.filter(
      (run) =>
        (run.resumed_from !== undefined && selected.has(run.resumed_from)) ||
        selected.has(run.run_id!),
    );
    linkedRuns.forEach((run) => {
      if (run.resumed_from !== undefined && !selected.has(run.resumed_from)) {
        selected.add(run.resumed_from);
      }
      if (!selected.has(run.run_id!)) {
        selected.add(run.run_id!);
      }
    });
    return selected.size - before;
  };
  while (expandLineage() > 0) {
    // Expand ancestors and descendants until the lineage reaches a fixed point.
  }
  const acks = new Map<string, boolean>();
  const grades = new Map<string, string>();
  for (const entry of entries) {
    if (
      entry.kind === "ack" &&
      entry.run_id !== undefined &&
      entry.consumed !== undefined
    )
      acks.set(entry.run_id, entry.consumed);
    if (
      entry.kind === "grade" &&
      entry.run_id !== undefined &&
      entry.grade !== undefined
    )
      grades.set(entry.run_id, entry.grade);
  }
  const failures = new Map<string, number>();
  for (const run of runs) {
    const id = run.run_id!;
    if (!selected.has(id)) continue;
    const row = run.stats?.row ?? run.pick?.choice ?? "unknown";
    const bad =
      (run.stats?.outcome ?? "") === "non_delivery" ||
      grades.get(id) === "fail" ||
      grades.get(id) === "partial" ||
      ((run.stats?.outcome ?? "") === "returned" && acks.get(id) !== true);
    if (bad) failures.set(row, (failures.get(row) ?? 0) + 1);
  }
  return Object.fromEntries(
    [...failures]
      .filter(([, count]) => count >= 2)
      .map(([row, count]) => [
        row,
        {
          failures: count,
          reason: `${count} lineage runs ended fail/partial, non_delivery, or returned without ack-consumed`,
        },
      ]),
  );
}

export function maskCandidates(
  rows: string[],
  masks: Record<string, { failures: number; reason: string }>,
  perRow: Record<string, { accepted_returns_per_worker_hour: number | null }>,
): {
  masked: Record<string, { failures: number; reason: string }>;
  fallback?: string;
} {
  const masked = Object.fromEntries(
    Object.entries(masks).filter(([row]) => rows.includes(row)),
  );
  if (rows.some((row) => masked[row] === undefined)) return { masked };
  const fallback = [...rows].toSorted(
    (a, b) =>
      (perRow[b]?.accepted_returns_per_worker_hour ?? -1) -
      (perRow[a]?.accepted_returns_per_worker_hour ?? -1),
  )[0];
  return fallback === undefined
    ? { masked: {} }
    : {
        masked: Object.fromEntries(
          Object.entries(masked).filter(([row]) => row !== fallback),
        ),
        fallback,
      };
}

const Candidate = z.strictObject({
  rules: z.array(
    z.strictObject({
      when: z.strictObject({
        row: z.string().optional(),
        effort: z.string().optional(),
        ticket_schema: z.number().optional(),
        capability_tags: z.array(z.string()).optional(),
        confidence_bin: z.enum(["low", "medium", "high"]).optional(),
      }),
      row: z.string(),
    }),
  ),
});

export function replayStats(
  log: string,
  candidateValue: unknown,
  options: ThroughputOptions,
) {
  const parsedCandidate = Candidate.safeParse(candidateValue);
  if (!parsedCandidate.success)
    return {
      error:
        "candidate must be { rules: [{ when: feature predicate, row: alternative row }] }",
    };
  const runs = log
    .split("\n")
    .filter((line) => line !== "")
    .flatMap((line) => {
      const parsed = jsonOf(Line).safeParse(line);
      if (
        !parsed.success ||
        parsed.data.kind !== "run" ||
        parsed.data.run_id === undefined
      )
        return [];
      const started = epoch(parsed.data.started_at);
      if (
        started === undefined ||
        started < options.sinceMs ||
        started > options.now
      )
        return [];
      return [{ ...parsed.data, started }];
    });
  const report = throughputStats(log, options);
  const rowRates = new Map(
    Object.entries(report.per_row).map(([row, stats]) => [
      row,
      stats.accepted_rate,
    ]),
  );
  const acks = new Map<string, boolean>();
  const grades = new Map<string, string>();
  for (const line of log.split("\n")) {
    const parsed = jsonOf(Line).safeParse(line);
    if (!parsed.success || parsed.data.run_id === undefined) continue;
    if (parsed.data.kind === "ack" && parsed.data.consumed !== undefined)
      acks.set(parsed.data.run_id, parsed.data.consumed);
    if (parsed.data.kind === "grade" && parsed.data.grade !== undefined)
      grades.set(parsed.data.run_id, parsed.data.grade);
  }
  const workerHours =
    sum(runs.map((run) => run.stats?.elapsed_s ?? run.worker?.elapsed_s ?? 0)) /
    3600;
  const actualAccepted = runs.filter(
    (run) =>
      grades.get(run.run_id ?? "") === "pass" ||
      (run.stats?.outcome === "returned" &&
        acks.get(run.run_id ?? "") === true),
  ).length;
  const candidateExpected = runs.reduce((total, run) => {
    const feature = {
      row: run.stats?.row ?? run.pick?.choice,
      effort: run.stats?.effort,
      ticket_schema: run.ticket?.schema,
      capability_tags: [...(run.ticket?.capabilities ?? [])].toSorted(),
      confidence_bin: confidenceBin(run.pick?.confidence),
    };
    const rule = parsedCandidate.data.rules.find(({ when }) =>
      matches(when, feature),
    );
    const alternative = rule?.row ?? feature.row;
    return total + (rowRates.get(alternative ?? "") ?? 0);
  }, 0);
  return {
    recorded_picks_accepted_returns_per_hour:
      workerHours === 0 ? null : actualAccepted / workerHours,
    candidate_accepted_returns_per_hour:
      workerHours === 0 ? null : candidateExpected / workerHours,
    runs: runs.length,
    matched_rules: runs.filter((run) =>
      parsedCandidate.data.rules.some(({ when }) => {
        const confidence = run.pick?.confidence;
        const feature = {
          row: run.stats?.row ?? run.pick?.choice,
          effort: run.stats?.effort,
          ticket_schema: run.ticket?.schema,
          capability_tags: [...(run.ticket?.capabilities ?? [])].toSorted(),
          confidence_bin: confidenceBin(confidence),
        };
        return matches(when, feature);
      }),
    ).length,
    assumption:
      "row rates are independent of task; candidate picks use the measured accepted rate for each selected row",
  };
}

export function parseSince(value: string | undefined, now: number): number {
  if (value === undefined) return now - 24 * 60 * 60 * 1000;
  const duration = /^(\d+(?:\.\d+)?)([smhd])$/u.exec(value);
  if (duration !== null) {
    const factors: Record<string, number> = {
      s: 1_000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    const factor = factors[duration[2] ?? ""];
    if (factor === undefined) return Number.NaN;
    return now - Number(duration[1]) * factor;
  }
  return epoch(value) ?? Number.NaN;
}

function matches(
  when: z.output<typeof Candidate>["rules"][number]["when"],
  features: {
    row: string | undefined;
    effort: string | undefined;
    ticket_schema: number | undefined;
    capability_tags: string[];
    confidence_bin: "low" | "medium" | "high";
  },
): boolean {
  return (
    (when.row === undefined || when.row === features.row) &&
    (when.effort === undefined || when.effort === features.effort) &&
    (when.ticket_schema === undefined ||
      when.ticket_schema === features.ticket_schema) &&
    (when.capability_tags === undefined ||
      JSON.stringify(when.capability_tags) ===
        JSON.stringify(features.capability_tags)) &&
    (when.confidence_bin === undefined ||
      when.confidence_bin === features.confidence_bin)
  );
}
