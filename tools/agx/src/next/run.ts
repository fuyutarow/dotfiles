import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fromThrowable } from "neverthrow";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { checkPremises } from "../premises.ts";
import { verifyLine } from "../ticket.ts";
import { parseReport, parseReturn, withReportInstruction } from "../report.ts";
import { parseNextTicket, type NextTicket } from "./ticket.ts";
import {
  append,
  acquireWorkspaceLock,
  events,
  foldedRuns,
  importLegacyRecords,
  now,
  overlapWarnings,
  recordPath,
  runningWorkspaceRun,
  stateDir,
} from "./store.ts";
import { route } from "./route.ts";
import { pinContinuation } from "./continue.ts";
import { createRunTemp } from "../temp.ts";
import { exitWithError } from "./exit.ts";
import { ownerlessRefLocks } from "../../../shared/src/ref-locks.ts";
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
const refuseRunningWorkspace = (cwd: string): void => {
  const holder = runningWorkspaceRun(cwd);
  if (holder !== undefined)
    fatal(`workspace ${cwd} already has running run ${holder.id}`, 2);
};
const ticketFor = (path: string) => {
  if (!existsSync(path)) fatal(`no such ticket: ${path}`, 2);
  const text = readFileSync(path, "utf8");
  const parsed = parseNextTicket(text);
  const accepted = parsed.success
    ? parsed
    : fatal(`invalid ticket: ${parsed.reason}`, 2);
  if (accepted.warnings.length > 0)
    process.stderr.write(
      `WARN ignored legacy ticket fields: ${accepted.warnings.join(", ")}\n`,
    );
  return { ticket: accepted.ticket, prose: accepted.prose };
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
      'If this work needs a tool release changeset, create it with `mise run changeset -- <tool> <patch|minor|major> "<entry>"`; do not hand-write a `.changes` file.',
      "",
      prose.trim(),
    ].join("\n"),
  );
const persistInterim = (id: string, path: string, message: string): void => {
  const parsed = parseReturn(message);
  if (parsed.kind !== "valid" || parsed.record.interim !== true) return;
  const progressText = `${JSON.stringify(parsed.record)}\n`;
  if (existsSync(path) && readFileSync(path, "utf8") === progressText) return;
  writeFileSync(path, progressText);
  append({ kind: "progress", id, at: now(), path });
};

const LegacyReport = z.looseObject({
  summary: z.string().optional(),
  changes: z.array(z.unknown()).optional(),
});

export function earlyQuitRows(ticket: string, cwd: string): string[] {
  return foldedRuns()
    .filter((priorRun) => priorRun.ticket === ticket && priorRun.cwd === cwd)
    .flatMap((priorRun) => {
      if (priorRun.failed_early_quit) return [priorRun.row];
      const endedAt = priorRun.ended_at;
      const reportPath = priorRun.report_path;
      if (
        priorRun.state !== "ended" ||
        priorRun.exit !== 0 ||
        priorRun.returned !== undefined ||
        priorRun.changed_files !== undefined ||
        endedAt === null ||
        reportPath === null
      )
        return [];
      const duration = fromThrowable(
        () =>
          Temporal.Instant.from(endedAt)
            .since(Temporal.Instant.from(priorRun.started_at))
            .total({ unit: "seconds" }),
        (error) => error,
      )();
      if (!duration.isOk() || duration.value >= 120) return [];
      const text = fromThrowable(
        () => readFileSync(reportPath, "utf8"),
        (error) => error,
      )();
      if (!text.isOk()) return [];
      const report = jsonOf(LegacyReport).safeParse(text.value);
      if (!report.success) return [];
      const returned = report.data.summary?.includes("agx-return") ?? false;
      return !returned && report.data.changes?.length === 0
        ? [priorRun.row]
        : [];
    });
}

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
): Promise<
  { cmd: string; exit: number; log_path: string; kind: VerifyKind }[]
> => {
  const results: {
    cmd: string;
    exit: number;
    log_path: string;
    kind: VerifyKind;
  }[] = [];
  for (const [index, cmd] of commands.entries()) {
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
    process.stderr.write(`VERIFY exit=${exit} ${cmd} kind=${kind}\n`);
    results.push({ cmd, exit, log_path: logPath, kind });
  }
  return results;
};

export function check(flags: Flags): number {
  const path = value(flags, "ticket");
  const cwd = resolve(value(flags, "cd") ?? process.cwd());
  if (path === undefined) return fatal("check requires positional TICKET", 2);
  const { ticket } = ticketFor(path);
  overlapWarnings(ticket.writes);
  const premises = checkPremises(ticket.premises, cwd);
  if (premises.status === "missing") {
    return fatal(
      `missing premises in --cd tree: ${premises.details.join("; ")}`,
      2,
    );
  }
  if (premises.status === "timeout") fatal("premise check timed out", 2);
  process.stdout.write(
    `OK ticket=${ticket.name ?? basename(path)} cwd=${cwd}\n`,
  );
  return 0;
}

export async function run(flags: Flags): Promise<number> {
  const path = value(flags, "ticket");
  const cwd = resolve(value(flags, "cd") ?? process.cwd());
  const sandbox = value(flags, "sandbox") ?? "workspace-write";
  if (path === undefined) return fatal("run requires positional TICKET", 2);
  if (!new Set(["none", "read-only", "workspace-write"]).has(sandbox))
    return fatal("--sandbox must be none, read-only, or workspace-write", 2);
  const { ticket, prose } = ticketFor(path);
  refuseRunningWorkspace(cwd);
  overlapWarnings(ticket.writes);
  const staleRefLocks = ownerlessRefLocks(cwd);
  if (staleRefLocks.length > 0) {
    const details = staleRefLocks
      .map(
        ({ path: lockPath, ageMs }) =>
          `${lockPath} age=${Math.floor(ageMs / 1_000)}s`,
      )
      .join("; ");
    return fatal(
      `ownerless Git ref lock(s) block dispatch: ${details}. Confirm no holder, then repair with: rip <path>`,
      2,
    );
  }
  const premises = checkPremises(ticket.premises, cwd);
  if (premises.status === "missing")
    return fatal(
      `missing premises in --cd tree: ${premises.details.join("; ")}`,
      2,
    );
  if (premises.status === "timeout") return fatal("premise check timed out", 2);
  const continuationId = value(flags, "continue");
  const pinned =
    continuationId === undefined
      ? undefined
      : await pinContinuation(continuationId, path);
  const resumeSession = pinned?.resumeSession;
  const row =
    pinned?.row ??
    (await route(
      `Proposition ${ticket.proposition.id}: ${ticket.proposition.claim}\n${prose}`,
      ticket.capabilities,
      ticket.timeout_s ?? 600,
      earlyQuitRows(ticket.name ?? basename(path), cwd),
    ));
  const id = randomUUID();
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
  for (const [signal, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
    ["SIGHUP", 129],
  ] as const)
    process.on(signal, () => process.exit(code));
  const runDir = join(stateDir(), "runs", id);
  mkdirSync(runDir, { recursive: true });
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
  const workspaceLock = await acquireWorkspaceLock(workspace);
  if (!workspaceLock.ok) {
    // The winning process may be between flock and publishing its started event.
    // Only diagnostics wait (at most 100 ms); acquisition itself never waits or retries.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      refuseRunningWorkspace(cwd);
      await Bun.sleep(10);
    }
    return fatal(
      `cannot start in workspace ${workspace}: ${workspaceLock.error}`,
      2,
    );
  }
  // Also covers runs started by an older binary while this invocation was routing.
  refuseRunningWorkspace(cwd);
  append({
    kind: "started",
    id,
    at: now(),
    ticket: ticket.name ?? basename(path),
    writes: ticket.writes,
    cwd,
    workspace,
    row: row.id,
    dispatcher_session: dispatcher,
    vendor_session: resumeSession ?? null,
    continues: continuationId ?? null,
    pid: process.pid,
  });

  const workerPath =
    process.env.AGX_NEXT_WORKER ??
    join(
      import.meta.dir,
      "..",
      "workers",
      row.route === "codex" ? "codex.ts" : "run-claude.ts",
    );
  const workerArgs = (): string[] => {
    if (process.env.AGX_NEXT_WORKER !== undefined)
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
  process.on("exit", () => {
    child.kill();
  });
  const outputPromise =
    child.stdout === null
      ? Promise.resolve("")
      : new Response(child.stdout).text();
  let progressOffset = 0;
  const progressWatcher = setInterval(() => {
    if (!existsSync(interimPath)) return;
    const data = readFileSync(interimPath, "utf8");
    const fresh = data.slice(progressOffset);
    progressOffset = data.length;
    const last = fresh.trim().split("\n").at(-1);
    if (last === undefined || last === "") return;
    const record = jsonOf(
      z.looseObject({ last_message: z.string() }),
    ).safeParse(last);
    if (!record.success) return;
    persistInterim(id, progressPath, record.data.last_message);
  }, 100);
  const exit = await child.exited;
  clearInterval(progressWatcher);
  const output = await outputPromise;
  const after = workspaceSnapshot(cwd, ticket.writes);
  const changed =
    before.isOk() && after.isOk()
      ? changedFiles(before.value, after.value)
      : undefined;
  const verify = await runVerify(ticket.verify, cwd, runDir, runEnv);
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
      timed_out: z.boolean().optional(),
      exit_code: z.number().optional(),
    }),
  ).safeParse(receiptLine);
  const workerReceipt = receipt.success ? receipt.data : {};
  const parsedReport = parseReport(
    workerReceipt.structured_output ?? workerReceipt.report,
    workerReceipt.last_message ?? receiptLine,
  );
  const outcome = deriveOutcome({
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
  const report = parsedReport.ok
    ? parsedReport.report
    : {
        raw: output.trim(),
        error: parsedReport.error,
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
      persistInterim(id, progressPath, interim.data.last_message);
  }
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
  temp.remove();
  await workspaceLock.release();
  process.stdout.write(
    `${JSON.stringify({ id, ticket: ticket.name ?? basename(path), row: row.id, exit, outcome, report_path: reportPath, state_file: recordPath(), host: hostname() })}\n`,
  );
  return exit;
}

const selectedRuns = (
  rows: ReturnType<typeof foldedRuns>,
  selector: string | undefined,
  startedAt: Map<string, string>,
): { rows: ReturnType<typeof foldedRuns>; error?: string } => {
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
      ...new Set(rows.map((entry) => entry.ticket)),
    ]
      .toSorted()
      .slice(0, 10)
      .join(", ")}`,
  };
};

export function list(flags: Flags): number {
  const running = flags.running === true || value(flags, "running") === "true";
  const rows = foldedRuns().filter(
    (entry) => !running || entry.state === "running",
  );
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
        `${entry.id} ${entry.state} ${entry.ticket} row=${entry.row} exit=${entry.exit ?? "-"} outcome=${entry.outcome ?? "-"}`,
    )
    .join("\n");
  if (asJson)
    output = `${JSON.stringify(selector === undefined ? rows : visible)}\n`;
  else if (selector === undefined && visible.length > 0) {
    output += "\n";
    const older = rows.length - visible.length;
    if (older > 0) output += `… ${older} older (agx ls --all)\n`;
  }
  process.stdout.write(output);
  return 0;
}

export function judgeRun(flags: Flags): number {
  const id = value(flags, "id");
  const decision = value(flags, "decision");
  if (id === undefined || decision === undefined)
    return fatal("judge requires RUN_ID and accept|reject", 2);
  if (decision !== "accept" && decision !== "reject")
    return fatal("judge decision must be accept or reject", 2);
  if (!foldedRuns().some((entry) => entry.id === id))
    return fatal(`unknown run ${id}`, 2);
  append({
    kind: "judged",
    id,
    at: now(),
    decision,
    note: value(flags, "note") ?? "",
  });
  return 0;
}

export async function stats(flags: Flags): Promise<number> {
  const importFlag =
    flags.importLegacy === true || value(flags, "import-legacy") === "true";
  const legacyImport = importFlag ? await importLegacyRecords() : undefined;
  const all = events();
  const runs = foldedRuns();
  const report = {
    runs: runs.length,
    running: runs.filter((entry) => entry.state === "running").length,
    ended: runs.filter((entry) => entry.state === "ended").length,
    orphaned: runs.filter((entry) => entry.state === "orphaned").length,
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
