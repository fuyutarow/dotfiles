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
