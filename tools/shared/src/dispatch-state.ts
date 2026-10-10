import { homedir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "./zod.ts";

/** The dispatch state basename has one owner, including consumers outside agx. */
export const STATE_DIR = "agx";
export const ACTIVE_MARKER_SCHEMA = 1;

/** Strict agx writer contract for one live worker marker. */
export const ActiveMarkerSchema = z.strictObject({
  schema: z.literal(ACTIVE_MARKER_SCHEMA),
  run_id: z.string().min(1),
  pid: z.number().int().positive(),
  display_id: z.string().optional(),
  kind: z.enum(["token", "compute"]).optional(),
  labels: z.array(z.string()).optional(),
  label: z.string(),
  choice: z.string(),
  pick_source: z.string(),
  started_at: z.string(),
  cwd: z.string(),
  dispatcher_session: z.string().optional(),
  ticket: z
    .looseObject({
      writes: z.array(z.string()),
      lane: z.string().optional(),
      name: z.string().optional(),
      kind: z.string().optional(),
      labels: z.array(z.string()).optional(),
    })
    .optional(),
});

/** Readers accept fields added by newer agx writers while validating the shared contract. */
export const ActiveMarkerReaderSchema = ActiveMarkerSchema.loose();
export type ActiveMarker = z.output<typeof ActiveMarkerSchema>;
export type ActiveMarkerReader = z.output<typeof ActiveMarkerReaderSchema>;

/** Serialize only markers that satisfy the strict agx writer contract. */
export type ActiveMarkerSerialization =
  | { success: true; text: string }
  | { success: false; error: string };

export function serializeActiveMarker(
  value: unknown,
): ActiveMarkerSerialization {
  const parsed = ActiveMarkerSchema.safeParse(value);
  if (!parsed.success)
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "invalid active marker",
    };
  return { success: true, text: JSON.stringify(parsed.data) };
}

export type ActiveMarkerRead =
  | { kind: "valid"; marker: ActiveMarkerReader }
  | { kind: "malformed" }
  | { kind: "unreadable"; reason: string };

const ActiveMarkerIdentitySchema = ActiveMarkerSchema.pick({
  run_id: true,
  pid: true,
}).loose();

/** Missing identity is malformed and skipped; other parsing failures are countable. */
export function parseActiveMarker(text: string): ActiveMarkerRead {
  const json = jsonOf(z.unknown()).safeParse(text);
  if (!json.success) return { kind: "unreadable", reason: "invalid JSON" };
  if (!ActiveMarkerIdentitySchema.safeParse(json.data).success)
    return { kind: "malformed" };
  const parsed = ActiveMarkerReaderSchema.safeParse(json.data);
  if (!parsed.success)
    return {
      kind: "unreadable",
      reason: parsed.error.issues[0]?.message ?? "invalid marker",
    };
  return { kind: "valid", marker: parsed.data };
}

export function dispatchStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.AGX_STATE_DIR;
  if (explicit !== undefined && explicit !== "") return explicit;
  const base = env.XDG_STATE_HOME;
  return join(
    base === undefined || base === "" ? join(homedir(), ".local/state") : base,
    STATE_DIR,
  );
}

/** Read both locations until the agent-router state migration is complete.
 *  An explicit directory stays isolated for callers and tests; agx wins duplicate run ids. */
export function dispatchStateReadDirs(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const current = dispatchStateDir(env);
  if (env.AGX_STATE_DIR !== undefined && env.AGX_STATE_DIR !== "")
    return [current];
  const base = env.XDG_STATE_HOME;
  const legacy = join(
    base === undefined || base === "" ? join(homedir(), ".local/state") : base,
    "agent-router",
  );
  return [current, legacy];
}
