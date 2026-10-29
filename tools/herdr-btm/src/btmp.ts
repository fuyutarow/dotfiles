#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import {
  gpuEstimate,
  gpuStateFailure,
  readGpuState,
} from "@dotfiles/shared/src/gpu-samples.ts";
import { ensureBtm } from "./ensure.ts";
import { btmpArgs } from "./args.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, cliArgv);

const discoveryArgs = cliArgv();
if (
  import.meta.main &&
  discoveryArgs.length === 1 &&
  ["--help", "-h", "--version", "-V"].includes(discoveryArgs[0] ?? "")
) {
  cli({
    name: "btmp",
    parameters: ["[btm-args...]"],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    help: {
      description:
        "Run btm with Herdr metadata, or btmp ensure to install it. Other arguments are forwarded to btm.",
    },
  });
}

const REPORT_INTERVAL_MS = 3_000;
const METRICS_TIMEOUT_MS = 2_000;
const HERDR_TIMEOUT_MS = 1_500;
const HOST_LOAD_ENTRY = `${import.meta.dir}/../../statusline/src/host-load.ts`;
const MetricsSchema = z.object({
  cpu: z.string(),
  ram: z.string(),
  tmp: z.string(),
});

function herdrPane(): string | undefined {
  const socketPath = process.env["HERDR_SOCKET_PATH"];
  const paneId = process.env["HERDR_PANE_ID"];
  if (
    process.env["HERDR_ENV"] !== "1" ||
    socketPath === undefined ||
    socketPath === "" ||
    paneId === undefined ||
    paneId === ""
  )
    return undefined;
  return paneId;
}

async function herdr(args: string[]): Promise<boolean> {
  const bin = Bun.which("herdr");
  if (bin === null) return false;
  const child = Bun.spawn([bin, ...args], {
    env: process.env,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    timeout: HERDR_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  return child.exited.then((code) => code === 0);
}

async function metrics(): Promise<z.output<typeof MetricsSchema> | undefined> {
  const child = Bun.spawn([process.execPath, HOST_LOAD_ENTRY], {
    env: { ...process.env, STATUSLINE_HOST_METRICS: "1" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    timeout: METRICS_TIMEOUT_MS,
    killSignal: "SIGKILL",
  });
  const [output, status] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  if (status !== 0) return undefined;
  const parsed = jsonOf(MetricsSchema).safeParse(output.trim());
  return parsed.success ? parsed.data : undefined;
}

async function gpuLabel(): Promise<string> {
  const state = await readGpuState();
  if (state?.unresponsiveSince !== undefined)
    return `GPU ⚠ stalled since ${Temporal.Instant.fromEpochMilliseconds(
      state.unresponsiveSince,
    )
      .toZonedDateTimeISO(Temporal.Now.timeZoneId())
      .toPlainTime()
      .toString({ smallestUnit: "minute" })}`;
  if (state?.paused === true) {
    const pid = state.holder?.pid;
    return pid === undefined
      ? "GPU n/a(paused job pid unavailable)"
      : `GPU paused (job pid ${pid})`;
  }
  const now = Temporal.Now.instant().epochMilliseconds;
  const failure = gpuStateFailure(state, now);
  if (failure !== undefined)
    return `GPU n/a(${failure.replaceAll(/\s+/gu, " ").slice(0, 120)})`;
  const reading = gpuEstimate(state?.samples ?? [], now);
  if (reading === "unknown") return "GPU n/a(stale (no GPU sample))";
  const used = Number(reading.memUsedGiB.toFixed(1)).toString();
  const total = Number(reading.memTotalGiB.toFixed(1)).toString();
  return `GPU ${used}/${total}G ${Math.round(reading.nowPct)}%`;
}

async function reportMetadata(
  paneId: string,
  stillRunning: () => boolean,
): Promise<void> {
  const [sample, gpu] = await Promise.all([metrics(), gpuLabel()]);
  if (sample === undefined || !stillRunning()) return;
  const summary = `CPU ${sample.cpu} · RAM ${sample.ram} · tmpfs ${sample.tmp} · ${gpu}`;
  await herdr([
    "pane",
    "report-metadata",
    paneId,
    "--source",
    "btm",
    "--agent",
    "btm",
    "--title",
    `btm · ${summary}`,
    "--ttl-ms",
    "10000",
    "--token",
    `btm_summary=${summary}`,
    "--token",
    `cpu=${sample.cpu}`,
    "--token",
    `ram=${sample.ram}`,
    "--token",
    `tmp=${sample.tmp}`,
  ]);
}

type RunState =
  | { kind: "exit"; code: number }
  | { kind: "reported" }
  | { kind: "tick" };

async function monitorBtm(
  paneId: string,
  appExit: Promise<number>,
): Promise<number> {
  let appIsRunning = true;
  const waitForExit = appExit.then((code): RunState => {
    appIsRunning = false;
    return { kind: "exit", code };
  });
  const report = (): Promise<RunState> =>
    reportMetadata(paneId, () => appIsRunning).then(() => ({
      kind: "reported",
    }));
  const reportOrExit = async (): Promise<RunState> => {
    const inFlightReport = report();
    const state = await Promise.race([waitForExit, inFlightReport]);
    if (state.kind === "exit") await inFlightReport;
    return state;
  };

  let state = await reportOrExit();
  while (state.kind === "reported") {
    const next = await Promise.race([
      waitForExit,
      Bun.sleep(REPORT_INTERVAL_MS).then((): RunState => ({ kind: "tick" })),
    ]);
    if (next.kind === "exit") return next.code;
    state = await reportOrExit();
  }
  if (state.kind !== "exit") return 1;
  return state.code;
}

async function runBtm(args: string[]): Promise<number> {
  const bin = Bun.which("btm");
  if (bin === null) {
    process.stderr.write("btmp: btm is not on PATH\n");
    return 127;
  }
  const paneId = herdrPane();
  // execve uses the resolved executable, never the interactive zsh alias.
  if (paneId === undefined && process.execve !== undefined)
    process.execve(bin, [bin, ...args], process.env);
  // bounded: interactive btm owns its lifetime; user exit/signals end monitoring.
  const app = Bun.spawn([bin, ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const appExit = app.exited;
  if (paneId === undefined) return appExit;

  process.on("SIGINT", () => {
    app.kill("SIGINT");
  });
  process.on("SIGTERM", () => {
    app.kill("SIGTERM");
  });
  process.on("SIGHUP", () => {
    app.kill("SIGHUP");
  });

  const registered = await herdr([
    "pane",
    "report-agent",
    paneId,
    "--source",
    "btm",
    "--agent",
    "btm",
    "--state",
    "idle",
    "--",
    "btmp",
    ...args,
  ]);
  if (!registered) return appExit;

  await using _release = {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      await herdr([
        "pane",
        "release-agent",
        paneId,
        "--source",
        "btm",
        "--agent",
        "btm",
      ]);
    },
  };
  const status = await monitorBtm(paneId, appExit);
  await herdr([
    "pane",
    "report-metadata",
    paneId,
    "--source",
    "btm",
    "--agent",
    "btm",
    "--clear-title",
    "--clear-token",
    "btm_summary",
  ]);
  return status;
}

if (import.meta.main) {
  const status = await Promise.try(async () => {
    const args = btmpArgs();
    if (args[0] === "ensure") {
      if (args.length !== 1) {
        process.stderr.write("usage: btmp ensure\n");
        return 2;
      }
      const result = await ensureBtm();
      if (result.isErr()) {
        process.stderr.write(`btmp: ${result.error.message}\n`);
        return 1;
      }
      return 0;
    }
    return runBtm(args);
  }).catch((error: unknown) => {
    process.stderr.write(`btmp: ${String(error)}\n`);
    return 1;
  });
  process.exitCode = status;
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("Error: unknown flag --__proto__\n");
    process.exit(2);
  }
}
