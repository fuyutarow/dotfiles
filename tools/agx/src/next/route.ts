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
): Promise<Choice> {
  const rosterPath = process.env.DISPATCH_ROSTER_PATH;
  const loaded = await loadRoster(rosterPath);
  if (!loaded.ok) {
    process.stderr.write(
      `agx-next: cannot read dispatch roster: ${loaded.error}\n`,
    );
    process.exit(1);
  }
  const roster = loaded.value;
  const endpoint = process.env.AGX_NEXT_JEV_URL ?? roster.auto.jev.url;
  const criteria = Object.fromEntries(
    roster.choice.map((row) => [row.id, criterionFor(roster, row)]),
  );
  const request: Record<string, unknown> = {
    state: {
      task: brief.slice(0, roster.auto.max_task_chars),
      routes: { codex: { available: true }, claude: { available: true } },
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
  if (!post.ok)
    return (
      roster.choice.find((row) => row.id === roster.default) ??
      roster.choice[0]!
    );
  const decoded = jsonOf(Reply).safeParse(post.text);
  if (post.status !== 200 || !decoded.success)
    return (
      roster.choice.find((row) => row.id === roster.default) ??
      roster.choice[0]!
    );
  const answer = decoded.data.answers.worker;
  const selected = answer?.choice;
  const valid = roster.choice.some((row) => row.id === selected);
  const sampled =
    answer?.probabilities === undefined
      ? undefined
      : sampleRow(
          answer.probabilities,
          roster.auto.pick_temperature,
          randomUUID(),
        );
  const rowId = sampled?.row ?? (valid ? selected : roster.default);
  return (
    roster.choice.find((row) => row.id === rowId) ??
    roster.choice.find((row) => row.id === roster.default) ??
    roster.choice[0]!
  );
}
