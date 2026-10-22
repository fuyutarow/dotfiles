import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { lstat } from "node:fs/promises";

const nonEmpty = (value: string | undefined) =>
  value === "" ? undefined : value;

/** The sole live state directory; legacy-v1 beneath it is read-only. */
export function stateDir(env: NodeJS.ProcessEnv = process.env): string {
  return (
    nonEmpty(env.AGX_STATE_DIR) ??
    join(
      nonEmpty(env.XDG_STATE_HOME) ??
        join(env.HOME ?? homedir(), ".local", "state"),
      "agx",
    )
  );
}

const exists = (path: string) =>
  lstat(path).then(
    () => true,
    () => false,
  );

/** Refuse retired configuration before any command can read or write state. */
export async function stateRefusal(
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  if (env.AGX_NEXT_STATE_DIR !== undefined)
    return "agx: AGX_NEXT_STATE_DIR is retired; use AGX_STATE_DIR";
  const dir = stateDir(env);
  const base = dirname(dir);
  if (!(await exists(dir)) && (await exists(join(base, "agx-next"))))
    return `agx: state migration required; run: mv ${join(base, "agx")} ${join(base, "agx.legacy-v1.tmp")} && mv ${join(base, "agx-next")} ${join(base, "agx")} && mv ${join(base, "agx.legacy-v1.tmp")} ${join(base, "agx/legacy-v1")}`;
  return undefined;
}

export async function checkState(): Promise<void> {
  const refusal = await stateRefusal();
  if (refusal !== undefined) {
    process.stderr.write(refusal + "\n");
    process.exit(2);
  }
}
