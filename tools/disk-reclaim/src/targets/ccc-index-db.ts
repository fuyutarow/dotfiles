import { lstat, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { err, fromAsyncThrowable, ok, type Result } from "neverthrow";
import { attempt, errorMessage } from "@dotfiles/shared/src/attempt.ts";
import { z } from "@dotfiles/shared/src/zod.ts";
import { loadCollectionPolicy } from "../policy.ts";
import type { Candidate } from "../model.ts";
import { collectProcesses } from "../lib/procs.ts";
import type { Target } from "./index.ts";
import { deleteTree, measuredTreeBytes } from "./tree.ts";

// Mirrors DB_ARTIFACTS in tools/repo-retrieve/src/ccc-db-dir.ts. Operate on
// these entries, never on a mapped project directory: nested worktree DBs can
// live below a registered root's mapped path.
const artifactNames = new Set([
  "cocoindex.db",
  "target_sqlite.db",
  "INDEXED_AT",
]);
const settingsPath = join(".cocoindex_code", "settings.yml");
const workspaceRepoPointer = join(".jj", "repo");
const errorCode = (error: unknown): string | undefined => {
  const parsed = z.object({ code: z.string().optional() }).safeParse(error);
  return parsed.success ? parsed.data.code : undefined;
};

async function inspectPath(
  path: string,
): Promise<Result<Awaited<ReturnType<typeof lstat>> | null, unknown>> {
  const result = await fromAsyncThrowable(() => lstat(path))();
  if (result.isOk()) return ok(result.value);
  if (errorCode(result.error) === "ENOENT") return ok(null);
  return err(result.error);
}

/** rr serves exact roots with settings.yml; a jj workspace pointer redirects to its backing root. */
async function isRegisteredRoot(project: string): Promise<boolean | undefined> {
  const settings = await inspectPath(join(project, settingsPath));
  if (settings.isErr()) return undefined;
  if (settings.value === null || !settings.value.isFile()) return false;
  const pointer = await inspectPath(join(project, workspaceRepoPointer));
  if (pointer.isErr()) return undefined;
  return pointer.value === null || !pointer.value.isFile();
}

async function discoverArtifacts(
  root: string,
): Promise<Result<string[], unknown>> {
  const pending = [root];
  const artifacts: string[] = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) continue;
    const result = await fromAsyncThrowable(() =>
      readdir(directory, { withFileTypes: true }),
    )();
    if (result.isErr()) return err(result.error);
    const entries = result.value;
    artifacts.push(
      ...entries
        .filter(
          (entry) => !entry.isSymbolicLink() && artifactNames.has(entry.name),
        )
        .map((entry) => join(directory, entry.name)),
    );
    pending.push(
      ...entries
        .filter(
          (entry) =>
            !entry.isSymbolicLink() &&
            !artifactNames.has(entry.name) &&
            entry.isDirectory(),
        )
        .map((entry) => join(directory, entry.name)),
    );
  }
  return ok(artifacts.toSorted());
}

async function newestMtime(path: string): Promise<Result<number, unknown>> {
  const own = await fromAsyncThrowable(() => lstat(path))();
  if (own.isErr()) return err(own.error);
  const stat = own.value;
  let newest = stat.mtimeMs;
  if (!stat.isDirectory() || stat.isSymbolicLink()) return ok(newest);
  const read = await fromAsyncThrowable(() =>
    readdir(path, { withFileTypes: true }),
  )();
  if (read.isErr()) return err(read.error);
  const entries = read.value;
  for (const entry of entries) {
    const childPath = join(path, entry.name);
    const child = await newestMtime(childPath);
    if (child.isErr()) return err(child.error);
    newest = Math.max(newest, child.value);
  }
  return ok(newest);
}

export function createCccIndexDbTarget(
  options: {
    home?: () => string;
    dbRoot?: (home: string) => string;
    isRegisteredRoot?: (project: string) => boolean | Promise<boolean>;
    loadPolicy?: typeof loadCollectionPolicy;
    now?: () => number;
  } = {},
): Target {
  const home = options.home ?? (() => process.env.HOME ?? homedir());
  const dbRoot =
    options.dbRoot ?? ((root) => join(root, ".cache/cocoindex-code/db"));
  const loadPolicy = options.loadPolicy ?? loadCollectionPolicy;
  const now = options.now ?? (() => Temporal.Now.instant().epochMilliseconds);

  return {
    name: "ccc-index-db",
    tier: "blind",
    available: () => ({ available: true, skip_reason: null }),
    plan: async (ctx) => {
      const homePath = resolve(home());
      const cacheRoot = resolve(dbRoot(homePath));
      const rootStat = await inspectPath(cacheRoot);
      if (rootStat.isErr()) {
        ctx.reportPlanError?.(
          `ccc index DB root cannot be read: ${rootStat.error instanceof Error ? rootStat.error.message : String(rootStat.error)}`,
        );
        return [];
      }
      if (
        rootStat.value === null ||
        !rootStat.value.isDirectory() ||
        rootStat.value.isSymbolicLink()
      )
        return [];

      const policyResult = await attempt(() => loadPolicy());
      if (!policyResult.ok) {
        ctx.reportPlanError?.(
          `ccc index DB collection policy could not be loaded: ${errorMessage(policyResult.error)}`,
        );
        return [];
      }
      const loaded = policyResult.value;
      if (loaded.isErr()) {
        ctx.reportPlanError?.(String(loaded.error));
        return [];
      }
      const ttlDays = loaded.value.classRules.deregisteredIndexDb.ttlDays;
      const ttlMs = ttlDays * 24 * 60 * 60 * 1_000;
      const cutoff = now() - ttlMs;
      const artifactResult = await discoverArtifacts(cacheRoot);
      if (artifactResult.isErr()) {
        ctx.reportPlanError?.(
          `ccc index DB scan failed: ${artifactResult.error instanceof Error ? artifactResult.error.message : String(artifactResult.error)}`,
        );
        return [];
      }
      const artifacts = artifactResult.value;
      let processSnapshot: ReturnType<typeof collectProcesses> | undefined;
      if (ctx.liveness === undefined) {
        processSnapshot = collectProcesses({
          ...(ctx.procDir === undefined ? {} : { procRoot: ctx.procDir }),
          uid: process.getuid?.() ?? 0,
          ignoreUnreadableProcs: ctx.config.ignore_unreadable_procs ?? [],
        });
      }

      const candidates: Candidate[] = [];
      for (const path of artifacts) {
        const projectRelative = relative(cacheRoot, dirname(path));
        if (
          isAbsolute(projectRelative) ||
          projectRelative === ".." ||
          projectRelative.startsWith(`..${sep}`)
        )
          continue;
        const project = resolve(homePath, projectRelative);
        const projectStat = await inspectPath(project);
        const exists = projectStat.isOk()
          ? projectStat.value !== null
          : undefined;
        const registrationResult = await attempt(() =>
          Promise.resolve(
            options.isRegisteredRoot === undefined
              ? isRegisteredRoot(project)
              : options.isRegisteredRoot(project),
          ),
        );
        const registered = registrationResult.ok
          ? registrationResult.value
          : undefined;
        const registrationError = registrationResult.ok
          ? undefined
          : errorMessage(registrationResult.error);

        let bytes: number | null = null;
        let touchedAt: number | undefined;
        let measurementError: string | undefined;
        const sizeResult = await attempt(() => measuredTreeBytes(path, ctx));
        if (sizeResult.ok) bytes = sizeResult.value;
        else measurementError = errorMessage(sizeResult.error);
        const mtimeResult = await newestMtime(path);
        if (mtimeResult.isOk()) touchedAt = mtimeResult.value;
        else measurementError ??= errorMessage(mtimeResult.error);

        const open =
          ctx.liveness?.openPaths(path) ?? processSnapshot?.openPaths(path);
        const openPaths = open?.open ?? [];
        const unknownOpenPaths = open?.unknown ?? [];
        const fresh = touchedAt !== undefined && touchedAt >= cutoff;
        let verdict: Candidate["verdict"] = "RECLAIM";
        let reason = "older than deregistered-index TTL";
        if (measurementError !== undefined) {
          verdict = "ASK";
          reason = measurementError;
        } else if (registered === undefined) {
          verdict = "ASK";
          reason =
            registrationError ??
            "could not establish retrieval-root registration";
        } else if (exists === undefined) {
          verdict = "ASK";
          reason = "could not establish project-directory existence";
        } else if (open === undefined) {
          verdict = "ASK";
          reason = "process scan unavailable";
        } else if (unknownOpenPaths.length > 0) {
          verdict = "ASK";
          reason = `could not establish reader status: ${unknownOpenPaths.join("; ")}`;
        } else if (registered) {
          verdict = "KEEP";
          reason = "registered retrieval root; keep its index DB";
        } else if (openPaths.length > 0) {
          verdict = "KEEP";
          reason = `live reader has the DB artifact open: ${openPaths.map(({ path: openPath }) => openPath).join(", ")}`;
        } else if (fresh) {
          verdict = "KEEP";
          reason = `touched within deregistered-index TTL (${ttlDays} days)`;
        } else {
          const projectStatus = exists
            ? "unregistered project"
            : "missing project directory";
          reason = `${projectStatus}; older than deregistered-index TTL (${ttlDays} days)`;
        }
        let registrationDetail =
          registrationError ?? "registration probe failed";
        if (registered === true) registrationDetail = project;
        else if (registered === false) registrationDetail = "not registered";
        const mtimeDetail =
          touchedAt === undefined
            ? "database mtime unavailable"
            : `${ttlDays} days; newest mtime ${Temporal.Instant.fromEpochMilliseconds(Math.trunc(touchedAt)).toString()}`;
        let readerDetail = "no open reader";
        if (open === undefined) readerDetail = "process scan unavailable";
        else if (openPaths.length > 0)
          readerDetail = openPaths
            .map(({ pid, via }) => `pid ${pid} via ${via}`)
            .join(", ");
        else if (unknownOpenPaths.length > 0)
          readerDetail = unknownOpenPaths.join("; ");
        candidates.push({
          id: path,
          path,
          verdict,
          reason,
          checks: [
            {
              name: "registered root DB is retained",
              ok:
                registered === undefined || exists === undefined
                  ? null
                  : !registered,
              detail: registrationDetail,
            },
            {
              name: "deregistered index DB exceeds collection TTL",
              ok: touchedAt === undefined ? null : !fresh,
              detail: mtimeDetail,
            },
            {
              name: "no live reader has the DB artifact open",
              ok:
                open === undefined || unknownOpenPaths.length > 0
                  ? null
                  : openPaths.length === 0,
              detail: readerDetail,
            },
          ],
          bytes,
          bytes_kind: bytes === null ? "estimate" : "freed_now",
          action: {
            kind: "delete",
            argv: verdict === "RECLAIM" ? [path] : [],
          },
          result: null,
        });
      }
      return candidates;
    },
    act: (candidate, ctx) => deleteTree(candidate, ctx),
  };
}

export const cccIndexDb = createCccIndexDbTarget();
