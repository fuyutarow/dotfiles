// agent-router's on-disk state, defined in ONE place for its two consumers: agent-router (writes a
// marker per running worker, appends runs.jsonl) and the statusline Run rows (read the markers).
// Outside the repo by design: briefs and picks may be private. Zero-dep beyond the repo's zod bundle.
import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { z } from "../../shared/src/zod.ts";

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

/** Every brief's full original text (ticket included), once per content: `briefs/<sha256>.md`. The
 *  run record's `brief.sha256` is the key; the router's per-run worker copies share the directory
 *  (named by run id) and are removed at the end of the run, these never are. */
export const storedBriefPath = (
  sha256: string,
  env: NodeJS.ProcessEnv = process.env,
): string => join(stateDir(env), "briefs", `${sha256}.md`);

/** Write the brief under its hash unless that file exists already (written once, never rewritten).
 *  The temp file + rename keeps a reader from ever seeing half a brief; two writers racing past the
 *  existence check land the same bytes, since the name is the content's hash. */
export function storeBrief(
  sha256: string,
  text: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const path = storedBriefPath(sha256, env);
  if (existsSync(path)) return path;
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
  return path;
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
  dispatcher_session: z.string().optional(),
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
  session: z.string().optional(), // the vendor's id for the worker (codex thread, claude session)
});
export type Progress = z.output<typeof ProgressSchema>;
