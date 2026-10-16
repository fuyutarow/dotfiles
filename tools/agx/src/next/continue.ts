import { loadRoster, type Choice } from "../../../../agents/models/roster.ts";
import { exitWithError } from "./exit.ts";
import { foldedRuns } from "./store.ts";
import { readRouteUsage } from "./usage.ts";

export type PinnedContinuation = Readonly<{
  previousId: string;
  row: Choice;
  resumeSession: string;
}>;

/**
 * `--continue` never routes: the prior run's row and recorded vendor session are reused as-is.
 * Every refusal happens here, before a run directory, a started event or a worker exists.
 */
export async function pinContinuation(
  continuationId: string,
  ticketPath: string,
): Promise<PinnedContinuation> {
  const refuse = (reason: string): never =>
    exitWithError(
      `agx: cannot continue run ${continuationId}: ${reason}; start a fresh run with: agx run ${ticketPath}\n`,
      2,
    );
  const previous = foldedRuns().find((entry) => entry.id === continuationId);
  if (previous === undefined) return refuse("unknown run");
  if (previous.vendor_session === null)
    return refuse("it has no vendor session to continue");
  const loaded = await loadRoster(process.env.DISPATCH_ROSTER_PATH);
  if (!loaded.ok) return refuse(`cannot read dispatch roster: ${loaded.error}`);
  const row = loaded.value.choice.find((entry) => entry.id === previous.row);
  if (row === undefined)
    return refuse(`its row ${previous.row} is not in the roster`);
  if (!(await readRouteUsage())[row.route].available)
    return refuse(`its ${row.route} route is at its subscription limit`);
  return {
    previousId: previous.id,
    row,
    resumeSession: previous.vendor_session,
  };
}
