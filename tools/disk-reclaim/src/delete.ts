import { existsSync, lstatSync, readdirSync, statfsSync } from "node:fs";
import { homedir, hostname } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import type { Config, ReceiptV2 } from "./model.ts";
import {
  errorMessage,
  now,
  stateDir,
  waitForLock,
  writeReceipt,
} from "./receipt.ts";
import { fromThrowable } from "../../shared/src/zod.ts";
import {
  directoryProtection,
  removeTree,
  removeTreeProgress,
  type RemovalRefusal,
} from "./lib/remove-tree.ts";
import {
  collectProcesses,
  type ProcessSnapshot,
  type ProcFs,
} from "./lib/procs.ts";
import type { Context } from "./targets/index.ts";

type Check = { name: string; ok: boolean; detail: string };
type PlanRow = {
  path: string;
  bytes: number | null;
  checks: Check[];
  allowed: boolean;
};
type Options = {
  progress?: Pick<
    Context,
    "progress" | "progressTty" | "targetName" | "reportProgress"
  >;
  diagnostics?: (summary: string, details: string[]) => void;
  log?: (message: string) => void;
  config: Config;
  yes: boolean;
  state?: string;
  procRoot?: string;
  procFs?: ProcFs;
  owner?: (path: string) => { uid: number; name: string };
  immutable?: (path: string) => boolean | null;
  /** The rip graveyard root; defaults to RIP_GRAVEYARD, GRAVEYARD, then the XDG data graveyard. */
  graveyard?: string;
};
const graveyardRoot = (options: Options): string =>
  resolve(
    options.graveyard ??
      process.env.RIP_GRAVEYARD ??
      process.env.GRAVEYARD ??
      join(
        process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"),
        "graveyard",
      ),
  );
const beneath = (root: string, path: string): boolean => {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
  );
};
const bytesAt = (path: string): number => {
  const stat = lstatSync(path);
  if (!stat.isDirectory()) return stat.size;
  return readdirSync(path).reduce(
    (sum, entry) => sum + bytesAt(join(path, entry)),
    0,
  );
};
function configuredRoot(path: string, roots: string[]): boolean {
  return roots.some((pattern) => {
    const star = pattern.indexOf("*");
    if (star < 0) return beneath(resolve(pattern), path);
    const prefix = resolve(pattern.slice(0, star));
    const tail = pattern.slice(star + 1).replaceAll("*", "");
    if (!beneath(prefix, path)) return false;
    const candidate = relative(prefix, path);
    return candidate !== "" && (tail.length === 0 || path.includes(tail));
  });
}
function symlinkPath(path: string): string | null {
  let cursor = resolve(path);
  const parts: string[] = [];
  while (cursor !== dirname(cursor)) {
    parts.unshift(cursor);
    cursor = dirname(cursor);
  }
  for (const part of parts) {
    if (!existsSync(part)) return null;
    if (lstatSync(part).isSymbolicLink()) return part;
  }
  return null;
}
function evaluate(
  input: string,
  config: Config,
  processes: ProcessSnapshot,
  graveyard: string,
): PlanRow {
  const path = resolve(input);
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) =>
    checks.push({ name, ok, detail });
  const absolute = isAbsolute(input);
  add(
    "absolute",
    absolute,
    absolute ? "path is absolute" : "path must be absolute",
  );
  if (!absolute) return { path: input, bytes: null, checks, allowed: false };
  const exists = existsSync(path);
  add("exists", exists, exists ? "path exists" : "path does not exist");
  if (!exists) return { path, bytes: null, checks, allowed: false };
  const escaped = symlinkPath(path);
  add(
    "no-symlink-escape",
    escaped === null,
    escaped === null
      ? "no symlink in path"
      : `symlink path refused: ${escaped}`,
  );
  const roots = [
    ...config.scratch_roots,
    ...config.repo_roots,
    ...config.delete_roots,
  ];
  // The rip graveyard is a declared delete root below its own directory: it holds data
  // that was already deleted, so the live-process and uid checks are the only gates there.
  const inGraveyard = path !== graveyard && beneath(graveyard, path);
  const inRoot =
    inGraveyard || roots.some((root) => configuredRoot(path, [root]));
  let rootDetail = "outside scratch_roots, repo_roots, and delete_roots";
  if (inRoot) rootDetail = "under a configured delete root";
  if (inGraveyard) rootDetail = "under the rip graveyard delete root";
  add("configured-root", inRoot, rootDetail);
  const protectedPath = path === "/" || path === resolve(homedir());
  add(
    "protected-root",
    !protectedPath,
    protectedPath ? "filesystem root and HOME are protected" : "not / or HOME",
  );
  const protection =
    inRoot &&
    !protectedPath &&
    escaped === null &&
    !inGraveyard &&
    lstatSync(path).isDirectory()
      ? fromThrowable(() => directoryProtection(path))()
      : null;
  let protectionReason: string | null = null;
  if (protection !== null) {
    protectionReason = protection.match(
      (reason) => reason,
      (error) => `unknown: ${errorMessage(error)}`,
    );
  }
  const isStore = protectionReason?.includes("repo store holder") === true;
  let storeDetail = "store check deferred to traversal for nested directories";
  if (inGraveyard)
    storeDetail = "inside the rip graveyard: repo-store refusal does not apply";
  if (isStore) storeDetail = `repo root protection: ${protectionReason}`;
  add("repo-store", !isStore, storeDetail);
  const jjReason =
    protectionReason !== null && !isStore ? protectionReason : null;
  add(
    "jj-workspace",
    jjReason === null,
    jjReason ??
      "no listed/default jj workspace at target; nested checks run during traversal",
  );
  const open =
    inRoot && !protectedPath && escaped === null
      ? processes.openPaths(path)
      : { open: [], unknown: [] };
  let busy: string | null = null;
  if (open.open.length > 0) {
    busy = open.open
      .slice(0, 3)
      .map((item) => `pid ${item.pid} has ${item.via} under target`)
      .join("; ");
  } else if (open.unknown.length > 0) {
    busy = `process usage is unknown: ${open.unknown.slice(0, 3).join("; ")}`;
  }
  add(
    "no-live-process",
    busy === null,
    busy ??
      "no same-uid process cwd/fd under target; all agents and workers run as the owner's uid; foreign-uid daemons do not use user scratch or workspaces (owner decision 2026-10-08)",
  );
  if (checks.some((check) => !check.ok))
    return { path, bytes: null, checks, allowed: false };
  const bytes = fromThrowable(() => bytesAt(path))();
  return {
    path,
    bytes: bytes.isOk() ? bytes.value : null,
    checks,
    allowed: checks.every((check) => check.ok),
  };
}
export async function deleteApproved(paths: string[], options: Options) {
  const procOptions = {
    ...(options.diagnostics === undefined
      ? {}
      : { diagnostics: options.diagnostics }),
    ...(options.procRoot === undefined ? {} : { procRoot: options.procRoot }),
    ...(options.procFs === undefined ? {} : { fs: options.procFs }),
    uid: process.getuid?.() ?? 0,
    ignoreUnreadableProcs: options.config.ignore_unreadable_procs ?? [],
  };
  const graveyard = graveyardRoot(options);
  const planProcesses = collectProcesses(procOptions);
  const rows = paths.map((path) => {
    options.progress?.reportProgress?.("delete", path, 0, 0);
    const row = evaluate(path, options.config, planProcesses, graveyard);
    options.progress?.reportProgress?.("delete", path, 1, row.bytes ?? 0, true);
    return row;
  });
  const lines = rows.map(
    (row) =>
      `${row.allowed ? "ALLOW" : "REFUSE"}\t${row.path}\t${row.bytes ?? "?"}\t${row.checks.map((c) => `${c.ok ? "ok" : "fail"}:${c.name}=${c.detail}`).join("; ")}`,
  );
  if (!options.yes) return { exit: 0, rows, lines, refused: [] };
  if (rows.some((row) => !row.allowed))
    return { exit: 2, rows, lines, refused: [] };
  const dir = options.state ?? stateDir();
  options.log?.("delete waits for the reclaim lock");
  const lock = await waitForLock("delete", dir, options.log);
  if (lock.release === null)
    return {
      exit: lock.exit,
      rows,
      lines: [lock.error, ...lines],
      refused: [],
    };
  using _lock = { [Symbol.dispose]: lock.release };
  const actions: ReceiptV2["actions"] = [];
  const refused: RemovalRefusal[] = [];
  const freeBefore = statfsSync(dirname(rows[0]!.path));
  const before = freeBefore.bavail * freeBefore.bsize;
  let exit = 0;
  const lockedProcesses = collectProcesses(procOptions);
  for (const row of rows) {
    const checked = evaluate(
      row.path,
      options.config,
      lockedProcesses,
      graveyard,
    );
    if (!checked.allowed) {
      exit = 2;
      lines.push(`REFUSE\t${row.path}\tunder-lock recheck failed`);
      break;
    }
    const action: ReceiptV2["actions"][number] = {
      id: basename(row.path),
      path: row.path,
      kind: "delete",
      verdict_at_act: "RECLAIM",
      bytes_planned: row.bytes,
      bytes_freed: null,
      ok: false,
      error: null,
      recovery: null,
      refused: [],
    };
    actions.push(action);
    const result = await removeTree(row.path, {
      progress: removeTreeProgress(row.path, row.bytes, options.progress),
      uid: process.getuid?.() ?? 0,
      graveyard: row.path !== graveyard && beneath(graveyard, row.path),
      protection: {
        processes: lockedProcesses,
        ownerTarget: "delete",
        procDir: options.procRoot,
        ignoreUnreadableProcs: options.config.ignore_unreadable_procs ?? [],
        repoRoots: [...options.config.repo_roots, ...options.config.repos],
        protectedPaths: options.config.protected ?? [],
      },
      ...(options.owner === undefined ? {} : { owner: options.owner }),
      ...(options.immutable === undefined
        ? {}
        : { immutable: options.immutable }),
    });
    action.refused = result.refused;
    refused.push(...result.refused);
    action.bytes_freed = result.bytes_freed;
    if (result.ok) action.ok = true;
    else {
      action.error = [
        ...result.errors.map((error) => `${error.path}: ${error.error}`),
        ...result.refused.map((item) => `${item.path}: ${item.reason}`),
      ].join("; ");
      exit = 1;
    }
    lines.push(
      `RESULT\t${row.path}\tbytes_freed=${result.bytes_freed}\tstatfs_bytes_freed=${result.statfs_bytes_freed}`,
    );
    for (const item of result.refused)
      lines.push(
        `REFUSED\t${item.path}\t${item.reason}\towner=${item.owner_name}(${item.owner_uid})\trepair=${item.repair}`,
      );
    for (const error of result.errors)
      lines.push(`ERROR\t${error.path}\t${error.error}`);
  }
  const afterStat = statfsSync(dirname(rows[0]!.path));
  const receipt: ReceiptV2 = {
    schema: 2,
    target: "delete",
    tier: "owner",
    actions,
    name: "delete",
    command: ["disk-reclaim", "delete", ...paths, "--yes"],
    host: hostname(),
    pid: process.pid,
    started: now(),
    ended: now(),
    exit,
    free_before: before,
    free_after: afterStat.bavail * afterStat.bsize,
    output: null,
  };
  writeReceipt(receipt, dir);
  return { exit, rows, lines, refused };
}
