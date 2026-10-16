import { events, foldedRuns } from "./store.ts";
import { fromThrowable } from "neverthrow";

const clean = (value: string): string => value.replaceAll(/[\t\r\n]/gu, " ");

export async function doctor(): Promise<number> {
  const allEvents = events();
  const started = new Set(
    allEvents.flatMap((event) => (event.kind === "started" ? [event.id] : [])),
  );
  const ended = new Set(
    allEvents.flatMap((event) => (event.kind === "ended" ? [event.id] : [])),
  );
  const now = Temporal.Now.instant();
  const findings: string[] = [];

  for (const run of await foldedRuns()) {
    const finding = runFinding(run, started, ended, now);
    if (finding !== undefined) findings.push(finding);
  }

  if (findings.length > 0) process.stdout.write(`${findings.join("\n")}\n`);
  if (process.env.AGX_DOCTOR_QUIET !== "1")
    process.stderr.write(`agx-run doctor: ${findings.length} finding(s)\n`);
  return findings.length === 0 ? 0 : 1;
}

function runFinding(
  run: Awaited<ReturnType<typeof foldedRuns>>[number],
  started: ReadonlySet<string>,
  ended: ReadonlySet<string>,
  now: Temporal.Instant,
): string | undefined {
  let kind: string | undefined;
  if (started.has(run.id) && !ended.has(run.id) && run.outcome === "lost")
    kind = "orphaned";
  else if (
    ended.has(run.id) &&
    (run.outcome === "lost" || run.returned !== true)
  )
    kind = "lost";
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
