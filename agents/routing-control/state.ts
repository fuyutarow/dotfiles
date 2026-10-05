// agent-router's on-disk state, defined in ONE place for its two consumers: agent-router (writes a
// marker per running worker, appends runs.jsonl) and the statusline `Run:` row (reads the markers).
// Outside the repo by design: briefs and picks may be private. Zero-dep beyond the repo's zod bundle.
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "../hooks/zod.ts";

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
});
export type Active = z.output<typeof ActiveSchema>;
