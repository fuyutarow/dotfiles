// Repository-wide write ownership shared by dispatcher sessions through agx's state directory.
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { join } from "node:path";
import { fromThrowable } from "neverthrow";
import { errorMessage } from "../../shared/src/attempt.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";
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

export type LeaseEvidence = Readonly<{
  run_id?: string | undefined;
  kind?: string | undefined;
  cwd?: string | undefined;
  ticket?:
    | { writes?: string[] | undefined; name?: string | undefined }
    | undefined;
  started_at?: string | undefined;
  at?: string | undefined;
  facts?: { changed_files?: string[] | undefined } | undefined;
  accept?: boolean | undefined;
}>;

const LeaseSchema = z.strictObject({
  repo: z.string(),
  run_id: z.string(),
  cwd: z.string(),
  writes: z.array(z.string()),
  ticket: z.string(),
  dispatcher_session: z.string(),
  since: z.string(),
});
const DETACHED_ADMISSION_GRACE_MS = 15 * 60_000;

const hash = (text: string): string =>
  createHash("sha256").update(text).digest("hex");

function repoLeaseDir(stateDir: string, repo: string): string {
  return join(stateDir, "write-leases", hash(repo));
}

function readLease(path: string): WriteLease | undefined {
  const text = fromThrowable(() => readFileSync(path, "utf8"), errorMessage)();
  if (text.isErr()) return undefined;
  const parsed = jsonOf(LeaseSchema).safeParse(text.value);
  return parsed.success ? parsed.data : undefined;
}

function saveLease(dir: string, lease: WriteLease): void {
  const path = join(dir, `${hash(lease.run_id)}.json`);
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(lease));
  renameSync(temp, path);
}

function detachedAdmissionIsRecent(at: string): boolean {
  const instant = fromThrowable(
    () => Temporal.Instant.from(at).epochMilliseconds,
    errorMessage,
  )();
  return (
    instant.isOk() &&
    Temporal.Now.instant().epochMilliseconds - instant.value <=
      DETACHED_ADMISSION_GRACE_MS
  );
}

type LockResult<T> = { ok: true; value: T } | { ok: false; error: string };

function lockOwnerIsDead(path: string): boolean {
  const ownerText = fromThrowable(
    () => readFileSync(path, "utf8"),
    errorMessage,
  )();
  if (ownerText.isErr()) return false;
  const pid = Number(ownerText.value);
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  const alive = fromThrowable(() => process.kill(pid, 0), errorMessage)();
  return alive.isErr() && alive.error.includes("ESRCH");
}

function withRepoLock<T>(dir: string, operation: () => T): LockResult<T> {
  const made = fromThrowable(
    () => mkdirSync(dir, { recursive: true }),
    errorMessage,
  )();
  if (made.isErr()) return { ok: false, error: made.error };
  const lock = join(dir, ".lock");
  const wait = new Int32Array(new SharedArrayBuffer(4));
  let descriptor: number | undefined;
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    const opened = fromThrowable(() => openSync(lock, "wx"), errorMessage)();
    if (opened.isOk()) {
      descriptor = opened.value;
      break;
    }
    if (!opened.error.includes("EEXIST"))
      return { ok: false, error: opened.error };
    if (lockOwnerIsDead(lock)) {
      fromThrowable(() => {
        unlinkSync(lock);
      }, errorMessage)();
      continue;
    }
    Atomics.wait(wait, 0, 0, 10);
  }
  if (descriptor === undefined)
    return {
      ok: false,
      error: "timed out waiting for the repository write-lease lock",
    };
  const closed = fromThrowable(() => {
    writeSync(descriptor, String(process.pid));
    closeSync(descriptor);
  }, errorMessage)();
  if (closed.isErr()) {
    fromThrowable(() => {
      unlinkSync(lock);
    }, errorMessage)();
    return { ok: false, error: closed.error };
  }
  const result = fromThrowable(operation, errorMessage)();
  const released = fromThrowable(() => {
    unlinkSync(lock);
  }, errorMessage)();
  if (result.isErr()) return { ok: false, error: result.error };
  if (released.isErr()) return { ok: false, error: released.error };
  return { ok: true, value: result.value };
}

function isHeld(
  lease: WriteLease,
  activeRunIds: ReadonlySet<string>,
  latest: ReadonlyMap<string, LeaseEvidence>,
  judged: ReadonlySet<string>,
  abandoned: ReadonlySet<string>,
  pendingDetached: ReadonlySet<string>,
): boolean {
  const run = latest.get(lease.run_id);
  if (!existsSync(lease.cwd)) return false;
  if (judged.has(lease.run_id) || abandoned.has(lease.run_id)) return false;
  if (run === undefined)
    return activeRunIds.has(lease.run_id) || pendingDetached.has(lease.run_id);
  return (
    run.kind === "run" &&
    (run.facts?.changed_files?.length ?? 0) > 0 &&
    existsSync(lease.cwd)
  );
}

function pruneLeases(
  dir: string,
  activeRunIds: ReadonlySet<string>,
  evidence: readonly LeaseEvidence[],
): WriteLease[] {
  const latest = new Map<string, LeaseEvidence>();
  const judged = new Set<string>();
  const abandoned = new Set<string>();
  const pendingDetached = new Set<string>();
  for (const row of evidence) {
    if (row.run_id === undefined) continue;
    if (row.kind === "acceptance" || row.kind === "landed")
      judged.add(row.run_id);
    if (row.kind === "abandoned") abandoned.add(row.run_id);
    if (
      row.kind === "detached" &&
      row.at !== undefined &&
      detachedAdmissionIsRecent(row.at)
    )
      pendingDetached.add(row.run_id);
    if (
      row.kind === "started" ||
      row.kind === "run" ||
      row.kind === "abandoned"
    )
      pendingDetached.delete(row.run_id);
    if (row.kind === "run" || row.kind === "abandoned")
      latest.set(row.run_id, row);
  }
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      const path = join(dir, name);
      const lease = readLease(path);
      if (
        lease !== undefined &&
        isHeld(lease, activeRunIds, latest, judged, abandoned, pendingDetached)
      )
        return [lease];
      fromThrowable(() => {
        unlinkSync(path);
      }, errorMessage)();
      return [];
    });
}

function overlapReason(
  runId: string,
  writes: string[],
  leases: readonly WriteLease[],
): string | undefined {
  const first = writes.flatMap((mine) =>
    leases.flatMap((held) =>
      held.run_id !== runId &&
      held.writes.some((glob) => globsOverlap(mine, glob))
        ? [{ mine, held }]
        : [],
    ),
  )[0];
  return first === undefined
    ? undefined
    : `${first.mine} is held by run ${first.held.run_id} (ticket ${first.held.ticket}, dispatcher ${first.held.dispatcher_session.slice(0, 8)}, since ${first.held.since})`;
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
  activeRunIds: ReadonlySet<string>;
  evidence: readonly LeaseEvidence[];
}): LockResult<void> {
  if (input.writes.length === 0) return { ok: true, value: undefined };
  const dir = repoLeaseDir(input.stateDir, input.repo);
  const result = withRepoLock(dir, () => {
    const leases = pruneLeases(dir, input.activeRunIds, input.evidence);
    const conflict = overlapReason(input.run_id, input.writes, leases);
    if (conflict !== undefined) return { ok: false as const, reason: conflict };
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
  });
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
  if (!existsSync(dir)) return { ok: true, value: undefined };
  return withRepoLock(dir, () => {
    const path = join(dir, `${hash(input.run_id)}.json`);
    if (existsSync(path)) unlinkSync(path);
  });
}

export function listWriteLeases(input: {
  stateDir: string;
  repo: string;
  activeRunIds: ReadonlySet<string>;
  evidence: readonly LeaseEvidence[];
}): LockResult<WriteLease[]> {
  const dir = repoLeaseDir(input.stateDir, input.repo);
  if (!existsSync(dir)) return { ok: true, value: [] };
  return withRepoLock(dir, () =>
    pruneLeases(dir, input.activeRunIds, input.evidence),
  );
}
