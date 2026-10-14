import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import { existsSync, readFileSync } from "node:fs";
import { jsonOf, z } from "../tools/shared/src/zod.ts";

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("agx-accept: unknown option '--__proto__'\n");
    process.exit(2);
  }
};

const parsed = cli(
  {
    name: "agx-accept",
    parameters: ["<selector>"],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  },
  undefined,
);

if (parsed._.length > 1) {
  process.stderr.write(
    `agx-accept: unexpected positional argument '${parsed._[1] ?? ""}'\n`,
  );
  process.exit(2);
}

const VerifySchema = z.object({
  cmd: z.string(),
  exit: z.number(),
  log_path: z.string(),
});
const RunSchema = z.object({
  id: z.string(),
  ticket: z.string(),
  row: z.string(),
  state: z.string(),
  exit: z.number().nullable(),
  judgment: z
    .object({ decision: z.enum(["accept", "reject"]), note: z.string() })
    .nullable()
    .optional(),
  started_at: z.string().optional(),
  ended_at: z.string().nullable(),
  cwd: z.string(),
  report_path: z.string().nullable(),
  verify: z.array(VerifySchema),
});
const safeRead = fromThrowable(
  (path: string) => readFileSync(path, "utf8"),
  (error) => error,
);

type Run = z.output<typeof RunSchema>;
const pad2 = (value: number): string =>
  String(Math.floor(value)).padStart(2, "0");
const duration = (seconds: number): string =>
  seconds >= 3600
    ? `${Math.floor(seconds / 3600)}h${pad2(Math.floor((seconds % 3600) / 60))}m`
    : `${Math.floor(seconds / 60)}m${pad2(seconds % 60)}s`;
const elapsed = (run: Run): string => {
  if (run.started_at === undefined) return "-";
  const startMs = Temporal.Instant.from(run.started_at).epochMilliseconds;
  const endMs =
    run.ended_at === null
      ? Temporal.Now.instant().epochMilliseconds
      : Temporal.Instant.from(run.ended_at).epochMilliseconds;
  return duration(Math.floor(Math.max(0, endMs - startMs) / 1000));
};

const printVerify = (run: Run): void => {
  for (const verify of run.verify) {
    process.stdout.write(`VERIFY exit=${verify.exit} ${verify.cmd}\n`);
    if (verify.exit === 0) continue;
    const log = safeRead(verify.log_path);
    if (log.isErr()) continue;
    const failures = log.value
      .split(/\r?\n/u)
      .filter((line) => line.includes("(fail)"))
      .slice(-20);
    for (const line of failures) process.stdout.write(`  ${line}\n`);
  }
};

const printReport = (run: Run): void => {
  process.stdout.write("REPORT\n");
  if (run.report_path === null) {
    process.stdout.write("  (no report)\n");
    return;
  }
  const reportText = safeRead(run.report_path);
  if (reportText.isErr()) {
    process.stdout.write("  (report unavailable or invalid JSON)\n");
    return;
  }
  const report = jsonOf(z.unknown()).safeParse(reportText.value);
  if (!report.success) {
    process.stdout.write("  (report unavailable or invalid JSON)\n");
    return;
  }
  const lines = JSON.stringify(report.data, null, 2).split("\n").slice(0, 12);
  for (const line of lines) process.stdout.write(`  ${line}\n`);
};

const printDiff = (
  workspace: string,
  accepted: boolean,
): number | undefined => {
  process.stdout.write("DIFF\n");
  if (!existsSync(workspace)) {
    const message = accepted
      ? `  workspace removed after land: ${workspace}; diff unavailable\n`
      : `  workspace path missing: ${workspace}; diff unavailable\n`;
    process.stdout.write(message);
    return undefined;
  }
  const diff = Bun.spawnSync(["jj", "-R", workspace, "diff", "--stat"], {
    cwd: process.cwd(),
    env: process.env,
    timeout: 15_000,
  });
  const diffOutput = diff.stdout.toString();
  const diffText = (
    diffOutput === "" ? diff.stderr.toString() : diffOutput
  ).trim();
  if (diffText === "") process.stdout.write("  (no diff output)\n");
  else process.stdout.write(`${diffText}\n`);
  if (diff.exitCode === 0) return undefined;
  process.stderr.write(`agx-accept: jj diff failed (exit ${diff.exitCode})\n`);
  return diff.exitCode ?? 2;
};

const main = (): void => {
  const selector = parsed._[0];
  if (selector === undefined) {
    process.stderr.write("agx-accept: SELECTOR is required\n");
    process.exitCode = 2;
    return;
  }
  const listing = Bun.spawnSync(["agx", "ls", selector, "--json"], {
    cwd: process.cwd(),
    env: process.env,
    timeout: 15_000,
  });
  if (listing.exitCode !== 0) {
    const errorText = listing.stderr.toString();
    process.stderr.write(
      errorText === "" ? "agx-accept: agx ls failed\n" : errorText,
    );
    process.exitCode = listing.exitCode ?? 2;
    return;
  }
  const decoded = jsonOf(z.array(RunSchema)).safeParse(
    listing.stdout.toString(),
  );
  if (!decoded.success) {
    process.stderr.write("agx-accept: agx ls returned invalid JSON\n");
    process.exitCode = 2;
    return;
  }
  if (decoded.data.length === 0) {
    process.stderr.write("agx-accept: agx ls selected no runs\n");
    process.exitCode = 2;
    return;
  }
  const selectedTicket = decoded.data[0]?.ticket;
  if (
    selectedTicket !== undefined &&
    decoded.data.some((entry) => entry.ticket !== selectedTicket)
  ) {
    process.stderr.write(
      "agx-accept: agx ls returned multiple tickets; update agx to a selector-aware version\n",
    );
    process.exitCode = 2;
    return;
  }
  const run = decoded.data.at(-1);
  if (run === undefined) return;
  process.stdout.write(
    `RUN id=${run.id} row=${run.row} state=${run.state} exit=${run.exit ?? "-"} elapsed=${elapsed(run)}\n`,
  );

  printVerify(run);
  printReport(run);

  const diffExit = printDiff(run.cwd, run.judgment?.decision === "accept");
  if (diffExit !== undefined) {
    process.exitCode = diffExit;
    return;
  }

  process.stdout.write(
    `NEXT\nagx judge ${run.id} accept --note "<note>"\nmise run land -- <workspace-name> -m "<message>"\n`,
  );
};

main();
