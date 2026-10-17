import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fromThrowable } from "neverthrow";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { validateSlug } from "../../../shared/src/slug.ts";
import { checkPremises } from "../premises.ts";
import { verifyLine } from "../ticket.ts";
import { parseReport, parseReturn, withReportInstruction } from "../report.ts";
import { parseNextTicket, type NextTicket } from "./ticket.ts";
import { ticketContext, ticketPlacement } from "./ticket-home.ts";
import {
  append,
  flushRunPublications,
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
import { leaseFor, type StopSignal } from "./lease.ts";
import { route } from "./route.ts";
import {
  loadRoster,
  routeFilterLabel,
} from "../../../../agents/models/roster.ts";
import { pinContinuation } from "./continue.ts";
import { createRunTemp } from "../temp.ts";
import { exitWithError } from "./exit.ts";
import { ownerlessRefLocks } from "../../../shared/src/ref-locks.ts";
import {
  DispatchBindingSchema,
  type DispatchBinding,
} from "../../../shared/src/agx-dispatch-binding.ts";
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
const ticketFor = async (path: string, newDispatch = true) => {
  const bytes = await readFile(path).catch(() =>
    fatal(`no such ticket: ${path}`, 2),
  );
  const parsed = parseNextTicket(bytes.toString("utf8"));
  const accepted = parsed.success
    ? parsed
    : fatal(`invalid ticket: ${parsed.reason}`, 2);
  if (newDispatch) {
    const slug = validateSlug(
      accepted.ticket.name ?? basename(path, ".md"),
      "tkt new",
    );
    if (!slug.ok) return fatal(String(slug.error));
  }
  if (accepted.warnings.length > 0)
    process.stderr.write(
      `WARN ignored legacy ticket fields: ${accepted.warnings.join(", ")}\n`,
    );
  return { ticket: accepted.ticket, prose: accepted.prose, bytes };
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
  // A worker in another workspace of this repository still checks its own base
  // commit. Scratch directories and unrelated repositories cannot select context.
  const worker =
    resolve(cwd) === repository.root ? repository : await ticketContext(cwd);
  const ctx =
    worker.ok && worker.vcs !== undefined && worker.root === repository.root
      ? { ...repository, base_rev: worker.base_rev, revision: worker.revision }
      : repository;
  if (ticket.base_rev !== undefined && ticket.base_rev !== ctx.base_rev)
    return fatal(
      `base_rev mismatch: ticket ${resolve(path)}, declared ${ticket.base_rev}, repository ${ctx.root}, worker ${cwd} commit ${ctx.base_rev ?? "unavailable"}`,
    );
  return ctx;
};
const premiseCommits = async (
  ticket: NextTicket,
  ctx: Awaited<ReturnType<typeof contextFor>>,
) => {
  const commits: { premise: string; commit: string }[] = [];
  for (const premise of ticket.premises ?? []) {
    let reference = /^(?:rev|bookmark):(.+)$/u.exec(premise)?.[1];
    if (
      ctx.vcs === "git" &&
      premise.startsWith("bookmark:") &&
      reference !== undefined
    ) {
      const at = reference.lastIndexOf("@");
      reference =
        at < 0
          ? `refs/heads/${reference}`
          : `refs/remotes/${reference.slice(at + 1)}/${reference.slice(0, at)}`;
    }
    const commit =
      reference === undefined ? ctx.base_rev : await ctx.revision(reference);
    if (commit === null)
      return fatal(`cannot resolve premise commit: ${premise}`);
    commits.push({ premise, commit });
  }
  return commits;
};
const checkedPremises = (
  ticket: NextTicket,
  cwd: string,
  vcs: string | undefined,
) =>
  checkPremises(
    ticket.premises?.filter(
      (premise) => vcs !== "git" || !premise.startsWith("rev:"),
    ),
    cwd,
  );
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

export async function earlyQuitRows(
  ticket: string,
  cwd: string,
): Promise<string[]> {
  return (await foldedRuns())
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

export async function check(flags: Flags): Promise<number> {
  const path = value(flags, "ticket");
  const cwd = resolve(value(flags, "cd") ?? process.cwd());
  if (path === undefined) return fatal("check requires positional TICKET", 2);
  const { ticket } = await ticketFor(path);
  const ctx = await contextFor(path, cwd, ticket);
  overlapWarnings(ticket.writes);
  const premises = checkedPremises(ticket, cwd, ctx.vcs);
  if (premises.status === "missing") {
    return fatal(
      `missing premises in --cd tree: ${premises.details.join("; ")}`,
      2,
    );
  }
  if (premises.status === "timeout") fatal("premise check timed out", 2);
  await premiseCommits(ticket, ctx);
  const loaded = await loadRoster(process.env.DISPATCH_ROSTER_PATH);
  if (!loaded.ok)
    return fatal(`cannot read dispatch roster: ${loaded.error}`, 1);
  process.stdout.write(
    `OK ticket=${ticket.name ?? basename(path, ".md")} cwd=${cwd} ${routeFilterLabel(loaded.value.auto)}\n`,
  );
  return 0;
}

export async function run(flags: Flags): Promise<number> {
  const path = value(flags, "ticket");
  const cwd = resolve(value(flags, "cd") ?? process.cwd());
  if (path === undefined) return fatal("run requires positional TICKET", 2);
  const { ticket, prose, bytes } = await ticketFor(
    path,
    value(flags, "continue") === undefined,
  );
  const actualUnit = await invocationUnitFor();
  const ticketName = ticket.name ?? basename(path, ".md");
  const rawBinding = value(flags, "dispatchBinding");
  let binding: DispatchBinding | undefined;
  if (rawBinding !== undefined) {
    const parsedBinding = jsonOf(DispatchBindingSchema).safeParse(rawBinding);
    if (!parsedBinding.success)
      return fatal(`invalid dispatch binding: ${parsedBinding.error.message}`);
    binding = parsedBinding.data;
    if (binding.ticket !== ticketName || resolve(binding.workspace) !== cwd)
      return fatal(
        "dispatch binding does not match the ticket and --cd workspace",
      );
  }
  const sandbox =
    value(flags, "sandbox") ?? ticket.sandbox ?? "workspace-write";
  if (!new Set(["none", "read-only", "workspace-write"]).has(sandbox))
    return fatal("--sandbox must be none, read-only, or workspace-write", 2);
  if (ticket.sandbox !== undefined && ticket.sandbox !== sandbox)
    return fatal(
      `--sandbox ${sandbox} differs from ticket sandbox ${ticket.sandbox}`,
    );
  await refuseRunningWorkspace(cwd);
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
  const ctx = await contextFor(path, cwd, ticket);
  if (ctx.base_rev === null)
    return fatal("cannot resolve --cd commit for base_rev");
  const premises = checkedPremises(ticket, cwd, ctx.vcs);
  if (premises.status === "missing")
    return fatal(
      `missing premises in --cd tree: ${premises.details.join("; ")}`,
      2,
    );
  if (premises.status === "timeout") return fatal("premise check timed out", 2);
  const continuationId = value(flags, "continue");
  const supersedes = value(flags, "supersedes") ?? ticket.supersedes;
  if (continuationId !== undefined && supersedes !== undefined)
    return fatal("supersedes and --continue are mutually exclusive");
  if (
    supersedes !== undefined &&
    !(await foldedRuns()).some((prior) => prior.id === supersedes)
  )
    return fatal(`cannot supersede unknown run ${supersedes}`);
  const premise_commits = await premiseCommits(ticket, ctx);
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
      await earlyQuitRows(ticketName, cwd),
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
    continues: continuationId ?? null,
    supersedes: supersedes ?? null,
    base_rev: ctx.base_rev,
    premise_commits,
    ticket_path: resolve(path),
    ticket_orig_path: ticketPath,
    ticket_sha256,
    pid: process.pid,
    lease: startedLease,
  });

  started = true;

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
  if (stopTask !== undefined) await stopTask;
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
  const running = flags.running === true || value(flags, "running") === "true";
  const rows = (await foldedRuns()).filter(
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
    if (older > 0) output += `… ${older} older (agx ls --all)\n`;
  }
  process.stdout.write(output);
  return 0;
}

export async function judgeRun(flags: Flags): Promise<number> {
  const id = value(flags, "id");
  const decision = value(flags, "decision");
  if (id === undefined || decision === undefined)
    return fatal("judge requires RUN_ID and accept|reject", 2);
  if (decision !== "accept" && decision !== "reject")
    return fatal("judge decision must be accept or reject", 2);
  if (!(await foldedRuns()).some((entry) => entry.id === id))
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
