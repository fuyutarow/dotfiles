import { attempt, errorMessage } from "../../../shared/src/attempt.ts";
import { parseNextTicket } from "./ticket.ts";
import { route } from "./route.ts";
import { postJev } from "../../../shared/src/jev-client.ts";
import { loadRoster } from "../../../../agents/models/roster.ts";
import { jsonOf, z } from "../../../shared/src/zod.ts";

const oneLine = (reason: string): string => reason.replaceAll(/[\r\n]+/gu, " ");
const JsonValue = jsonOf(z.unknown());

export async function jev(): Promise<number> {
  const loaded = await loadRoster(process.env.DISPATCH_ROSTER_PATH);
  if (!loaded.ok) {
    process.stderr.write(
      `agx jev: cannot read dispatch roster: ${oneLine(loaded.error)}\n`,
    );
    return 1;
  }

  const input = await Bun.stdin.text();
  const parsedRequest = JsonValue.safeParse(input);
  if (!parsedRequest.success) {
    process.stderr.write("agx jev: stdin must contain one JSON request\n");
    return 2;
  }

  const endpoint = process.env.AGX_NEXT_JEV_URL ?? loaded.value.auto.jev.url;
  const result = await postJev(
    endpoint,
    parsedRequest.data,
    loaded.value.auto.timeout_ms,
  );
  if (!result.ok) {
    process.stderr.write(`agx jev: ${oneLine(result.reason)}\n`);
    return 1;
  }
  if (result.status !== 200) {
    process.stderr.write(`agx jev: endpoint returned HTTP ${result.status}\n`);
    return 1;
  }

  const parsedAnswer = JsonValue.safeParse(result.text);
  if (!parsedAnswer.success) {
    process.stderr.write("agx jev: endpoint returned invalid JSON\n");
    return 1;
  }
  process.stdout.write(`${JSON.stringify(parsedAnswer.data)}\n`);
  return 0;
}

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
  const loaded = await loadRoster(process.env.DISPATCH_ROSTER_PATH);
  if (!loaded.ok) {
    process.stderr.write(`agx roster: ${oneLine(loaded.error)}\n`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(loaded.value)}\n`);
  return 0;
}
