import { foldedRuns } from "./store.ts";

const clean = (value: string): string => value.replaceAll(/[\t\r\n]/gu, " ");

export async function doctor(): Promise<number> {
  const findings: string[] = [];

  for (const run of await foldedRuns()) {
    const finding = runFinding(run);
    if (finding !== undefined) findings.push(finding);
  }

  if (findings.length > 0) process.stdout.write(`${findings.join("\n")}\n`);
  if (process.env.AGX_DOCTOR_QUIET !== "1")
    process.stderr.write(`agx-run doctor: ${findings.length} finding(s)\n`);
  return findings.length === 0 ? 0 : 1;
}

function runFinding(
  run: Awaited<ReturnType<typeof foldedRuns>>[number],
): string | undefined {
  const kind = run.health;
  return kind === undefined || kind === null
    ? undefined
    : ["agx-run", run.cwd, run.id, kind, `agx judge ${run.id} accept|reject`]
        .map((value) => clean(value))
        .join("\t");
}
