import { homedir } from "node:os";
import { join } from "node:path";

/** The dispatch state basename has one owner, including consumers outside agent-dispatch. */
export const STATE_DIR = "agent-router";

export function dispatchStateDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.AGENT_ROUTER_STATE_DIR;
  if (explicit !== undefined && explicit !== "") return explicit;
  const base = env.XDG_STATE_HOME;
  return join(
    base === undefined || base === "" ? join(homedir(), ".local/state") : base,
    STATE_DIR,
  );
}
