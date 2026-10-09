import { homedir } from "node:os";
import { join } from "node:path";

/** The dispatch state basename has one owner, including consumers outside agx. */
export const STATE_DIR = "agx";

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
