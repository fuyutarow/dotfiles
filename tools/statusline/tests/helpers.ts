import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs: string[] = [];
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}
export function tempHome(): string {
  const home = tempDir("statusline-home-");
  mkdirSync(join(home, ".claude"));
  return home;
}
export function isolatedStatuslineEnv(
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const home =
    env.HOME === undefined || env.HOME === ""
      ? tempDir("statusline-env-home-")
      : env.HOME;
  let state = join(home, ".local", "state", "agx-test");
  if (env.AGX_STATE_DIR !== undefined && env.AGX_STATE_DIR !== "") {
    state = env.AGX_STATE_DIR;
  } else if (env.XDG_STATE_HOME !== undefined && env.XDG_STATE_HOME !== "") {
    // Empty keeps migration tests on their temporary XDG root to exercise both reader paths.
    state = "";
  }
  return {
    ...env,
    HOME: home,
    AGX_STATE_DIR: state,
    AGX_DISPATCHER_SESSION: "",
    CLAUDE_CODE_SESSION_ID: "",
  };
}
export function cleanupTempDirs(): void {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
}
