import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
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
  const text = await attempt(() => readFile(path.value, "utf8"));
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
