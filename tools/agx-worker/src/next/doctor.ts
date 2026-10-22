import { doctorOutput } from "../../../shared/src/doctor-record.ts";
import { foldedRuns, publishCurrentRuns } from "./store.ts";

const clean = (value: string): string => value.replaceAll(/[\t\r\n]/gu, " ");

export async function doctor(quiet = false): Promise<number> {
  const findings: string[] = [];

  for (const run of await foldedRuns()) {
    const finding = runFinding(run);
    if (finding !== undefined) findings.push(finding);
  }

  await publishCurrentRuns();
  const output = doctorOutput(findings);
  if (!output.ok) {
    process.stderr.write(`agx-worker doctor: ${String(output.error)}\n`);
    return 2;
  }
  process.stdout.write(output.value);
  if (!quiet)
    process.stderr.write(`agx-worker doctor: ${findings.length} finding(s)\n`);
  return findings.length === 0 ? 0 : 1;
}

function runFinding(
  run: Awaited<ReturnType<typeof foldedRuns>>[number],
): string | undefined {
  const kind = run.health;
  return kind === undefined || kind === null
    ? undefined
    : [
        "agx-worker",
        run.cwd,
        run.id,
        kind,
        `agx worker judge ${run.id} accept|reject`,
      ]
        .map((value) => clean(value))
        .join("\t");
}
