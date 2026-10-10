// Read-only helpers for agx state paths and progress files. The active-marker contract lives in
// tools/shared/src/dispatch-state.ts. This module contains no marker, progress, brief, or log writer.
import { join } from "node:path";
import { z } from "./zod.ts";
import {
  ACTIVE_MARKER_SCHEMA,
  dispatchStateDir,
  dispatchStateReadDirs,
} from "../../shared/src/dispatch-state.ts";

export const STATE_SCHEMA = ACTIVE_MARKER_SCHEMA;

/** $AGX_STATE_DIR (test seam), else $XDG_STATE_HOME/agx, else ~/.local/state/agx. */
export const stateDir = dispatchStateDir;
/** One JSON marker per running worker: written at start, removed at exit. */
export const activeDir = (env: NodeJS.ProcessEnv = process.env): string =>
  join(stateDir(env), "active");
export const activeDirs = (env: NodeJS.ProcessEnv = process.env): string[] =>
  dispatchStateReadDirs(env).map((dir) => join(dir, "active"));
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
