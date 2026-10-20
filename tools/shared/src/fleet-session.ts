import {
  mkdir,
  open,
  opendir,
  realpath,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { attempt, errorMessage, type Attempt } from "./attempt.ts";
import { jsonOf, z } from "./zod.ts";

export const FleetSessionUnavailableSchema = z.strictObject({
  na: z.literal(true),
  why: z.string().min(1),
});

const SessionNameSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-agt_[a-z0-9]+$/u);

const SessionIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);

export const FleetSessionSchema = z.strictObject({
  schema: z.literal(1),
  session_id: SessionIdSchema,
  vendor: z.enum(["claude", "codex"]),
  name: z.union([SessionNameSchema, FleetSessionUnavailableSchema]),
  model: z.union([z.string().min(1), FleetSessionUnavailableSchema]),
  effort: z.union([z.string().min(1), FleetSessionUnavailableSchema]),
  ctx: z.union([
    z.strictObject({
      tokens: z.number().int().nonnegative(),
      pct: z.number().min(0).max(100),
    }),
    FleetSessionUnavailableSchema,
  ]),
  rate: z.union([
    z.strictObject({
      five_h_pct: z.number().min(0).max(100),
      seven_d_pct: z.number().min(0).max(100),
      resets: z.string().min(1),
    }),
    FleetSessionUnavailableSchema,
  ]),
  cwd: z.string().min(1),
  pane_id: z.string().nullable(),
  updated_at: z.iso.datetime(),
});

export type FleetSessionUnavailable = z.output<
  typeof FleetSessionUnavailableSchema
>;
export type FleetSession = z.output<typeof FleetSessionSchema>;
export type FleetSessionRead = FleetSession | FleetSessionUnavailable;

function sessionPath(
  sessionId: string,
  env: NodeJS.ProcessEnv,
): Attempt<string> {
  const runtimeDir = env.XDG_RUNTIME_DIR;
  if (runtimeDir === undefined || runtimeDir === "")
    return { ok: false, error: new Error("XDG_RUNTIME_DIR is not set") };
  if (!SessionIdSchema.safeParse(sessionId).success)
    return { ok: false, error: new Error("invalid session_id") };
  return {
    ok: true,
    value: join(runtimeDir, "fleet", "sessions", `${sessionId}.json`),
  };
}

function unavailable(why: string): FleetSessionUnavailable {
  return { na: true, why };
}

/** Different spellings are equivalent only when the filesystem proves it. */
export async function fleetCwdMatches(
  left: string,
  right: string,
): Promise<boolean> {
  if (left === right) return true;
  const paths = await Promise.all(
    [left, right].map((path) => attempt(() => realpath(path))),
  );
  const [a, b] = paths;
  return a?.ok === true && b?.ok === true && a.value === b.value;
}

/** Parse and validate one serialized fleet-session record. */
export function parseFleetSession(text: string): FleetSessionRead {
  const parsed = jsonOf(FleetSessionSchema).safeParse(text);
  return parsed.success
    ? parsed.data
    : unavailable(
        `invalid fleet session: ${parsed.error.issues[0]?.message ?? "unknown validation error"}`,
      );
}

/** Read one session record; absent runtime data is reported as an explicit unknown. */
export async function readFleetSession(
  sessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<FleetSessionRead> {
  const path = sessionPath(sessionId, env);
  if (!path.ok) return unavailable(errorMessage(path.error));
  const text = await attempt(async (): Promise<string | undefined> => {
    await using handle = await open(path.value, "r");
    const info = await handle.stat();
    if (!info.isFile() || info.size > 64 * 1024) return undefined;
    const buffer = Buffer.alloc(info.size);
    const read = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, read.bytesRead).toString("utf8");
  });
  if (!text.ok) {
    const missing = z
      .object({ code: z.literal("ENOENT") })
      .safeParse(text.error);
    return unavailable(
      missing.success
        ? `fleet session ${sessionId} is missing`
        : `fleet session ${sessionId} could not be read: ${errorMessage(text.error)}`,
    );
  }
  if (text.value === undefined)
    return unavailable("invalid oversized fleet session");
  const parsed = parseFleetSession(text.value);
  const session = FleetSessionSchema.safeParse(parsed);
  if (session.success && session.data.session_id !== sessionId)
    return unavailable(
      `fleet session ${sessionId} has a mismatched session_id`,
    );
  return parsed;
}

/** Write a complete record by atomically replacing its destination with a same-directory temp. */
export async function writeFleetSession(
  session: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Attempt<void>> {
  const parsed = FleetSessionSchema.safeParse(session);
  if (!parsed.success) return { ok: false, error: parsed.error };
  const path = sessionPath(parsed.data.session_id, env);
  if (!path.ok) return path;
  const temp = `${path.value}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const written = await attempt(async () => {
    await mkdir(dirname(path.value), { recursive: true, mode: 0o700 });
    await writeFile(temp, `${JSON.stringify(parsed.data)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temp, path.value);
  });
  // Preserve the original error even if best-effort temporary-file cleanup fails.
  if (!written.ok) await attempt(() => unlink(temp));
  return written;
}

function fleetSessionContent(value: FleetSession): string {
  return JSON.stringify({ ...value, updated_at: undefined });
}

/** Preserve the file and its timestamp when observations have not changed.
 * In particular, projector reads must not retrigger the fleet PathChanged watcher.
 */
export async function writeFleetSessionIfChanged(
  session: unknown,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Attempt<FleetSession>> {
  const parsed = FleetSessionSchema.safeParse(session);
  if (!parsed.success) return { ok: false, error: parsed.error };
  const existing = FleetSessionSchema.safeParse(
    await readFleetSession(parsed.data.session_id, env),
  );
  if (
    existing.success &&
    fleetSessionContent(existing.data) === fleetSessionContent(parsed.data)
  )
    return { ok: true, value: existing.data };
  const next = {
    ...parsed.data,
    updated_at: Temporal.Now.instant().toString(),
  };
  const written = await writeFleetSession(next, env);
  return written.ok ? { ok: true, value: next } : written;
}

const CodexMeta = z.object({
  type: z.literal("session_meta"),
  payload: z.object({
    id: z.string(),
    session_id: z.string().optional(),
    cwd: z.string(),
    originator: z.enum([
      "Codex Desktop",
      "codex_cli_rs",
      "codex-tui",
      "codex_exec",
    ]),
  }),
});
const CodexSettings = z.object({
  model: z.string().min(1).nullish(),
  effort: z.string().min(1).nullish(),
  reasoning_effort: z.string().min(1).nullish(),
});
const CodexTurn = z.object({
  type: z.literal("turn_context"),
  payload: CodexSettings,
});
const CodexApplied = z.object({
  type: z.literal("event_msg"),
  payload: z.object({
    type: z.literal("thread_settings_applied"),
    thread_settings: CodexSettings,
  }),
});

async function rolloutDirectory(
  directory: string,
): Promise<{ path: string; directory: boolean }[] | undefined> {
  const opened = await attempt(() => opendir(directory));
  if (!opened.ok) return undefined;
  const entries: { path: string; directory: boolean }[] = [];
  let visited = 0;
  for await (const entry of opened.value) {
    if (++visited > 50000) return undefined;
    if (entry.isDirectory() || entry.isFile())
      entries.push({
        path: join(directory, entry.name),
        directory: entry.isDirectory(),
      });
  }
  return entries;
}

/** Exact ID lookup only. Exhaustion/duplicates fail closed; no date/cwd ordering. */
export async function codexRolloutPath(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(id))
    return undefined;
  const root = join(
    env.CODEX_HOME ?? join(env.HOME ?? "", ".codex"),
    "sessions",
  );
  const pending = [root];
  let selected: string | undefined;
  let remaining = 50000;
  const deadline = Temporal.Now.instant().epochMilliseconds + 1000;
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) break;
    const entries = await rolloutDirectory(directory);
    if (entries === undefined) return undefined;
    remaining -= entries.length;
    if (remaining < 0 || Temporal.Now.instant().epochMilliseconds > deadline)
      return undefined;
    pending.push(
      ...entries.filter((entry) => entry.directory).map((entry) => entry.path),
    );
    const matches = entries.filter(
      (entry) =>
        !entry.directory &&
        entry.path.endsWith(`-${id}.jsonl`) &&
        entry.path.split("/").at(-1)?.startsWith("rollout-") === true,
    );
    if (matches.length > 1 || (matches.length === 1 && selected !== undefined))
      return undefined;
    selected = matches[0]?.path ?? selected;
  }
  return selected;
}

/** Refresh from a validated native rollout using at most 128 KiB head + 256 KiB tail.
 * Reuses the fallback helper contract; no transcript-wide scan or second writer/cache.
 */
export async function readCodexNativeSession(
  session: FleetSession,
  env: NodeJS.ProcessEnv = process.env,
  nativePath?: string,
): Promise<FleetSessionRead> {
  if (session.vendor !== "codex") return session;
  const path = nativePath ?? (await codexRolloutPath(session.session_id, env));
  if (path === undefined)
    return unavailable("missing or ambiguous exact Codex rollout");
  const scanned = await attempt(async () => {
    await using handle = await open(path, "r");
    const info = await handle.stat();
    if (!info.isFile()) return unavailable("rollout is not a file");
    const head = Buffer.alloc(Math.min(info.size, 128 * 1024));
    const headRead = await handle.read(head, 0, head.length, 0);
    const firstEnd = head.indexOf(10, 0);
    if (firstEnd < 0 || firstEnd >= headRead.bytesRead)
      return unavailable("missing or truncated session_meta");
    const meta = jsonOf(CodexMeta).safeParse(
      head.subarray(0, firstEnd).toString("utf8"),
    );
    if (
      !meta.success ||
      meta.data.payload.id !== session.session_id ||
      (meta.data.payload.session_id !== undefined &&
        meta.data.payload.session_id !== session.session_id) ||
      !(await fleetCwdMatches(meta.data.payload.cwd, session.cwd))
    )
      return unavailable("rollout ID/vendor/cwd mismatch");
    const start = Math.max(0, info.size - 256 * 1024);
    const tail = Buffer.alloc(info.size - start);
    const read = await handle.read(tail, 0, tail.length, start);
    const lines = tail.subarray(0, read.bytesRead).toString("utf8").split("\n");
    if (start > 0) lines.shift();
    lines.pop(); // Only complete records; an appending writer may leave a partial last line.
    let model: string | undefined;
    let effort: string | undefined;
    for (const line of lines) {
      const turn = jsonOf(CodexTurn).safeParse(line);
      const applied = jsonOf(CodexApplied).safeParse(line);
      const settings = turn.success
        ? turn.data.payload
        : applied.data?.payload.thread_settings;
      if (settings === undefined) continue;
      model = settings.model ?? model;
      effort = settings.effort ?? settings.reasoning_effort ?? effort;
    }
    return {
      ...session,
      model: model ?? unavailable("no bounded native model observation"),
      effort: effort ?? unavailable("no bounded native effort observation"),
      updated_at: Temporal.Now.instant().toString(),
    };
  });
  if (!scanned.ok) return unavailable(errorMessage(scanned.error));
  return scanned.value;
}

/** Fallback-compatible refresh contract; all fleet records use the sole atomic writer. */
export async function refreshCodexFleetSession(
  session: FleetSession,
  env: NodeJS.ProcessEnv = process.env,
  nativePath?: string,
): Promise<FleetSessionRead> {
  if (session.vendor !== "codex") return session;
  const next = await readCodexNativeSession(session, env, nativePath);
  if (!FleetSessionSchema.safeParse(next).success) return next;
  const written = await writeFleetSessionIfChanged(next, env);
  return written.ok ? written.value : unavailable(errorMessage(written.error));
}
