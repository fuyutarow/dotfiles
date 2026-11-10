import { stat } from "node:fs/promises";
import { join } from "node:path";
import { err, fromPromise, ok, type Result } from "neverthrow";
import { z } from "./zod.ts";

const ErrnoSchema = z.object({ code: z.string() });

// agx writes this marker when Claude API credits run out; for 24 h after that agx runs Claude
// workers on the subscription. Only its mtime is read, and the file's content never is.
export function claudeCreditsMarkerPath(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const xdg = env["XDG_STATE_HOME"];
  const stateHome =
    xdg !== undefined && xdg !== ""
      ? xdg
      : join(env["HOME"] ?? "", ".local", "state");
  return join(stateHome, "agx", "claude-credits-unavailable");
}

/** Marker mtime in epoch ms, or undefined when the marker is absent. */
export async function readClaudeCreditsMarker(
  path: string = claudeCreditsMarkerPath(),
): Promise<Result<number | undefined, string>> {
  const stats = await fromPromise(stat(path), (error: unknown) => error);
  if (stats.isOk()) return ok(stats.value.mtimeMs);
  const errno = ErrnoSchema.safeParse(stats.error);
  if (errno.success && errno.data.code === "ENOENT") return ok(undefined);
  return err("claude credits marker unreadable");
}
