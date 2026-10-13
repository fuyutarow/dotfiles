// Repository-wide write ownership shared by dispatcher sessions through agx's state directory.
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fromThrowable } from "neverthrow";
import { errorMessage } from "../../shared/src/attempt.ts";
import { z } from "../../shared/src/zod.ts";
import {
  appendLifecycle,
  readLifecycle,
  type LifecycleEvent,
} from "./lifecycle-log.ts";
import { expandBraces, globsOverlap } from "./ticket.ts";

export type WriteLease = Readonly<{
  repo: string;
  run_id: string;
  cwd: string;
  writes: string[];
  ticket: string;
  dispatcher_session: string;
  since: string;
  lease: "repository" | "workspace";
  exclusive: boolean;
}>;
const SnapshotLeaseSchema = z.object({
  lease: z.object({
    repo: z.string(),
    run_id: z.string(),
    cwd: z.string(),
    writes: z.array(z.string()),
    ticket: z.string(),
    dispatcher_session: z.string(),
    since: z.string(),
    lease: z.enum(["repository", "workspace"]),
    exclusive: z.boolean(),
  }),
  live: z.boolean(),
  abandoned: z.boolean(),
});
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
  lease: z.enum(["repository", "workspace"]).optional(),
  exclusive: z.boolean().optional(),
  lease_writes: z.array(z.string()).optional(),
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

function evidenceFromLifecycle(
  events: readonly LifecycleEvent[],
  legacyLeaseWrites: ReadonlyMap<string, readonly string[]> = new Map(),
): LeaseEvidence[] {
  return events.flatMap((event) => {
    if (event.type === "lease_snapshot") return [];
    const record = event.record;
    const common = { ...record, run_id: event.run_id, at: event.at };
    const row = (value: unknown): LeaseEvidence[] => {
      const parsed = EvidenceSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    };
    if (event.type === "admitted") {
      const storedLeaseWrites = z
        .array(z.string())
        .safeParse(record.lease_writes);
      const leaseWrites = (
        storedLeaseWrites.success
          ? storedLeaseWrites.data
          : (legacyLeaseWrites.get(event.run_id) ?? event.writes)
      ).filter((glob) => event.writes.includes(glob));
      return row({
        ...common,
        kind: "admitted",
        repo: event.repo,
        cwd: event.workspace,
        lease: record.lease === "workspace" ? "workspace" : "repository",
        exclusive: record.exclusive === true,
        lease_writes: leaseWrites,
        ticket: { name: event.ticket, writes: leaseWrites },
        dispatcher_session: event.session_id ?? "unknown",
        started_at: event.at,
      });
    }
    if (event.type === "running")
      return row({ ...common, kind: "started", pid: event.pid });
    if (event.type === "terminal")
      return row({
        ...common,
        kind: event.outcome === "abandoned" ? "abandoned" : "run",
        cwd: event.workspace ?? record.cwd,
        worker: { outcome: event.outcome },
      });
    if (event.type === "judged")
      return row({
        ...common,
        kind: "acceptance",
        accept: event.decision === "accept",
      });
    return row({ ...common, kind: "lease-released" });
  });
}

/** Lease evidence is projected only from lifecycle.jsonl. */
export function readLeaseEvidence(stateDir: string): LeaseEvidence[] {
  return evidenceFromLifecycle(readLifecycle(stateDir).events);
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

function characterClassWitness(
  segment: string,
  index: number,
): { end: number; witness: string } | undefined {
  const end = segment.indexOf("]", index + 1);
  if (end <= index + 1) return undefined;
  const chars = segment.slice(index + 1, end);
  const excluded = chars.startsWith("!") || chars.startsWith("^");
  const first = chars[excluded ? 1 : 0];
  return {
    end,
    witness: excluded && first === "x" ? "y" : (first ?? "x"),
  };
}

function witnessSegment(segment: string): string {
  if (segment === "**") return "agx-lease-probe";
  let witness = "";
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment[index];
    if (char === "\\" && index + 1 < segment.length) {
      index += 1;
      witness += segment[index];
      continue;
    }
    if (char === "*" || char === "?") {
      witness += "x";
      continue;
    }
    const grouped =
      char === "[" ? characterClassWitness(segment, index) : undefined;
    if (grouped !== undefined) {
      witness += grouped.witness;
      index = grouped.end;
      continue;
    }
    witness += char;
  }
  return witness === "" ? "x" : witness;
}

function globWitnesses(glob: string): string[] {
  const pattern = glob.endsWith("/") ? `${glob}**` : glob;
  return expandBraces(pattern).flatMap((expanded) => {
    const segments = expanded
      .split("/")
      .filter((segment) => segment !== "" && segment !== ".");
    let witnesses = [""];
    for (const [index, segment] of segments.entries()) {
      const choices =
        segment === "**" && index < segments.length - 1
          ? ["", "agx-lease-probe"]
          : [witnessSegment(segment)];
      witnesses = witnesses.flatMap((prefix) =>
        choices.map((choice) => {
          if (prefix === "") return choice;
          if (choice === "") return prefix;
          return `${prefix}/${choice}`;
        }),
      );
    }
    return witnesses.filter((witness) => witness !== "");
  });
}

function gitDirectory(cwd: string): string | undefined {
  const dotGit = join(cwd, ".git");
  if (existsSync(dotGit)) return undefined;
  const store = join(cwd, ".jj", "repo", "store");
  const targetFile = join(store, "git_target");
  if (!existsSync(targetFile)) return undefined;
  const target = fromThrowable(
    () => readFileSync(targetFile, "utf8").trim(),
    errorMessage,
  )();
  if (target.isErr() || target.value === "") return undefined;
  const directory = resolve(store, target.value);
  return existsSync(directory) ? directory : undefined;
}

function ignoreRule(
  cwd: string,
  candidate: string,
  cache: Map<string, string | null>,
): string | undefined {
  const key = JSON.stringify([resolve(cwd), candidate]);
  const cached = cache.get(key);
  if (cached !== undefined) return cached ?? undefined;
  const gitDir = gitDirectory(cwd);
  if (!existsSync(join(cwd, ".git")) && gitDir === undefined) {
    cache.set(key, null);
    return undefined;
  }
  const args = [
    "git",
    ...(gitDir === undefined
      ? []
      : [`--git-dir=${gitDir}`, `--work-tree=${resolve(cwd)}`]),
    "check-ignore",
    "--no-index",
    "--verbose",
    "--",
    candidate,
  ];
  const checked = Bun.spawnSync(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 2_000,
  });
  if (checked.exitCode !== 0) {
    cache.set(key, null);
    return undefined;
  }
  const details = checked.stdout.toString().trim().split("\t", 1)[0];
  const pattern = details?.split(":").slice(2).join(":");
  cache.set(key, pattern ?? null);
  return pattern;
}

function ignoreRuleCoversGlob(rule: string, glob: string): boolean {
  const normalizedRule = rule.replace(/^\//u, "");
  return expandBraces(glob).every((expanded) => {
    const normalizedGlob = expanded.endsWith("/") ? `${expanded}**` : expanded;
    if (normalizedRule === normalizedGlob) return true;
    const directory = normalizedRule.endsWith("/**")
      ? normalizedRule.slice(0, -3)
      : normalizedRule.replace(/\/$/u, "");
    if (normalizedRule.endsWith("/") || normalizedRule.endsWith("/**"))
      return (
        normalizedGlob === directory ||
        normalizedGlob === `${directory}/**` ||
        normalizedGlob.startsWith(`${directory}/`)
      );
    if (!normalizedRule.includes("/") && !/[?*[{]/u.test(normalizedRule))
      return (
        normalizedGlob === normalizedRule ||
        normalizedGlob === `${normalizedRule}/**` ||
        normalizedGlob.startsWith(`${normalizedRule}/`)
      );
    return false;
  });
}

function leaseableWriteGlobs(
  cwd: string,
  writes: readonly string[],
  cache = new Map<string, string | null>(),
): string[] {
  return writes.filter((glob) => {
    const witnesses = globWitnesses(glob);
    if (witnesses.length === 0) return true;
    const rules = witnesses.map((candidate) =>
      ignoreRule(cwd, candidate, cache),
    );
    return !rules.every(
      (rule) => rule !== undefined && ignoreRuleCoversGlob(rule, glob),
    );
  });
}

function legacyLeaseWriteObservations(
  events: readonly LifecycleEvent[],
  repo: string,
): Map<string, readonly string[]> {
  const observations = new Map<string, readonly string[]>();
  const ignoreCache = new Map<string, string | null>();
  const snapshot = events.findLast(
    (event) => event.type === "lease_snapshot" && event.record.repo === repo,
  );
  for (const event of events) {
    if (
      event.type !== "admitted" ||
      event.repo !== repo ||
      (snapshot !== undefined && event.seq < snapshot.seq) ||
      z.array(z.string()).safeParse(event.record.lease_writes).success
    )
      continue;
    observations.set(
      event.run_id,
      leaseableWriteGlobs(event.workspace, event.writes, ignoreCache),
    );
  }
  return observations;
}

type LockResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; exitCode?: number };
type FoldInput = {
  repo: string;
  legacyLeaseWrites?: ReadonlyMap<string, readonly string[]>;
};
type LeaseReadInput = FoldInput & { stateDir: string };
type LeaseDecision = {
  lease: WriteLease;
  live: boolean;
  held: boolean;
  hard: boolean;
  abandoned: boolean;
  error?: string;
};

function leaseFromAdmission(
  row: LeaseEvidence,
  repo: string,
): WriteLease | undefined {
  const cwd = row.cwd;
  const writes = row.lease_writes ?? row.ticket?.writes ?? [];
  if (
    row.kind !== "admitted" ||
    cwd === undefined ||
    row.ticket?.name === undefined ||
    writes.length === 0 ||
    row.repo !== repo ||
    row.run_id === undefined
  )
    return undefined;
  return {
    repo,
    run_id: row.run_id,
    cwd: resolve(cwd),
    writes,
    ticket: row.ticket.name,
    dispatcher_session: row.dispatcher_session ?? "unknown",
    since: row.started_at ?? row.at ?? row.run_id,
    lease: row.lease ?? "repository",
    exclusive: row.exclusive ?? false,
  };
}

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

/** A pure fold over lifecycle events; only live and unresolved exclusive runs hold leases. */
export function foldWriteLeases(
  events: readonly LifecycleEvent[],
  input: FoldInput,
): LeaseDecision[] {
  const snapshot = events.findLast(
    (event) =>
      event.type === "lease_snapshot" && event.record.repo === input.repo,
  );
  const snapshotState = z
    .array(SnapshotLeaseSchema)
    .safeParse(snapshot?.record.lease_state);
  const leases = new Map<string, LeaseDecision>();
  if (snapshot !== undefined && snapshotState.success)
    for (const entry of snapshotState.data)
      leases.set(entry.lease.run_id, {
        lease: entry.lease,
        live: entry.live,
        held: true,
        hard: true,
        abandoned: entry.abandoned,
      });

  const offset =
    snapshot !== undefined && snapshotState.success ? snapshot.seq : 0;
  const delta = events.filter((event) => event.seq > offset);
  for (const row of evidenceFromLifecycle(delta, input.legacyLeaseWrites)) {
    if (row.run_id === undefined) continue;
    const lease = leaseFromAdmission(row, input.repo);
    if (lease !== undefined) {
      leases.set(row.run_id, {
        lease,
        live: true,
        held: true,
        hard: true,
        abandoned: false,
      });
      continue;
    }
    const previous = leases.get(row.run_id);
    if (previous === undefined) continue;
    if (
      row.kind === "acceptance" &&
      row.accept === false &&
      previous.lease.exclusive
    ) {
      leases.delete(row.run_id);
      continue;
    }
    if (row.kind === "lease-released" || row.kind === "disposed") {
      leases.delete(row.run_id);
      continue;
    }
    if (row.kind !== "run" && row.kind !== "abandoned") continue;
    if (!previous.lease.exclusive) {
      leases.delete(row.run_id);
      continue;
    }
    leases.set(row.run_id, {
      ...previous,
      live: false,
      abandoned: row.kind === "abandoned",
    });
  }
  return [...leases.values()];
}

export function appendLeaseSnapshot(input: LeaseReadInput): LockResult<number> {
  const current = readLifecycle(input.stateDir);
  if (current.errors.length > 0)
    return { ok: false, error: current.errors.join("; ") };
  const legacyLeaseWrites = legacyLeaseWriteObservations(
    current.events,
    input.repo,
  );
  const record: Record<string, unknown> = { repo: input.repo };
  const appended = appendLifecycle(
    input.stateDir,
    {
      type: "lease_snapshot",
      run_id: "__lease_snapshot__",
      record,
    },
    (events) => {
      const decisions = foldWriteLeases(events, {
        repo: input.repo,
        legacyLeaseWrites,
      });
      record.snapshot_offset = events.at(-1)?.seq ?? 0;
      const ticketIndex = new Map<string, string>();
      const lineageIndex = new Map<string, string>();
      for (const event of events)
        if (event.type === "admitted" && event.repo === input.repo) {
          ticketIndex.set(event.ticket, event.run_id);
          lineageIndex.set(event.run_id, event.lineage_id);
        }
      record.ticket_index = Object.fromEntries(ticketIndex);
      record.lineage_index = Object.fromEntries(lineageIndex);
      record.lease_state = decisions
        .filter((decision) => decision.held)
        .map((decision) => ({
          lease: decision.lease,
          live: decision.live,
          abandoned: decision.abandoned,
        }));
      return null;
    },
  );
  return appended.ok
    ? { ok: true, value: appended.event.seq }
    : { ok: false, error: appended.error };
}

export function reconcileWriteLeases(
  input: LeaseReadInput,
): LockResult<WriteLease[]> {
  const lifecycle = readLifecycle(input.stateDir);
  if (lifecycle.errors.length > 0)
    return { ok: false, error: lifecycle.errors.join("; ") };
  const decisions = foldWriteLeases(lifecycle.events, {
    ...input,
    legacyLeaseWrites: legacyLeaseWriteObservations(
      lifecycle.events,
      input.repo,
    ),
  });
  return {
    ok: true,
    value: decisions
      .filter((decision) => decision.held)
      .map((decision) => decision.lease),
  };
}

function overlapReason(
  runId: string,
  writes: string[],
  leases: readonly WriteLease[],
  owner: {
    ticket: string;
    cwd: string;
    lease: "repository" | "workspace";
  },
): string | undefined {
  const first = writes.flatMap((mine) =>
    leases.flatMap((held) =>
      held.run_id !== runId &&
      !(
        owner.lease === "workspace" &&
        held.lease === "workspace" &&
        held.cwd !== owner.cwd
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
  lease?: "workspace";
  exclusive?: boolean;
  admissionRecord?: Record<string, unknown>;
}): LockResult<void> {
  if (input.writes.length === 0) return { ok: true, value: undefined };
  const cwd = workspaceDirectory(input.cwd);
  const ownWrites = leaseableWriteGlobs(cwd, input.writes);
  const admission = {
    type: "admitted" as const,
    run_id: input.run_id,
    repo: input.repo,
    workspace: cwd,
    ticket: input.ticket,
    writes: input.writes,
    resource: null,
    predecessor: input.predecessor,
    session_id: input.dispatcher_session,
    record: {
      ...input.admissionRecord,
      cwd,
      lease_writes: ownWrites,
      lease: input.lease ?? "repository",
      exclusive: input.exclusive ?? false,
      ...(input.admissionRecord === undefined
        ? {
            kind: "admitted",
            run_id: input.run_id,
            repo: input.repo,
            cwd,
            ticket: { name: input.ticket, writes: input.writes },
            dispatcher_session: input.dispatcher_session,
            started_at: input.since,
            predecessor: input.predecessor,
            pid: process.pid,
          }
        : {}),
    },
    at: input.since,
  };
  const appended = appendLifecycle(input.stateDir, admission, (events) => {
    const decisions = foldWriteLeases(events, {
      repo: input.repo,
      legacyLeaseWrites: legacyLeaseWriteObservations(events, input.repo),
    });
    const eligible = decisions.filter((decision) => decision.held);
    const conflict = overlapReason(
      input.run_id,
      ownWrites,
      eligible.map((decision) => decision.lease),
      {
        ticket: input.ticket,
        cwd,
        lease: input.lease ?? "repository",
      },
    );
    return conflict ?? null;
  });
  if (!appended.ok) return { ok: false, error: appended.error };
  return { ok: true, value: undefined };
}

export function releaseWriteLease(input: {
  stateDir: string;
  repo: string;
  run_id: string;
}): LockResult<void> {
  const appended = appendLifecycle(input.stateDir, {
    type: "disposed",
    run_id: input.run_id,
    record: { repo: input.repo },
  });
  return appended.ok
    ? { ok: true, value: undefined }
    : { ok: false, error: appended.error };
}

export function writeLeaseDecisions(
  input: LeaseReadInput,
): LockResult<LeaseDecision[]> {
  const lifecycle = readLifecycle(input.stateDir);
  if (lifecycle.errors.length > 0)
    return { ok: false, error: lifecycle.errors.join("; ") };
  return {
    ok: true,
    value: foldWriteLeases(lifecycle.events, {
      ...input,
      legacyLeaseWrites: legacyLeaseWriteObservations(
        lifecycle.events,
        input.repo,
      ),
    }),
  };
}

export function listWriteLeases(
  input: LeaseReadInput,
): LockResult<WriteLease[]> {
  const result = writeLeaseDecisions(input);
  if (!result.ok) return result;
  return {
    ok: true,
    value: result.value
      .filter((decision) => decision.held)
      .map((decision) => decision.lease),
  };
}
