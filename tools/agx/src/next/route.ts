import { randomUUID } from "node:crypto";
import { postJev } from "../jev-client.ts";
import { sampleRow } from "../selection.ts";
import {
  criterionFor,
  loadRoster,
  ROUTING_OBJECTIVE,
  type Choice,
} from "../../../../agents/models/roster.ts";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { exitWithError } from "./exit.ts";
import { readRouteUsage } from "./usage.ts";
import { setPendingPickAudit } from "./store.ts";

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
): Promise<Choice> {
  const rosterPath = process.env.DISPATCH_ROSTER_PATH;
  const loaded = await loadRoster(rosterPath);
  if (!loaded.ok)
    return exitWithError(
      `agx: cannot read dispatch roster: ${loaded.error}\n`,
      1,
    );
  const roster = loaded.value;
  const endpoint = process.env.AGX_NEXT_JEV_URL ?? roster.auto.jev.url;
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
        !maskedRows.includes(row.id) &&
        (minimumTb4 === undefined || (row.tb4 ?? 0) >= minimumTb4),
    )
    .toSorted(
      (a, b) =>
        ["low", "medium", "high", "xhigh", "max"].indexOf(a.effort) -
        ["low", "medium", "high", "xhigh", "max"].indexOf(b.effort),
    );
  const usage = readRouteUsage();
  const candidates = eligible.filter((row) => usage[row.route].available);
  if (candidates.length === 0)
    return exitWithError(
      eligible.length === 0
        ? "agx: no roster row satisfies required capabilities\n"
        : "agx: all capability-eligible routes are at their subscription limit\n",
      2,
    );
  const criteria = Object.fromEntries(
    candidates.map((row) => [row.id, criterionFor(roster, row)]),
  );
  const request: Record<string, unknown> = {
    state: {
      task: brief.slice(0, roster.auto.max_task_chars),
      routes: usage,
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
        instructions: `${ROUTING_OBJECTIVE} Subscription pace is an additional route criterion: among capability-eligible comparable rows, prefer the route with the most negative fresh-window pace (quota likely to expire unused), and avoid a positive-pace route when the other route has a comparable row. Stale or unknown usage is neutral and must not create a route preference. Never choose a route whose availability is false. Pick a roster row for this ticket.`,
        criteria,
      },
    },
  };
  if (roster.auto.jev.api === "typesafe") request.model = roster.auto.jev.model;
  const post = await postJev(endpoint, request, roster.auto.timeout_ms);
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
