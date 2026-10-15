// Test temp ownership: a bun test preload (bunfig.toml [test] preload) that gives each test
// process its own TMPDIR under one per-run parent and removes both at exit, so no test leaves an
// entry in the system temp directory. Every helper that calls mkdtemp(join(tmpdir(), …)) follows
// for free: os.tmpdir() reads TMPDIR at call time, and spawned children inherit it.
//
//   <system tmp>/dotfiles-test-run-<owner pid>-XXXXXX/      one per run, removed by its owner
//     p<pid>-XXXXXX/                                        one per test process = its TMPDIR
//
// The first process of a run creates the parent and publishes it in DOTFILES_TEST_RUN_DIR; a nested
// `bun test` inherits the variable and adds its own child under the same parent. The end of the
// run (a preload-level afterAll: bun 1.4 never emits `exit` from `bun test`, measured 2026-10-15),
// process exit, and INT/TERM/HUP where the runtime delivers them remove the process's own
// directory — and the parent, when this process owns it. A kill the runtime does not deliver
// (SIGKILL always; `bun test` swallows INT/TERM too) leaves the parent, which is named after its
// owner's pid: the next run removes it when that pid is dead, or when it is older than STALE_MS
// (pid numbers repeat across pid namespaces). Only entries with this prefix, owned by this user,
// are ever removed — nothing else in the temp directory is touched.

import { afterAll } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pidAlive } from "./dir-lock.ts";
import { fromThrowable } from "./zod.ts";

export const RUN_PREFIX = "dotfiles-test-run-";
export const RUN_DIR_ENV = "DOTFILES_TEST_RUN_DIR";
const STALE_MS = 12 * 60 * 60 * 1000;
const SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;

/** The owner pid encoded in a run-parent name, or undefined when `name` is not one. */
export function ownerPidOf(name: string): number | undefined {
  const match = new RegExp(`^${RUN_PREFIX}(\\d+)-`, "u").exec(name);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/** Remove a tree even when a fixture left it read-only; false when it still exists. */
export function removeTree(path: string): boolean {
  const remove = () => {
    rmSync(path, { recursive: true, force: true });
  };
  if (fromThrowable(remove)().isOk()) return true;
  Bun.spawnSync(["chmod", "-R", "u+rwX", path], {
    stdout: "ignore",
    stderr: "ignore",
    timeout: 30_000,
  });
  return fromThrowable(remove)().isOk();
}

/** Remove run parents of `root` whose owner process is gone; returns the names removed. */
export function sweepStaleRuns(root: string): string[] {
  const listed = fromThrowable(() => readdirSync(root))();
  if (listed.isErr()) return [];
  const uid = process.getuid?.();
  const removed: string[] = [];
  for (const name of listed.value) {
    const pid = ownerPidOf(name);
    if (pid === undefined) continue;
    const path = join(root, name);
    const stat = fromThrowable(() => statSync(path))();
    if (stat.isErr() || (uid !== undefined && stat.value.uid !== uid)) continue;
    const old = Temporal.Now.instant().epochMilliseconds - stat.value.mtimeMs;
    if ((pidAlive(pid) && old < STALE_MS) || !removeTree(path)) continue;
    removed.push(name);
  }
  return removed;
}

export type TestTmp = {
  readonly parent: string;
  /** The directory this process exports as TMPDIR. */
  readonly dir: string;
  readonly ownsParent: boolean;
  /** Remove this process's directory (and the parent when owned). Idempotent. */
  readonly cleanup: () => void;
};

/** Create the run parent (or join the inherited one) and this process's directory under it. */
export function createTestTmp(
  env: Record<string, string | undefined> = process.env,
  root: string = tmpdir(),
): TestTmp {
  sweepStaleRuns(root);
  const inherited = env[RUN_DIR_ENV];
  const joined = inherited !== undefined && existsSync(inherited);
  const parent = joined
    ? inherited
    : mkdtempSync(join(root, `${RUN_PREFIX}${process.pid}-`));
  const dir = mkdtempSync(join(parent, `p${process.pid}-`));
  env[RUN_DIR_ENV] = parent;
  env.TMPDIR = dir;
  let done = false;
  return {
    parent,
    dir,
    ownsParent: !joined,
    cleanup: () => {
      if (done) return;
      done = true;
      removeTree(dir);
      if (!joined) removeTree(parent);
    },
  };
}

/** Install the cleanup at the end of the test run, on exit, and on the terminating signals. */
export function installTestTmp(
  env: Record<string, string | undefined> = process.env,
  root: string = tmpdir(),
): TestTmp {
  const tmp = createTestTmp(env, root);
  process.on("exit", tmp.cleanup);
  // afterAll throws outside `bun test` (a plain script importing this module); exit covers that.
  fromThrowable(() => {
    afterAll(tmp.cleanup);
  })();
  for (const [signal, number] of Object.entries(SIGNALS)) {
    process.once(signal, () => {
      tmp.cleanup();
      process.exit(128 + number);
    });
  }
  return tmp;
}

installTestTmp();
