// bun test for scripts/graveyards.ts — WHERE a "deleted" byte can still be sitting.
//
// The regression this locks: reclaim:audit and reclaim:purge once looked only at rip's
// /tmp/graveyard-$USER, so the 33 GB in the XDG trash beside it was invisible to both (r99,
// 2026-09-21). Two properties keep that from recurring — discovery names BOTH mechanisms, and
// it points at the trash's CONTENT dirs rather than its root, so emptying leaves files/ and
// info/ standing for the next trash operation.
import { describe, expect, test } from "bun:test";

import { existingGraveyards, graveyardCandidates } from "../graveyards";

const HOME = "/home/me";

describe("graveyardCandidates — every mechanism, not just rip's", () => {
  test("names rip's graveyard AND the XDG trash", () => {
    const paths = graveyardCandidates({ USER: "me" }, HOME).map((g) => g.path);
    expect(paths).toContain("/tmp/graveyard-me");
    expect(paths.some((p) => p.includes("/.local/share/Trash/"))).toBe(true);
  });

  test("targets the trash CONTENT dirs, never the Trash root", () => {
    const paths = graveyardCandidates({ USER: "me" }, HOME).map((g) => g.path);
    expect(paths).toContain(`${HOME}/.local/share/Trash/files`);
    expect(paths).toContain(`${HOME}/.local/share/Trash/info`);
    expect(paths).not.toContain(`${HOME}/.local/share/Trash`);
  });

  test("GRAVEYARD overrides rip's default path", () => {
    const paths = graveyardCandidates(
      { USER: "me", GRAVEYARD: "/data/grave" },
      HOME,
    ).map((g) => g.path);
    expect(paths).toContain("/data/grave");
    expect(paths).not.toContain("/tmp/graveyard-me");
  });

  test("XDG_DATA_HOME relocates the trash", () => {
    const paths = graveyardCandidates(
      { USER: "me", XDG_DATA_HOME: "/data/share" },
      HOME,
    ).map((g) => g.path);
    expect(paths).toContain("/data/share/Trash/files");
    expect(paths.some((p) => p.startsWith(`${HOME}/.local/share`))).toBe(false);
  });

  test("every candidate carries a label a human can act on", () => {
    for (const g of graveyardCandidates({ USER: "me" }, HOME)) {
      expect(g.label.length).toBeGreaterThan(0);
    }
  });
});

describe("existingGraveyards — only what is really there", () => {
  test("keeps the directories that exist, drops the rest", () => {
    const candidates = graveyardCandidates({ USER: "me" }, HOME);
    const present = new Set([`${HOME}/.local/share/Trash/files`]);
    const found = existingGraveyards(candidates, (p) => present.has(p));
    expect(found.map((g) => g.path)).toEqual([
      `${HOME}/.local/share/Trash/files`,
    ]);
  });

  test("empty when nothing exists — callers must handle 'no graveyard'", () => {
    const candidates = graveyardCandidates({ USER: "me" }, HOME);
    expect(existingGraveyards(candidates, () => false)).toEqual([]);
  });
});
