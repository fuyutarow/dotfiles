// Test temp ownership: a bun test preload (bunfig.toml [test] preload) that gives each test
// process its own TMPDIR under one per-run parent and removes both at exit, so no test leaves an
// entry in the system temp directory. Every helper that calls mkdtemp(join(tmpdir(), …)) follows
// for free: os.tmpdir() reads TMPDIR at call time, and spawned children inherit it.
//
//   <system tmp>/dotfiles-test-run-ns-<namespace>-<owner pid>-XXXXXX/
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

import { afterAll, afterEach, beforeEach, setDefaultTimeout } from "bun:test";
import { mkdir, mkdtemp, readlink } from "node:fs/promises";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pidAlive } from "./dir-lock.ts";
import { fromThrowable } from "./zod.ts";

// Signal 0 can only establish liveness inside this PID namespace. Codex sandboxes share /tmp
// but can each have PID 3: a sweeper must never treat another namespace's live owner as dead.
const namespace =
  process.platform === "linux"
    ? await readlink("/proc/self/ns/pid")
        .then((value) => value.replaceAll(/\D/gu, ""))
        .catch(() => crypto.randomUUID().replaceAll("-", ""))
    : "host";
export const RUN_PREFIX = `dotfiles-test-run-ns-${namespace}-`;
const ANY_RUN = /^dotfiles-test-run-(?:ns-[a-z0-9]+-)?\d+-/u;
export const RUN_DIR_ENV = "DOTFILES_TEST_RUN_DIR";
const STALE_MS = 12 * 60 * 60 * 1000;
const SIGNALS = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;

/** The owner pid encoded in a run-parent name, or undefined when `name` is not one. */
export function ownerPidOf(name: string): number | undefined {
  const match = new RegExp(`^${RUN_PREFIX}(\\d+)-`, "u").exec(name);
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

/** Restore owner access on directories without following symlinks. */
function restoreDirectoryAccess(path: string): void {
  // sync-ok: process exit handler runs synchronously
  const stat = lstatSync(path);
  if (!stat.isDirectory()) return;
  // sync-ok: process exit handler runs synchronously
  chmodSync(path, stat.mode | 0o700);
  for (const name of readdirSync(path)) {
    // One inaccessible entry must not prevent repairing its siblings.
    fromThrowable(() => {
      restoreDirectoryAccess(join(path, name));
    })();
  }
}

/** Remove a tree even when a fixture left it read-only; false when it still exists. */
export function removeTree(path: string): boolean {
  fromThrowable(() => {
    restoreDirectoryAccess(path);
  })();
  const removed = fromThrowable(() => {
    rmSync(path, { recursive: true, force: true });
  })();
  if (removed.isOk()) return true;
  process.stderr.write(`WARNING: could not remove test temp path ${path}\n`);
  return false;
}

/** Remove run parents of `root` whose owner process is gone; returns the names removed. */
export function sweepStaleRuns(root: string): string[] {
  const listed = fromThrowable(() => readdirSync(root))();
  if (listed.isErr()) return [];
  const uid = process.getuid?.();
  const removed: string[] = [];
  for (const name of listed.value) {
    const pid = ownerPidOf(name);
    if (pid === undefined && !ANY_RUN.test(name)) continue;
    const path = join(root, name);
    const stat = fromThrowable(() => statSync(path))();
    if (stat.isErr() || (uid !== undefined && stat.value.uid !== uid)) continue;
    const old = Temporal.Now.instant().epochMilliseconds - stat.value.mtimeMs;
    // Foreign namespaces and legacy names have no locally meaningful PID. Only age can
    // retire them. Same-namespace dead owners can still be reclaimed immediately.
    if (
      ((pid === undefined || pidAlive(pid)) && old < STALE_MS) ||
      !removeTree(path)
    )
      continue;
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

const processTmp = installTestTmp();
// Installed tool binaries are test inputs. Preserve their declared location before
// isolating HOME/XDG_DATA_HOME; mise must not reinstall the toolchain in each fixture.
process.env.MISE_DATA_DIR ??= join(
  process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"),
  "mise",
);
// Subprocess integration tests have 30 s child guards. Bun's 5 s default otherwise kills an
// awaited child under load before its own guard can report a result. This is a hang guard;
// deadline behavior is asserted separately with injected clocks.
fromThrowable(() => {
  setDefaultTimeout(30_000);
})();

const originalEnv = new Map<string, string | undefined>();
let testRoot: string | undefined;

/** Paths are isolated before module evaluation too: several collectors capture HOME on import. */
async function isolatedPaths(root: string) {
  const home = join(root, "home");
  const paths = {
    HOME: home,
    AGX_STATE_DIR: join(root, "xdg-state", "agx"),
    AGX_NEXT_STATE_DIR: join(root, "xdg-state", "agx-next"),
    CLAUDE_BASH_DURATIONS_DIR: join(root, "xdg-state", "claude-bash-durations"),
    CLAUDE_CONFIG_DIR: join(home, ".claude"),
    CLAUDE_SESSION_SCRATCHPAD: join(root, "scratchpad"),
    CODEX_HOME: join(home, ".codex"),
    SESSION_SCRATCHPAD: join(root, "scratchpad"),
    XDG_CACHE_HOME: join(root, "xdg-cache"),
    XDG_CONFIG_HOME: join(root, "xdg-config"),
    XDG_DATA_HOME: join(root, "xdg-data"),
    XDG_RUNTIME_DIR: join(root, "xdg-runtime"),
    XDG_STATE_HOME: join(root, "xdg-state"),
    TMPDIR: join(root, "tmp"),
  };
  await Promise.all(
    Object.values(paths).map((path) => mkdir(path, { recursive: true })),
  );
  return paths;
}

Object.assign(process.env, await isolatedPaths(processTmp.dir));

/** Give each test and every process it starts an isolated home and temp tree. */
fromThrowable(() => {
  beforeEach(async () => {
    const root = await mkdtemp(join(processTmp.dir, "dotfiles-test-"));
    testRoot = root;
    const paths = await isolatedPaths(root);
    for (const key of Object.keys(paths))
      originalEnv.set(key, process.env[key]);
    Object.assign(process.env, paths);
  });
})();

fromThrowable(() => {
  afterEach(() => {
    for (const [key, value] of originalEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
    const root = testRoot;
    testRoot = undefined;
    if (root !== undefined) removeTree(root);
  });
})();
