// agent-router's on-disk state, defined in ONE place for its two consumers: agent-router (writes a
// marker per running worker, appends runs.jsonl) and the statusline Run rows (read the markers).
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

// A brief's dispatch declaration (CLAUDE.md: every dispatch declares its resource class) is the
// same few words on every brief, so as a label it told the Run rows nothing (Vast 2026-10-06: three
// rows all read "RESOURCE-CLASS(NONCOMPUTE): read"). The label is the first line after it.
const DECLARATION = /^RESOURCE-(?:CLASS|ENVELOPE)\(/u;
const LABEL_CHARS = 60;

/** A worker's default label: the brief's first line that is not a declaration, heading marks dropped. */
export function briefLabel(brief: string): string {
  return (
    brief
      .split("\n")
      .map((l) => l.trim().replace(/^#+\s*/u, ""))
      .find((l) => l !== "" && !DECLARATION.test(l))
      ?.slice(0, LABEL_CHARS) ?? ""
  );
}

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

/** What a running worker is doing, beside its marker: `<run_id>.progress.json` in activeDir.
 *  Written by codex-run from codex's own `--json` events (agent-router passes the path in
 *  CODEX_RUN_PROGRESS_FILE) and by run-claude from claude's stream-json (--progress-file), read by
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
});
export type Progress = z.output<typeof ProgressSchema>;
