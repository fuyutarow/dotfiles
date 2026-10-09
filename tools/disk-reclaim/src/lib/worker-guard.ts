import { realpathSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";
import {
  AGX_WORKER_ENV,
  AGX_WORKER_VALUE,
} from "../../../shared/src/worker-env.ts";
import { stateDir } from "../receipt.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";

const isWithin = (path: string, parent: string): boolean => {
  const rel = relative(resolve(parent), resolve(path));
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
};

const realTmpdir = fromThrowable(() => realpathSync(tmpdir()))().unwrapOr(
  resolve(tmpdir()),
);
const isSystemTmp = (path: string): boolean =>
  [tmpdir(), realTmpdir, "/tmp", "/private/tmp"].some((root) =>
    isWithin(path, root),
  );

/** Return the refusal message when a worker's mutating command is not isolated. */
export function workerMutationRefusal(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (env[AGX_WORKER_ENV] !== AGX_WORKER_VALUE) return null;
  const home = env.HOME ?? homedir();
  if (isSystemTmp(home) || isSystemTmp(stateDir(env))) return null;
  return "agx worker guard: mutating run and delete --yes commands require HOME or RECLAIM_STATE_DIR under the system tmp directory; run it from the owner's own shell, or set HOME to a tmp dir for tests";
}
