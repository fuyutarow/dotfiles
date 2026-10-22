import {
  exhaustionPolicy,
  loadRoster,
  type Choice,
} from "../../../../agents/models/roster.ts";
import { exitWithError } from "./exit.ts";
import { foldedRuns } from "./store.ts";
import { readRouteUsage } from "./usage.ts";
import { route } from "./route.ts";

export type PinnedContinuation = Readonly<{
  previousId: string;
  row: Choice;
  resumeSession?: string | undefined;
  supersedes?: string;
}>;

/**
 * Ordinary continuations pin their row. Capacity continuations route away from its model.
 * Every refusal happens here, before a run directory, a started event or a worker exists.
 */
export async function pinContinuation(
  continuationId: string,
  ticketPath: string,
  routing?: {
    brief: string;
    capabilities: readonly string[];
    timeoutS: number;
    maskedRows: readonly string[];
  },
  onFailure?: (reason: string) => void,
): Promise<PinnedContinuation | null> {
  const refuse = (reason: string): null => {
    if (onFailure !== undefined) {
      onFailure(`cannot continue run ${continuationId}: ${reason}`);
      return null;
    }
    return exitWithError(
      `agx: cannot continue run ${continuationId}: ${reason}; start a fresh run with: agx worker run ${ticketPath}\n`,
      2,
    );
  };
  const previous = (await foldedRuns()).find(
    (entry) => entry.id === continuationId,
  );
  if (previous === undefined) return refuse("unknown run");
  if (previous.vendor_session === null && previous.outcome !== "capacity")
    return refuse(
      previous.outcome === "stopped"
        ? "it ended stopped and has no vendor session to continue"
        : "it has no vendor session to continue",
    );
  const loaded = await loadRoster(process.env.DISPATCH_ROSTER_PATH);
  if (!loaded.ok) return refuse(`cannot read dispatch roster: ${loaded.error}`);
  const row = loaded.value.choice.find((entry) => entry.id === previous.row);
  if (previous.outcome === "capacity") {
    // Inspection validates the reference without selecting or launching a worker.
    if (routing === undefined) return null;
    const masked = loaded.value.choice
      .filter(
        (entry) =>
          entry.id === previous.row ||
          (row !== undefined &&
            entry.route === row.route &&
            entry.model === row.model),
      )
      .map((entry) => entry.id);
    const next = await route(
      routing.brief,
      routing.capabilities,
      routing.timeoutS,
      [...routing.maskedRows, previous.row, ...masked],
    );
    // Verified with `codex exec resume --help`: -m/--model overrides the resumed model.
    if (
      row?.route === "codex" &&
      next.route === "codex" &&
      previous.vendor_session !== null
    ) {
      process.stderr.write(
        `agx: capacity on ${previous.row}; resuming ${previous.id} on ${next.id} (${next.model})\n`,
      );
      return {
        previousId: previous.id,
        row: next,
        resumeSession: previous.vendor_session,
      };
    }
    process.stderr.write(
      `agx: capacity on ${previous.row}; fresh dispatch on ${next.id} supersedes ${previous.id} (vendor session cannot be resumed on this route)\n`,
    );
    return { previousId: previous.id, row: next, supersedes: previous.id };
  }
  if (row === undefined)
    return refuse(`its row ${previous.row} is not in the roster`);
  const usage = await readRouteUsage(
    undefined,
    exhaustionPolicy(loaded.value.auto),
  );
  if (!usage[row.route].available)
    return refuse(`its ${row.route} route is at its subscription limit`);
  return {
    previousId: previous.id,
    row,
    resumeSession: previous.vendor_session ?? undefined,
  };
}
