#!/usr/bin/env bun
import { jsonOf, z } from "../../shared/src/zod.ts";

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
  const socketPath = process.env.HERDR_SOCKET_PATH;
  const paneId = process.env.HERDR_PANE_ID;
  if (
    process.env.HERDR_ENV !== "1" ||
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

async function reportMetadata(
  paneId: string,
  stillRunning: () => boolean,
): Promise<void> {
  const sample = await metrics();
  if (sample === undefined || !stillRunning()) return;
  await herdr([
    "pane",
    "report-metadata",
    "--source",
    "btm",
    "--agent",
    "btm",
    paneId,
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

async function runBtm(): Promise<number> {
  const bin = Bun.which("btm") ?? "btm";
  const app = Bun.spawn([bin], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const appExit = app.exited;
  const paneId = herdrPane();
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
    "--source",
    "btm",
    "--agent",
    "btm",
    "--state",
    "idle",
    paneId,
    "--",
    "btm",
  ]);
  if (!registered) return appExit;

  await using _release = {
    [Symbol.asyncDispose]: async (): Promise<void> => {
      await herdr([
        "pane",
        "release-agent",
        "--source",
        "btm",
        "--agent",
        "btm",
        paneId,
      ]);
    },
  };
  const status = await monitorBtm(paneId, appExit);
  return status;
}

if (import.meta.main) {
  const status = await Promise.try(runBtm).catch((error: unknown) => {
    process.stderr.write(`btmp: ${String(error)}\n`);
    return 1;
  });
  process.exitCode = status;
}
