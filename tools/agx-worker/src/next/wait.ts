import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { fromThrowable } from "neverthrow";
import { recordCursor, recordPath, stateDir, type ListedRun } from "./store.ts";

type Row = ListedRun;
export type WaitFlags = Readonly<{
  selector: string | undefined;
  json: boolean;
}>;

const pollMs = (): number => {
  const raw = Number(process.env.AGX_WAIT_POLL_MS);
  return Number.isFinite(raw) && raw >= 5000 ? raw : 5000;
};

/** Notifications are latched while reading so an append cannot race the next wait. */
function notifications(root: string) {
  const watchers = new Map<string, FSWatcher>();
  let dirty = false;
  let wake: (() => void) | undefined;
  const changed = () => {
    dirty = true;
    wake?.();
  };
  const add = (path: string) => {
    if (watchers.has(path)) return;
    const result = fromThrowable(() => watch(path, changed))();
    if (result.isErr()) return;
    const watcher = result.value;
    watcher.on("error", () => {
      watcher.close();
      watchers.delete(path);
      changed();
    });
    watchers.set(path, watcher);
  };
  return {
    refresh(rows: readonly Row[] = []) {
      add(root);
      add(recordPath(root));
      for (const row of rows) add(join(root, "runs", row.id));
    },
    async wait() {
      if (!dirty)
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, pollMs());
          wake = () => {
            clearTimeout(timer);
            resolve();
          };
        });
      wake = undefined;
      dirty = false;
    },
    close() {
      for (const watcher of watchers.values()) watcher.close();
    },
  };
}

/** Same selector grammar as `agx worker ls`: exact id, exact ticket, unique id prefix. */
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
      ...new Set(rows.map((entry) => `tkt_${entry.ticket}`)),
    ]
      .toSorted()
      .slice(0, 10)
      .join(", ")}`,
  };
};

const line = (entry: Row): string =>
  `${entry.id} ${entry.state} tkt_${entry.ticket} row=${entry.row} exit=${entry.exit ?? "-"} outcome=${entry.outcome ?? "-"}`;

/**
 * `agx worker ls --wait SELECTOR`: a read-only incremental fold over the record log, woken by
 * file notification with a slow liveness fallback. Its cursor never writes a snapshot.
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
  const root = stateDir();
  const cursor = recordCursor(root);
  const changes = notifications(root);
  changes.refresh();
  return waitForRun(selector).finally(() => {
    changes.close();
  });

  async function waitForRun(selected: string): Promise<number> {
    let rows = await cursor.read();
    const initialRows = rows;
    const initialSelection = select(initialRows, selected);
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
      const selection = select(rows, selected);
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
          (a.ended_at ?? a.started_at).localeCompare(
            b.ended_at ?? b.started_at,
          ),
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
      changes.refresh(selection.rows);
      await changes.wait();
      rows = await cursor.read();
    }
  }
}
