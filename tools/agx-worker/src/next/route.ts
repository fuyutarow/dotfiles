import { randomUUID } from "node:crypto";
import { jevEndpoint, postJev } from "../../../shared/src/jev-client.ts";
import { sampleRow } from "../selection.ts";
import {
  criterionFor,
  exhaustionPolicy,
  loadRoster,
  routeFilterLabel,
  ROUTING_OBJECTIVE,
  type Choice,
  type LoadRosterOptions,
} from "../roster/index.ts";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { exitWithError } from "./exit.ts";
import { readRouteUsage } from "./usage.ts";
import { foldedRuns, setPendingPickAudit } from "./store.ts";
import { CAPACITY_COOLDOWN_MS, capacityRows } from "./capacity.ts";

const Reply = z.looseObject({
  answers: z.record(
    z.string(),
    z.looseObject({
      choice: z.string(),
      confidence: z.number().optional(),
      probabilities: z.record(z.string(), z.number()).optional(),
    }),
  ),
});

export async function route(
  brief: string,
  capabilities: readonly string[] = [],
  timeoutS = 600,
  maskedRows: readonly string[] = [],
  rosterOptions: LoadRosterOptions = {},
): Promise<Choice> {
  const loaded = await loadRoster(rosterOptions);
  if (!loaded.ok)
    return exitWithError(
      `agx: cannot read dispatch roster: ${loaded.error}\n`,
      1,
    );
  const roster = loaded.value;
  const runs = await foldedRuns();
  const cooling = capacityRows(runs, roster.choice);
  const coolingNote =
    cooling.size === 0
      ? ""
      : `; capacity rows cooling down for up to ${CAPACITY_COOLDOWN_MS / 1000} s`;
  const endpoint = jevEndpoint(roster.auto.jev.url);
  if (!endpoint.ok) return exitWithError(`agx: ${endpoint.error}\n`, 2);
  let timeoutClass = "standard";
  if (timeoutS > 600) timeoutClass = "extended";
  if (timeoutS >= 3600) timeoutClass = "multi-hour";
  const minimumTb4 = capabilities.some((tag) =>
    ["terminal-agentic", "long-tool-loop"].includes(tag),
  )
    ? 30
    : undefined;
  const eligible = roster.choice
    .filter(
      (row) =>
        (roster.auto.routes === undefined ||
          roster.auto.routes.includes(row.route)) &&
        !maskedRows.includes(row.id) &&
        !cooling.has(row.id) &&
        (minimumTb4 === undefined || (row.tb4 ?? 0) >= minimumTb4),
    )
    .toSorted(
      (a, b) =>
        ["low", "medium", "high", "xhigh", "max"].indexOf(a.effort) -
        ["low", "medium", "high", "xhigh", "max"].indexOf(b.effort),
    );
  const usage = await readRouteUsage(undefined, exhaustionPolicy(roster.auto));
  const candidates = eligible.filter((row) => usage[row.route].available);
  if (candidates.length === 0)
    return exitWithError(
      eligible.length === 0
        ? `agx: no roster row satisfies required capabilities (${routeFilterLabel(roster.auto)})${coolingNote}\n`
        : "agx: all capability-eligible routes are at their subscription limit\n",
      2,
    );
  const criteria = Object.fromEntries(
    candidates.map((row) => [row.id, criterionFor(roster, row)]),
  );
  const request: Record<string, unknown> = {
    state: {
      task: brief.slice(0, Math.min(roster.auto.max_task_chars, 2400)),
      routes: Object.fromEntries(
        Object.entries(usage).map(([name, value]) => [
          name,
          {
            available: value.available,
            windows: Object.fromEntries(
              Object.entries(value.windows).map(([windowName, window]) => [
                windowName,
                {
                  used_percent: window.used_percent,
                  elapsed_fraction: window.elapsed_fraction,
                  pace: window.pace,
                  status: window.status,
                },
              ]),
            ),
          },
        ]),
      ),
      task_size: {
        timeout_s: timeoutS,
        class: timeoutClass,
      },
      ...(capabilities.length === 0
        ? {}
        : { required_capabilities: [...capabilities] }),
    },
    questions: {
      worker: {
        type: "choice",
        instructions: `${ROUTING_OBJECTIVE} Pick a roster row for this ticket.`,
        criteria,
      },
    },
  };
  if (roster.auto.jev.api === "typesafe") request.model = roster.auto.jev.model;
  const post = await postJev(endpoint.value, request, roster.auto.timeout_ms);
  const fallback =
    candidates.find((row) => row.id === roster.default) ?? candidates[0]!;
  const recordPick = (
    row: Choice,
    source: string,
    probabilities: Record<string, number> | undefined,
  ): Choice => {
    setPendingPickAudit({
      source,
      probabilities: probabilities ?? null,
      usage_snapshot: usage,
    });
    return row;
  };
  if (!post.ok)
    return recordPick(fallback, "fallback-request-failed", undefined);
  const decoded = jsonOf(Reply).safeParse(post.text);
  if (post.status !== 200)
    return recordPick(fallback, `fallback-http-${post.status}`, undefined);
  if (!decoded.success)
    return recordPick(fallback, "fallback-invalid-response", undefined);
  const answer = decoded.data.answers.worker;
  const selected = answer?.choice;
  const probabilities = answer?.probabilities;
  const sampled =
    probabilities === undefined
      ? undefined
      : sampleRow(probabilities, roster.auto.pick_temperature, randomUUID());
  if (sampled !== undefined && candidates.some((row) => row.id === sampled.row))
    return recordPick(
      candidates.find((row) => row.id === sampled.row) ?? fallback,
      "jev",
      probabilities,
    );
  if (selected !== undefined) {
    const selectedRow = candidates.find((row) => row.id === selected);
    if (selectedRow !== undefined)
      return recordPick(selectedRow, "jev", probabilities);
  }
  return recordPick(
    fallback,
    answer === undefined
      ? "fallback-missing-answer"
      : "fallback-ineligible-choice",
    probabilities,
  );
}
