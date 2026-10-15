#!/usr/bin/env bun
// Consumer: humans (tables) and machine callers (one JSON document).
import { cli, command } from "cleye";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { fromAsyncThrowable } from "neverthrow";
import { z } from "../../shared/src/zod.ts";
import {
  actPlannedPath,
  loadConfig,
  plan,
  run,
  type EngineOptions,
} from "./engine.ts";
import { Plan, Tier } from "./model.ts";
import {
  errorMessage,
  readReceipts,
  freeBytes,
  stateDir,
  waitForLock,
  writeItemOutcomes,
  wrap,
} from "./receipt.ts";
import { deleteApproved } from "./delete.ts";
import { ProgressReporter } from "./lib/progress.ts";
import { readHeadroom } from "./storage.ts";
import { registry, type Context, type Target } from "./targets/index.ts";
import { typedYes } from "./targets/purge.ts";
import { workerMutationRefusal } from "./lib/worker-guard.ts";
import {
  sampleWslReturn,
  trimWslGuest,
  wslStorageSnapshot,
  wslReturnReport,
} from "./host-return.ts";
import { cachePlanReport } from "./report.ts";
import {
  applyRecords,
  recordsFromPlan,
  type ReclaimRecord,
} from "./records.ts";
import {
  resolveProcRoot,
  processDecisionText,
  summarizeProcessFailures,
} from "./lib/procs.ts";

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("disk-reclaim: unknown flag --__proto__\n");
    process.exit(2);
  }
};
const flags = {
  on: { type: String, description: "Target host, such as windows" },
  target: {
    type: [String] satisfies [StringConstructor],
    description: "Select a target (repeatable)",
  },
  host: { type: String, description: "Windows host SSH alias (default r99)" },
  approve: {
    type: [String] satisfies [StringConstructor],
    description: "Explicit owner-item approval (repeatable)",
  },
  json: {
    type: Boolean,
    default: false,
    description: "Write exactly one JSON document",
  },
  tier: { type: String, description: "Select a decision tier" },
  all: {
    type: Boolean,
    default: false,
    description: "Plan all registered targets",
  },
  yes: {
    type: Boolean,
    default: false,
    description:
      "Authorize run; exit 1 if any target fails (2 for invocation errors)",
  },
  underPressure: {
    type: Boolean,
    default: false,
    description:
      "Allow recent graveyard entries past the 10-minute undo window when the host is below deny",
  },
  noProgress: {
    type: Boolean,
    default: false,
    description: "Disable stderr progress",
  },
  verbose: {
    type: Boolean,
    default: false,
    description: "Include per-process probe details",
  },
  fetch: {
    type: Boolean,
    default: false,
    description: "Fetch jj Git remotes before judging workspaces (opt-in)",
  },
  stopOnError: {
    type: Boolean,
    default: false,
    description: "Stop this target after its first candidate failure",
  },
  interactive: {
    type: Boolean,
    default: false,
    description: "Keep the terminal for wrap",
  },
  last: { type: Number, default: 10, description: "Number of latest receipts" },
};
const usageExit = (code: number) => {
  if (code === 1) process.exitCode = 2;
};
const common = { strictFlags: true, ignoreArgv: rejectPrototypeFlag };
const planFlags = {
  on: flags.on,
  target: flags.target,
  host: flags.host,
  approve: flags.approve,
  json: flags.json,
  tier: flags.tier,
  all: flags.all,
  fetch: flags.fetch,
  noProgress: flags.noProgress,
  verbose: flags.verbose,
  yes: flags.yes,
};
const parsedFlags = z.object({
  on: z.string().optional(),
  target: z.array(z.string()).default([]),
  host: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u)
    .optional(),
  approve: z.array(z.string().min(1)).default([]),
  json: z.boolean().default(false),
  tier: z.string().optional(),
  all: z.boolean().default(false),
  yes: z.boolean().default(false),
  underPressure: z.boolean().default(false),
  noProgress: z.boolean().default(false),
  verbose: z.boolean().default(false),
  fetch: z.boolean().default(false),
  stopOnError: z.boolean().default(false),
  interactive: z.boolean().default(false),
  last: z.number().default(10),
});
const commands = [
  command({
    ...common,
    name: "plan",
    parameters: ["[targets...]"],
    flags: planFlags,
  }),
  command({
    ...common,
    name: "run",
    parameters: ["[targets...]"],
    flags: {
      host: flags.host,
      approve: flags.approve,
      json: flags.json,
      tier: flags.tier,
      yes: flags.yes,
      underPressure: flags.underPressure,
      noProgress: flags.noProgress,
      verbose: flags.verbose,
      interactive: flags.interactive,
      stopOnError: flags.stopOnError,
      fetch: flags.fetch,
    },
  }),
  command({
    ...common,
    name: "apply",
    parameters: [],
    flags: { approve: flags.approve, noProgress: flags.noProgress },
  }),
  command({
    ...common,
    name: "targets",
    parameters: [],
    flags: { json: flags.json },
  }),
  command({
    ...common,
    name: "delete",
    parameters: ["<paths...>"],
    flags: {
      json: flags.json,
      yes: flags.yes,
      verbose: flags.verbose,
      noProgress: flags.noProgress,
    },
  }),
  command({
    ...common,
    name: "receipts",
    parameters: [],
    flags: { json: flags.json, last: flags.last },
  }),
  command({
    ...common,
    name: "wrap",
    parameters: ["<name>", "--", "<command...>"],
    flags: { interactive: flags.interactive },
  }),
];
const print = (value: unknown, human: string, json: boolean): void => {
  process.stdout.write(`${json ? JSON.stringify(value) : human}\n`);
};
const fail = (message: string): number => {
  process.stderr.write(`disk-reclaim: ${safeStderr(message)}\n`);
  return 2;
};
const safeStderr = (message: string) =>
  message
    .split("")
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || (code >= 127 && code <= 159) ? " " : character;
    })
    .join("");

function watchProgress(reporter: ProgressReporter): () => void {
  const restore = () => {
    reporter.finish();
  };
  const interrupt = () => {
    restore();
    process.exit(130);
  };
  const terminate = () => {
    restore();
    process.exit(143);
  };
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  process.once("exit", restore);
  return () => {
    restore();
    process.removeListener("SIGINT", interrupt);
    process.removeListener("SIGTERM", terminate);
    process.removeListener("exit", restore);
  };
}

const progressIsTty = (json: boolean) =>
  !json &&
  (process.env.CI ?? "") === "" &&
  process.env.TERM !== "dumb" &&
  process.stdout.isTTY &&
  process.stderr.isTTY;

function planTable(value: Plan): string {
  const lines = [
    "TARGET\tTIER\tVERDICT\tPATH\tBYTES\tLIVE-SAFE\tAPPROVAL\tC: DELTA\tREASON",
  ];
  for (const target of value.targets) {
    if (target.exit === 1 || !target.available)
      process.stderr.write(
        `disk-reclaim: ${target.exit === 1 ? "FAILED" : "SKIP"} ${target.name}: ${target.skip_reason ?? "unavailable"}\n`,
      );
    lines.push(
      ...target.candidates.map(
        (c) =>
          `${target.name}\t${c.host_lever?.tier ?? target.tier}\t${c.verdict}\t${c.host_lever?.path ?? c.path ?? "-"}\t${c.bytes ?? "-"}\t${c.host_lever?.live_safe ?? "-"}\t${c.host_lever?.approval ?? "-"}\t${c.result?.c_free_delta ?? "-"}\t${processDecisionText(c.reason)}`,
      ),
    );
  }
  lines.push("", "SUMMARY\tCANDIDATES\tFOUND BYTES\tFREED BYTES\tEXIT");
  for (const target of value.targets)
    lines.push(
      `${target.name}\t${target.candidates.length}\t${target.candidates.reduce((sum, c) => sum + (c.bytes ?? 0), 0)}\t${target.candidates.reduce((sum, c) => sum + (c.result?.bytes_freed ?? 0), 0)}\t${target.exit ?? "preview"}`,
    );
  return lines.join("\n");
}

function completedDeletionPaths(value: Plan): string[] {
  return value.targets.flatMap((target) =>
    target.candidates.flatMap((candidate) =>
      candidate.path !== null && candidate.result?.ok === true
        ? [candidate.path]
        : [],
    ),
  );
}

function reportProcessDiagnostics(
  value: Plan,
  details: Set<string>,
  verbose: boolean,
): void {
  const texts = value.targets.flatMap((target) =>
    target.candidates.flatMap((candidate) => [
      candidate.reason,
      ...candidate.checks.map((check) => check.detail),
    ]),
  );
  const fragments = texts
    .join("; ")
    .split("; ")
    .filter(
      (detail) => detail.includes("pid ") && /\b(EACCES|EPERM)\b/u.test(detail),
    );
  for (const detail of fragments)
    details.add(detail.slice(detail.indexOf("pid ")));
  const held = value.targets
    .filter((target) =>
      target.candidates.some(
        (candidate) =>
          candidate.verdict === "ASK" &&
          /process|open-path|environ/iu.test(candidate.reason),
      ),
    )
    .map((target) => target.name);
  const effect =
    held.length === 0
      ? "no targets held back by unreadable process evidence"
      : `ASK targets: ${held.join(", ")}; see candidate reasons`;
  writeProcessDiagnostics(details, verbose, effect);
}

function writeProcessDiagnostics(
  details: Set<string>,
  verbose: boolean,
  effect: string,
): void {
  for (const summary of summarizeProcessFailures([...details]))
    process.stderr.write(`${safeStderr(`${summary}; ${effect}`)}\n`);
  if (verbose)
    for (const detail of details)
      process.stderr.write(`${safeStderr(detail)}\n`);
}

async function applyInput(
  input: string,
  approve: string[],
  targets: Target[],
  context: Context,
  captureLiveness?: EngineOptions["captureLiveness"],
  json = false,
  targetFailures: { target: string; reason: string }[] = [],
): Promise<number> {
  const freeBefore = freeBytes();
  const lock = await waitForLock("apply", stateDir(), context.log);
  if (lock.release === null)
    return fail(lock.error ?? "could not acquire apply lock");
  using _lock = { [Symbol.dispose]: lock.release };
  const wslBefore = await wslStorageSnapshot();
  const applyOne = async (record: ReclaimRecord) => {
    const target = targets.find((item) => item.name === record.target);
    if (target === undefined)
      return { ok: false, reason: "unknown target", bytes_freed: null };
    const actionResult = await actPlannedPath(
      target,
      record.path,
      { ...context, approve },
      captureLiveness,
    );
    return {
      ok: actionResult.ok,
      reason: actionResult.error ?? "applied",
      bytes_freed: actionResult.bytes_freed,
    };
  };
  const results = await applyRecords(input, { approve, apply: applyOne });
  let cDelta: number | null = null;
  let trimError: string | null = null;
  if (wslBefore !== null) {
    const trim = await trimWslGuest();
    if (!trim.ok) trimError = `WSL target fstrim failed: ${trim.detail}`;
    else {
      const wslAfter = await sampleWslReturn(wslBefore);
      cDelta = wslAfter.hostCFree - wslBefore.hostCFree;
    }
  }
  writeItemOutcomes(results, stateDir());
  if (json) {
    process.stdout.write(
      `${results.map((item) => JSON.stringify(item)).join("\n")}${results.length === 0 ? "" : "\n"}`,
    );
  } else {
    process.stdout.write(
      `${formatApplySummary(results, freeBytes() - freeBefore, cDelta, trimError, targetFailures)}\n`,
    );
  }
  if (trimError !== null) return fail(trimError);
  return results.some((item) => item.outcome === "failed") ||
    targetFailures.length > 0
    ? 1
    : 0;
}

const oneLine = (text: string, max = 180): string => {
  const line = safeStderr(text).replaceAll(/\s+/gu, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
};
const signedBytes = (bytes: number): string =>
  `${bytes >= 0 ? "+" : ""}${bytes}`;
function formatApplySummary(
  results: Awaited<ReturnType<typeof applyRecords>>,
  freedBytes: number,
  cDelta: number | null,
  trimError: string | null,
  targetFailures: { target: string; reason: string }[],
): string {
  const targets = new Map<
    string,
    { deleted: number; skipped: number; failed: number }
  >();
  for (const item of results) {
    const name = item.target ?? "unknown";
    const counts = targets.get(name) ?? { deleted: 0, skipped: 0, failed: 0 };
    counts[item.outcome] += 1;
    targets.set(name, counts);
  }
  for (const failure of targetFailures) {
    const counts = targets.get(failure.target) ?? {
      deleted: 0,
      skipped: 0,
      failed: 0,
    };
    counts.failed += 1;
    targets.set(failure.target, counts);
  }
  const failures = results.filter((item) => item.outcome === "failed");
  const cDeltaText =
    cDelta === null ? "not measured (not WSL)" : `${signedBytes(cDelta)} bytes`;
  const failureLines = failures
    .slice(0, 10)
    .map(
      (item) =>
        `  ${oneLine(item.path ?? "<invalid record>")}: ${oneLine(item.reason)}`,
    );
  if (failures.length > 10)
    failureLines.push(`  … ${failures.length - 10} more failed items`);
  return [
    "disk-reclaim: --yes complete",
    `Freed bytes: ${results.reduce((sum, item) => sum + (item.bytes_freed ?? 0), 0)} (filesystem delta ${freedBytes >= 0 ? "+" : ""}${freedBytes})`,
    `Windows C: delta after fstrim: ${cDeltaText}`,
    "Outcomes by target:",
    ...[...targets].map(
      ([target, counts]) =>
        `  ${target}: deleted ${counts.deleted}, skipped ${counts.skipped}, failed ${counts.failed}`,
    ),
    ...(failures.length === 0 ? [] : ["Failed items:", ...failureLines]),
    ...targetFailures.map(
      (failure) => `  ${oneLine(failure.target)}: ${oneLine(failure.reason)}`,
    ),
    ...(trimError === null ? [] : [`fstrim: ${oneLine(trimError)}`]),
  ].join("\n");
}

function outputPlan(
  value: Plan,
  records: ReclaimRecord[],
  mode: "json" | "jsonl" | "human",
): void {
  if (mode === "json") {
    print(value, planTable(value), true);
    return;
  }
  if (mode === "jsonl") {
    for (const target of value.targets.filter((row) => row.exit === 1))
      process.stderr.write(
        `disk-reclaim: FAILED ${target.name}: ${safeStderr(target.skip_reason ?? "target failed")}\n`,
      );
    process.stdout.write(
      `${records.map((record) => JSON.stringify(record)).join("\n")}${records.length === 0 ? "" : "\n"}`,
    );
    return;
  }
  print(value, planTable(value), false);
}

export async function main(
  argv = Bun.argv.slice(2),
  targets: Target[] = registry,
  dependencies: Pick<EngineOptions, "captureLiveness"> = {},
): Promise<number> {
  // Cleye exits 1 for parser errors; reclaim reserves 1 for partial action failure.

  process.on("exit", usageExit);
  const parsed = cli(
    {
      ...common,
      name: "disk-reclaim",
      version: "1.2.0",
      parameters: ["[targets...]"],
      commands,
      flags: planFlags,
      help: {
        description:
          "Plan safe disk reclamation as JSONL. Apply reads approved records from stdin.",
      },
    },
    undefined,
    argv,
  );
  process.removeListener("exit", usageExit);
  const validatedFlags = parsedFlags.safeParse(parsed.flags);
  if (!validatedFlags.success) return fail(validatedFlags.error.message);
  const f = validatedFlags.data;
  const selectedCommand = parsed.command;
  if (selectedCommand === "wrap") {
    const name = parsed._[0];
    if (name === undefined) return fail("wrap requires a name");
    if (f.json)
      return fail("wrap forwards command output and does not support --json");
    return wrap(name, parsed._["--"], f.interactive);
  }
  if (
    selectedCommand === "run" ||
    selectedCommand === "apply" ||
    (selectedCommand === "delete" && f.yes)
  ) {
    const refusal = workerMutationRefusal();
    if (refusal !== null) return fail(refusal);
  }
  const p = parsed;
  if (
    ["targets", "receipts", "apply"].includes(selectedCommand ?? "") &&
    p._.length > 0
  )
    return fail("unexpected positional arguments");
  if (f.interactive && selectedCommand !== "run")
    return fail("--interactive is supported only by run and wrap");
  if (selectedCommand === "delete") {
    const paths = p._.map(String);
    if (paths.length === 0) return fail("delete requires at least one path");
    const loaded = loadConfig();
    if (loaded.config === null) return fail(loaded.error ?? "invalid config");
    const reporter = new ProgressReporter({ tty: progressIsTty(f.json) });
    const cleanup = watchProgress(reporter);
    const details = new Set<string>();
    if (!f.noProgress) {
      reporter.start();
      reporter.activity("delete", "checking paths/processes");
    }
    const result = await deleteApproved(paths, {
      config: loaded.config,
      yes: f.yes,
      state: stateDir(),
      procRoot: resolveProcRoot(),
      progress: {
        progress: !f.noProgress,
        progressTty: progressIsTty(f.json),
        targetName: "delete",
        reportProgress: f.noProgress
          ? undefined
          : (_target, _root, entries, bytes, done, phase = "scan", total) => {
              reporter.report("delete", phase, entries, bytes, done, total);
            },
      },
      diagnostics: (_summary, failures) => {
        for (const detail of failures) details.add(detail);
      },
      log: (message) => {
        reporter.message(message);
      },
    }).finally(cleanup);
    writeProcessDiagnostics(
      details,
      f.verbose,
      "delete retains its unreadable-process refusal",
    );
    for (const refusal of result.refused)
      process.stderr.write(
        `disk-reclaim: REFUSED ${refusal.path}: ${refusal.reason} (owner ${refusal.owner_name}, uid ${refusal.owner_uid}); repair: ${refusal.repair}\n`,
      );
    print(
      result,
      [
        ...result.lines.map(processDecisionText),
        "",
        "SUMMARY\tPATHS\tFOUND BYTES\tEXIT",
        `delete\t${result.rows.length}\t${result.rows.reduce((sum, row) => sum + (row.bytes ?? 0), 0)}\t${result.exit}`,
      ].join("\n"),
      f.json,
    );
    return result.exit;
  }
  if (selectedCommand === "receipts") {
    if (!Number.isSafeInteger(f.last) || f.last < 0)
      return fail("--last must be a non-negative integer");
    const result = readReceipts(f.last);
    if (result.errors.length > 0) return fail(result.errors.join("; "));
    print(
      result.receipts,
      [
        "NAME\tENDED\tEXIT\tFREE BEFORE\tFREE AFTER\tOUTPUT",
        ...result.receipts.map(
          (r) =>
            `${r.name}\t${r.ended}\t${r.exit}\t${r.free_before}\t${r.free_after}\t${r.output ?? "-"}`,
        ),
      ].join("\n"),
      f.json,
    );
    return 0;
  }
  const loaded = loadConfig();
  if (loaded.config === null) return fail(loaded.error ?? "invalid config");
  const progressTty =
    !f.json &&
    (process.env.CI ?? "") === "" &&
    process.env.TERM !== "dumb" &&
    process.stdout.isTTY &&
    process.stderr.isTTY;
  const progressReporter = new ProgressReporter({ tty: progressTty });
  const cancellation = new AbortController();
  let cancelledWith: 130 | 143 | undefined;
  let interruptCount = 0;
  let activePhase = "scan";
  const processDetails = new Set<string>();
  const deleted = new Map<
    string,
    Map<string, { entries: number; bytes: number }>
  >();
  let preflight = true;
  const lastScanReport = new Map<string, number>();
  const reportProgress = (
    target: string,
    root: string,
    entries: number,
    bytes: number,
    done = false,
    phase: "scan" | "delete" = "scan",
    totalBytes?: number,
  ): void => {
    activePhase = phase === "delete" ? "deletion" : "scan";
    if (
      !progressTty &&
      !f.noProgress &&
      phase === "scan" &&
      entries > 0 &&
      performance.now() - (lastScanReport.get(target) ?? 0) >= 2000
    ) {
      lastScanReport.set(target, performance.now());
      process.stderr.write(
        `disk-reclaim: ${safeStderr(target)}: scanned ${entries} entries, ${bytes} bytes\n`,
      );
    }
    if (preflight) {
      progressReporter.update({
        id: "preflight",
        task: "storage/procs",
        entries: 0,
        bytes: 0,
        done: true,
      });
      preflight = false;
    }
    if (phase === "delete" && target !== root) {
      const paths =
        deleted.get(target) ??
        new Map<string, { entries: number; bytes: number }>();
      paths.set(root, { entries, bytes });
      deleted.set(target, paths);
      const totals = [...paths.values()].reduce(
        (sum, path) => ({
          entries: sum.entries + path.entries,
          bytes: sum.bytes + path.bytes,
        }),
        { entries: 0, bytes: 0 },
      );
      progressReporter.report(
        target,
        phase,
        totals.entries,
        totals.bytes,
        false,
        totalBytes === undefined
          ? undefined
          : totals.bytes - bytes + totalBytes,
      );
      return;
    }
    progressReporter.report(target, phase, entries, bytes, done, totalBytes);
  };
  const selectedHost =
    f.on === "windows" ? (f.host ?? "r99") : (f.on ?? f.host);
  const context: Context = {
    signal: cancellation.signal,
    ...(selectedHost === undefined ? {} : { host: selectedHost }),
    approve: f.approve,
    mode: "plan",
    explicit: false,
    fetch: f.fetch,
    progress: !f.noProgress,
    progressTty,
    reportProgress: f.noProgress ? undefined : reportProgress,
    config: loaded.config,
    procDir: resolveProcRoot(),
    verbose: f.verbose,
    reportActivity: (unit, task) => {
      if (/SSH/u.test(task)) activePhase = "SSH probe";
      else if (selectedCommand === "run") activePhase = "deletion";
      else activePhase = "scan";
      if (f.noProgress) return;
      if (progressTty) progressReporter.activity(unit, task);
      else
        process.stderr.write(
          `disk-reclaim: ${safeStderr(`${unit}: ${task}`)}\n`,
        );
    },
    reportProcessFailures: (_summary, details) => {
      for (const detail of details) processDetails.add(detail);
    },
    log: (m) => {
      const message = `reclaim: ${safeStderr(m)}`;
      if (progressTty) progressReporter.message(message);
      else process.stderr.write(`disk-reclaim: ${message}\n`);
    },
  };
  if (selectedCommand === "apply") {
    const input = await new Response(stdin).text();
    if (input.trim() === "")
      return fail("apply requires JSONL records on stdin");
    return applyInput(
      input,
      f.approve,
      targets,
      context,
      dependencies.captureLiveness,
      f.json,
    );
  }
  if (selectedCommand === "targets") {
    const rows = await Promise.all(
      targets.map(async (t) => {
        const availability = await t.available(context);
        return {
          name: t.name,
          tier: t.tier,
          ...availability,
          what: t.description?.what ?? "",
          why: availability.skip_reason ?? t.description?.why ?? "",
        };
      }),
    );
    print(
      rows,
      [
        "NAME\tTIER\tAVAILABLE\tWHAT\tWHY",
        ...rows.map(
          (t) => `${t.name}\t${t.tier}\t${t.available}\t${t.what}\t${t.why}`,
        ),
      ].join("\n"),
      f.json,
    );
    return 0;
  }
  const names = [...p._.map(String), ...f.target].map((name) =>
    name === "windows" ? "host" : name,
  );
  if (f.on === "windows" && names.length === 0) names.push("host");
  const tier = f.tier === undefined ? null : Tier.safeParse(f.tier);
  if (tier !== null && !tier.success) return fail(`unknown tier ${f.tier}`);
  const unknown = names.filter((name) => !targets.some((t) => t.name === name));
  if (unknown.length > 0)
    return fail(`unknown target(s): ${unknown.join(", ")}`);
  if (
    selectedCommand === "run" &&
    (f.all || (names.length === 0 && f.tier !== "blind"))
  )
    return fail(
      "run requires named targets or --tier blind; --all is plan-only",
    );
  // sudo is part of blind selection and emits SKIP when unavailable.
  const picked = targets.filter(
    (t) =>
      (names.length === 0 || names.includes(t.name)) &&
      (tier === null ||
        !tier.success ||
        t.tier === tier.data ||
        (tier.data === "blind" && t.tier === "sudo")),
  );
  if (names.some((name) => !picked.some((t) => t.name === name)))
    return fail("named targets do not match --tier");
  let authorized = f.yes;
  if (f.interactive) {
    if (!stdin.isTTY) return fail("--interactive requires a terminal");
    if (picked.length !== 1 || picked[0]?.name !== "purge")
      return fail(
        "--interactive is reserved for the irreversible purge target",
      );
    const prompt = createInterface({ input: stdin, output: stdout });
    let onKeypress:
      | ((_character: string, key: { name?: string }) => void)
      | undefined;
    const escape = new Promise<string>((resolve) => {
      onKeypress = (_character, key) => {
        if (key.name === "escape") resolve("\u001B");
      };
      stdin.on("keypress", onKeypress);
    });
    const answer = await Promise.race([
      prompt.question(
        "Empty every graveyard permanently. Type yes to continue: ",
      ),
      escape,
    ]).finally(() => {
      if (onKeypress !== undefined)
        stdin.removeListener("keypress", onKeypress);
      prompt.close();
    });
    if (!typedYes(answer)) {
      process.stderr.write("disk-reclaim: purge cancelled\n");
      return 1;
    }
    authorized = true;
  }
  const options = {
    ...dependencies,
    context,
    explicit: names,
    yes: authorized,
    underPressure: f.underPressure,
    stopOnError: f.stopOnError,
  };
  const restore = () => {
    progressReporter.finish();
  };
  const cancel = (code: 130 | 143) => {
    interruptCount++;
    if (interruptCount > 1) {
      restore();
      process.exit(code);
    }
    cancelledWith = code;
    process.stderr.write(`disk-reclaim: cancelled during ${activePhase}\n`);
    cancellation.abort();
    restore();
  };
  const interrupt = () => {
    cancel(130);
  };
  const terminate = () => {
    cancel(143);
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", terminate);
  process.once("exit", restore);
  if (!f.noProgress) {
    progressReporter.message(
      `[reclaim] plan: scanning ${picked.length} targets…`,
    );
    progressReporter.start();
    progressReporter.update({
      id: "preflight",
      task: "storage/procs",
      entries: 0,
      bytes: 0,
    });
  }
  const wslBefore =
    selectedCommand === "run" ? await wslStorageSnapshot() : null;
  const measuredOptions = { ...options, headroom: readHeadroom() };
  const result = await (
    selectedCommand === "run"
      ? run(picked, measuredOptions)
      : plan(picked, measuredOptions)
  ).finally(() => {
    restore();
    process.removeListener("exit", restore);
  });
  if (result.error !== null && cancelledWith === undefined)
    process.stderr.write(`reclaim: ${safeStderr(result.error)}\n`);
  if (result.plan !== null) {
    const validated = Plan.safeParse(result.plan);
    if (!validated.success) return fail(validated.error.message);
    if (selectedCommand === "plan") await cachePlanReport(validated.data);
    reportProcessDiagnostics(validated.data, processDetails, f.verbose);
    const records =
      selectedCommand === "plan" && !f.yes && f.json
        ? []
        : await recordsFromPlan(validated.data);
    if (cancelledWith !== undefined && selectedCommand === "run") {
      const completedPaths = completedDeletionPaths(validated.data);
      const summary = completedPaths.map((path) => safeStderr(path)).join(", ");
      process.stderr.write(
        `disk-reclaim: deleted before cancellation: ${summary.length === 0 ? "none" : summary}\n`,
      );
    }
    if (cancelledWith !== undefined && selectedCommand === "plan") {
      // An incomplete plan is not a usable plan document.
    } else if (selectedCommand === "plan" && !f.yes)
      outputPlan(validated.data, records, f.json ? "json" : "jsonl");
    else if (f.yes && selectedCommand !== "run")
      return applyInput(
        `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
        f.approve,
        targets,
        context,
        dependencies.captureLiveness,
        f.json,
        validated.data.targets.flatMap((target) =>
          target.exit === 1
            ? [
                {
                  target: target.name,
                  reason: target.skip_reason ?? "target failed",
                },
              ]
            : [],
        ),
      );
    else outputPlan(validated.data, records, f.json ? "json" : "human");
  }
  if (selectedCommand === "run") {
    const report = wslReturnReport(wslBefore, await wslStorageSnapshot());
    if (report !== null) process.stderr.write(`${report}\n`);
  }
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", terminate);
  return cancelledWith ?? result.exit;
}
if (import.meta.main) {
  const result = await fromAsyncThrowable(main)();
  if (result.isErr())
    process.stderr.write(`reclaim: ${errorMessage(result.error)}\n`);
  process.exitCode = result.isOk() ? result.value : 2;
}
