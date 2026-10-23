import { attempt, errorMessage } from "../../../shared/src/attempt.ts";
import { parseNextTicket } from "./ticket.ts";
import { route } from "./route.ts";
import { loadRoster, ROUTING_OBJECTIVE } from "../roster/index.ts";

const oneLine = (reason: string): string => reason.replaceAll(/[\r\n]+/gu, " ");

export async function roster(ticketPath?: string): Promise<number> {
  if (ticketPath !== undefined) {
    const source = await attempt(() => Bun.file(ticketPath).text());
    if (!source.ok) {
      process.stderr.write(
        `agx-worker roster: ${errorMessage(source.error)}\n`,
      );
      return 1;
    }
    const parsed = parseNextTicket(source.value);
    if (!parsed.success) {
      process.stderr.write(`agx-worker roster: ${parsed.reason}\n`);
      return 2;
    }
    const row = await route(
      source.value,
      parsed.ticket.capabilities,
      parsed.ticket.timeout_s ?? 600,
    );
    process.stdout.write(`${JSON.stringify(row)}\n`);
    return 0;
  }
  const loaded = await loadRoster();
  if (!loaded.ok) {
    process.stderr.write(`agx worker roster: ${oneLine(loaded.error)}\n`);
    return 1;
  }
  process.stdout.write(
    `${JSON.stringify({ ...loaded.value, objective: ROUTING_OBJECTIVE })}\n`,
  );
  return 0;
}
