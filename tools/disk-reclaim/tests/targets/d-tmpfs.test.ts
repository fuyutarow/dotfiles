import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTmpfsTarget } from "../../src/targets/tmpfs.ts";

describe("tmpfs target", () => {
  test("plan identifies stale temp dirs, protects exclusions and reports usage and graveyard relocation", () => {
    const root = mkdtempSync(join(tmpdir(), "reclaim-tmpfs-fixture-"));
    using cleanup = new DisposableStack();
    cleanup.defer(() => {
      rmSync(root, { recursive: true, force: true });
    });
    const graveyard = join(root, "graveyard-fuyu");
    const stale = join(root, "hooktest-abcdef012345");
    const fresh = join(root, "doctor-home-abcdef012345");
    const session = join(root, "claude-12345");
    const opened = join(root, "cargo-install-abcdef012345");
    const destination = join(root, "disk", "graveyard");
    for (const path of [graveyard, stale, fresh, session, opened])
      mkdirSync(path);
    writeFileSync(
      join(graveyard, ".record"),
      "2026-10-12T00:00:00Z\t/tmp/original\t/tmp/removed\n",
    );
    writeFileSync(join(stale, "entry"), "stale");
    writeFileSync(join(fresh, "entry"), "fresh");
    writeFileSync(join(opened, "entry"), "busy");
    const old = (Temporal.Now.instant().epochMilliseconds - 61 * 60_000) / 1000;
    utimesSync(stale, old, old);
    utimesSync(graveyard, old, old);
    const target = createTmpfsTarget({
      mounts: () => [{ path: root, type: "tmpfs" }],
      now: () => Temporal.Now.instant().epochMilliseconds,
      isOpen: (path) => path === opened,
      ripGraveyard: () => graveyard,
      diskGraveyard: () => destination,
      isDiskPath: () => true,
    });
    const context = {
      mode: "plan" as const,
      config: {
        repo_roots: [],
        repos: [],
        scratch_roots: [],
        delete_roots: [],
        regenerable_ignored: [],
        ignore_unreadable_procs: ["sshd"],
        session_grace_hours: 24,
      },
      log: () => {},
    };
    const rows = target.plan(context);
    expect(rows.find((row) => row.path === root)?.reason).toContain(
      "tmpfs use:",
    );
    expect(rows.find((row) => row.path === stale)).toMatchObject({
      verdict: "RECLAIM",
      reason: "stale mkdtemp-style directory; not open",
    });
    expect(rows.find((row) => row.path === fresh)?.reason).toBe(
      "younger than 60 minutes",
    );
    expect(rows.find((row) => row.path === session)?.reason).toBe(
      "protected session or system directory",
    );
    expect(rows.find((row) => row.path === opened)?.reason).toBe(
      "open by a process",
    );
    const graveyardRow = rows.find((row) => row.path === graveyard);
    expect(graveyardRow).toMatchObject({
      verdict: "RECLAIM",
      action: { argv: ["relocate-graveyard", destination] },
    });
    const ramDestinationTarget = createTmpfsTarget({
      mounts: () => [{ path: root, type: "tmpfs" }],
      isOpen: (path) => path === opened,
      ripGraveyard: () => graveyard,
      diskGraveyard: () => destination,
      isDiskPath: () => false,
    });
    expect(
      ramDestinationTarget.plan(context).find((row) => row.path === graveyard),
    ).toMatchObject({
      verdict: "ASK",
      reason: `destination is RAM-backed: ${destination}`,
    });
    if (graveyardRow !== undefined) {
      expect(
        target.act(graveyardRow, { ...context, mode: "run" }),
      ).toMatchObject({ ok: true });
      expect(existsSync(join(destination, ".record"))).toBe(true);
      expect(existsSync(graveyard)).toBe(false);
    }
  });
});
