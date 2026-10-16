import { events, foldedRuns } from "./store.ts";
import { fromThrowable } from "neverthrow";

const clean = (value: string): string => value.replaceAll(/[\t\r\n]/gu, " ");

export async function doctor(): Promise<number> {
  const allEvents = events();
  const legacy = new Set(
    allEvents.flatMap((event) =>
      event.kind === "started" && event.lease === undefined ? [event.id] : [],
    ),
  );
  const now = Temporal.Now.instant();
  const findings: string[] = [];

  for (const run of await foldedRuns()) {
    const finding = runFinding(run, legacy, now);
    if (finding !== undefined) findings.push(finding);
  }

  if (findings.length > 0) process.stdout.write(`${findings.join("\n")}\n`);
  if (process.env.AGX_DOCTOR_QUIET !== "1")
    process.stderr.write(`agx-run doctor: ${findings.length} finding(s)\n`);
  return findings.length === 0 ? 0 : 1;
}

function runFinding(
  run: Awaited<ReturnType<typeof foldedRuns>>[number],
  legacy: ReadonlySet<string>,
  now: Temporal.Instant,
): string | undefined {
  let kind: string | undefined;
  if (run.state === "running") return undefined;
  // Pre-lease history (including imports) cannot establish modern lifecycle or
  // return guarantees. Missing metadata is not evidence that a run was lost.
  if (legacy.has(run.id)) kind = "legacy";
  else if (run.ended_at === null && run.outcome === "lost") kind = "orphaned";
  else if (run.ended_at !== null && run.returned !== true)
    kind = "missing-return";
  else if (
    run.state === "ended" &&
    run.judgment === null &&
    run.ended_at !== null
  )
    kind = unjudgedFinding(run.ended_at, now);
  return kind === undefined
    ? undefined
    : ["agx-run", run.cwd, run.id, kind, `agx judge ${run.id} accept|reject`]
        .map((value) => clean(value))
        .join("\t");
}

function unjudgedFinding(
  endedAt: string,
  now: Temporal.Instant,
): string | undefined {
  const parsed = fromThrowable(() => Temporal.Instant.from(endedAt))();
  return parsed.isOk() && now.since(parsed.value).total({ unit: "hours" }) > 24
    ? "unjudged"
    : undefined;
}
