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
  const candidates = eligible;
  if (candidates.length === 0)
    return exitWithError(
      "agx: no roster row satisfies required capabilities\n",
      2,
    );
  const criteria = Object.fromEntries(
    candidates.map((row) => [row.id, criterionFor(roster, row)]),
  );
  const request: Record<string, unknown> = {
    state: {
      task: brief.slice(0, roster.auto.max_task_chars),
      routes: { codex: { available: true }, claude: { available: true } },
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
  const post = await postJev(endpoint, request, roster.auto.timeout_ms);
  const fallback =
    candidates.find((row) => row.id === roster.default) ?? candidates[0]!;
  if (!post.ok) return fallback;
  const decoded = jsonOf(Reply).safeParse(post.text);
  if (post.status !== 200 || !decoded.success) return fallback;
  const answer = decoded.data.answers.worker;
  const selected = answer?.choice;
  const sampled =
    answer?.probabilities === undefined
      ? undefined
      : sampleRow(
          answer.probabilities,
          roster.auto.pick_temperature,
          randomUUID(),
        );
  let rowId = fallback.id;
  if (sampled !== undefined && candidates.some((row) => row.id === sampled.row))
    rowId = sampled.row;
  else if (
    selected !== undefined &&
    candidates.some((row) => row.id === selected)
  )
    rowId = selected;
  return candidates.find((row) => row.id === rowId) ?? fallback;
}
