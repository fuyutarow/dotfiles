import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fromAsyncThrowable, fromThrowable } from "neverthrow";
import { cachedSource } from "./render-cache.ts";
import { execAsyncWithin, writeCacheAsync } from "./bounded.ts";
import { jsonOf, z } from "./zod.ts";

const REFRESH_MS = 60_000;
const STALE_AFTER_MS = 10 * 60_000;
const LOCK_STALE_MS = 30_000;
const REFRESH_TIMEOUT_MS = 2_000;

const WorkspaceCountsSchema = z.object({
  total: z.number().int().nonnegative(),
  unlanded: z.number().int().nonnegative(),
  collectable: z.number().int().nonnegative(),
  legacy: z.number().int().nonnegative(),
  capturedAt: z.number(),
});
export type WorkspaceCounts = z.output<typeof WorkspaceCountsSchema>;
const FindingsSchema = z.object({
  kinds: z.record(
    z.string().regex(/^[a-z0-9-]+$/u),
    z.number().int().nonnegative(),
  ),
  capturedAt: z.number(),
});
export type FleetFindings = z.output<typeof FindingsSchema>;

/** Doctor's five-column TSV is authoritative; never infer findings from counts. */
export function doctorFindings(
  output: string,
  capturedAt: number,
): FleetFindings | undefined {
  const kinds = new Map<string, number>();
  for (const line of output.split("\n").filter((value) => value !== "")) {
    const columns = line.split("\t");
    const kind = columns[3];
    if (
      columns.length !== 5 ||
      !["agx-run", "agx-ws", "agx-ticket"].includes(columns[0] ?? "") ||
      kind === undefined
    )
      return undefined;
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
  }
  const parsed = FindingsSchema.safeParse({
    kinds: Object.fromEntries(kinds),
    capturedAt,
  });
  return parsed.success ? parsed.data : undefined;
}

async function refreshDoctorFindings(env: NodeJS.ProcessEnv) {
  const command = Bun.which("agx", { PATH: env.PATH ?? "" });
  if (command === null) return null;
  const result = await fromAsyncThrowable(async () => {
    const signal = AbortSignal.timeout(20_000);
    const child = Bun.spawn([command, "doctor"], {
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    const findings = doctorFindings(stdout, now());
    const count = Object.values(findings?.kinds ?? {}).reduce(
      (sum, value) => sum + value,
      0,
    );
    // Exit 1 with findings is healthy. Child errors also exit 1 but add stderr;
    // never publish a partial inventory as an all-clear observation.
    if (
      signal.aborted ||
      exit !== (count === 0 ? 0 : 1) ||
      stderr !== `agx doctor: ${count} finding(s)\n`
    )
      return null;
    return findings;
  })();
  return result.unwrapOr(null);
}

/** Consume ws gc's TSV, retaining its verdicts rather than reclassifying workspaces. */
export function workspaceCounts(
  output: string,
  capturedAt: number,
): WorkspaceCounts | undefined {
  const counts = {
    total: 0,
    unlanded: 0,
    collectable: 0,
    legacy: 0,
    capturedAt,
  };
  for (const line of output.split("\n").filter((value) => value !== "")) {
    const columns = line.split("\t");
    const kind = columns[1];
    const verdict = columns[2];
    if (
      columns.length !== 6 ||
      (kind !== "ws" && kind !== "legacy") ||
      verdict === "FAILED"
    )
      return undefined;
    counts.total += 1;
    if (kind === "legacy") counts.legacy += 1;
    if (verdict === "unlanded") counts.unlanded += 1;
    if (["empty", "landed", "abandoned"].includes(verdict ?? ""))
      counts.collectable += 1;
  }
  return counts;
}

const SnapshotSchema = z.object({
  output: z.string(),
  capturedAt: z.number(),
  exit: z.literal(0),
  workspaces: WorkspaceCountsSchema.optional(),
  findings: FindingsSchema.optional(),
});
const SnapshotCacheSchema = z.object({
  snapshot: SnapshotSchema.nullable(),
});
const LockSchema = z.object({ token: z.string(), at: z.number() });

export interface AgxSnapshotRead {
  findings?: FleetFindings | undefined;
  workspaces?: WorkspaceCounts | undefined;
  rows: unknown[] | undefined;
  ageSeconds: number | undefined;
  reason: string | undefined;
}

/** agx's state directory (records.jsonl, runs/<id>/…); same resolution order as tools/agx. */
export function stateDir(env: NodeJS.ProcessEnv): string {
  for (const key of ["AGX_NEXT_STATE_DIR", "AGX_STATE_DIR"]) {
    const value = env[key];
    if (value !== undefined && value !== "") return value;
  }
  const xdg = env.XDG_STATE_HOME;
  if (xdg !== undefined && xdg !== "") return join(xdg, "agx-next");
  return join(env.HOME ?? homedir(), ".local", "state", "agx-next");
}

export function agxSnapshotPath(env: NodeJS.ProcessEnv): string {
  const runtime = env.XDG_RUNTIME_DIR;
  const root =
    runtime !== undefined && runtime !== "" ? runtime : stateDir(env);
  return join(root, "statusline", "agx-runs.json");
}

const lockPathFor = (snapshotPath: string): string => snapshotPath + ".lock";
const now = (): number => Temporal.Now.instant().epochMilliseconds;

async function snapshotFromDisk(path: string) {
  const text = await Bun.file(path)
    .text()
    .catch(() => null);
  if (text === null) return { snapshot: null };
  const decoded = jsonOf(SnapshotSchema).safeParse(text);
  return decoded.success ? { snapshot: decoded.data } : { snapshot: null };
}

async function startRefreshIfNeeded(
  snapshotPath: string,
  snapshot: z.output<typeof SnapshotSchema> | null,
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const at = now();
  if (
    snapshot !== null &&
    at >= snapshot.capturedAt &&
    at - snapshot.capturedAt < REFRESH_MS
  )
    return;

  const lockPath = lockPathFor(snapshotPath);
  const attemptPath = snapshotPath + ".attempt";
  const attempted = await Bun.file(attemptPath)
    .text()
    .catch(() => null);
  if (attempted !== null && at - Number(attempted) < REFRESH_MS) return;
  await mkdir(dirname(snapshotPath), { recursive: true }).catch(() => null);
  const token = crypto.randomUUID();
  const createLock = () =>
    writeFile(lockPath, JSON.stringify({ token, at }), {
      flag: "wx",
      mode: 0o600,
    });

  const acquired = await createLock().then(
    () => true,
    async (error: unknown) => {
      const code = z.object({ code: z.string() }).safeParse(error);
      if (!code.success || code.data.code !== "EEXIST") return false;
      const info = await stat(lockPath).catch(() => null);
      if (info === null || at - info.mtimeMs <= LOCK_STALE_MS) return false;
      const oldLock = await readFile(lockPath, "utf8").catch(() => null);
      if (oldLock === null) return false;
      const parsed = jsonOf(LockSchema).safeParse(oldLock);
      if (!parsed.success || at - parsed.data.at <= LOCK_STALE_MS) return false;
      const quarantine = lockPath + "." + crypto.randomUUID() + ".stale";
      const moved = await rename(lockPath, quarantine).then(
        () => true,
        () => false,
      );
      if (!moved) return false;
      await unlink(quarantine).catch(() => null);
      return createLock().then(
        () => true,
        () => false,
      );
    },
  );
  if (!acquired) return;
  const latestAttempt = await Bun.file(attemptPath)
    .text()
    .catch(() => null);
  if (latestAttempt !== null && at - Number(latestAttempt) < REFRESH_MS) {
    await unlink(lockPath).catch(() => null);
    return;
  }
  const recorded = await writeFile(attemptPath, String(at), {
    mode: 0o600,
  }).then(
    () => true,
    () => false,
  );
  if (!recorded) {
    await unlink(lockPath).catch(() => null);
    return;
  }

  const started = fromThrowable(() =>
    Bun.spawn([process.execPath, join(import.meta.dir, "agx-refresh.ts")], {
      env: { ...env, STATUSLINE_AGX_REFRESH_TOKEN: token },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      detached: true,
    }),
  )();
  if (started.isErr()) {
    await unlink(lockPath).catch(() => null);
    return;
  }
  started.value.unref();
}

/** Read the last good agx listing and request a detached refresh when it is old. */
export async function readAgxSnapshotAsync(
  env: NodeJS.ProcessEnv = process.env,
): Promise<AgxSnapshotRead> {
  const path = agxSnapshotPath(env);
  const cached = await cachedSource({
    key: "agx-snapshot:" + path,
    ttlMs: 250,
    schema: SnapshotCacheSchema,
    root: join(
      env.HOME ?? homedir(),
      ".cache",
      "claude",
      "statusline",
      "sources",
    ),
    load: () => snapshotFromDisk(path),
  });
  let snapshot = cached.snapshot;
  if (snapshot === null || now() - snapshot.capturedAt >= STALE_AFTER_MS) {
    const current = await snapshotFromDisk(path);
    if (current.snapshot !== null) snapshot = current.snapshot;
  }
  await startRefreshIfNeeded(path, snapshot, env);
  if (snapshot === null)
    return {
      rows: undefined,
      ageSeconds: undefined,
      reason: "snapshot unavailable",
    };

  const ageMs = now() - snapshot.capturedAt;

  const parsed = jsonOf(z.array(z.unknown())).safeParse(snapshot.output);
  if (!parsed.success)
    return {
      rows: undefined,
      ageSeconds: undefined,
      reason: "snapshot invalid",
    };
  return {
    rows: parsed.data,
    workspaces: snapshot.workspaces,
    findings: snapshot.findings,
    ageSeconds: Math.max(0, Math.floor(ageMs / 1000)),
    reason: undefined,
  };
}

/** The detached worker only publishes a complete successful listing; failures preserve the file. */
export async function refreshAgxSnapshot(
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const path = agxSnapshotPath(env);
  const lockPath = lockPathFor(path);
  const token = env.STATUSLINE_AGX_REFRESH_TOKEN;
  const lockText = await readFile(lockPath, "utf8").catch(() => null);
  const lock =
    lockText === null ? null : jsonOf(LockSchema).safeParse(lockText);
  if (
    token === undefined ||
    token === "" ||
    lock?.success !== true ||
    lock.data.token !== token
  )
    return;

  const update = async () => {
    const result = await execAsyncWithin(
      "agx",
      "agx",
      ["ls", "--json"],
      REFRESH_TIMEOUT_MS,
      env,
    );
    if (result.isErr()) return;
    const rows = jsonOf(z.array(z.unknown())).safeParse(result.value);
    if (!rows.success) return;
    const previous = await snapshotFromDisk(path);
    // Background classification must not inherit the foreground four-second render budget.
    const [ws, currentFindings] = await Promise.all([
      execAsyncWithin(
        "agx ws",
        "agx",
        ["ws", "gc", "--all", "--dry-run"],
        20_000,
        env,
      ),
      refreshDoctorFindings(env),
    ]);
    const workspaces =
      (ws.isOk() ? workspaceCounts(ws.value, now()) : undefined) ??
      previous.snapshot?.workspaces;
    await writeCacheAsync(path, {
      output: result.value,
      capturedAt: now(),
      exit: 0,
      workspaces,
      findings: currentFindings ?? previous.snapshot?.findings,
    });
  };
  const result = await fromAsyncThrowable(update)();
  const release = async () => {
    const currentText = await readFile(lockPath, "utf8").catch(() => null);
    const current =
      currentText === null ? null : jsonOf(LockSchema).safeParse(currentText);
    if (current?.success === true && current.data.token === token)
      await unlink(lockPath).catch(() => null);
  };
  await release();
  if (result.isErr()) process.exitCode = 1;
}

if (import.meta.main) await refreshAgxSnapshot();
