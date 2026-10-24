// Location for selection telemetry and composed diagnostics, never a worker-state reader.
import { homedir } from "node:os";
import { join } from "node:path";
export function agxTelemetryDir(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_STATE_HOME;
  if (env.AGX_STATE_DIR !== undefined && env.AGX_STATE_DIR !== "")
    return env.AGX_STATE_DIR;
  return join(
    base === undefined || base === ""
      ? join(env.HOME ?? homedir(), ".local/state")
      : base,
    "agx",
  );
}
