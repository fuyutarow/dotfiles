// Read-only wire contract ported from tools/agent-dispatch/src/state.ts:
// state directory: lines 9-20; marker path: 47-49; ActiveSchema: 68-79;
// progress path/schema: 81-100. No marker, progress, brief or run-log writers.
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "./zod.ts";

export const STATE_SCHEMA = 1;

const nonEmpty = (v: string | undefined): string | undefined =>
  v === undefined || v === "" ? undefined : v;

/** $AGENT_ROUTER_STATE_DIR (test seam), else $XDG_STATE_HOME/agent-router, else ~/.local/state/agent-router. */
export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = nonEmpty(env.AGENT_ROUTER_STATE_DIR);
  if (explicit !== undefined) return explicit;
  const base = nonEmpty(env.XDG_STATE_HOME) ?? join(homedir(), ".local/state");
  return join(base, "agent-router");
}
/** One JSON marker per running worker: written at start, removed at exit. */
export const activeDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(stateDir(env), "active");
export const ActiveSchema = z.strictObject({
  schema: z.literal(STATE_SCHEMA),
  run_id: z.string(),
  pid: z.number().int(),
  label: z.string(),
  choice: z.string(),
  pick_source: z.string(),
  started_at: z.string(),
  cwd: z.string(),
  dispatcher_session: z.string().optional(),
  // Ticket metadata is written on current agent-dispatch markers; the statusline ignores it,
  // but the strict wire schema must accept it or the entire live marker disappears.
  ticket: z.looseObject({ writes: z.array(z.string()) }).optional(),
});
export type Active = z.output<typeof ActiveSchema>;

/** What a running worker is doing, beside its marker: `<run_id>.progress.json` in activeDir.
 *  Written by agent-dispatch from codex's own `--json` events (agent-router passes the path in
 *  AGENT_DISPATCH_CODEX_PROGRESS_FILE) and by run-claude from claude's stream-json (--progress-file), read by
 *  the statusline Run rows, removed with the marker. codex
 *  reports token usage only when a turn completes (a luna run is one turn), so live tokens do not
 *  exist; the counts here are commands run and distinct files changed so far. */
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
  session: z.string().optional(), // the vendor's id for the worker (codex thread, claude session)
});
export type Progress = z.output<typeof ProgressSchema>;
