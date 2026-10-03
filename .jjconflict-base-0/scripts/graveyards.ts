// Where "deleted" bytes are still sitting. A delete that is a RENAME frees nothing: `rip` moves
// the path into its graveyard, and every XDG-aware deleter beside it (gio/trash-cli, editors,
// agent harnesses tearing down worktrees) moves one into ~/.local/share/Trash. Both keep
// occupying the filesystem until something empties them, and neither shows up as "used by" the
// project that created it.
//
// This module exists because looking in ONE of those places is how 33 GB stayed invisible on r99
// (measured 2026-09-21): reclaim:audit and reclaim:purge both hardcoded rip's
// /tmp/graveyard-$USER — which held 503 MB — while the XDG trash beside it held 33 GB of trashed
// agent worktrees (polysearch-*, soks-*, doctor-*), the single largest pure-waste item on a box
// whose C: was at 7% free. Discovery lives here, once, so the reporter and the purger can never
// again disagree about where to look.
//
// Consumers: reclaim-audit.ts (reports) and reclaim-purge.ts (empties). Pure by construction —
// no I/O of its own; existence is injected, so both callers and the tests share one code path.

export type Graveyard = { readonly label: string; readonly path: string };

/**
 * Every place a "deleted" byte can be waiting, in report order.
 *
 * Each path is a directory whose CONTENTS are the garbage — never the mechanism's own root. The
 * XDG trash is therefore listed as its `files/` and `info/` pair rather than as `Trash/`: the
 * spec requires both directories to exist for the next trash operation, so emptying must leave
 * them standing.
 */
export function graveyardCandidates(
  env: Record<string, string | undefined>,
  home: string,
): Graveyard[] {
  const xdgData = env.XDG_DATA_HOME ?? `${home}/.local/share`;
  return [
    {
      label: "rip graveyard",
      path: env.GRAVEYARD ?? `/tmp/graveyard-${env.USER ?? ""}`,
    },
    { label: "XDG trash: files", path: `${xdgData}/Trash/files` },
    { label: "XDG trash: info", path: `${xdgData}/Trash/info` },
  ];
}

/** The subset that actually exists as a directory. `isDir` is injected so tests need no fixture. */
export function existingGraveyards(
  candidates: Graveyard[],
  isDir: (path: string) => boolean,
): Graveyard[] {
  return candidates.filter((g) => isDir(g.path));
}
