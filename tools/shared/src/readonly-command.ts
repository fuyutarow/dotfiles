// A deadline may kill the helper before exec, or its already restricted target.
// In neither case can a shared-store writer have started. JJ_READ_ARGS alone
// cannot establish this property: jj's backend can import refs during a read.
import { join } from "node:path";

export const READONLY_JOB_ENV = "AGX_READONLY_COMMAND_JOB";

export function readonlyCommand(
  argv: string[],
  cwd: string,
  environment: NodeJS.ProcessEnv = process.env,
): { cmd: [string, ...string[]]; env: NodeJS.ProcessEnv } {
  return {
    cmd: [process.execPath, join(import.meta.dir, "readonly-exec.ts")],
    env: {
      ...environment,
      [READONLY_JOB_ENV]: JSON.stringify({ argv, cwd }),
    },
  };
}
