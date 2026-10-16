import { setTimeout as sleep } from "node:timers/promises";
import { fullFoldedRuns } from "./store.ts";

type Row = Awaited<ReturnType<typeof fullFoldedRuns>>[number];
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
): { rows: readonly Row[]; kind: "run" | "ticket"; error?: string } => {
  const exactId = rows.find((entry) => entry.id === selector);
  if (exactId !== undefined) return { rows: [exactId], kind: "run" };
  const ticketRuns = rows.filter((entry) => entry.ticket === selector);
  if (ticketRuns.length > 0) return { rows: ticketRuns, kind: "ticket" };
  const idMatches = rows.filter((entry) => entry.id.startsWith(selector));
  if (idMatches.length === 1) return { rows: idMatches, kind: "run" };
  if (idMatches.length > 1)
    return {
      rows: [],
      kind: "run",
      error: `selector '${selector}' is ambiguous; run id candidates: ${idMatches
        .map((entry) => entry.id)
        .toSorted()
        .join(", ")}`,
    };
  return {
    rows: [],
    kind: "ticket",
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
 * Run-id selectors preserve immediate terminal lookup. Ticket selectors ignore
 * runs already terminal on the initial read, then return the first eligible run
 * that ends or becomes ended lost, printing its row in `ls` format.
 */
export async function waitRun(flags: WaitFlags): Promise<number> {
  const selector = flags.selector;
  if (selector === undefined || selector === "") {
    process.stderr.write("agx: --wait needs a non-empty run selector\n");
    return 2;
  }
  const initialRows = await fullFoldedRuns();
  const initialSelection = select(initialRows, selector);
  if (initialSelection.error !== undefined) {
    process.stderr.write(`agx: ${initialSelection.error}\n`);
    return 2;
  }
  const initialIds = new Set(initialRows.map((entry) => entry.id));
  const initiallyRunningIds = new Set(
    initialSelection.rows
      .filter((entry) => entry.state === "running")
      .map((entry) => entry.id),
  );
  const kind = initialSelection.kind;

  for (;;) {
    const selection = select(await fullFoldedRuns(), selector);
    if (selection.error !== undefined) {
      process.stderr.write(`agx: ${selection.error}\n`);
      return 2;
    }
    const done = selection.rows
      .filter(
        (entry) =>
          entry.state !== "running" &&
          (kind === "run" ||
            initiallyRunningIds.has(entry.id) ||
            !initialIds.has(entry.id)),
      )
      .toSorted((a, b) =>
        (a.ended_at ?? a.started_at).localeCompare(b.ended_at ?? b.started_at),
      );
    const firstDone = done[0];
    if (firstDone !== undefined) {
      process.stdout.write(
        flags.json
          ? `${JSON.stringify([firstDone])}\n`
          : `${line(firstDone)}\n`,
      );
      return 0;
    }
    await sleep(pollMs());
  }
}
