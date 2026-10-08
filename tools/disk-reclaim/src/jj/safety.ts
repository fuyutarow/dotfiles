import type { Candidate } from "../model.ts";
import type { OpenPaths } from "./proc.ts";

type Check = Candidate["checks"][number];

/** Facts about one listed workspace; `null` means the probe could not run. */
export type WorkspaceFacts = {
  fresh: { ok: boolean | null; detail: string };
  /** change ids of `(::W@ ~ ::B) ~ (empty() & description(exact:""))` */
  unpushed: string[] | null;
  /** change ids of `(::W@ ~ ::B) & conflicts()` */
  conflicts: string[] | null;
  /** change ids of `(::W@ ~ ::B) & bookmarks()` */
  bookmarks: string[] | null;
  /** top-level untracked entries that are not regenerable; null if the walk failed */
  foreign: string[] | null;
  open: OpenPaths;
  /** only when the workspace lives under a scratch root: is its session dead? */
  session: { ok: boolean | null; detail: string } | null;
  lastFetch: string;
};

export type Judgement = {
  verdict: Candidate["verdict"];
  checks: Check[];
  reason: string;
};

const list = (ids: string[]): string => {
  if (ids.length === 0) return "none";
  const suffix = ids.length > 5 ? ` (+${ids.length - 5})` : "";
  return ids.slice(0, 5).join(", ") + suffix;
};
const emptyCheck = (
  name: string,
  ids: string[] | null,
  what: string,
): Check => {
  if (ids === null) return { name, ok: null, detail: "jj query failed" };
  const detail = ids.length === 0 ? `no ${what}` : `${what}: ${list(ids)}`;
  return { name, ok: ids.length === 0, detail };
};
const openCheck = (paths: OpenPaths): Check => {
  // A process seen using the workspace is a positive fact; an unreadable
  // unrelated process must not hide it (that would leave KEEP with an unknown check).
  if (paths.open.length > 0) {
    const used = paths.open
      .slice(0, 3)
      .map((entry) => `pid ${entry.pid} ${entry.via}`)
      .join("; ");
    const unreadable =
      paths.unknown.length > 0
        ? `; also unreadable: ${paths.unknown.slice(0, 3).join("; ")}`
        : "";
    return { name: "not in use", ok: false, detail: `${used}${unreadable}` };
  }
  if (paths.unknown.length > 0)
    return {
      name: "not in use",
      ok: null,
      detail: `unreadable: ${paths.unknown.slice(0, 3).join("; ")}`,
    };
  const detail =
    paths.open.length === 0
      ? "no same-uid process cwd or fd under the workspace; all agents and workers run as the owner's uid; foreign-uid daemons do not use user scratch or workspaces (owner decision 2026-10-08)"
      : paths.open
          .slice(0, 3)
          .map((entry) => `pid ${entry.pid} ${entry.via}`)
          .join("; ");
  return { name: "not in use", ok: paths.open.length === 0, detail };
};
const foreignCheck = (foreign: string[] | null): Check => {
  if (foreign === null)
    return {
      name: "ignored files are regenerable",
      ok: null,
      detail: "could not walk the workspace",
    };
  return {
    name: "ignored files are regenerable",
    ok: foreign.length === 0,
    detail:
      foreign.length === 0
        ? "only regenerable_ignored entries"
        : `not regenerable: ${list(foreign)}`,
  };
};

/** Pure over facts. Conflicts and positive use are KEEP; unknown checks are ASK; RECLAIM needs all seven. */
export function judgeWorkspace(f: WorkspaceFacts): Judgement {
  const open = openCheck(f.open);
  const checks: Check[] = [
    { name: "fresh working copy", ...f.fresh },
    emptyCheck(
      "every non-empty commit is on a remote",
      f.unpushed,
      "commits not on a remote",
    ),
    emptyCheck("no conflicts", f.conflicts, "conflicted commits"),
    emptyCheck(
      "no unpushed local bookmarks",
      f.bookmarks,
      "bookmarked commits not on a remote",
    ),
    foreignCheck(f.foreign),
    open,
    ...(f.session === null
      ? []
      : [{ name: "scratch session is dead", ...f.session }]),
    { name: "remote view", ok: true, detail: f.lastFetch },
  ];
  const conflicted = f.conflicts !== null && f.conflicts.length > 0;
  const failed = checks.filter((c) => c.ok !== true);
  let verdict: Candidate["verdict"] = "RECLAIM";
  if (failed.length > 0) verdict = "ASK";
  if (conflicted || f.open.open.length > 0) verdict = "KEEP";
  const reason =
    verdict === "RECLAIM"
      ? `all content is on a remote; ${f.lastFetch}`
      : `${failed.map((c) => `${c.name}: ${c.detail}`).join("; ")}; ${f.lastFetch}`;
  return { verdict, checks, reason };
}
