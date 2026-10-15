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
import { execAsyncBounded, writeCacheAsync } from "./bounded.ts";
import { jsonOf, z } from "./zod.ts";

const REFRESH_MS = 5_000;
const OLD_AFTER_MS = 30_000;
const STALE_AFTER_MS = 10 * 60_000;
const LOCK_STALE_MS = 30_000;
const REFRESH_TIMEOUT_MS = 2_000;

const SnapshotSchema = z.object({
  output: z.string(),
  capturedAt: z.number(),
  exit: z.literal(0),
});
const SnapshotCacheSchema = z.object({
  snapshot: SnapshotSchema.nullable(),
});
const LockSchema = z.object({ token: z.string(), at: z.number() });

export interface AgxSnapshotRead {
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
  if (ageMs < 0)
    return {
      rows: undefined,
      ageSeconds: undefined,
      reason: "snapshot clock changed",
    };
  if (ageMs >= STALE_AFTER_MS)
    return {
      rows: undefined,
      ageSeconds: Math.floor(ageMs / 1000),
      reason: "snapshot expired " + Math.floor(ageMs / 1000) + "s",
    };

  const parsed = jsonOf(z.array(z.unknown())).safeParse(snapshot.output);
  if (!parsed.success)
    return {
      rows: undefined,
      ageSeconds: undefined,
      reason: "snapshot invalid",
    };
  return {
    rows: parsed.data,
    ageSeconds: ageMs > OLD_AFTER_MS ? Math.floor(ageMs / 1000) : undefined,
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
    const result = await execAsyncBounded(
      "agx",
      "agx",
      ["ls", "--json"],
      REFRESH_TIMEOUT_MS,
      env,
    );
    if (result.isErr()) return;
    const rows = jsonOf(z.array(z.unknown())).safeParse(result.value);
    if (!rows.success) return;
    await writeCacheAsync(path, {
      output: result.value,
      capturedAt: now(),
      exit: 0,
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
