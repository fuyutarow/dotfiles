// Read-only wire contract ported from tools/agx/src/state.ts:
// state directory: lines 9-20; marker path: 47-49; ActiveSchema: 68-79;
// progress path/schema: 81-100. No marker, progress, brief or run-log writers.
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "./zod.ts";

export const STATE_SCHEMA = 1;

const nonEmpty = (v: string | undefined): string | undefined =>
  v === undefined || v === "" ? undefined : v;

/** $AGX_STATE_DIR (test seam), else $XDG_STATE_HOME/agx, else ~/.local/state/agx. */
export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = nonEmpty(env.AGX_STATE_DIR);
  if (explicit !== undefined) return explicit;
  const base = nonEmpty(env.XDG_STATE_HOME) ?? join(homedir(), ".local/state");
  return join(base, "agx");
}
/** One JSON marker per running worker: written at start, removed at exit. */
export const activeDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(stateDir(env), "active");
export const ActiveSchema = z.strictObject({
  schema: z.literal(STATE_SCHEMA),
  run_id: z.string(),
  pid: z.number().int(),
  display_id: z.string().optional(),
  label: z.string(),
  choice: z.string(),
  pick_source: z.string(),
  started_at: z.string(),
  cwd: z.string(),
  dispatcher_session: z.string().optional(),
  // Ticket metadata is written on current agx markers; the statusline ignores it,
  // but the strict wire schema must accept it or the entire live marker disappears.
  ticket: z.looseObject({ writes: z.array(z.string()) }).optional(),
});
export type Active = z.output<typeof ActiveSchema>;

/** What a running worker is doing, beside its marker: `<run_id>.progress.json` in activeDir.
 *  Codex and Claude workers write activity, cumulative usage when reported, and known cost here;
 *  the statusline Run rows read it, and agx removes it with the active marker. */
export const progressFile = (
  runId: string,
  env: NodeJS.ProcessEnv = process.env,
): string => join(activeDir(env), `${runId}.progress.json`);

export const ProgressSchema = z.strictObject({
  schema: z.literal(STATE_SCHEMA),
  at: z.string(),
  last: z.string(),
  commands: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  usage: z
    .looseObject({
      input_tokens: z.number().nonnegative().optional(),
      cached_input_tokens: z.number().nonnegative().optional(),
      output_tokens: z.number().nonnegative().optional(),
      reasoning_output_tokens: z.number().nonnegative().optional(),
    })
    .optional(),
  cost_usd: z.number().nonnegative().optional(),
  session: z.string().optional(), // the vendor's id for the worker (codex thread, claude session)
});
export type Progress = z.output<typeof ProgressSchema>;
