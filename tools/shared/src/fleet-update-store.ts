import {
  mkdir,
  open,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import {
  FleetPatchRequestSchema,
  FleetSessionV2Schema,
  mergeFleetUpdate,
  type FleetField,
  type FleetPatchRequest,
  type FleetSessionV2,
  type FleetUpdateError,
} from "./fleet-update.ts";
import { FleetSessionSchema, type FleetSession } from "./fleet-session.ts";
import { attempt, type Attempt } from "./attempt.ts";
import { jsonOf, z } from "./zod.ts";

const SessionIdSchema = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const MAX_SESSION_BYTES = 64 * 1024;
const LOCK_TIMEOUT_MS = 200;
const LOCK_RETRY_MS = 10;
const SerializedSessionSchema = z.union([
  FleetSessionV2Schema,
  FleetSessionSchema,
]);
const ErrnoSchema = z.object({ code: z.string() });

export type FleetStoredSession =
  | Readonly<{ kind: "v1"; value: FleetSession }>
  | Readonly<{ kind: "v2"; value: FleetSessionV2 }>
  | Readonly<{ kind: "unavailable"; why: string }>;

export type FleetUpdateStoreError =
  | FleetUpdateError
  | Readonly<
      | { code: "LOCK_TIMEOUT" }
      | { code: "LOCK_RELEASE_FAILED" }
      | { code: "READ_FAILED" }
      | { code: "WRITE_FAILED" }
      | { code: "LEGACY_SCHEMA" }
    >;

export type UpdateFleetSessionResult =
  | Readonly<{
      ok: true;
      committed: true;
      value: FleetSessionV2;
      changed: readonly FleetField[];
      cleanupWarning?: "LOCK_RELEASE_FAILED";
    }>
  | Readonly<{ ok: false; error: FleetUpdateStoreError }>;

type ReadSession =
  | Readonly<{ kind: "missing" }>
  | Readonly<{ kind: "v1"; value: FleetSession }>
  | Readonly<{ kind: "v2"; value: FleetSessionV2 }>
  | Readonly<{ kind: "failed"; why: string }>;

function unavailable(why: string): FleetStoredSession {
  return { kind: "unavailable", why };
}

function unobservedCell() {
  return {
    value: { na: true as const, why: "not observed" },
    observedAt: null,
  };
}

function runtimeRoot(env: NodeJS.ProcessEnv): string | undefined {
  const runtimeDir = env.XDG_RUNTIME_DIR;
  return runtimeDir !== undefined && runtimeDir !== "" && isAbsolute(runtimeDir)
    ? runtimeDir
    : undefined;
}

function sessionPath(
  sessionId: string,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const runtimeDir = runtimeRoot(env);
  if (runtimeDir === undefined || !SessionIdSchema.test(sessionId))
    return undefined;
  return join(runtimeDir, "fleet", "sessions", `${sessionId}.json`);
}

function lockPath(
  sessionId: string,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const runtimeDir = runtimeRoot(env);
  if (runtimeDir === undefined || !SessionIdSchema.test(sessionId))
    return undefined;
  return join(runtimeDir, "fleet", "locks", `${sessionId}.lock`);
}

function unavailablePathWhy(sessionId: string, env: NodeJS.ProcessEnv): string {
  if (env.XDG_RUNTIME_DIR === undefined || env.XDG_RUNTIME_DIR === "")
    return "XDG_RUNTIME_DIR is not set";
  if (runtimeRoot(env) === undefined)
    return "XDG_RUNTIME_DIR must be an absolute path";
  if (!SessionIdSchema.test(sessionId)) return "invalid session_id";
  return "fleet session path is unavailable";
}

function errorCode(error: unknown): string | undefined {
  return ErrnoSchema.safeParse(error).data?.code;
}

async function readOpenedSession(path: string): Promise<string | ReadSession> {
  await using handle = await open(path, "r");
  const info = await handle.stat();
  if (!info.isFile() || info.size > MAX_SESSION_BYTES)
    return { kind: "failed", why: "session record is not a bounded file" };
  const buffer = Buffer.alloc(info.size);
  let bytesRead = 0;
  while (bytesRead < buffer.length) {
    const read = await handle.read(
      buffer,
      bytesRead,
      buffer.length - bytesRead,
      bytesRead,
    );
    if (read.bytesRead === 0)
      return {
        kind: "failed",
        why: "fleet session was truncated while reading",
      };
    bytesRead += read.bytesRead;
  }
  return buffer.toString("utf8");
}

function decodeSession(text: string): ReadSession {
  const decoded = jsonOf(SerializedSessionSchema).safeParse(text);
  if (!decoded.success) return { kind: "failed", why: "invalid fleet session" };
  return decoded.data.schema === 2
    ? { kind: "v2", value: decoded.data }
    : { kind: "v1", value: decoded.data };
}

async function readSession(path: string): Promise<ReadSession> {
  const read = await attempt(() => readOpenedSession(path));
  if (!read.ok)
    return errorCode(read.error) === "ENOENT"
      ? { kind: "missing" }
      : {
          kind: "failed",
          why: `fleet session could not be read: ${String(read.error)}`,
        };
  return typeof read.value === "string"
    ? decodeSession(read.value)
    : read.value;
}

/** Read one serialized session without converting schema 1 into schema 2. */
export async function readFleetUpdateSession(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<FleetStoredSession> {
  const path = sessionPath(sessionId, env);
  if (path === undefined)
    return unavailable(unavailablePathWhy(sessionId, env));
  const stored = await readSession(path);
  if (stored.kind === "missing")
    return unavailable(`fleet session ${sessionId} is missing`);
  if (stored.kind === "failed") return unavailable(stored.why);
  if (stored.value.session_id !== sessionId)
    return unavailable(
      `fleet session ${sessionId} has a mismatched session_id`,
    );
  return stored;
}

function bootstrap(
  request: FleetPatchRequest,
  commitAt: string,
): FleetSessionV2 {
  return {
    schema: 2,
    session_id: request.target.session_id,
    vendor: request.target.vendor,
    revision: 0,
    fields: {
      name: unobservedCell(),
      model: unobservedCell(),
      effort: unobservedCell(),
      ctx: unobservedCell(),
      rate: unobservedCell(),
      cwd: unobservedCell(),
      pane_id: unobservedCell(),
    },
    updated_at: commitAt,
  };
}

async function acquireLock(
  path: string,
): Promise<"acquired" | "timeout" | "failed"> {
  const parent = await attempt(() =>
    mkdir(dirname(path), { recursive: true, mode: 0o700 }),
  );
  if (!parent.ok) return "failed";
  const startedAt = performance.now();
  while (performance.now() - startedAt <= LOCK_TIMEOUT_MS) {
    const lock = await attempt(() => mkdir(path, { mode: 0o700 }));
    if (lock.ok) return "acquired";
    if (errorCode(lock.error) !== "EEXIST") return "failed";
    await Bun.sleep(LOCK_RETRY_MS);
  }
  return "timeout";
}

/** Replace only after a fully written same-directory temporary file exists. */
async function writeAtomically(
  path: string,
  value: FleetSessionV2,
): Promise<boolean> {
  const temp = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const written = await attempt(async () => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(temp, `${JSON.stringify(value)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temp, path);
  });
  if (written.ok) return true;
  await attempt(() => unlink(temp));
  return false;
}

async function mergeAndWrite(
  current: Extract<ReadSession, { kind: "missing" | "v2" }>,
  request: FleetPatchRequest,
  path: string,
): Promise<UpdateFleetSessionResult> {
  const commitAt = Temporal.Now.instant().toString();
  const record =
    current.kind === "missing" ? bootstrap(request, commitAt) : current.value;
  const merged = mergeFleetUpdate(record, request, commitAt);
  if (!merged.ok) return merged;
  if (!(await writeAtomically(path, merged.value)))
    return { ok: false, error: { code: "WRITE_FAILED" } };
  return {
    ok: true,
    committed: true,
    value: merged.value,
    changed: merged.changed,
  };
}

async function updateLockedSession(
  path: string,
  request: FleetPatchRequest,
): Promise<UpdateFleetSessionResult> {
  const current = await readSession(path);
  if (current.kind === "failed")
    return { ok: false, error: { code: "READ_FAILED" } };
  if (current.kind === "v1")
    return { ok: false, error: { code: "LEGACY_SCHEMA" } };
  return mergeAndWrite(current, request, path);
}

function releaseResult(
  result: Attempt<UpdateFleetSessionResult>,
  release: Attempt<void> | undefined,
): UpdateFleetSessionResult {
  if (!result.ok) return { ok: false, error: { code: "READ_FAILED" } };
  if (release !== undefined && release.ok) return result.value;
  if (result.value.ok)
    return { ...result.value, cleanupWarning: "LOCK_RELEASE_FAILED" };
  return { ok: false, error: { code: "LOCK_RELEASE_FAILED" } };
}

/**
 * Apply one validated owner patch under a bounded per-session lock.
 * Schema 1 is observable through readFleetUpdateSession but is never migrated here.
 */
export async function updateFleetSession(
  request: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<UpdateFleetSessionResult> {
  const parsedRequest = FleetPatchRequestSchema.safeParse(request);
  if (!parsedRequest.success)
    return { ok: false, error: { code: "INVALID_REQUEST" } };

  const path = sessionPath(parsedRequest.data.target.session_id, env);
  const lock = lockPath(parsedRequest.data.target.session_id, env);
  if (path === undefined || lock === undefined)
    return { ok: false, error: { code: "READ_FAILED" } };

  const acquired = await acquireLock(lock);
  if (acquired === "timeout")
    return { ok: false, error: { code: "LOCK_TIMEOUT" } };
  if (acquired === "failed")
    return { ok: false, error: { code: "READ_FAILED" } };

  let releasing: Promise<Attempt<void>> | undefined;
  const result = await attempt(() =>
    updateLockedSession(path, parsedRequest.data).finally(() => {
      releasing = attempt(() => rmdir(lock));
    }),
  );
  const released = releasing === undefined ? undefined : await releasing;
  return releaseResult(result, released);
}
