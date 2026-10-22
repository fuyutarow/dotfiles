import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { InspectionUnavailable } from "../../../shared/src/agx-config.ts";
import { verifyLine } from "../ticket.ts";
import { parseReport, parseReturn, withReportInstruction } from "../report.ts";
import { type NextTicket } from "./ticket.ts";
import { ticketContext, ticketPlacement } from "./ticket-home.ts";
import {
  append,
  flushRunPublications,
  acquireWorkspaceLock,
  events,
  foldedRuns,
  workspaceRuns,
  importLegacyRecords,
  now,
  overlapWarnings,
  recordPath,
  runningWorkspaceRun,
  stateDir,
} from "./store.ts";
import { leaseFor, type StopSignal } from "./lease.ts";
import { route } from "./route.ts";
import { pinContinuation } from "./continue.ts";
import { routeFilterLabel } from "../../../../agents/models/roster.ts";
import {
  earlyQuitRows,
  preflight,
  printPreflightFailures,
} from "./preflight.ts";
import { createRunTemp } from "../temp.ts";
import { exitWithError } from "./exit.ts";
import { changedFiles, deriveOutcome, workspaceSnapshot } from "./outcome.ts";
import {
  verificationEnvironment,
  verifyKind,
  type VerifyKind,
} from "./verify.ts";

export type Flags = Readonly<Record<string, string | boolean | undefined>>;
const fatal = (message: string, exitCode = 2): never =>
  exitWithError(`agx: ${message}\n`, exitCode);
const value = (flags: Flags, key: string): string | undefined =>
  typeof flags[key] === "string" ? flags[key] : undefined;
export function systemdUnitName(cgroup: string): string | undefined {
  const unit = cgroup
    .split(/\r?\n/u)
    .flatMap((line) => line.split("/"))
    .findLast((part) => part.endsWith(".service"));
  return unit?.slice(0, -".service".length);
}
const invocationUnitFor = async (): Promise<string | undefined> => {
  if (
    process.env.INVOCATION_ID === undefined ||
    process.env.INVOCATION_ID === ""
  )
    return undefined;
  const cgroup = await readFile("/proc/self/cgroup", "utf8").catch(() => null);
  return cgroup === null ? undefined : systemdUnitName(cgroup);
};
const refuseRunningWorkspace = async (cwd: string): Promise<void> => {
  const holder = await runningWorkspaceRun(cwd);
  if (holder !== undefined)
    fatal(`workspace ${cwd} already has running run ${holder.id}`, 2);
};
const contextFor = async (path: string, cwd: string, ticket: NextTicket) => {
  const located = await ticketContext(dirname(resolve(path)));
  if (!located.ok) return fatal(located.error);
  // External declared homes have no repository ancestor. In that case only,
  // use the supplied workspace to find the declaration and verify placement.
  const repository =
    located.vcs === undefined ? await ticketContext(cwd) : located;
  if (!repository.ok) return fatal(repository.error);
  const placement = await ticketPlacement(path, repository);
  if (placement !== null) return fatal(placement);
  // Placement belongs to the ticket repository; execution provenance belongs to
  // --cd, including a scratch directory with no repository or commit.
  const worker =
    resolve(cwd) === repository.root ? repository : await ticketContext(cwd);
  if (!worker.ok) return fatal(worker.error);
  const ctx = {
    ...repository,
    base_rev: worker.base_rev,
    revision: worker.revision,
    vcs: worker.vcs,
    verifyAlways: worker.verifyAlways,
  };
  if (ticket.base_rev !== undefined && ticket.base_rev !== ctx.base_rev)
    return fatal(
      `base_rev mismatch: ticket ${resolve(path)}, declared ${ticket.base_rev}, repository ${ctx.root}, worker ${cwd} commit ${ctx.base_rev ?? "unavailable"}`,
    );
  return ctx;
};
const renderPromise = (
  ticket: NextTicket,
  cwd: string,
  sandbox: string,
  prose: string,
): string =>
  withReportInstruction(
    [
      `Proposition ${ticket.proposition.id}: ${ticket.proposition.claim}`,
      `refuted_by: ${ticket.proposition.refuted_by}`,
      "Everything below serves this proposition; do not let a side task displace it.",
      "",
      "Promise:",
      `outcome: ${ticket.outcome}`,
      `writes: ${JSON.stringify(ticket.writes.map((glob) => resolve(cwd, glob)))}`,
      ...(ticket.verify.length === 0 ? [] : [verifyLine(ticket.verify)]),
      `Sandbox mode: ${sandbox}${sandbox === "none" ? " (unsandboxed)" : ""}.`,
      ...(
        [
          "resources",
          "base_rev",
          "external_reads",
          "first_return_s",
          "network",
        ] as const
      ).flatMap((key) =>
        ticket[key] === undefined
          ? []
          : [`${key}: ${JSON.stringify(ticket[key])}`],
      ),
      'If this work needs a tool release changeset, create it with `mise run changeset -- <tool> <patch|minor|major> "<entry>"`; do not hand-write a `.changes` file.',
      "",
      prose.trim(),
    ].join("\n"),
  );
const persistInterim = (id: string, path: string, message: string): boolean => {
  const parsed = parseReturn(message);
  if (parsed.kind !== "valid" || parsed.record.interim !== true) return false;
  const progressText = `${JSON.stringify(parsed.record)}\n`;
  if (existsSync(path) && readFileSync(path, "utf8") === progressText)
    return true;
  writeFileSync(path, progressText);
  append({ kind: "progress", id, at: now(), path });
  return true;
};

export { earlyQuitRows } from "./preflight.ts";

const lastLines = (output: string, count: number): string => {
  const lines = output.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  const tail = lines.slice(-count);
  return tail.length === 0 ? "" : `${tail.join("\n")}\n`;
};

const runVerify = async (
  commands: string[],
  cwd: string,
  runDir: string,
  env: NodeJS.ProcessEnv,
  always: string[],
): Promise<
  {
    cmd: string;
    exit: number;
    log_path: string;
    kind: VerifyKind;
    source?: "[verify].always";
  }[]
> => {
  const results: {
    cmd: string;
    exit: number;
    log_path: string;
    kind: VerifyKind;
    source?: "[verify].always";
  }[] = [];
  for (const [index, cmd] of [...always, ...commands].entries()) {
    const source = index < always.length ? "[verify].always" : undefined;
    const logPath = join(
      runDir,
      `verify-${String(index + 1).padStart(2, "0")}.log`,
    );
    const child = Bun.spawn(
      ["sh", "-c", 'exec 2>&1; sh -c "$1"', "agx-verify", cmd],
      {
        cwd,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env,
      },
    );
    const stdout =
      child.stdout === null
        ? Promise.resolve("")
        : new Response(child.stdout).text();
    const stderr =
      child.stderr === null
        ? Promise.resolve("")
        : new Response(child.stderr).text();
    const exit = await child.exited;
    const output = `${await stdout}${await stderr}`;
    writeFileSync(logPath, lastLines(output, 20));
    const kind = verifyKind(exit, child.signalCode);
    process.stderr.write(
      `VERIFY exit=${exit} ${cmd} kind=${kind}${source === undefined ? "" : ` source=${source}`}\n`,
    );
    results.push({
      cmd,
      exit,
      log_path: logPath,
      kind,
      ...(source === undefined ? {} : { source }),
    });
  }
  return results;
};

export async function check(flags: Flags): Promise<number> {
  const path = value(flags, "ticket");
  const cwd = resolve(value(flags, "cd") ?? process.cwd());
  if (path === undefined) return fatal("check requires positional TICKET", 2);
  const inspected = await preflight(path, cwd, flags);
  if (inspected.temporary !== undefined)
    return fatal(inspected.temporary.message, 75);
  if (inspected.failures.length > 0)
    return printPreflightFailures(inspected.failures);
  const { ticket, loaded } = inspected;
  if (ticket === undefined || !loaded.ok)
    return fatal("preflight did not resolve ticket and roster");
  await overlapWarnings(ticket.writes, inspected.ctx?.root ?? cwd);
  process.stdout.write(
    `OK ticket=${ticket.name ?? basename(path, ".md")} cwd=${cwd} ${routeFilterLabel(loaded.value.auto)}\n`,
  );
  if ((inspected.ctx?.verifyAlways.length ?? 0) > 0)
    process.stdout.write(
      `[verify].always=${JSON.stringify(inspected.ctx?.verifyAlways)}\n`,
    );
  return 0;
}

export async function run(flags: Flags): Promise<number> {
  if (process.env.AGX_NEXT_WORKER !== undefined)
    return fatal(
      "AGX_NEXT_WORKER is no longer supported; use AGX_WORKER_BIN",
      2,
    );
  const path = value(flags, "ticket");
  const cwd = resolve(value(flags, "cd") ?? process.cwd());
  if (path === undefined) return fatal("run requires positional TICKET", 2);
  const inspected = await preflight(path, cwd, flags);
  if (inspected.temporary !== undefined)
    return fatal(inspected.temporary.message, 75);
  if (inspected.failures.length > 0)
    return printPreflightFailures(inspected.failures);
  const {
    ticket,
    prose,
    bytes,
    ctx,
    sandbox,
    binding,
    pinned: inspectedContinuation,
    premise_commits,
  } = inspected;
  if (ticket === undefined || bytes === null || ctx === undefined)
    return fatal("preflight did not resolve ticket and context");
  const actualUnit = await invocationUnitFor();
  const ticketName = ticket.name ?? basename(path, ".md");
  const continuationId = value(flags, "continue");
  const routing = {
    brief: `Proposition ${ticket.proposition.id}: ${ticket.proposition.claim}\n${prose}`,
    capabilities: ticket.capabilities ?? [],
    timeoutS: ticket.timeout_s ?? 600,
    maskedRows: await earlyQuitRows(ticketName, cwd),
  };
  const selectedContinuation =
    continuationId === undefined
      ? undefined
      : await pinContinuation(continuationId, path, routing);
  const pinned = selectedContinuation ?? inspectedContinuation;
  const supersedes =
    pinned?.supersedes ?? value(flags, "supersedes") ?? ticket.supersedes;
  const resumeSession = pinned?.resumeSession;
  await overlapWarnings(ticket.writes, ctx.root);
  if (ctx.vcs === undefined)
    process.stderr.write(
      "agx: no repository in --cd; base_rev absent; repository changes, end commit and landing unavailable\n",
    );
  const row =
    pinned?.row ??
    (await route(
      routing.brief,
      routing.capabilities,
      routing.timeoutS,
      routing.maskedRows,
    ));
  const id = binding?.id ?? randomUUID();
  // The run owns its temp space: removed on any exit path (process.exit included); a SIGKILL
  // leaves it for the next run's sweep.
  const made = createRunTemp(id);
  if (made.isErr()) {
    console.error(made.error);
    process.exit(1);
  }
  const temp = made.value;
  Object.assign(process.env, temp.env);
  process.on("exit", temp.remove);
  let started = false;
  let ended = false;
  let stopTask: Promise<never> | undefined;
  let killWorker: (() => void) | undefined;
  const stop = (signal: StopSignal, code: number): void => {
    if (stopTask !== undefined) return;
    killWorker?.();
    if (started && !ended) {
      ended = true;
      append({
        kind: "ended",
        id,
        at: now(),
        exit: code,
        outcome: "stopped",
        signal,
        report_path: null,
        vendor_session: resumeSession ?? null,
        verify: [],
      });
    }
    stopTask = (async () => {
      await flushRunPublications();
      process.exit(code);
    })();
  };
  for (const [signal, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
    ["SIGHUP", 129],
  ] as const)
    process.on(signal, stop.bind(undefined, signal, code));
  const runDir = join(stateDir(), "runs", id);
  mkdirSync(runDir, { recursive: true });
  const ticketPath = join(runDir, "ticket.orig.md");
  const ticket_sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(ticketPath, bytes, { flag: "wx" });
  await writeFile(
    join(runDir, "ticket.orig.md.sha256"),
    `${ticket_sha256}  ticket.orig.md\n`,
    { flag: "wx" },
  );
  const reportPath = join(runDir, "report.json");
  const workerBrief = join(runDir, "brief.md");
  const progressPath = join(runDir, "last-progress.json");
  const interimPath = join(runDir, "interim.jsonl");
  const agxDispatcherSession = process.env.AGX_DISPATCHER_SESSION;
  const claudeSession = process.env.CLAUDE_CODE_SESSION_ID;
  const codexSession = process.env.CODEX_SESSION_ID;
  let dispatcher: string | null = null;
  const explicitSession = value(flags, "session");
  if (explicitSession !== undefined && explicitSession !== "")
    dispatcher = explicitSession;
  else if (agxDispatcherSession !== undefined && agxDispatcherSession !== "")
    dispatcher = agxDispatcherSession;
  else if (claudeSession !== undefined && claudeSession !== "")
    dispatcher = claudeSession;
  else if (codexSession !== undefined && codexSession !== "")
    dispatcher = codexSession;
  if (dispatcher === null)
    process.stderr.write(
      "WARN dispatcher session is unavailable; pass --session ID or preserve CLAUDE_CODE_SESSION_ID/CODEX_SESSION_ID (systemd-run: use -E NAME).\n",
    );
  const workspace = resolve(cwd);
  writeFileSync(
    workerBrief,
    withReportInstruction(renderPromise(ticket, cwd, sandbox, prose)),
  );
  const launchContext = await contextFor(path, cwd, ticket);
  if (launchContext.base_rev !== ctx.base_rev)
    return fatal(
      `--cd commit changed before launch: checked ${ctx.base_rev}, now ${launchContext.base_rev ?? "unavailable"}`,
    );
  const workspaceLock = await acquireWorkspaceLock(workspace);
  if (!workspaceLock.ok) {
    // The winning process may be between flock and publishing its started event.
    // Only diagnostics wait (at most 100 ms); acquisition itself never waits or retries.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await refuseRunningWorkspace(cwd);
      await Bun.sleep(10);
    }
    return fatal(
      `cannot start in workspace ${workspace}: ${workspaceLock.error}`,
      2,
    );
  }
  // Also covers runs started by an older binary while this invocation was routing.
  await refuseRunningWorkspace(cwd);
  const unit = binding?.unit ?? actualUnit ?? `agt_${ticketName}`;
  const workerName = unit;
  const startedLease = await leaseFor(
    process.pid,
    process.env.INVOCATION_ID !== undefined && process.env.INVOCATION_ID !== ""
      ? `${unit}.service`
      : null,
  );
  if (stopTask !== undefined) await stopTask;
  append({
    kind: "started",
    id,
    at: now(),
    ticket: binding?.ticket ?? ticketName,
    writes: ticket.writes,
    cwd,
    workspace,
    worker_name: workerName,
    unit,
    workspace_name: basename(workspace),
    row: row.id,
    dispatcher_session: dispatcher,
    vendor_session: resumeSession ?? null,
    continues: supersedes === undefined ? (continuationId ?? null) : null,
    supersedes: supersedes ?? null,
    base_rev: ctx.base_rev ?? undefined,
    premise_commits,
    ticket_path: resolve(path),
    ticket_orig_path: ticketPath,
    ticket_sha256,
    pid: process.pid,
    lease: startedLease,
  });

  started = true;

  const workerPath =
    process.env.AGX_WORKER_BIN ??
    join(
      import.meta.dir,
      "..",
      "workers",
      row.route === "codex" ? "codex.ts" : "run-claude.ts",
    );
  const workerArgs = (): string[] => {
    if (process.env.AGX_WORKER_BIN !== undefined)
      return [
        workerPath,
        "--ticket",
        path,
        "--cd",
        cwd,
        "--row",
        row.id,
        ...(resumeSession === undefined ? [] : ["--resume", resumeSession]),
      ];
    if (row.route === "codex")
      return [
        workerPath,
        "--choice",
        row.id,
        "--sandbox",
        sandbox,
        "--cd",
        cwd,
        "--prompt-file",
        workerBrief,
        "--run-id",
        id,
        "--receipt-dir",
        runDir,
        "--timeout-s",
        String(ticket.timeout_s ?? 600),
        ...(resumeSession === undefined ? [] : ["--resume", resumeSession]),
      ];
    let permissionMode = "acceptEdits";
    if (sandbox === "read-only") permissionMode = "plan";
    if (sandbox === "none") permissionMode = "bypassPermissions";
    const claudeSettings =
      sandbox === "workspace-write"
        ? JSON.stringify({
            sandbox: {
              enabled: true,
              autoAllowBashIfSandboxed: true,
              allowUnsandboxedCommands: false,
              failIfUnavailable: true,
            },
          })
        : undefined;
    return [
      workerPath,
      "--target",
      cwd,
      "--prompt-file",
      workerBrief,
      "--model",
      row.model,
      "--effort",
      row.effort,
      "--permission-mode",
      permissionMode,
      ...(sandbox === "workspace-write" ? ["--allowed-tools", "Bash"] : []),
      ...(claudeSettings === undefined ? [] : ["--settings", claudeSettings]),
      "--max-turns",
      "60",
      "--max-budget-usd",
      "2",
      "--timeout-ms",
      String((ticket.timeout_s ?? 600) * 1000),
      "--progress-file",
      join(runDir, "worker-progress.jsonl"),
      "--persist-session",
      ...(resumeSession === undefined ? [] : ["--resume", resumeSession]),
    ];
  };
  const before = workspaceSnapshot(cwd, ticket.writes);
  const runEnv = verificationEnvironment(cwd, process.env, temp.env);
  if (runEnv instanceof InspectionUnavailable) return fatal(runEnv.message, 75);
  if (stopTask !== undefined) await stopTask;
  const child = Bun.spawn([process.execPath, ...workerArgs()], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
    env: {
      ...runEnv,
      AGX_INTERIM_REPORTS_FILE: interimPath,
    },
    timeout: (ticket.timeout_s ?? 600) * 1000,
  });
  const firstReturnS =
    ticket.first_return_s ?? Math.floor((ticket.timeout_s ?? 600) / 2);
  const workerStartedAt = performance.now();
  let progressSeen = false;
  let lateRecorded = false;
  killWorker = () => {
    child.kill();
  };
  process.on("exit", () => {
    child.kill();
  });
  const outputPromise =
    child.stdout === null
      ? Promise.resolve("")
      : new Response(child.stdout).text();
  let progressOffset = 0;
  const observeInterim = (): void => {
    if (!existsSync(interimPath)) return;
    const data = readFileSync(interimPath, "utf8");
    const fresh = data.slice(progressOffset);
    progressOffset = data.length;
    const last = fresh.trim().split("\n").at(-1);
    if (last === undefined || last === "") return;
    const record = jsonOf(
      z.looseObject({ last_message: z.string() }),
    ).safeParse(last);
    if (record.success)
      progressSeen ||= persistInterim(
        id,
        progressPath,
        record.data.last_message,
      );
  };
  const progressWatcher = setInterval(() => {
    observeInterim();
    const elapsed = (performance.now() - workerStartedAt) / 1000;
    if (!progressSeen && !lateRecorded && elapsed >= firstReturnS) {
      append({
        kind: "late",
        id,
        at: now(),
        first_return_s: firstReturnS,
        elapsed: Math.floor(elapsed),
      });
      lateRecorded = true;
    }
  }, 100);
  const exit = await child.exited;
  clearInterval(progressWatcher);
  const output = await outputPromise;
  if (stopTask !== undefined) await stopTask;
  const receiptLine = output.trim().split("\n").at(-1) ?? "";
  const receipt = jsonOf(
    z.looseObject({
      report: z.unknown().optional(),
      structured_output: z.unknown().optional(),
      last_message: z.string().optional(),
      vendor_session: z.string().optional(),
      session: z.string().optional(),
      session_id: z.string().optional(),
      outcome: z.string().optional(),
      cause: z.string().optional(),
      timed_out: z.boolean().optional(),
      exit_code: z.number().optional(),
    }),
  ).safeParse(receiptLine);
  const workerReceipt = receipt.success ? receipt.data : {};
  // Capacity never ran the promised work; verification cannot turn it into a worker failure
  // or delay releasing this model to the router's cool-down.
  const capacity = workerReceipt.outcome === "capacity";
  const after = capacity ? undefined : workspaceSnapshot(cwd, ticket.writes);
  const changed =
    before.isOk() && after?.isOk() === true
      ? changedFiles(before.value, after.value)
      : undefined;
  const verify = capacity
    ? []
    : await runVerify(ticket.verify, cwd, runDir, runEnv, ctx.verifyAlways);
  const parsedReport = parseReport(
    workerReceipt.structured_output ?? workerReceipt.report,
    workerReceipt.last_message ?? receiptLine,
  );
  for (const warning of parsedReport.ok ? (parsedReport.warnings ?? []) : [])
    process.stderr.write(`WARN ${warning}\n`);
  const outcome = deriveOutcome({
    capacity,
    timedOut:
      child.signalCode === "SIGTERM" ||
      workerReceipt.timed_out === true ||
      workerReceipt.outcome === "timeout" ||
      exit === 3 ||
      exit === 124,
    refused:
      exit !== 0 ||
      workerReceipt.outcome === "refused" ||
      (workerReceipt.exit_code !== undefined && workerReceipt.exit_code !== 0),
    verify,
    reportValid: parsedReport.ok,
    changed,
  });
  let report: unknown = parsedReport.ok
    ? parsedReport.report
    : {
        raw: output.trim(),
        error: parsedReport.error,
      };
  if (capacity)
    report = {
      summary: `Vendor capacity on ${row.id}: ${workerReceipt.cause ?? "model unavailable"}`,
      changes: [],
      checks: [],
      for_coordinator: [
        "Dispatch again or use --continue to route away from this model.",
      ],
      open: [
        "The vendor did not complete this ticket; this is not a worker failure.",
      ],
    };
  if (ctx.verifyAlways.length > 0)
    report = {
      ...(typeof report === "object" && report !== null ? report : {}),
      verify,
    };
  writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
  const vendorSession =
    workerReceipt.vendor_session ??
    workerReceipt.session ??
    workerReceipt.session_id ??
    null;
  if (existsSync(interimPath)) {
    const finalInterim = readFileSync(interimPath, "utf8")
      .trim()
      .split("\n")
      .at(-1);
    const interim =
      finalInterim === undefined
        ? undefined
        : jsonOf(z.looseObject({ last_message: z.string() })).safeParse(
            finalInterim,
          );
    if (interim?.success === true)
      progressSeen ||= persistInterim(
        id,
        progressPath,
        interim.data.last_message,
      );
  }
  if (stopTask !== undefined) await stopTask;
  append({
    kind: "ended",
    id,
    at: now(),
    exit,
    outcome,
    report_path: reportPath,
    vendor_session: vendorSession,
    verify,
    returned: /```agx-return\s*\n/u.test(
      workerReceipt.last_message ?? receiptLine,
    ),
    changed_files: changed,
  });
  ended = true;
  temp.remove();
  await workspaceLock.release();
  process.stdout.write(
    `${JSON.stringify({ id, ticket: ticketName, row: row.id, exit, outcome, report_path: reportPath, state_file: recordPath(), host: hostname(), unit })}\n`,
  );
  return exit;
}

const selectedRuns = (
  rows: Awaited<ReturnType<typeof foldedRuns>>,
  selector: string | undefined,
  startedAt: Map<string, string>,
): { rows: Awaited<ReturnType<typeof foldedRuns>>; error?: string } => {
  const newestFirst = rows.toSorted((a, b) =>
    (startedAt.get(b.id) ?? "").localeCompare(startedAt.get(a.id) ?? ""),
  );
  if (selector === undefined) return { rows: newestFirst };
  const exactId = rows.find((entry) => entry.id === selector);
  if (exactId !== undefined) return { rows: [exactId] };
  const ticketRuns = rows.filter((entry) => entry.ticket === selector);
  if (ticketRuns.length > 0)
    return {
      rows: ticketRuns.toSorted((a, b) =>
        (startedAt.get(a.id) ?? "").localeCompare(startedAt.get(b.id) ?? ""),
      ),
    };
  const idMatches = rows.filter((entry) => entry.id.startsWith(selector));
  if (idMatches.length === 1) return { rows: idMatches };
  if (idMatches.length > 1)
    return {
      rows: [],
      error: `selector '${selector}' is ambiguous; run id candidates: ${idMatches
        .map((entry) => entry.id)
        .toSorted()
        .join(", ")}`,
    };
  return {
    rows: [],
    error: `no run id or exact ticket matches '${selector}'; ticket candidates: ${[
      ...new Set(rows.map((entry) => `tkt_${entry.ticket}`)),
    ]
      .toSorted()
      .slice(0, 10)
      .join(", ")}`,
  };
};

export { runningSummary } from "./listing.ts";
import { runningSummary, listingRows } from "./listing.ts";

export async function list(flags: Flags): Promise<number> {
  const workspacePath = value(flags, "workspace");
  const workspace =
    workspacePath === undefined
      ? undefined
      : await realpath(resolve(workspacePath)).catch(() => null);
  if (workspace === null) {
    process.stderr.write(
      "agx: workspace path does not exist or cannot be resolved\n",
    );
    return 2;
  }
  const latest = flags.latest === true || value(flags, "latest") === "true";
  const ticket = value(flags, "ticket");
  if (latest || ticket !== undefined) {
    const selector = value(flags, "selector");
    if (latest && ticket === undefined) {
      process.stderr.write("agx: --latest requires --ticket <name>\n");
      return 2;
    }
    if (!latest) {
      process.stderr.write("agx: --ticket requires --latest\n");
      return 2;
    }
    if (
      selector !== undefined ||
      flags.all === true ||
      flags.running === true ||
      flags.wait === true ||
      flags.summary === true ||
      workspace !== undefined
    ) {
      process.stderr.write(
        "agx: --latest accepts only --ticket <name> and optional --json\n",
      );
      return 2;
    }
    const allRuns = await foldedRuns();
    const ticketRuns = allRuns.filter((entry) => entry.ticket === ticket);
    const latestRun = ticketRuns.at(-1);
    if (latestRun === undefined) {
      const candidates = [
        ...new Set(allRuns.map((entry) => `tkt_${entry.ticket}`)),
      ]
        .toSorted()
        .slice(0, 10);
      process.stderr.write(
        `agx: no run for exact ticket '${ticket}'${candidates.length === 0 ? "" : `; ticket candidates: ${candidates.join(", ")}`}\n`,
      );
      return 2;
    }
    const verifyExits = latestRun.verify.map((result) => result.exit);
    if (flags.json === true || value(flags, "json") === "true") {
      process.stdout.write(
        `${JSON.stringify({
          id: latestRun.id,
          state: latestRun.state,
          outcome: latestRun.outcome,
          verify_exits: verifyExits,
          report_path: latestRun.report_path,
        })}\n`,
      );
    } else {
      process.stdout.write(
        `${latestRun.id} state=${latestRun.state} outcome=${latestRun.outcome ?? "-"} verify_exits=${verifyExits.length === 0 ? "-" : verifyExits.join(",")} report_path=${latestRun.report_path ?? "-"}\n`,
      );
    }
    return 0;
  }
  const running = flags.running === true || value(flags, "running") === "true";
  const rows = (
    await (workspace === undefined ? foldedRuns() : workspaceRuns(workspace))
  ).filter((entry) => !running || entry.state === "running");
  const asJson = value(flags, "json") === "true" || flags.json === true;
  const all = flags.all === true || value(flags, "all") === "true";
  const selector = value(flags, "selector");
  const startedAt = new Map(rows.map((entry) => [entry.id, entry.started_at]));
  const selection = selectedRuns(rows, selector, startedAt);
  if (selection.error !== undefined) {
    process.stderr.write(`agx: ${selection.error}\n`);
    return 2;
  }
  let visible = selection.rows;
  if (selector === undefined && !all && !asJson) visible = visible.slice(0, 30);
  let output = visible
    .map(
      (entry) =>
        `${entry.id} ${entry.state} tkt_${entry.ticket} row=${entry.row} exit=${entry.exit ?? "-"} outcome=${entry.outcome ?? "-"}`,
    )
    .join("\n");
  if (asJson) {
    const selected = selector === undefined ? rows : visible;
    let payload: unknown = listingRows(selected);
    if (flags.summary === true) {
      payload = {
        runs: listingRows(selected),
        summary: runningSummary(selected),
      };
    }
    output = JSON.stringify(payload) + "\n";
  } else if (selector === undefined && visible.length > 0) {
    output += "\n";
    const older = rows.length - visible.length;
    if (older > 0) output += `… ${older} older (agx worker ls --all)\n`;
  }
  process.stdout.write(output);
  return 0;
}

export async function judgeRun(flags: {
  id?: string | undefined;
  decision?: string | undefined;
  note?: string | undefined;
  evidence?: string[] | undefined;
}): Promise<number> {
  const id = flags.id;
  const decision = flags.decision;
  if (id === undefined || decision === undefined)
    return fatal("judge requires RUN_ID and accept|reject", 2);
  if (decision !== "accept" && decision !== "reject")
    return fatal("judge decision must be accept or reject", 2);
  if (!(await foldedRuns()).some((entry) => entry.id === id))
    return fatal(`unknown run ${id}`, 2);
  const evidence = [];
  for (const path of flags.evidence ?? []) {
    const bytes = await readFile(path).catch(() =>
      fatal(`cannot read evidence: ${path}`, 2),
    );
    const decoded = await Promise.try(() =>
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes),
    ).catch(() => fatal(`evidence must be UTF-8: ${path}`, 2));
    evidence.push({
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      content: decoded,
    });
  }
  append({
    kind: "judged",
    id,
    at: now(),
    decision,
    note: flags.note ?? "",
    ...(evidence.length === 0 ? {} : { evidence }),
  });
  return 0;
}

export async function stats(flags: Flags): Promise<number> {
  const importFlag =
    flags.importLegacy === true || value(flags, "import-legacy") === "true";
  const legacyImport = importFlag ? await importLegacyRecords() : undefined;
  const all = events();
  const runs = await foldedRuns();
  const report = {
    runs: runs.length,
    running: runs.filter((entry) => entry.state === "running").length,
    ended: runs.filter((entry) => entry.state === "ended").length,
    lost: runs.filter((entry) => entry.outcome === "lost").length,
    judgments: all.filter((event) => event.kind === "judged").length,
    ...(legacyImport === undefined ? {} : { legacy_import: legacyImport }),
    by_row: Object.fromEntries(
      [...new Set(runs.map((entry) => entry.row))].map((row) => [
        row,
        runs.filter((entry) => entry.row === row).length,
      ]),
    ),
  };
  process.stdout.write(`${JSON.stringify(report)}\n`);
  return 0;
}
