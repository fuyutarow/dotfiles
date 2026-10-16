import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  readdirSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { type Attempt } from "../../shared/src/attempt.ts";
import { fromThrowable } from "../../shared/src/zod.ts";

export type JjWorkspace = { root: string; repo: string; backingRoot: string };

/** Resolve metadata without invoking jj: even a root probe must not snapshot a store. */
export function jjWorkspace(cwd: string): Attempt<JjWorkspace> {
  const result = fromThrowable(() => {
    let root = realpathSync(cwd);
    while (!existsSync(join(root, ".jj"))) {
      const parent = dirname(root);
      if (parent === root) return null;
      root = parent;
    }
    if (
      readFileSync(join(root, ".jj", "working_copy", "type"), "utf8").trim() !==
        "local" ||
      !existsSync(join(root, ".jj", "working_copy", "checkout"))
    )
      return null;
    const marker = join(root, ".jj", "repo");
    const repo = realpathSync(
      lstatSync(marker).isDirectory()
        ? marker
        : resolve(dirname(marker), readFileSync(marker, "utf8").trim()),
    );
    if (
      !lstatSync(repo).isDirectory() ||
      !existsSync(join(repo, "store", "type"))
    )
      return null;
    return { root, repo, backingRoot: dirname(dirname(repo)) };
  })();
  if (result.isErr()) return { ok: false, error: result.error };
  return result.value === null
    ? { ok: false, error: `${cwd} is not a valid local jj workspace` }
    : { ok: true, value: result.value };
}

/** Git lockfiles carry no PID. Detect and name them; never guess ownership or delete them. */
export function refLocks(workspace: JjWorkspace): Attempt<string[]> {
  const result = fromThrowable(() => {
    const store = join(workspace.repo, "store");
    const target = join(store, "git_target");
    const git = existsSync(target)
      ? realpathSync(resolve(store, readFileSync(target, "utf8").trim()))
      : join(store, "git");
    if (!existsSync(git)) return [];
    const commonFile = join(git, "commondir");
    const common = existsSync(commonFile)
      ? realpathSync(resolve(git, readFileSync(commonFile, "utf8").trim()))
      : git;
    const locks = new Set<string>();
    for (const root of new Set([git, common])) {
      const present = ["packed-refs.lock", "HEAD.lock", "shallow.lock"]
        .map((name) => join(root, name))
        .filter((path) => existsSync(path));
      for (const path of present) locks.add(path);
    }
    if (locks.size > 0) return [...locks].toSorted();
    const pending = [join(common, "refs")];
    let visited = 0;
    while (pending.length > 0) {
      const path = pending.pop();
      if (path === undefined) break;
      if (!existsSync(path)) continue;
      if (++visited > 20_000) return null;
      const info = lstatSync(path);
      if (info.isSymbolicLink()) return null;
      if (info.isDirectory())
        pending.push(...readdirSync(path).map((name) => join(path, name)));
      else if (path.endsWith(".lock")) locks.add(path);
    }
    return [...locks].toSorted();
  })();
  if (result.isErr()) return { ok: false, error: result.error };
  return result.value === null
    ? { ok: false, error: "cannot safely inspect Git ref lock paths" }
    : { ok: true, value: result.value };
}
