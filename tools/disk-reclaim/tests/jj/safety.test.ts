import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { regenerable, scanWorkspace } from "../../src/jj/scan.ts";
import { judgeWorkspace, type WorkspaceFacts } from "../../src/jj/safety.ts";
import { REMOTE_SET, unpushedRevset } from "../../src/jj/jj.ts";

const clean: WorkspaceFacts = {
  fresh: { ok: true, detail: "fresh" },
  unpushed: [],
  conflicts: [],
  bookmarks: [],
  foreign: [],
  open: { open: [], unknown: [] },
  session: null,
  lastFetch: "remote view as of last fetch 2026-10-08 10:00:00",
};

describe("judgeWorkspace", () => {
  test("all seven checks passing is RECLAIM and the reason states the last fetch", () => {
    const j = judgeWorkspace(clean);
    expect(j.verdict).toBe("RECLAIM");
    expect(j.reason).toContain("last fetch 2026-10-08");
  });
  test("an unknown check is ASK, never RECLAIM", () => {
    expect(judgeWorkspace({ ...clean, unpushed: null }).verdict).toBe("ASK");
    expect(
      judgeWorkspace({ ...clean, open: { open: [], unknown: ["pid 1 fd"] } })
        .verdict,
    ).toBe("ASK");
    expect(judgeWorkspace({ ...clean, foreign: null }).verdict).toBe("ASK");
  });
  test("conflicts are KEEP; other failures are ASK", () => {
    expect(judgeWorkspace({ ...clean, conflicts: ["abc"] }).verdict).toBe(
      "KEEP",
    );
    expect(judgeWorkspace({ ...clean, unpushed: ["abc"] }).verdict).toBe("ASK");
    expect(judgeWorkspace({ ...clean, bookmarks: ["abc"] }).verdict).toBe(
      "ASK",
    );
    expect(
      judgeWorkspace({ ...clean, session: { ok: null, detail: "unknown" } })
        .verdict,
    ).toBe("ASK");
  });
});

describe("revsets", () => {
  test("remote set excludes the git pseudo-remote and unions trunk()", () => {
    expect(REMOTE_SET).toBe(
      '(remote_bookmarks(remote=~exact:"git") | trunk())',
    );
    expect(unpushedRevset("ws1")).toBe(`(::"ws1"@ ~ ::${REMOTE_SET})`);
  });
});

describe("scanWorkspace", () => {
  test("regenerable matches by basename or path suffix", () => {
    expect(regenerable("crates/x/target", ["target"])).toBe(true);
    expect(regenerable(".julia/compiled", [".julia/compiled"])).toBe(true);
    expect(regenerable("a/.julia/compiled", [".julia/compiled"])).toBe(true);
    expect(regenerable(".env", ["target"])).toBe(false);
  });
  test("untracked entries must be regenerable, including nested ones; empty dirs are fine", () => {
    const root = tempRoot("reclaim-scan-");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(root, { recursive: true, force: true });
    });
    mkdirSync(join(root, "src"), { recursive: true });
    mkdirSync(join(root, "node_modules/p"), { recursive: true });
    mkdirSync(join(root, "empty"));
    mkdirSync(join(root, ".jj"));
    writeFileSync(join(root, "src/lib.ts"), "x");
    writeFileSync(join(root, "src/.env"), "secret");
    writeFileSync(join(root, "node_modules/p/i.js"), "x");
    const scan = scanWorkspace(
      root,
      ["src/lib.ts"],
      ["node_modules"],
      Temporal.Now.instant().epochMilliseconds + 10_000,
    );
    expect(scan.foreign).toEqual(["src/.env"]);
    expect(scan.newer).toEqual([]);
    expect(
      scanWorkspace(root, ["src/lib.ts"], ["node_modules"], 1).newer,
    ).toEqual(["src/lib.ts"]);
  });
});
