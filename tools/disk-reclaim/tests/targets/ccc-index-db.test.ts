import { afterAll, describe, expect, test } from "bun:test";
import { ok as assertOk } from "node:assert/strict";
import {
  closeSync,
  mkdirSync,
  openSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { loadCollectionPolicy } from "../../src/policy.ts";
import { createCccIndexDbTarget } from "../../src/targets/ccc-index-db.ts";
import { Config } from "../../src/model.ts";
import type { Context } from "../../src/targets/index.ts";

const fixtureRoot = tempRoot("reclaim-ccc-index-db-");
afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

const now = Temporal.Instant.from("2026-10-27T00:00:00Z").epochMilliseconds;
const dayMs = 24 * 60 * 60 * 1_000;
const writeArtifact = (path: string, ageDays: number) => {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, "fixture ccc database");
  const touchedSeconds = (now - ageDays * dayMs) / 1_000 + 0.12345;
  utimesSync(path, touchedSeconds, touchedSeconds);
};
const writePolicy = (path: string, ttlDays: number) => {
  writeFileSync(
    path,
    `graveyard_min_age_hours = 24\ngraveyard_pressure_undo_minutes = 10\n\n[collection_policy.class_rules.ownerless_cache]\ndefault_owner = "dotfiles"\nttl_days = 14\n\n[collection_policy.class_rules.deregistered_index_db]\nttl_days = ${ttlDays}\n`,
  );
};
const testContext = (procDir: string): Context => ({
  mode: "plan",
  procDir,
  config: (() => {
    const parsed = Config.safeParse({
      repo_roots: [],
      repos: [],
      scratch_roots: [],
      delete_roots: [],
      regenerable_ignored: [],
      session_grace_hours: 24,
      ignore_unreadable_procs: ["sshd"],
    });
    assertOk(
      parsed.success,
      "fixture config must satisfy the production schema",
    );
    return parsed.data;
  })(),
  log: () => {},
});

describe("ccc index DB target", () => {
  test("keeps registered roots and fresh or open DBs, expires stale unregistered and missing roots by policy", async () => {
    const home = join(fixtureRoot, "matrix-home");
    const dbRoot = join(fixtureRoot, "matrix-db");
    const policyPath = join(fixtureRoot, "matrix-reclaim.toml");
    const procDir = join(fixtureRoot, "matrix-proc");
    const registered = join(home, "Workspace", "registered");
    const workspace = join(home, "Workspace", "repo.ws", "ws_worker");
    const fresh = join(home, "Workspace", "fresh");
    const live = join(home, "Workspace", "live");
    const registeredDb = join(
      dbRoot,
      "Workspace",
      "registered",
      "target_sqlite.db",
    );
    const missingDb = join(dbRoot, "Workspace", "removed", "target_sqlite.db");
    const workspaceDb = join(
      dbRoot,
      "Workspace",
      "repo.ws",
      "ws_worker",
      "target_sqlite.db",
    );
    const freshDb = join(dbRoot, "Workspace", "fresh", "target_sqlite.db");
    const liveDb = join(dbRoot, "Workspace", "live", "target_sqlite.db");
    mkdirSync(join(registered, ".cocoindex_code"), { recursive: true });
    writeFileSync(
      join(registered, ".cocoindex_code", "settings.yml"),
      "fixture",
    );
    mkdirSync(join(workspace, ".jj"), { recursive: true });
    mkdirSync(join(workspace, ".cocoindex_code"), { recursive: true });
    writeFileSync(join(workspace, ".jj", "repo"), "../repo/store");
    writeFileSync(
      join(workspace, ".cocoindex_code", "settings.yml"),
      "fixture",
    );
    mkdirSync(fresh, { recursive: true });
    mkdirSync(live, { recursive: true });
    for (const path of [registeredDb, missingDb, workspaceDb, freshDb, liveDb])
      writeArtifact(path, path === freshDb ? 2 : 4);
    writePolicy(policyPath, 3);
    mkdirSync(join(procDir, "123", "fd"), { recursive: true });
    writeFileSync(
      join(procDir, "123", "stat"),
      `123 (reader) S ${"0 ".repeat(19)}`,
    );
    symlinkSync(liveDb, join(procDir, "123", "fd", "3"));

    const liveFd = openSync(liveDb, "r");
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      closeSync(liveFd);
    });

    const registeredRoots = new Set([resolve(registered)]);
    const target = createCccIndexDbTarget({
      home: () => home,
      dbRoot: () => dbRoot,
      isRegisteredRoot: (project) => registeredRoots.has(resolve(project)),
      loadPolicy: () => loadCollectionPolicy(policyPath),
      now: () => now,
    });
    const planned = await target.plan(testContext(procDir));
    const byPath = new Map(
      planned.map((candidate): [string | null, (typeof planned)[number]] => [
        candidate.path,
        candidate,
      ]),
    );

    expect(byPath.get(registeredDb)).toMatchObject({
      verdict: "KEEP",
      reason: "registered retrieval root; keep its index DB",
    });
    expect(byPath.get(missingDb)).toMatchObject({ verdict: "RECLAIM" });
    expect(byPath.get(workspaceDb)).toMatchObject({ verdict: "RECLAIM" });
    expect(byPath.get(freshDb)).toMatchObject({
      verdict: "KEEP",
      reason: "touched within deregistered-index TTL (3 days)",
    });
    expect(byPath.get(liveDb)?.verdict).toBe("KEEP");
    expect(byPath.get(liveDb)?.reason).toContain("live reader");
    expect(byPath.get(missingDb)?.bytes).toBeGreaterThan(0);
  });

  test("uses rr's exact-root settings marker and excludes a jj workspace pointer", async () => {
    const home = join(fixtureRoot, "registration-home");
    const dbRoot = join(fixtureRoot, "registration-db");
    const policyPath = join(fixtureRoot, "registration-reclaim.toml");
    const procDir = join(fixtureRoot, "registration-proc");
    mkdirSync(procDir, { recursive: true });
    const registered = join(home, "Workspace", "registered");
    const workspace = join(registered, ".ws", "ws_agent");
    const registeredDb = join(
      dbRoot,
      "Workspace",
      "registered",
      "target_sqlite.db",
    );
    const workspaceDb = join(
      dbRoot,
      "Workspace",
      "registered",
      ".ws",
      "ws_agent",
      "target_sqlite.db",
    );
    mkdirSync(join(registered, ".cocoindex_code"), { recursive: true });
    writeFileSync(
      join(registered, ".cocoindex_code", "settings.yml"),
      "fixture",
    );
    mkdirSync(join(workspace, ".jj"), { recursive: true });
    mkdirSync(join(workspace, ".cocoindex_code"), { recursive: true });
    writeFileSync(join(workspace, ".jj", "repo"), "../repo/store");
    writeFileSync(
      join(workspace, ".cocoindex_code", "settings.yml"),
      "fixture",
    );
    writeArtifact(registeredDb, 10);
    writeArtifact(workspaceDb, 10);
    writePolicy(policyPath, 3);

    const target = createCccIndexDbTarget({
      home: () => home,
      dbRoot: () => dbRoot,
      loadPolicy: () => loadCollectionPolicy(policyPath),
      now: () => now,
    });
    const planned = await target.plan(testContext(procDir));
    const byPath = new Map(
      planned.map((candidate) => [candidate.path, candidate]),
    );

    expect(byPath.get(registeredDb)?.verdict).toBe("KEEP");
    expect(byPath.get(workspaceDb)?.verdict).toBe("RECLAIM");
  });
});
