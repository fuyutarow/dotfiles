// Fleet session handoff, schema 1. No installed npm dependencies: Stop hooks read this too.
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jsonOf, z } from "./zod.ts";
import { attempt, type Attempt } from "./attempt.ts";

const NA = z.object({ na: z.literal(true), why: z.string().min(1) });
const Percent = z.number().min(0).max(100);
const ISO = z.iso.datetime({ offset: true });
const Context = z.object({ tokens: z.number().nonnegative(), pct: Percent });
const Rate = z.object({
  five_h_pct: Percent,
  seven_d_pct: Percent,
  resets: z.object({
    five_h: z.union([ISO, NA]),
    seven_d: z.union([ISO, NA]),
  }),
});
export const FleetSessionSchema = z.object({
  schema: z.literal(1),
  session_id: z.string().regex(/^[A-Za-z0-9_-]+$/u),
  vendor: z.enum(["claude", "codex"]),
  name: z.union([z.string().regex(/^.+-agt_.+$/u), NA]),
  model: z.union([z.string().min(1), NA]),
  effort: z.union([z.string().min(1), NA]),
  ctx: z.union([Context, NA]),
  rate: z.union([Rate, NA]),
  rc: z.union([z.enum(["🔗", "rc:off", "rc:?"]), NA]),
  cwd: z.string(),
  pane_id: z.string().nullable(),
  updated_at: ISO,
});
export type FleetSession = z.infer<typeof FleetSessionSchema>;

/** Accept JSON text or an already decoded value; malformed handoffs are unavailable. */
export function parseFleetSession(value: unknown): FleetSession | undefined {
  const parsed = (
    typeof value === "string" ? jsonOf(FleetSessionSchema) : FleetSessionSchema
  ).safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function sessionPath(
  sessionId: string,
  runtimeDir: string | undefined,
): string | undefined {
  if (runtimeDir === undefined || runtimeDir === "") return undefined;
  if (!/^[A-Za-z0-9_-]+$/u.test(sessionId)) return undefined;
  return join(runtimeDir, "fleet", "sessions", `${sessionId}.json`);
}

/** Read only the requested session; missing, invalid or mismatched files fail open. */
export async function readFleetSession(
  sessionId: string,
  runtimeDir = process.env.XDG_RUNTIME_DIR,
): Promise<FleetSession | undefined> {
  const path = sessionPath(sessionId, runtimeDir);
  if (path === undefined) return undefined;
  const read = await attempt(() => readFile(path, "utf8"));
  const session = read.ok ? parseFleetSession(read.value) : undefined;
  return session?.session_id === sessionId ? session : undefined;
}

/** Validate before publication; same-directory rename keeps readers off partial JSON. */
export async function writeFleetSession(
  value: FleetSession,
  runtimeDir = process.env.XDG_RUNTIME_DIR,
): Promise<Attempt<void>> {
  const parsed = FleetSessionSchema.safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error };
  const session = parsed.data;
  const path = sessionPath(session.session_id, runtimeDir);
  if (path === undefined)
    return {
      ok: false,
      error: "invalid session id or missing XDG_RUNTIME_DIR",
    };
  const temp = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
  const result = await attempt(async () => {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(temp, `${JSON.stringify(session)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    await rename(temp, path);
  });
  await attempt(() => unlink(temp));
  return result;
}

const reset = (value: string | z.infer<typeof NA>) =>
  typeof value === "string" ? ` ⟳${value}` : "";
const unavailable = (value: unknown) =>
  `n/a (${NA.safeParse(value).data?.why ?? "not recorded"})`;

/** Shared plain snapshot rows: the handoff owns values, never legacy presentation reasons. */
export function fleetSessionRows(session: FleetSession): string[] {
  const rows: string[] = [];
  const ctx = Context.safeParse(session.ctx);
  if (ctx.success) {
    const { tokens, pct } = ctx.data;
    const shown =
      tokens < 1000 ? `${tokens}` : `${Math.round(tokens / 100) / 10}k`;
    rows.push(`Ctx: ${shown} ${pct}%`);
  } else rows.push(`Ctx: ${unavailable(session.ctx)}`);
  const rate = Rate.safeParse(session.rate);
  if (rate.success) {
    const { five_h_pct, seven_d_pct, resets } = rate.data;
    rows.push(
      `Rate: 5h ${five_h_pct}%${reset(resets.five_h)} · 7d ${seven_d_pct}%${reset(resets.seven_d)}`,
    );
  } else rows.push(`Rate: ${unavailable(session.rate)}`);
  return rows.map((row) => row.replaceAll(/[\r\n\u2028\u2029]/gu, " "));
}
