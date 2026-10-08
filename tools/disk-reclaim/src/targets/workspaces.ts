import {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import {
  listWorkspaces,
  storeOf,
  walkRoots,
  type Listed,
} from "../jj/discover.ts";
import { jj, unpushedRevset, workingCopyRevset } from "../jj/jj.ts";
import type { OpenPaths } from "../lib/procs.ts";
import { resolveProcRoot } from "../lib/procs.ts";
import { createLivenessSnapshot, scratchRef } from "../liveness/facts.ts";
import { judge } from "../liveness/predicate.ts";
import { judgeWorkspace, type WorkspaceFacts } from "../jj/safety.ts";
import { scanWorkspace } from "../jj/scan.ts";
import {
  removeTree,
  removeTreeProgress,
  type RemoveTreeOptions,
} from "../lib/remove-tree.ts";
import type { ActionResult, Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { treeBytes } from "./tree.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";
import { protectedReason } from "../lib/protected.ts";

export type WorkspacesOptions = {
  /** opt-in: `jj git fetch` each store before judging (a fresher remote view) */
  fetch?: boolean;
  /** scratch liveness from the liveness module; absent = unknown, so scratch workspaces ASK */
  sessionDead?: (path: string) => boolean | null;
  /** process probe; the default fails closed on any unreadable same-uid /proc entry */
  openPaths?: (dir: string) => OpenPaths;
  owner?: RemoveTreeOptions["owner"];
  immutable?: RemoveTreeOptions["immutable"];
};

const real = (path: string): string => {
  return fromThrowable(() => realpathSync(path))().unwrapOr(resolve(path));
};
const under = (path: string, dir: string): boolean =>
  path === dir || path.startsWith(`${dir}/`);
const processComm = (pid: number, procDir?: string): string => {
  const result = fromThrowable(() =>
    readFileSync(join(resolveProcRoot(procDir), String(pid), "comm"), "utf8"),
  )();
  if (result.isErr()) return "unreadable";
  const comm = result.value.trim();
  return comm === "" ? "unknown" : comm;
};
const FORGET = (store: string, name: string) => [
  "jj",
  "-R",
  store,
  "workspace",
  "forget",
  name,
];

function ids(store: string, revset: string): string[] | null {
  const run = jj([
    "-R",
    store,
    "--ignore-working-copy",
    "log",
    "--no-graph",
    "-r",
    revset,
    "-T",
    'change_id.short() ++ "\\n"',
  ]);
  return run.ok ? run.stdout.split("\n").filter((l) => l !== "") : null;
}
function lastFetch(store: string): string {
  const run = jj([
    "-R",
    store,
    "--ignore-working-copy",
    "op",
    "log",
    "--no-graph",
    "--limit",
    "2000",
    "-T",
    'time.end().format("%Y-%m-%d %H:%M:%S") ++ "\\t" ++ description.first_line() ++ "\\n"',
  ]);
  if (!run.ok) return "last fetch unknown (op log unreadable)";
  const hit = run.stdout
    .split("\n")
    .find((line) => /\tfetch from git remote/u.test(line));
  return hit === undefined
    ? "no fetch in the op log: remote view is as of the last push or clone"
    : `remote view as of last fetch ${hit.split("\t")[0]}`;
}

function storeCandidates(
  store: string,
  context: Context,
  options: WorkspacesOptions,
  covered: Set<string>,
  log: (line: string) => void,
): Candidate[] {
  let fetchError: string | null = null;
  if ((options.fetch ?? context.fetch) === true) {
    const fetched = jj(["-R", store, "git", "fetch"]);
    if (!fetched.ok) {
      fetchError = `fetch failed in ${store}: ${fetched.stderr.trim().split("\n")[0]}`;
      log(`workspaces: ${fetchError}`);
    }
  }
  const { listed, error } = listWorkspaces(store);
  if (listed === null) {
    log(`workspaces: cannot list ${store}: ${error}`);
    return [];
  }
  return listed.flatMap((entry) => {
    if (entry.root !== null) covered.add(entry.root);
    if (entry.name === "default" || entry.root === store) return [];
    if (fetchError === null) return [evaluate(store, entry, context, options)];
    return [
      ask(
        entry.root ?? `${store}#${entry.name}`,
        entry.root,
        fetchError,
        entry.name,
        "remote fetch",
      ),
    ];
  });
}

function gather(
  store: string,
  name: string,
  root: string,
  ctx: Context,
  options: WorkspacesOptions,
): WorkspaceFacts {
  const snapshot = ctx.liveness ?? createLivenessSnapshot(ctx.config);
  const open = (options.openPaths ?? snapshot.openPaths)(root);
  const scratch = ctx.config.scratch_roots
    .map(real)
    .some((s) => under(root, s));
  const ref = scratchRef(root, ctx.config.scratch_roots);
  const liveness =
    ref === null ? "unknown" : judge(ref, snapshot.facts(ref)).verdict;
  let verdict: boolean | null = null;
  if (options.sessionDead !== undefined) verdict = options.sessionDead(root);
  else if (liveness !== "unknown") verdict = liveness === "dead";
  let session: WorkspaceFacts["session"] = null;
  if (scratch) {
    let detail = "session is live";
    if (verdict === null) detail = "session liveness unknown";
    else if (verdict) detail = "session is dead";
    session = { ok: verdict, detail };
  }
  let fresh: WorkspaceFacts["fresh"];
  let treeStateMs: number | null = null;
  if (
    ctx.mode === "run" &&
    (open.open.length > 0 ||
      open.unknown.length > 0 ||
      (session !== null && session.ok !== true))
  ) {
    fresh = {
      ok: null,
      detail: "snapshot refused until process and session safety pass",
    };
  } else if (ctx.mode === "run") {
    // Under the lock: snapshot the working copy; any warning means jj could not record everything.
    const status = jj(["-R", root, "status"]);
    if (!status.ok) {
      fresh = {
        ok: null,
        detail: `jj status failed: ${status.stderr.trim().split("\n")[0]}`,
      };
    } else if (/warning/iu.test(status.stderr)) {
      fresh = {
        ok: false,
        detail: `snapshot warning: ${status.stderr.trim().split("\n")[0]}`,
      };
    } else {
      fresh = { ok: true, detail: "snapshotted without warnings" };
    }
  } else {
    const treeState = fromThrowable(
      () => statSync(join(root, ".jj", "working_copy", "tree_state")).mtimeMs,
    )();
    if (treeState.isOk()) {
      treeStateMs = treeState.value;
      fresh = { ok: true, detail: "no tracked file newer than tree_state" };
    } else {
      fresh = { ok: null, detail: "tree_state unreadable" };
    }
  }
  // `file list` prints cwd-relative paths, so it runs from the workspace root.
  const tracked = jj(["--ignore-working-copy", "file", "list"], root);
  let foreign: string[] | null = null;
  if (tracked.ok) {
    const scan = scanWorkspace(
      root,
      tracked.stdout.split("\n").filter((l) => l !== ""),
      ctx.config.regenerable_ignored,
      treeStateMs,
    );
    foreign = scan.foreign;
    if (scan.newer.length > 0)
      fresh = {
        ok: false,
        detail: `modified since the last snapshot: ${scan.newer.slice(0, 3).join(", ")}`,
      };
  } else if (fresh.ok === true) {
    fresh = { ok: null, detail: "jj file list failed" };
  }
  const unpushed = unpushedRevset(name);
  return {
    fresh,
    unpushed: ids(store, `${unpushed} ~ (empty() & description(exact:""))`),
    conflicts: ids(store, `${unpushed} & conflicts()`),
    bookmarks: ids(store, `${unpushed} & bookmarks()`),
    foreign,
    open,
    session,
    lastFetch: lastFetch(store),
  };
}

const ask = (
  id: string,
  path: string | null,
  reason: string,
  name: string,
  check: string,
): Candidate => ({
  id,
  path,
  verdict: "ASK",
  reason,
  checks: [{ name: check, ok: false, detail: reason }],
  bytes: null,
  bytes_kind: "estimate",
  action: { kind: "jj-forget+delete", argv: [name] },
  result: null,
});
const failAction = (error: string): ActionResult => ({
  ok: false,
  bytes_freed: null,
  error,
});

function evaluate(
  store: string,
  entry: Listed,
  ctx: Context,
  options: WorkspacesOptions,
): Candidate {
  const { name, root } = entry;
  const id = root ?? `${store}#${name}`;
  if (root === null)
    return ask(
      id,
      null,
      `root of workspace ${name} could not be determined`,
      name,
      "workspace root",
    );
  if (!existsSync(root)) {
    return {
      id,
      path: root,
      verdict: "RECLAIM",
      reason: `listed by ${store} but its directory is gone; forget is bookkeeping only, commits stay in the store`,
      checks: [{ name: "directory missing", ok: true, detail: root }],
      bytes: 0,
      bytes_kind: "freed_now",
      action: { kind: "jj-forget", argv: FORGET(store, name) },
      result: null,
    };
  }
  const stat = lstatSync(root);
  const marker = fromThrowable(() =>
    lstatSync(join(root, ".jj", "repo")).isFile(),
  )().unwrapOr(false);
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    !marker ||
    root === "/" ||
    root === real(homedir()) ||
    under(store, root)
  ) {
    return ask(
      id,
      root,
      "listed workspace root is not a plain secondary-workspace directory",
      name,
      "workspace directory",
    );
  }
  const judged = judgeWorkspace(gather(store, name, root, ctx, options));
  return {
    id,
    path: root,
    verdict: judged.verdict,
    reason: judged.reason,
    checks: judged.checks,
    bytes: judged.verdict === "RECLAIM" ? treeBytes(root) : null,
    bytes_kind: judged.verdict === "RECLAIM" ? "freed_now" : "estimate",
    action: { kind: "jj-forget+delete", argv: FORGET(store, name) },
    result: null,
  };
}

export function createWorkspacesTarget(
  options: WorkspacesOptions = {},
): Target {
  return {
    name: "workspaces",
    tier: "blind",
    available: () =>
      Bun.which("jj") === null
        ? { available: false, skip_reason: "jj is not installed" }
        : { available: true, skip_reason: null },
    plan: (ctx) => {
      const context = {
        ...ctx,
        liveness:
          ctx.liveness ??
          createLivenessSnapshot(
            ctx.config,
            ctx.procDir === undefined
              ? {}
              : { procs: { procRoot: ctx.procDir } },
          ),
      };
      const found = walkRoots([
        ...ctx.config.repo_roots,
        ...ctx.config.scratch_roots,
        ...ctx.config.repos,
      ]);
      const stores = new Set(found.stores);
      for (const workspace of found.workspaces) {
        const store = storeOf(workspace);
        if (store !== null) stores.add(store);
      }
      const candidates: Candidate[] = [];
      const covered = new Set<string>();
      for (const store of [...stores].toSorted()) {
        candidates.push(
          ...storeCandidates(store, context, options, covered, ctx.log),
        );
      }
      for (const dir of found.workspaces) {
        if (covered.has(dir)) continue;
        const store = storeOf(dir);
        let reason = `orphan: not listed by its store ${store} (forgotten or never registered)`;
        if (store === null)
          reason =
            "orphan: the store this workspace points at is missing, so jj cannot evaluate its working copy";
        candidates.push(ask(dir, dir, reason, "orphan", "listed by its store"));
      }
      return candidates.map((candidate) => {
        if (candidate.path === null || candidate.verdict !== "RECLAIM")
          return candidate;
        const protection = protectedReason(candidate.path, {
          procDir: ctx.procDir,
          repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
          protectedPaths: ctx.config.protected ?? [],
          ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
        });
        if (protection === null) return candidate;
        candidate.verdict =
          protection === "process paths are unknown" ? "ASK" : "KEEP";
        candidate.reason = `protected: ${protection}`;
        candidate.action.argv = [];
        return candidate;
      });
    },
    act: (candidate, ctx): ActionResult => {
      const fail = failAction;
      const argv = candidate.action.argv;
      const [bin, flag, store, ...rest] = argv;
      const name = rest[2];
      if (
        bin !== "jj" ||
        flag !== "-R" ||
        store === undefined ||
        rest[0] !== "workspace" ||
        rest[1] !== "forget" ||
        name === undefined ||
        rest.length !== 3
      ) {
        return fail("malformed forget argv");
      }
      if (name === "default") return fail("refusing the default workspace");
      const path = candidate.path;
      if (path === null) return fail("missing path");
      if (ctx.recordRecovery === undefined)
        return fail("refusing to forget without a recovery record");
      const wc = jj([
        "-R",
        store,
        "--ignore-working-copy",
        "log",
        "--no-graph",
        "-r",
        workingCopyRevset(name),
        "-T",
        "commit_id",
      ]);
      const op = jj([
        "-R",
        store,
        "--ignore-working-copy",
        "op",
        "log",
        "--no-graph",
        "--limit",
        "1",
        "-T",
        "id",
      ]);
      const commit = wc.stdout.trim();
      const opId = op.stdout.trim();
      if (!wc.ok || !op.ok || commit === "" || opId === "")
        return fail("cannot read the recovery commit and operation");
      const dir = existsSync(path) ? lstatSync(path) : null;
      // A final fresh scan precedes forget; never reuse the plan's process snapshot here.
      const snapshot = (
        ctx.liveness ??
        createLivenessSnapshot(
          ctx.config,
          ctx.procDir === undefined ? {} : { procs: { procRoot: ctx.procDir } },
        )
      ).refresh();
      const busy = (options.openPaths ?? snapshot.openPaths)(path);
      if (dir !== null && (busy.open.length > 0 || busy.unknown.length > 0)) {
        const evidence = [
          ...busy.open.map(
            ({ pid, via, path: openPath }) =>
              `pid ${pid} comm ${processComm(pid, ctx.procDir)} ${via}=${openPath}`,
          ),
          ...busy.unknown.map((detail) => {
            const pid = /pid (\d+)/u.exec(detail)?.[1];
            return pid === undefined
              ? `unreadable: ${detail}`
              : `pid ${pid} comm ${processComm(Number(pid), ctx.procDir)} ${detail}`;
          }),
        ];
        ctx.log(`workspace process check refused: ${evidence.join("; ")}`);
        return fail("a process may be using the workspace");
      }
      if (candidate.action.kind === "jj-forget+delete") {
        const removalOptions = {
          uid: process.getuid?.() ?? 0,
          ...(options.owner === undefined ? {} : { owner: options.owner }),
          ...(options.immutable === undefined
            ? {}
            : { immutable: options.immutable }),
          protection: {
            ownerTarget: "workspaces",
            procDir: ctx.procDir,
            repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
            protectedPaths: ctx.config.protected ?? [],
            ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
          },
        } satisfies Omit<RemoveTreeOptions, "progress">;
        const preflight = removeTree(path, {
          ...removalOptions,
          dryRun: true,
          allowListedWorkspace: path,
          progress: false,
        });
        if (!preflight.ok) {
          const details = [
            ...preflight.refused.map((item) => `${item.path}: ${item.reason}`),
            ...preflight.errors.map((item) => `${item.path}: ${item.error}`),
          ];
          return fail(
            `workspace deletion preflight failed: ${details.join("; ")}`,
          );
        }
      }
      // 1. recovery is durable before anything is destroyed
      ctx.recordRecovery(candidate, {
        repo: store,
        workspace: name,
        commit_id: commit,
        op_id: opId,
      });
      // 2. forget
      const forgot = jj(argv.slice(1));
      if (!forgot.ok)
        return fail(`jj workspace forget failed: ${forgot.stderr.trim()}`);
      if (candidate.action.kind === "jj-forget")
        return { ok: true, bytes_freed: 0, error: null };
      // 3. re-stat: the directory must be the very one that was judged
      const after = fromThrowable(() => lstatSync(path))().unwrapOr(null);
      if (after === null) return { ok: true, bytes_freed: 0, error: null };
      if (
        dir === null ||
        after.isSymbolicLink() ||
        !after.isDirectory() ||
        after.ino !== dir.ino ||
        after.dev !== dir.dev
      ) {
        return fail(
          "workspace forgotten but the directory changed since judgement; left in place as an orphan",
        );
      }
      // 4. real delete
      const removed = removeTree(path, {
        uid: process.getuid?.() ?? 0,
        ...(options.owner === undefined ? {} : { owner: options.owner }),
        ...(options.immutable === undefined
          ? {}
          : { immutable: options.immutable }),
        protection: {
          ownerTarget: "workspaces",
          procDir: ctx.procDir,
          repoRoots: [...ctx.config.repo_roots, ...ctx.config.repos],
          protectedPaths: ctx.config.protected ?? [],
          ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
        },
        progress: removeTreeProgress(path, candidate.bytes, ctx),
      });
      return {
        ok: removed.ok,
        bytes_freed: removed.ok ? removed.statfs_bytes_freed : null,
        error: removed.ok
          ? null
          : `workspace forgotten; delete incomplete, left as an orphan: ${[...removed.refused.map((r) => `${r.path}: ${r.reason}`), ...removed.errors.map((e) => `${e.path}: ${e.error}`)].join("; ")}`,
      };
    },
  };
}

export const workspaces = createWorkspacesTarget();
