#!/usr/bin/env bun
// Consumer: humans and machine callers. Unbounded action adapters remain unavailable.
import { isAbsolute } from "node:path";
import { join } from "node:path";
import { cli } from "cleye";
import { fromThrowable, jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { ReclaimRecord } from "./records.ts";
import { runProbe } from "./disk-probe.ts";
import { planPaths } from "./disk-path-plan.ts";
import { unavailableRecords } from "./disk-records.ts";
import { movePaths } from "./disk-move.ts";
import { freeMiseConfigs } from "./disk-mise-configs.ts";
import { freeClean } from "./disk-clean.ts";
import { freeToolchains } from "./disk-toolchains.ts";
import { freeBuilds } from "./disk-builds.ts";
import { diskTargetNames } from "./disk-targets/index.ts";
import pkg from "../package.json" with { type: "json" };

const grammar: Record<string, string[]> = {
  plan: [
    "targets [--target TARGET]... [--tier TIER | --all] [--on windows] [--host ALIAS] [--only ABS] [--fetch] [--approve ITEM]... [--within DURATION]",
    "paths ABS... [--within DURATION]",
    "capacity --path ABS --min-available SIZE [--within DURATION]",
    "workspace-gc [--all] [--legacy] [--within DURATION]",
  ],
  move: [
    "paths ABS... [--within DURATION]",
    "workspace-gc [--all] [--legacy] [--within DURATION]",
  ],
  free: [
    "targets (TARGET... | --tier blind) [--only ABS] [--fetch] [--approve ITEM]... [--under-pressure] [--stop-on-error] [--within DURATION]",
    "records [--approve ITEM]... [--within DURATION] < PLAN.jsonl",
    "paths ABS... [--within DURATION]",
    "graveyard --amount SIZE [--within DURATION]",
    "capacity --path ABS --min-available SIZE [--within DURATION]",
  ],
  inspect: [
    "targets [--host ALIAS]",
    "receipts [--last N]",
    "capacity --path ABS [--within DURATION]",
    "wsl [--within DURATION]",
  ],
};
const allowed: Record<string, string[]> = {
  "plan targets": [
    "target",
    "tier",
    "all",
    "on",
    "host",
    "only",
    "fetch",
    "approve",
    "within",
  ],
  "plan paths": ["within"],
  "plan capacity": ["path", "min-available", "within"],
  "plan workspace-gc": ["all", "legacy", "within"],
  "move paths": ["within"],
  "move workspace-gc": ["all", "legacy", "within"],
  "free targets": [
    "tier",
    "only",
    "fetch",
    "approve",
    "under-pressure",
    "stop-on-error",
    "within",
  ],
  "free records": ["approve", "within"],
  "free paths": ["within"],
  "free graveyard": ["amount", "within"],
  "free capacity": ["path", "min-available", "within"],
  "inspect targets": ["host"],
  "inspect receipts": ["last"],
  "inspect capacity": ["path", "within"],
  "inspect wsl": ["within"],
};
const flags = new Set([
  "all",
  "fetch",
  "legacy",
  "under-pressure",
  "stop-on-error",
  "no-progress",
]);
const repeated = new Set(["target", "approve"]);
const tiers = new Set([
  "blind",
  "sudo",
  "owner",
  "irreversible",
  "interactive",
  "plan-only",
]);
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__")
    invalid("unknown option --__proto__");
};
function invalid(message: string): never {
  process.stderr.write(`disk: ${message}\n`);
  process.exit(2);
}
function help(command?: string) {
  if (command === undefined)
    return `Usage: disk <command> <mode> [options]\n\nCommands:\n  plan     Preview (scan cache may be updated)\n  move     Move recoverably\n  free     Delete or discard irreversibly\n  inspect  Read without updating the cache\n\nOptions: --no-progress, -h, --help, -V, --version\n`;
  return `Usage:\n${grammar[command]?.map((line) => `  disk ${command} ${line}`).join("\n")}\n\nOptions: --no-progress, -h, --help, -V, --version\n\nExample: disk ${command} ${command === "inspect" ? "targets" : "paths /example"}\n`;
}
function size(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(KiB|MiB|GiB|TiB|KB|MB|GB|TB)$/u.exec(value);
  if (match === null) invalid("invalid size");
  const factors: Record<string, number> = {
    KiB: 1024,
    MiB: 1024 ** 2,
    GiB: 1024 ** 3,
    TiB: 1024 ** 4,
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4,
  };
  const result = Math.ceil(Number(match[1]) * (factors[match[2] ?? ""] ?? 0));
  if (!Number.isSafeInteger(result) || result <= 0) invalid("invalid size");
  return result;
}
function duration(value: string): number {
  const match = /^(\d+)(ms|s|m|h)$/u.exec(value);
  if (match === null) invalid("invalid duration");
  const factors: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
  };
  const result = Number(match[1]) * (factors[match[2] ?? ""] ?? 0);
  if (!Number.isSafeInteger(result) || result <= 0) invalid("invalid duration");
  return result;
}
function parseOption(
  arg: string,
  args: string[],
  index: number,
  command: string,
  mode: string,
  options: Map<string, string[]>,
): number {
  const eq = arg.indexOf("=");
  let name = "";
  if (arg.startsWith("--")) name = arg.slice(2, eq < 0 ? undefined : eq);
  if (
    !(
      (allowed[`${command} ${mode}`]?.includes(name) ?? false) ||
      name === "no-progress"
    )
  )
    invalid(`unknown option ${arg}`);
  if (options.has(name) && !repeated.has(name))
    invalid(`repeated option --${name}`);
  let value = "true";
  if (flags.has(name)) {
    if (eq >= 0) invalid(`option --${name} takes no value`);
  } else {
    value = eq >= 0 ? arg.slice(eq + 1) : (args[index + 1] ?? "");
    if (value === "" || (eq < 0 && value.startsWith("-")))
      invalid(`missing value for --${name}`);
  }
  const values = options.get(name) ?? [];
  if (values.includes(value)) invalid(`duplicate --${name} value`);
  options.set(name, [...values, value]);
  return flags.has(name) || eq >= 0 ? index : index + 1;
}
function parseOptions(args: string[], command: string, mode: string) {
  const options = new Map<string, string[]>();
  const positional: string[] = [];
  let terminated = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (!terminated && arg === "--") {
      terminated = true;
      continue;
    }
    if (!terminated && (arg === "-h" || arg === "--help")) {
      process.stdout.write(help(command));
      process.exit(0);
    }
    if (!terminated && (arg === "-V" || arg === "--version")) {
      process.stdout.write(`disk ${pkg.version}\n`);
      process.exit(0);
    }
    if (!terminated && arg.startsWith("-")) {
      i = parseOption(arg, args, i, command, mode, options);
    } else positional.push(arg);
  }
  return { options, positional };
}

async function validateRecords(
  deadline: number,
  progress: boolean,
  start: number,
) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const report = () => {
    process.stderr.write(
      `disk: free records waiting for input; elapsed ${Math.floor(performance.now() - start)}ms / deadline ${deadline}ms; last stage: parsing\n`,
    );
  };
  if (progress) report();
  const timer = progress
    ? setInterval(() => {
        report();
      }, 5000)
    : undefined;
  const input = await Promise.race([
    Bun.stdin.text(),
    new Promise<undefined>((resolve) => {
      const schedule = () => {
        const remaining = deadline - (performance.now() - start);
        if (remaining <= 0) resolve(undefined);
        else
          timeout = setTimeout(
            schedule,
            Math.min(Math.ceil(remaining), 2147483647),
          );
      };
      schedule();
    }),
  ]);
  if (timeout !== undefined) clearTimeout(timeout);
  if (timer !== undefined) clearInterval(timer);
  if (input === undefined) {
    process.stdin.destroy();
    return null;
  }
  const lines = input.split(/\r?\n/u).filter((line) => line.trim() !== "");
  if (lines.length === 0) invalid("no input records");
  for (const line of lines) {
    if (!jsonOf(ReclaimRecord).safeParse(line).success)
      invalid("invalid input record");
  }
  return input;
}
async function inspectReceipts(
  last: string,
  deadline: number,
  start: number,
  progress: boolean,
) {
  const elapsed = () => Math.floor(performance.now() - start);
  const report = (stage: string) => {
    if (progress)
      process.stderr.write(
        `disk: inspect receipts ${stage}; elapsed ${elapsed()}ms / deadline ${deadline}ms; last stage: parsing\n`,
      );
  };
  report("reading history");
  const remaining = deadline - elapsed();
  if (remaining <= 0)
    return {
      detail: null,
      error: "deadline expired before receipt inspection",
    };
  const signal = AbortSignal.timeout(Math.min(remaining, 2147483647));
  const spawned = fromThrowable(() =>
    Bun.spawn(
      [
        process.execPath,
        "-e",
        `import { receiptsProbe } from ${JSON.stringify(join(import.meta.dir, "disk-receipts.ts"))}; await receiptsProbe(process.env.DISK_PROBE_LAST);`,
      ],
      {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        signal,
        killSignal: "SIGKILL",
        env: { ...process.env, DISK_PROBE_LAST: last },
      },
    ),
  )();
  if (spawned.isErr())
    return {
      detail: null,
      error: `receipt inspection could not start: ${String(spawned.error)}`,
    };
  const child = spawned.value;
  const timer = setInterval(() => {
    report("waiting for history");
  }, 5000);
  const [out, err, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearInterval(timer);
  if (signal.aborted)
    return { detail: null, error: "receipt inspection deadline exceeded" };
  if (exit !== 0)
    return { detail: null, error: `receipt inspection failed: ${err.trim()}` };
  const parsed = jsonOf(
    z.object({ receipts: z.array(z.unknown()), errors: z.array(z.string()) }),
  ).safeParse(out);
  if (!parsed.success)
    return { detail: null, error: "invalid receipt inspection result" };
  if (parsed.data.errors.length > 0)
    return { detail: parsed.data, error: parsed.data.errors.join("; ") };
  report("completed history");
  return { detail: parsed.data, error: null };
}
async function measureCapacity(
  path: string,
  deadline: number,
  start: number,
  progress: boolean,
) {
  const remaining = deadline - Math.floor(performance.now() - start);
  if (remaining <= 0)
    return {
      measurement: null,
      error: "deadline expired before capacity measurement",
    };
  if (progress)
    process.stderr.write(
      `disk: measuring ${path}; elapsed ${Math.floor(performance.now() - start)}ms / deadline ${deadline}ms; last stage: parsing\n`,
    );
  const timer = progress
    ? setInterval(() => {
        process.stderr.write(
          `disk: measuring ${path}; elapsed ${Math.floor(performance.now() - start)}ms / deadline ${deadline}ms; last stage: measuring\n`,
        );
      }, 5000)
    : undefined;
  const { out, err, exit, timedOut } = await runProbe(
    [
      process.execPath,
      "-e",
      `import { capacityProbe } from ${JSON.stringify(join(import.meta.dir, "disk-capacity.ts"))}; await capacityProbe(process.env.DISK_PROBE_PATH);`,
    ],
    remaining,
    { ...process.env, DISK_PROBE_PATH: path },
  );
  if (timer !== undefined) clearInterval(timer);
  if (timedOut)
    return {
      measurement: null,
      error: "capacity measurement deadline exceeded",
    };
  if (exit !== 0)
    return {
      measurement: null,
      error: `capacity measurement failed: ${err.trim()}`,
    };
  const parsed = jsonOf(
    z.object({
      free: z.number().nonnegative(),
      total: z.number().nonnegative(),
      free_inodes: z.number().nonnegative().nullable(),
      assessment: z.unknown(),
      config_errors: z.array(z.string()),
    }),
  ).safeParse(out);
  if (!parsed.success)
    return { measurement: null, error: "capacity measurement unavailable" };
  return { measurement: parsed.data, error: null };
}
export async function main(
  argv = process.argv.slice(2),
  toolchainsDeps?: Parameters<typeof freeToolchains>[3],
  output: (text: string) => void = (text) => {
    process.stdout.write(text);
  },
  buildsDependencies?: Parameters<typeof freeBuilds>[3],
) {
  const start = performance.now();
  const started = Temporal.Now.instant().toString();
  const args = [...argv];
  if (
    args.length === 0 ||
    (args.length === 1 && (args[0] === "--help" || args[0] === "-h"))
  ) {
    process.stdout.write(help());
    return;
  }
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-V")) {
    process.stdout.write(`disk ${pkg.version}\n`);
    return;
  }
  const command = args.shift();
  if (command === undefined || !Object.hasOwn(grammar, command))
    invalid("unknown command");
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) {
    process.stdout.write(help(command));
    return;
  }
  if (args.length === 1 && (args[0] === "--version" || args[0] === "-V")) {
    process.stdout.write(`disk ${pkg.version}\n`);
    return;
  }
  const mode = args.shift();
  if (mode === undefined || !Object.hasOwn(allowed, `${command} ${mode}`))
    invalid("unknown or missing mode");
  const { options } = parseOptions(args, command, mode);
  // Preflight retains the frozen diagnostics and rejects duplicate options;
  // Cleye provides the strict argv boundary and the positional values.
  const parsed = cli(
    {
      name: "disk",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      help: false,
      parameters: ["[args...]"],
      flags: {
        target: [String],
        tier: String,
        all: Boolean,
        on: String,
        host: String,
        only: String,
        fetch: Boolean,
        approve: [String],
        within: String,
        legacy: Boolean,
        path: String,
        minAvailable: String,
        amount: String,
        underPressure: Boolean,
        stopOnError: Boolean,
        noProgress: Boolean,
        last: String,
      },
    },
    undefined,
    [command, mode, ...args],
  );
  const positional = parsed._.slice(2);
  const get = (name: string) => options.get(name)?.[0];
  const key = `${command} ${mode}`;
  if (mode === "paths") {
    if (positional.length === 0 || positional.some((p) => !isAbsolute(p)))
      invalid("paths must be absolute");
  } else if (key === "free targets") {
    if (
      (positional.length === 0 && get("tier") !== "blind") ||
      (positional.length > 0 && options.has("tier"))
    )
      invalid("select targets or --tier blind");
  } else if (positional.length > 0) invalid("unexpected positional argument");
  const targets =
    key === "free targets" ? positional : (options.get("target") ?? []);
  if (
    targets.some((target) => !diskTargetNames.has(target)) ||
    new Set(targets).size !== targets.length
  )
    invalid("invalid or duplicate target");
  if (
    get("tier") !== undefined &&
    (!tiers.has(get("tier") ?? "") ||
      (key === "free targets" && get("tier") !== "blind"))
  )
    invalid("invalid tier");
  if (
    key === "plan targets" &&
    [options.has("target"), options.has("tier"), options.has("all")].filter(
      Boolean,
    ).length > 1
  )
    invalid("conflicting selectors");
  if (get("on") !== undefined && get("on") !== "windows")
    invalid("invalid host platform");
  if (
    get("only") !== undefined &&
    (!isAbsolute(get("only") ?? "") ||
      targets.length === 0 ||
      targets.some((t) => !["tmpfs", "purge", "rip-expire"].includes(t)))
  )
    invalid("--only requires explicit supported targets and an absolute path");
  if (
    options.has("under-pressure") &&
    (targets.length !== 1 || targets[0] !== "purge")
  )
    invalid("--under-pressure requires purge");
  if (
    mode === "capacity" &&
    (get("path") === undefined || !isAbsolute(get("path") ?? ""))
  )
    invalid("--path must be absolute");
  if (
    (key === "plan capacity" || key === "free capacity") &&
    get("min-available") === undefined
  )
    invalid("missing --min-available");
  if (key === "free graveyard" && get("amount") === undefined)
    invalid("missing --amount");
  const amount =
    get("amount") === undefined ? undefined : size(get("amount") ?? "");
  const minimum =
    get("min-available") === undefined
      ? undefined
      : size(get("min-available") ?? "");
  const deadline =
    get("within") === undefined ? 120000 : duration(get("within") ?? "");
  if (
    get("last") !== undefined &&
    (!/^\d+$/u.test(get("last") ?? "") ||
      !Number.isSafeInteger(Number(get("last"))))
  )
    invalid("invalid --last");
  const recordsInput =
    key === "free records"
      ? await validateRecords(deadline, !options.has("no-progress"), start)
      : null;
  const scope = {
    path: get("path") ?? get("only") ?? null,
    paths: mode === "paths" ? positional : [],
    targets,
    host: get("host") ?? (get("on") === "windows" ? "windows" : "local"),
    filesystem: null,
  };
  let goal = null;
  if (minimum !== undefined)
    goal = { kind: "min_available_bytes", value: minimum };
  else if (amount !== undefined)
    goal = { kind: "available_delta_bytes", value: amount };
  if (key === "plan paths") {
    const controller = new AbortController();
    let cancelled = 0;
    const interrupt = () => {
      cancelled = 130;
      controller.abort();
    };
    const terminate = () => {
      cancelled = 143;
      controller.abort();
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    const report = () => {
      if (!options.has("no-progress"))
        process.stderr.write(
          `disk: plan paths checking ${positional.join(", ")}; elapsed ${Math.floor(performance.now() - start)}ms / deadline ${deadline}ms; last stage: checking\n`,
        );
    };
    report();
    const timer = setInterval(report, 5000);
    const remaining = Math.max(
      1,
      deadline - Math.floor(performance.now() - start),
    );
    const result = await planPaths(positional, remaining, controller.signal);
    clearInterval(timer);
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    const unknown = result.items.filter(
      (item) => item.verdict === "unknown",
    ).length;
    let outcome = "completed";
    if (result.error !== null || unknown > 0) outcome = "unknown";
    if (cancelled !== 0) outcome = "cancelled";
    if (result.error !== null) process.stderr.write(`disk: ${result.error}\n`);
    process.stdout.write(
      `${JSON.stringify({ schema: "disk.result/1", command, mode, outcome, started_at: started, finished_at: Temporal.Now.instant().toString(), deadline_ms: deadline, scope, goal, observations: { before: null, after: null, delta_available_bytes: null, unlinked_logical_bytes: 0, allocated_estimate_bytes: null, moved_logical_bytes: 0 }, items: result.items, counts: { selected: result.items.length, completed: 0, refused: result.items.filter((item) => item.verdict === "keep").length, failed: 0, unknown }, errors: result.error === null ? [] : [{ code: "path_plan_unknown", message: result.error, scope }], receipt: null })}\n`,
    );
    process.exitCode = outcome === "unknown" ? 4 : 0;
    if (cancelled !== 0) process.exitCode = cancelled;
    return;
  }
  if (key === "inspect receipts") {
    const { detail, error } = await inspectReceipts(
      get("last") ?? "10",
      deadline,
      start,
      !options.has("no-progress"),
    );
    if (error !== null) process.stderr.write(`disk: ${error}\n`);
    process.stdout.write(
      `${JSON.stringify({ schema: "disk.result/1", command, mode, outcome: error === null ? "completed" : "unknown", started_at: started, finished_at: Temporal.Now.instant().toString(), deadline_ms: deadline, scope, goal, observations: { before: null, after: null, delta_available_bytes: null, unlinked_logical_bytes: 0, allocated_estimate_bytes: null, moved_logical_bytes: 0 }, items: [], counts: { selected: 0, completed: 0, refused: 0, failed: 0, unknown: 0 }, errors: error === null ? [] : [{ code: "receipt_unknown", message: error, scope }], receipt: null, detail })}\n`,
    );
    process.exitCode = error === null ? 0 : 4;
    return;
  }
  if (key === "plan capacity" || key === "inspect capacity") {
    const { measurement, error } = await measureCapacity(
      get("path") ?? "",
      deadline,
      start,
      !options.has("no-progress"),
    );
    let before = null;
    if (measurement !== null)
      before = {
        time: Temporal.Now.instant().toString(),
        source: "statfs",
        mount: null,
        filesystem: null,
        available_bytes: measurement.free,
        free_inodes: measurement.free_inodes,
        error:
          measurement.free_inodes === null
            ? "inode measurement unavailable"
            : null,
      };
    let issue = error;
    if (issue === null && key === "plan capacity")
      issue = "recovery candidate planning is unavailable";
    if (
      issue === null &&
      measurement !== null &&
      measurement.config_errors.length > 0
    )
      issue = measurement.config_errors.join("; ");
    if (issue === null && measurement?.free_inodes === null)
      issue = "inode measurement unavailable";
    if (issue !== null) process.stderr.write(`disk: ${issue}\n`);
    process.stdout.write(
      `${JSON.stringify({ schema: "disk.result/1", command, mode, outcome: issue === null ? "completed" : "unknown", started_at: started, finished_at: Temporal.Now.instant().toString(), deadline_ms: deadline, scope, goal, observations: { before, after: null, delta_available_bytes: null, unlinked_logical_bytes: 0, allocated_estimate_bytes: null, moved_logical_bytes: 0 }, items: [], counts: { selected: 0, completed: 0, refused: 0, failed: 0, unknown: 0 }, errors: issue === null ? [] : [{ code: "capacity_unknown", message: issue, scope }], receipt: null, detail: measurement === null ? null : { total_bytes: measurement.total, assessment: measurement.assessment } })}\n`,
    );
    process.exitCode = issue === null ? 0 : 4;
    return;
  }
  if (key === "free records" && recordsInput !== null) {
    const items = unavailableRecords(
      recordsInput,
      options.get("approve") ?? [],
    );
    const unknown = items.filter((item) => item.verdict === "unknown").length;
    const refused = items.length - unknown;
    const outcome = "unknown";
    const message =
      "bounded records adapter unavailable; no operation was attempted";
    process.stderr.write(`disk: ${message}\n`);
    process.stdout.write(
      `${JSON.stringify({ schema: "disk.result/1", command, mode, outcome, started_at: started, finished_at: Temporal.Now.instant().toString(), deadline_ms: deadline, scope, goal, observations: { before: null, after: null, delta_available_bytes: null, unlinked_logical_bytes: 0, allocated_estimate_bytes: null, moved_logical_bytes: 0 }, items, counts: { selected: items.length, completed: 0, refused, failed: 0, unknown }, errors: [{ code: "adapter_unavailable", message, scope }], receipt: null })}\n`,
    );
    process.exitCode = 4;
    return;
  }
  if (
    key === "free targets" &&
    targets.length === 1 &&
    targets[0] === "toolchains"
  ) {
    const controller = new AbortController();
    let cancelled = 0;
    const interrupt = () => {
      cancelled = 130;
      controller.abort();
    };
    const terminate = () => {
      cancelled = 143;
      controller.abort();
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    const result = await freeToolchains(
      deadline,
      start,
      !options.has("no-progress"),
      toolchainsDeps,
      controller.signal,
      options.has("stop-on-error"),
    );
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    const { items, before, after, receipt, exit } = result;
    const counts = {
      selected: items.length,
      completed: items.filter((item) => item.verdict === "completed").length,
      refused: items.filter((item) =>
        ["deny", "changed", "ask", "keep"].includes(item.verdict),
      ).length,
      failed: items.filter((item) => item.verdict === "failed").length,
      unknown: items.filter((item) => item.verdict === "unknown").length,
    };
    let outcome = "partial";
    if (exit === 0) outcome = "completed";
    if (exit === 3) outcome = "busy";
    if (exit === 4) outcome = "unknown";
    if (cancelled !== 0) outcome = "cancelled";
    output(
      `${JSON.stringify({ schema: "disk.result/1", command, mode, outcome, started_at: started, finished_at: Temporal.Now.instant().toString(), deadline_ms: deadline, scope, goal, observations: { before, after, delta_available_bytes: before === null || after === null ? null : after.available_bytes - before.available_bytes, unlinked_logical_bytes: 0, allocated_estimate_bytes: null, moved_logical_bytes: 0 }, items, counts, errors: [], receipt })}\n`,
    );
    process.exitCode = cancelled === 0 ? exit : cancelled;
    return;
  }
  if (
    key === "free targets" &&
    targets.some((target) => target === "vhdx" || target === "audit")
  ) {
    const items = targets.map((target) => {
      const planOnly = target === "vhdx" || target === "audit";
      return {
        id: target,
        target,
        path: null,
        verdict: planOnly ? "deny" : "unknown",
        reason: planOnly
          ? `${target} is plan-only`
          : "target adapter unavailable",
        fingerprint: null,
        effect: "none",
        logical_bytes: null,
        allocated_bytes: null,
        eligible_at: null,
        error: null,
      };
    });
    const unknown = items.filter((item) => item.verdict === "unknown").length;
    const refused = items.length - unknown;
    const outcome = unknown > 0 ? "unknown" : "partial";
    process.stderr.write(
      "disk: plan-only targets cannot be freed; no operation was attempted\n",
    );
    process.stdout.write(
      `${JSON.stringify({ schema: "disk.result/1", command, mode, outcome, started_at: started, finished_at: Temporal.Now.instant().toString(), deadline_ms: deadline, scope, goal, observations: { before: null, after: null, delta_available_bytes: null, unlinked_logical_bytes: 0, allocated_estimate_bytes: null, moved_logical_bytes: 0 }, items, counts: { selected: items.length, completed: 0, refused, failed: 0, unknown }, errors: [], receipt: null })}\n`,
    );
    process.exitCode = unknown > 0 ? 4 : 1;
    return;
  }
  if (
    key === "free targets" &&
    targets.length === 1 &&
    (targets[0] === "clean" ||
      targets[0] === "rust" ||
      targets[0] === "builds" ||
      targets[0] === "tmpfs")
  ) {
    const controller = new AbortController();
    let cancelled = 0;
    const interrupt = () => {
      cancelled = 130;
      controller.abort();
    };
    const terminate = () => {
      cancelled = 143;
      controller.abort();
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    let actingTarget: "clean" | "rust" | "tmpfs" = "clean";
    if (targets[0] === "rust") actingTarget = "rust";
    if (targets[0] === "tmpfs") actingTarget = "tmpfs";
    const result =
      targets[0] === "builds"
        ? await freeBuilds(
            deadline,
            start,
            !options.has("no-progress"),
            buildsDependencies,
            controller.signal,
            options.has("stop-on-error"),
          )
        : await freeClean(
            deadline,
            start,
            !options.has("no-progress"),
            undefined,
            controller.signal,
            options.has("stop-on-error"),
            actingTarget,
            get("only"),
          );
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    const counts = {
      selected: result.items.length,
      completed: result.items.filter((i) => i.verdict === "completed").length,
      refused: result.items.filter((i) =>
        ["keep", "ask", "deny", "changed"].includes(i.verdict),
      ).length,
      failed: result.items.filter((i) =>
        ["failed", "partial"].includes(i.verdict),
      ).length,
      unknown: result.items.filter((i) => i.verdict === "unknown").length,
    };
    let outcome = "partial";
    if (result.exit === 0) outcome = "completed";
    else if (result.exit === 3) outcome = "busy";
    else if (result.exit === 4) outcome = "unknown";
    if (cancelled !== 0) outcome = "cancelled";
    process.stdout.write(
      `${JSON.stringify({ schema: "disk.result/1", command, mode, outcome, started_at: started, finished_at: Temporal.Now.instant().toString(), deadline_ms: deadline, scope, goal, observations: { before: null, after: null, delta_available_bytes: null, unlinked_logical_bytes: 0, allocated_estimate_bytes: null, moved_logical_bytes: 0 }, items: result.items, counts, errors: result.error === null ? [] : [{ code: "target_error", message: result.error, scope }], receipt: result.receipt })}\n`,
    );
    process.exitCode = cancelled === 0 ? result.exit : cancelled;
    return;
  }
  if (
    key === "free targets" &&
    targets.length === 1 &&
    targets[0] === "mise-configs"
  ) {
    const controller = new AbortController();
    let cancelled = 0;
    const interrupt = () => {
      cancelled = 130;
      controller.abort();
    };
    const terminate = () => {
      cancelled = 143;
      controller.abort();
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    const result = await freeMiseConfigs(
      deadline,
      start,
      !options.has("no-progress"),
      undefined,
      controller.signal,
    );
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    const { item, before, after, receipt, exit } = result;
    let outcome = "partial";
    if (exit === 0) outcome = "completed";
    else if (exit === 3) outcome = "busy";
    else if (exit === 4) outcome = "unknown";
    if (cancelled !== 0) outcome = "cancelled";
    const counts = {
      selected: 1,
      completed: item.verdict === "completed" ? 1 : 0,
      refused: ["deny", "changed", "ask", "keep"].includes(item.verdict)
        ? 1
        : 0,
      failed: item.verdict === "failed" ? 1 : 0,
      unknown: item.verdict === "unknown" ? 1 : 0,
    };
    process.stdout.write(
      `${JSON.stringify({ schema: "disk.result/1", command, mode, outcome, started_at: started, finished_at: Temporal.Now.instant().toString(), deadline_ms: deadline, scope, goal, observations: { before, after, delta_available_bytes: before === null || after === null ? null : after.available_bytes - before.available_bytes, unlinked_logical_bytes: 0, allocated_estimate_bytes: null, moved_logical_bytes: 0 }, items: [item], counts, errors: [], receipt })}\n`,
    );
    process.exitCode = cancelled === 0 ? exit : cancelled;
    return;
  }
  if (key === "move paths") {
    const { items, graveyard, receipt, busy } = await movePaths(
      positional,
      deadline,
      start,
      !options.has("no-progress"),
    );
    const counts = {
      selected: items.length,
      completed: items.filter((i) => i.verdict === "completed").length,
      refused: items.filter(
        (i) => i.verdict === "deny" || i.verdict === "changed",
      ).length,
      failed: 0,
      unknown: items.filter((i) => i.verdict === "unknown").length,
    };
    let outcome = "completed";
    if (counts.refused > 0) outcome = "partial";
    if (counts.unknown > 0) outcome = "unknown";
    if (busy) outcome = "busy";
    process.stderr.write(
      "disk: burial does not free capacity on the same filesystem\n",
    );
    process.stdout.write(
      `${JSON.stringify({ schema: "disk.result/1", command, mode, outcome, started_at: started, finished_at: Temporal.Now.instant().toString(), deadline_ms: deadline, scope: { ...scope, destination: graveyard }, goal, observations: { before: null, after: null, delta_available_bytes: null, unlinked_logical_bytes: 0, allocated_estimate_bytes: null, moved_logical_bytes: 0 }, items, counts, errors: [], receipt, detail: { capacity: "same-filesystem burial does not free capacity" } })}\n`,
    );
    process.exitCode = 0;
    if (counts.refused > 0) process.exitCode = 1;
    if (counts.unknown > 0) process.exitCode = 4;
    if (busy) process.exitCode = 3;
    return;
  }
  const message =
    command === "plan"
      ? "unsupported until cache-only path is verified; no operation was attempted"
      : "adapter unavailable; no operation was attempted";
  process.stderr.write(`disk: ${message}\n`);
  process.stdout.write(
    `${JSON.stringify({ schema: "disk.result/1", command, mode, outcome: "unknown", started_at: started, finished_at: Temporal.Now.instant().toString(), deadline_ms: deadline, scope, goal, observations: { before: null, after: null, delta_available_bytes: null, unlinked_logical_bytes: 0, allocated_estimate_bytes: null, moved_logical_bytes: 0 }, items: [], counts: { selected: 0, completed: 0, refused: 0, failed: 0, unknown: 0 }, errors: [{ code: "adapter_unavailable", message, scope }], receipt: null })}\n`,
  );
  process.exitCode = 4;
  if (key === "free records" && recordsInput === null) process.exit(4);
}
if (import.meta.main) await main();
