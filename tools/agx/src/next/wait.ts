import { setTimeout as sleep } from "node:timers/promises";
import { fullFoldedRuns } from "./store.ts";

type Row = ReturnType<typeof fullFoldedRuns>[number];
export type WaitFlags = Readonly<{
  selector: string | undefined;
  json: boolean;
}>;

const pollMs = (): number => {
  const raw = Number(process.env.AGX_WAIT_POLL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 1000;
};

/** Same selector grammar as `agx ls`: exact id, exact ticket, unique id prefix. */
const select = (
  rows: readonly Row[],
  selector: string,
): { rows: readonly Row[]; error?: string } => {
  const exactId = rows.find((entry) => entry.id === selector);
  if (exactId !== undefined) return { rows: [exactId] };
  const ticketRuns = rows.filter((entry) => entry.ticket === selector);
  if (ticketRuns.length > 0) return { rows: ticketRuns };
  const idMatches = rows.filter((entry) => entry.id.startsWith(selector));
  if (idMatches.length === 1) return { rows: idMatches };
  if (idMatches.length > 1)
    return {
      rows: [],
      error: `selector '${selector}' is ambiguous; run id candidates: ${idMatches
        .map((entry) => entry.id)
        .toSorted()
        .join(", ")}`,
    };
  return {
    rows: [],
    error: `no run id or exact ticket matches '${selector}'; ticket candidates: ${[
      ...new Set(rows.map((entry) => entry.ticket)),
    ]
      .toSorted()
      .slice(0, 10)
      .join(", ")}`,
  };
};

const line = (entry: Row): string =>
  `${entry.id} ${entry.state} ${entry.ticket} row=${entry.row} exit=${entry.exit ?? "-"} outcome=${entry.outcome ?? "-"}`;

/**
 * `agx ls --wait SELECTOR`: a read-only fold over the record log, re-read on a
 * bounded poll. It uses the full replay so it never writes the fold snapshot.
 * Returns once any selected run is ended or orphaned (a run whose process died
 * without an ended event), printing the terminal rows in `ls` format.
 */
export async function waitRun(flags: WaitFlags): Promise<number> {
  const selector = flags.selector;
  if (selector === undefined || selector === "") {
    process.stderr.write("agx: --wait needs a non-empty run selector\n");
    return 2;
  }
  for (;;) {
    const selection = select(fullFoldedRuns(), selector);
    if (selection.error !== undefined) {
      process.stderr.write(`agx: ${selection.error}\n`);
      return 2;
    }
    const done = selection.rows
      .filter((entry) => entry.state !== "running")
      .toSorted((a, b) =>
        (a.ended_at ?? a.started_at).localeCompare(b.ended_at ?? b.started_at),
      );
    if (done.length > 0) {
      process.stdout.write(
        flags.json
          ? `${JSON.stringify(done)}\n`
          : `${done.map((entry) => line(entry)).join("\n")}\n`,
      );
      return 0;
    }
    await sleep(pollMs());
  }
}
