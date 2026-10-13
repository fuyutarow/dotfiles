// Repository-wide write ownership shared by dispatcher sessions through agx's state directory.
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fromThrowable } from "neverthrow";
import { errorMessage } from "../../shared/src/attempt.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { ledgerLines, appendLedgerLine } from "./ledger.ts";
import { workspaceRoot } from "./lifecycle.ts";
import { globsOverlap } from "./ticket.ts";

export type WriteLease = Readonly<{
  repo: string;
  run_id: string;
  cwd: string;
  writes: string[];
  ticket: string;
  dispatcher_session: string;
  since: string;
}>;

const EvidenceSchema = z.object({
  run_id: z.string().optional(),
  kind: z.string().optional(),
  cwd: z.string().optional(),
  repo: z.string().optional(),
  workspace: z.string().optional(),
  display_id: z.string().optional(),
  dispatcher_session: z.string().optional(),
  pid: z.number().optional(),
  unit: z.string().optional(),
  ticket: z
    .object({
      writes: z.array(z.string()).optional(),
      name: z.string().optional(),
    })
    .optional(),
  started_at: z.string().optional(),
  at: z.string().optional(),
  accept: z.boolean().optional(),
  review: z.string().optional(),
  no_review: z.string().optional(),
  worker: z.object({ session: z.string().optional() }).optional(),
  reason: z.string().optional(),
  resumed_from: z.string().optional(),
  predecessor: z.string().optional(),
  lease_version: z.literal(1).optional(),
  facts: z.object({ changed_files: z.array(z.string()).optional() }).optional(),
});
export type LeaseEvidence = z.output<typeof EvidenceSchema>;
export type WorkspaceChanges = { changed: boolean; error?: string };

function* leaseEvidenceLines(stateDir: string): Generator<string> {
  const events = join(stateDir, "events");
  const admissions = join(stateDir, "admissions");
  if (existsSync(admissions))
    for (const entryName of readdirSync(admissions).filter((name) =>
      name.endsWith(".json"),
    ))
      yield readFileSync(join(admissions, entryName), "utf8");
  yield* ledgerLines(stateDir);
  if (existsSync(events))
    for (const name of readdirSync(events).filter((entryName) =>
      entryName.endsWith(".jsonl"),
    ))
      yield* readFileSync(join(events, name), "utf8").split("\n");
}

/** Lifecycle rows do not require routing fields; streaming bounds memory on large ledgers. */
export function readLeaseEvidence(stateDir: string): LeaseEvidence[] {
  const rows: LeaseEvidence[] = [];
  let previous: string | undefined;
  for (const line of leaseEvidenceLines(stateDir)) {
    // An identical adjacent receipt adds no lifecycle evidence.
    if (line === previous) continue;
    previous = line;
    const parsed = jsonOf(EvidenceSchema).safeParse(line);
    if (parsed.success) rows.push(parsed.data);
  }
  return rows;
}

const LegacyLease = z.object({
  repo: z.string(),
  run_id: z.string(),
  cwd: z.string(),
  writes: z.array(z.string()),
  ticket: z.string(),
  dispatcher_session: z.string(),
  since: z.string(),
});

/** A 3.5.0 receipt requires independent matching run metadata; cache content alone grants nothing. */
const FIRST_LEASE_DEPLOYMENT_MS = Temporal.Instant.from(
  "2026-10-12T13:39:37Z",
).epochMilliseconds;

function leaseEra(row: LeaseEvidence): boolean {
  const encoded =
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2}(?:\.\d+)?)Z/u.exec(
      row.run_id ?? "",
    );
  const at =
    encoded === null
      ? row.started_at
      : `${encoded[1]}T${encoded[2]}:${encoded[3]}:${encoded[4]}Z`;
  if (at === undefined) return false;
  const parsed = fromThrowable(
    () => Temporal.Instant.from(at).epochMilliseconds,
    errorMessage,
  )();
  return parsed.isOk() && parsed.value >= FIRST_LEASE_DEPLOYMENT_MS;
}

function legacyAdmissions(input: FoldInput): LeaseEvidence[] {
  const dir = repoLeaseDir(input.stateDir, input.repo);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const parsed = jsonOf(LegacyLease).safeParse(
        readFileSync(join(dir, name), "utf8"),
      );
      if (!parsed.success) return [];
      const lease = parsed.data;
      if (
        input.evidence.some(
          (row) =>
            row.run_id === lease.run_id &&
            row.kind === "admitted" &&
            row.cwd !== undefined &&
            row.ticket?.name !== undefined &&
            (row.ticket.writes?.length ?? 0) > 0,
        )
      )
        return [];
      const matches = input.evidence.some(
        (row) =>
          row.run_id === lease.run_id &&
          leaseEra(row) &&
          row.cwd !== undefined &&
          (row.repo ?? workspaceRoot(row.cwd)) === input.repo &&
          workspaceDirectory(row.cwd) === workspaceDirectory(lease.cwd) &&
          row.ticket?.name === lease.ticket &&
          row.ticket.writes !== undefined &&
          JSON.stringify(row.ticket.writes.toSorted()) ===
            JSON.stringify(lease.writes.toSorted()),
      );
      if (!matches || lease.repo !== input.repo) return [];
      return [
        {
          kind: "admitted",
          lease_version: 1,
          run_id: lease.run_id,
          repo: lease.repo,
          cwd: lease.cwd,
          ticket: { name: lease.ticket, writes: lease.writes },
          dispatcher_session: lease.dispatcher_session,
          started_at: lease.since,
        } satisfies LeaseEvidence,
      ];
    });
}

type ReadOnlyObservation = {
  exit: number | null;
  stdout: string;
  stderr: string;
};
type ReadOnlyJj = (args: string[], cwd: string) => ReadOnlyObservation;
function observeJj(args: string[], cwd: string): ReadOnlyObservation {
  const child = Bun.spawnSync(
    ["jj", "--ignore-working-copy", "--no-pager", "--color", "never", ...args],
    { cwd, stdout: "pipe", stderr: "pipe", timeout: 5_000 },
  );
  return {
    exit: child.exitCode,
    stdout: child.stdout.toString(),
    stderr: child.stderr.toString(),
  };
}

/** A clean stored tree is usable only while the filesystem still matches its snapshot epoch. */
function snapshotIsCurrent(
  cwd: string,
  tracked: string[],
  sparse: string[],
): boolean {
  const snapshotAt = statSync(
    join(cwd, ".jj", "working_copy", "tree_state"),
  ).mtimeMs;
  const paths = new Set([cwd]);
  for (const file of tracked) {
    if (
      !sparse.some(
        (prefix) =>
          prefix === "." || file === prefix || file.startsWith(prefix + "/"),
      )
    )
      continue;
    const path = resolve(cwd, file);
    if (!path.startsWith(resolve(cwd) + "/")) return false;
    paths.add(path);
    let parent = dirname(path);
    while (parent !== resolve(cwd)) {
      paths.add(parent);
      parent = dirname(parent);
    }
  }
  return [...paths].every((path) => statSync(path).mtimeMs <= snapshotAt);
}

/** Reads only: jj cannot snapshot or write .jj. An unavailable/stale observation fails closed. */
export function workspaceChanges(
  cwd: string,
  observe: ReadOnlyJj = observeJj,
): WorkspaceChanges {
  if (!existsSync(join(cwd, ".jj")))
    return {
      changed: true,
      error: "jj workspace unavailable; assuming changes (fail closed)",
    };
  const result = fromThrowable((): WorkspaceChanges => {
    const diff = observe(
      ["diff", "--from", "trunk()", "--to", "@", "--summary"],
      cwd,
    );
    if (diff.exit !== 0)
      return {
        changed: true,
        error:
          diff.stderr.trim() === ""
            ? "jj diff failed (fail closed)"
            : diff.stderr.trim(),
      };
    if (diff.stdout.trim() !== "") return { changed: true };
    const files = observe(["file", "list", "-r", "@"], cwd);
    if (files.exit !== 0)
      return {
        changed: true,
        error:
          files.stderr.trim() === ""
            ? "jj file list failed (fail closed)"
            : files.stderr.trim(),
      };
    const sparse = observe(["sparse", "list"], cwd);
    if (sparse.exit !== 0)
      return {
        changed: true,
        error: "jj sparse list failed (fail closed): " + sparse.stderr.trim(),
      };
    if (
      !snapshotIsCurrent(
        cwd,
        files.stdout.split("\n").filter((path) => path !== ""),
        sparse.stdout.split("\n").filter((path) => path !== ""),
      )
    )
      return {
        changed: true,
        error:
          "jj working-copy snapshot is stale; current filesystem changes are unknown (fail closed)",
      };
    return { changed: false };
  }, errorMessage)();
  return result.isOk() ? result.value : { changed: true, error: result.error };
}

function processAlive(pid: number | undefined): boolean {
  if (pid === undefined || !Number.isSafeInteger(pid) || pid <= 0) return false;
  const result = fromThrowable(() => process.kill(pid, 0), errorMessage)();
  return result.isOk() || result.error.includes("EPERM");
}

function unitAlive(unit: string): boolean {
  const command =
    process.platform === "darwin"
      ? ["launchctl", "list", unit]
      : [
          "systemctl",
          "--user",
          "show",
          unit,
          "--property=ActiveState",
          "--value",
        ];
  const result = fromThrowable(
    () =>
      Bun.spawnSync(command, {
        stdout: "pipe",
        stderr: "pipe",
        timeout: 2_000,
      }),
    errorMessage,
  )();
  if (result.isErr() || result.value.exitCode !== 0) return false;
  if (process.platform === "darwin")
    return /"PID"\s*=\s*\d+/u.test(result.value.stdout.toString());
  return ["active", "activating", "reloading"].includes(
    result.value.stdout.toString().trim(),
  );
}

const hash = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

function repoLeaseDir(stateDir: string, repo: string): string {
  return join(stateDir, "write-leases", hash(repo));
}

/** Admission metadata is authority; write-lease files are only a disposable projection. */
function saveAdmission(stateDir: string, record: LeaseEvidence): void {
  const dir = join(stateDir, "admissions");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, hash(record.run_id ?? "") + ".json");
  const temporary = path + "." + process.pid + ".tmp";
  writeFileSync(temporary, JSON.stringify(record));
  const descriptor = openSync(temporary, "r");
  fsyncSync(descriptor);
  closeSync(descriptor);
  renameSync(temporary, path);
}

function saveLease(dir: string, lease: WriteLease): void {
  const path = join(dir, `${hash(lease.run_id)}.json`);
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(lease));
  renameSync(temp, path);
}

type LockResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; exitCode?: number };

const REPO_LOCK_WAIT_MS = 30_000;
const REPO_LOCK_TIMEOUT_EXIT = 75;
const epochMilliseconds = () => Temporal.Now.instant().epochMilliseconds;
type LockHolder = Readonly<{ run_id?: string; ticket?: string }>;
type LockOwner = Readonly<{
  pid: number;
  run_id?: string;
  ticket?: string;
  since: string;
}>;

function lockOwnerIsDead(path: string): boolean {
  const ownerText = fromThrowable(
    () => readFileSync(path, "utf8"),
    errorMessage,
  )();
  if (ownerText.isErr()) return false;
  const parsed = jsonOf(
    z.object({ pid: z.number().int().positive() }),
  ).safeParse(ownerText.value);
  const pid = parsed.success ? parsed.data.pid : Number(ownerText.value);
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  const alive = fromThrowable(() => process.kill(pid, 0), errorMessage)();
  return alive.isErr() && alive.error.includes("ESRCH");
}

function waitForLockOrReap(
  path: string,
  wait: Int32Array,
  remainingMs: number,
): void {
  if (lockOwnerIsDead(path)) {
    fromThrowable(() => {
      unlinkSync(path);
    }, errorMessage)();
    return;
  }
  Atomics.wait(wait, 0, 0, Math.min(25, remainingMs));
}

function lockHolderDescription(path: string): string {
  const ownerText = fromThrowable(
    () => readFileSync(path, "utf8"),
    errorMessage,
  )();
  if (ownerText.isErr()) return "holder unknown";
  const parsed = jsonOf(
    z.object({
      pid: z.number().int().positive(),
      run_id: z.string().optional(),
      ticket: z.string().optional(),
      since: z.string(),
    }),
  ).safeParse(ownerText.value);
  if (!parsed.success) {
    if (/^\d+$/u.test(ownerText.value))
      return `pid ${ownerText.value}, held duration unknown`;
    return "holder unknown";
  }
  const owner = parsed.data;
  const held = fromThrowable(
    () =>
      Math.max(
        0,
        epochMilliseconds() -
          Temporal.Instant.from(owner.since).epochMilliseconds,
      ),
    errorMessage,
  )();
  const run = owner.run_id === undefined ? "" : `, run ${owner.run_id}`;
  const ticket = owner.ticket === undefined ? "" : `, ticket ${owner.ticket}`;
  let duration = "unknown duration";
  if (held.isOk()) duration = `${Math.round(held.value / 1000)}s`;
  return `pid ${owner.pid}${run}${ticket}, held ${duration}`;
}

function withRepoLock<T>(
  dir: string,
  holder: LockHolder,
  operation: () => T,
  waitMs = REPO_LOCK_WAIT_MS,
): LockResult<T> {
  const made = fromThrowable(
    () => mkdirSync(dir, { recursive: true }),
    errorMessage,
  )();
  if (made.isErr()) return { ok: false, error: made.error };
  const lock = join(dir, ".lock");
  const wait = new Int32Array(new SharedArrayBuffer(4));
  const startedAt = epochMilliseconds();
  let descriptor: number | undefined;
  while (epochMilliseconds() - startedAt < waitMs) {
    const opened = fromThrowable(() => openSync(lock, "wx"), errorMessage)();
    if (opened.isErr() && !opened.error.includes("EEXIST"))
      return { ok: false, error: opened.error };
    if (opened.isErr()) {
      waitForLockOrReap(lock, wait, waitMs - (epochMilliseconds() - startedAt));
      continue;
    }
    const acquiredDescriptor = opened.value;
    descriptor = acquiredDescriptor;
    const owner: LockOwner = {
      pid: process.pid,
      ...(holder.run_id === undefined ? {} : { run_id: holder.run_id }),
      ...(holder.ticket === undefined ? {} : { ticket: holder.ticket }),
      since: Temporal.Now.instant().toString(),
    };
    const written = fromThrowable(() => {
      writeSync(acquiredDescriptor, JSON.stringify(owner));
      closeSync(acquiredDescriptor);
    }, errorMessage)();
    if (written.isErr()) {
      fromThrowable(() => {
        unlinkSync(lock);
      }, errorMessage)();
      return { ok: false, error: written.error };
    }
    break;
  }
  if (descriptor === undefined) {
    const identity = lockHolderDescription(lock);
    return {
      ok: false,
      error: `timed out after ${waitMs}ms waiting for the repository write-lease lock (${identity})`,
      exitCode: REPO_LOCK_TIMEOUT_EXIT,
    };
  }
  const result = fromThrowable(operation, errorMessage)();
  const released = fromThrowable(() => {
    unlinkSync(lock);
  }, errorMessage)();
  if (result.isErr()) return { ok: false, error: result.error };
  if (released.isErr()) return { ok: false, error: released.error };
  return { ok: true, value: result.value };
}

type FoldInput = {
  stateDir: string;
  repo: string;
  activeRunIds: ReadonlySet<string>;
  evidence: readonly LeaseEvidence[];
  workspaceChanges?: (cwd: string) => WorkspaceChanges;
  unitAlive?: (unit: string) => boolean;
  processAlive?: (pid: number | undefined) => boolean;
};
type LeaseDecision = {
  lease: WriteLease;
  live: boolean;
  held: boolean;
  abandoned: boolean;
  error?: string;
};

function workspaceDirectory(cwd: string): string {
  let directory = resolve(cwd);
  while (dirname(directory) !== directory) {
    const gitPath = join(directory, ".git");
    const git = fromThrowable(() => lstatSync(gitPath), errorMessage)();
    if (
      existsSync(join(directory, ".jj")) ||
      existsSync(join(directory, ".git", "HEAD")) ||
      (git.isOk() && git.value.isFile())
    )
      return directory;
    directory = dirname(directory);
  }
  return resolve(cwd);
}

const lineage = (lease: WriteLease) =>
  JSON.stringify([lease.ticket, workspaceDirectory(lease.cwd)]);

function propagateJudgments(parents: string[][], judged: Set<string>): boolean {
  let propagated = false;
  for (const [id, parent] of parents) {
    if (id === undefined || parent === undefined) continue;
    if (!(judged.has(id) || judged.has(parent))) continue;
    const before = judged.size;
    judged.add(id);
    judged.add(parent);
    propagated = propagated || judged.size !== before;
  }
  return propagated;
}

/** One computation for admission, listing and GC. Lease files are never an input. */
export function foldWriteLeases(input: FoldInput): LeaseDecision[] {
  const records = new Map<string, LeaseEvidence>();
  const admitted = new Set<string>();
  const finished = new Set<string>();
  const judged = new Set<string>();
  const detached = new Map<string, LeaseEvidence>();
  const started = new Set<string>();
  const released = new Set<string>();
  for (const row of [...legacyAdmissions(input), ...input.evidence]) {
    if (row.run_id === undefined) continue;
    if (
      row.kind === "admitted" &&
      row.cwd !== undefined &&
      row.ticket?.name !== undefined &&
      (row.ticket.writes?.length ?? 0) > 0
    )
      admitted.add(row.run_id);
    const merged = EvidenceSchema.safeParse(
      Object.assign(
        {},
        records.get(row.run_id),
        Object.fromEntries(
          Object.entries(row).filter(([, value]) => value !== undefined),
        ),
      ),
    );
    if (merged.success) records.set(row.run_id, merged.data);
    if (["run", "abandoned", "lease-released"].includes(row.kind ?? ""))
      finished.add(row.run_id);
    if (row.kind === "acceptance" || row.kind === "landed")
      judged.add(row.run_id);
    if (row.kind === "detached") detached.set(row.run_id, row);
    if (["admitted", "started", "detached"].includes(row.kind ?? ""))
      started.add(row.run_id);
    if (row.kind === "lease-released") released.add(row.run_id);
  }
  const leases = new Map<string, WriteLease>();
  for (const [runId, row] of records) {
    const eligible = admitted.has(runId);
    if (
      !eligible &&
      !input.activeRunIds.has(runId) &&
      ((finished.has(runId) && !detached.has(runId)) || !started.has(runId))
    )
      continue;
    const cwd = row.cwd;
    const writes = row.ticket?.writes ?? [];
    if (cwd === undefined || (eligible && writes.length === 0)) continue;
    const repo = row.repo ?? workspaceRoot(cwd);
    if (repo !== input.repo) continue;
    leases.set(runId, {
      repo,
      run_id: runId,
      cwd: workspaceDirectory(cwd),
      writes,
      ticket:
        row.ticket?.name ?? row.display_id?.replace(/^agt_/u, "") ?? runId,
      dispatcher_session: row.dispatcher_session ?? "unknown",
      since: row.started_at ?? row.at ?? runId,
    });
  }
  const parents = [...records.entries()].flatMap(([id, row]) => {
    const parent = row.predecessor ?? row.resumed_from;
    if (parent === undefined || row.cwd === undefined) return [];
    const parentCwd = records.get(parent)?.cwd;
    return admitted.has(id) &&
      parentCwd !== undefined &&
      workspaceDirectory(parentCwd) === workspaceDirectory(row.cwd)
      ? [[id, parent]]
      : [];
  });
  while (propagateJudgments(parents, judged)) {
    /* bounded by the number of run IDs */
  }
  const judgedLineages = new Set(
    [...leases.values()]
      .filter((lease) => judged.has(lease.run_id))
      .map((lease) => lineage(lease)),
  );
  for (const [runId, row] of records) {
    if (
      judged.has(runId) &&
      row.cwd !== undefined &&
      row.ticket?.name !== undefined
    )
      judgedLineages.add(
        JSON.stringify([row.ticket.name, workspaceDirectory(row.cwd)]),
      );
  }
  const transferred = new Set(
    parents.flatMap((pair) =>
      pair[0] === undefined || pair[1] === undefined || released.has(pair[0])
        ? []
        : [pair[1]],
    ),
  );
  const changes = new Map<string, WorkspaceChanges>();
  const decisions: LeaseDecision[] = [];
  for (const lease of leases.values()) {
    const decision = decideLease(
      lease,
      input,
      records,
      detached,
      finished,
      started,
      released,
      judgedLineages,
      changes,
      admitted.has(lease.run_id),
    );
    decisions.push(
      transferred.has(lease.run_id)
        ? Object.assign({}, decision, { held: false })
        : decision,
    );
  }
  return decisions;
}

function decideLease(
  lease: WriteLease,
  input: FoldInput,
  records: Map<string, LeaseEvidence>,
  detached: Map<string, LeaseEvidence>,
  finished: Set<string>,
  started: Set<string>,
  released: Set<string>,
  judgedLineages: Set<string>,
  changes: Map<string, WorkspaceChanges>,
  eligible: boolean,
): LeaseDecision {
  const row = records.get(lease.run_id);
  const pending = detached.get(lease.run_id);
  const unit =
    pending?.unit ??
    (pending === undefined
      ? undefined
      : "agx-" + lease.ticket + "-" + hash(lease.run_id).slice(0, 8));
  const live =
    input.activeRunIds.has(lease.run_id) ||
    (unit !== undefined && (input.unitAlive ?? unitAlive)(unit)) ||
    (!finished.has(lease.run_id) &&
      (input.processAlive ?? processAlive)(row?.pid));
  const abandoned =
    !live &&
    !finished.has(lease.run_id) &&
    row !== undefined &&
    started.has(lease.run_id);
  if (live)
    return { lease, live, held: lease.writes.length > 0, abandoned: false };
  if (!eligible) return { lease, live, held: false, abandoned };
  if (
    released.has(lease.run_id) ||
    judgedLineages.has(lineage(lease)) ||
    !existsSync(lease.cwd)
  )
    return { lease, live, held: false, abandoned };
  let observation = changes.get(lease.cwd);
  if (observation === undefined) {
    observation = (input.workspaceChanges ?? workspaceChanges)(lease.cwd);
    changes.set(lease.cwd, observation);
  }
  return {
    lease,
    live,
    held: observation.changed,
    abandoned,
    ...(observation.error === undefined ? {} : { error: observation.error }),
  };
}

function rebuildLeases(dir: string, decisions: LeaseDecision[]): WriteLease[] {
  for (const name of readdirSync(dir).filter((entryName) =>
    entryName.endsWith(".json"),
  ))
    unlinkSync(join(dir, name));
  const held = decisions
    .filter((decision) => decision.held)
    .map((decision) => decision.lease);
  for (const lease of held) saveLease(dir, lease);
  return held;
}

export function reconcileWriteLeases(
  input: FoldInput,
): LockResult<WriteLease[]> {
  const dir = repoLeaseDir(input.stateDir, input.repo);
  const result = withRepoLock(dir, {}, () => {
    for (const admission of legacyAdmissions({
      ...input,
      evidence: [...readLeaseEvidence(input.stateDir), ...input.evidence],
    }))
      saveAdmission(input.stateDir, admission);
    const decisions = foldWriteLeases({
      ...input,
      evidence: [...readLeaseEvidence(input.stateDir), ...input.evidence],
    });
    for (const decision of decisions.filter((item) => item.abandoned)) {
      const appended = appendLedgerLine(
        input.stateDir,
        JSON.stringify({
          kind: "abandoned",
          run_id: decision.lease.run_id,
          cwd: decision.lease.cwd,
          ticket: {
            name: decision.lease.ticket,
            writes: decision.lease.writes,
          },
          at: Temporal.Now.instant().toString(),
          reason: "stopped externally",
        }) + "\n",
      );
      if (!appended.ok) return appended;
    }
    return { ok: true as const, value: rebuildLeases(dir, decisions) };
  });
  return result.ok ? result.value : result;
}

function overlapReason(
  runId: string,
  writes: string[],
  leases: readonly WriteLease[],
  owner: { ticket: string; cwd: string; predecessor?: string },
): string | undefined {
  const first = writes.flatMap((mine) =>
    leases.flatMap((held) =>
      held.run_id !== runId &&
      !(
        held.run_id === owner.predecessor &&
        workspaceDirectory(held.cwd) === workspaceDirectory(owner.cwd)
      ) &&
      !(
        held.ticket === owner.ticket &&
        workspaceDirectory(held.cwd) === workspaceDirectory(owner.cwd)
      ) &&
      held.writes.some((glob) => globsOverlap(mine, glob))
        ? [{ mine, held }]
        : [],
    ),
  )[0];
  return first === undefined
    ? undefined
    : `${first.mine} is held by run ${first.held.run_id} (ticket ${first.held.ticket}, dispatcher ${first.held.dispatcher_session.slice(0, 8)}, since ${first.held.since}); release: agx ledger note ${first.held.run_id} --reject --note "<reason>", or mise run land -- ${basename(first.held.cwd)} -m "land ${first.held.ticket}"; for externally stopped units first run agx ledger gc`;
}

export function claimWriteLease(input: {
  stateDir: string;
  repo: string;
  run_id: string;
  cwd: string;
  writes: string[];
  ticket: string;
  dispatcher_session: string;
  since: string;
  predecessor?: string;
  lockWaitMs?: number;
  activeRunIds: ReadonlySet<string>;
  evidence: readonly LeaseEvidence[];
  workspaceChanges?: (cwd: string) => WorkspaceChanges;
  unitAlive?: (unit: string) => boolean;
  processAlive?: (pid: number | undefined) => boolean;
}): LockResult<void> {
  if (input.writes.length === 0) return { ok: true, value: undefined };
  const dir = repoLeaseDir(input.stateDir, input.repo);
  const workspaceSnapshots = new Map<string, WorkspaceChanges>();
  const processSnapshots = new Map<number | undefined, boolean>();
  const unitSnapshots = new Map<string, boolean>();
  const snapshotEvidence = [
    ...readLeaseEvidence(input.stateDir),
    ...input.evidence,
  ];
  foldWriteLeases({
    ...input,
    evidence: snapshotEvidence,
    workspaceChanges: (cwd) => {
      const result = (input.workspaceChanges ?? workspaceChanges)(cwd);
      workspaceSnapshots.set(resolve(cwd), result);
      return result;
    },
    processAlive: (pid) => {
      const result = (input.processAlive ?? processAlive)(pid);
      processSnapshots.set(pid, result);
      return result;
    },
    unitAlive: (unit) => {
      const result = (input.unitAlive ?? unitAlive)(unit);
      unitSnapshots.set(unit, result);
      return result;
    },
  });
  const result = withRepoLock(
    dir,
    input,
    () => {
      const decisions = foldWriteLeases({
        ...input,
        evidence: [...readLeaseEvidence(input.stateDir), ...input.evidence],
        workspaceChanges: (cwd) =>
          workspaceSnapshots.get(resolve(cwd)) ?? {
            changed: true,
            error:
              "workspace appeared after admission preflight; assuming changes (fail closed)",
          },
        processAlive: (pid) => processSnapshots.get(pid) ?? true,
        unitAlive: (unit) => unitSnapshots.get(unit) ?? true,
      });
      const leases = decisions
        .filter((decision) => decision.held)
        .map((decision) => decision.lease);
      const conflict = overlapReason(input.run_id, input.writes, leases, input);
      if (conflict !== undefined) {
        const unavailable = decisions
          .filter((item) => item.held && item.error !== undefined)
          .map((item) => item.error)
          .join("; ");
        return {
          ok: false as const,
          reason: `${conflict}${unavailable === "" ? "" : `; workspace check failed closed: ${unavailable}`}`,
        };
      }
      for (const decision of decisions.filter((item) => item.abandoned)) {
        const appended = appendLedgerLine(
          input.stateDir,
          JSON.stringify({
            kind: "abandoned",
            run_id: decision.lease.run_id,
            cwd: decision.lease.cwd,
            ticket: {
              name: decision.lease.ticket,
              writes: decision.lease.writes,
            },
            at: Temporal.Now.instant().toString(),
            reason: "stopped externally",
          }) + "\n",
        );
        if (!appended.ok) return { ok: false as const, reason: appended.error };
      }
      const predecessor =
        input.predecessor ??
        leases.find(
          (lease) =>
            lease.ticket === input.ticket &&
            workspaceDirectory(lease.cwd) === workspaceDirectory(input.cwd),
        )?.run_id;
      saveAdmission(input.stateDir, {
        kind: "admitted",
        lease_version: 1,
        ...(predecessor === undefined ? {} : { predecessor }),
        run_id: input.run_id,
        repo: input.repo,
        cwd: input.cwd,
        ticket: { name: input.ticket, writes: input.writes },
        dispatcher_session: input.dispatcher_session,
        started_at: input.since,
        pid: process.pid,
      });
      saveLease(dir, {
        repo: input.repo,
        run_id: input.run_id,
        cwd: input.cwd,
        writes: input.writes,
        ticket: input.ticket,
        dispatcher_session: input.dispatcher_session,
        since: input.since,
      });
      return { ok: true as const };
    },
    input.lockWaitMs,
  );
  if (!result.ok) return result;
  return result.value.ok
    ? { ok: true, value: undefined }
    : { ok: false, error: result.value.reason };
}

export function releaseWriteLease(input: {
  stateDir: string;
  repo: string;
  run_id: string;
}): LockResult<void> {
  const dir = repoLeaseDir(input.stateDir, input.repo);
  return withRepoLock(dir, { run_id: input.run_id }, () => {
    const appended = appendLedgerLine(
      input.stateDir,
      JSON.stringify({
        kind: "lease-released",
        run_id: input.run_id,
        at: Temporal.Now.instant().toString(),
      }) + "\n",
    );
    if (!appended.ok) return;
    const path = join(dir, `${hash(input.run_id)}.json`);
    if (existsSync(path)) unlinkSync(path);
  });
}

export function listWriteLeases(input: FoldInput): LockResult<WriteLease[]> {
  const result = fromThrowable(
    () =>
      foldWriteLeases(input)
        .filter((decision) => decision.held)
        .map((decision) => decision.lease),
    errorMessage,
  )();
  return result.isOk()
    ? { ok: true, value: result.value }
    : { ok: false, error: result.error };
}
