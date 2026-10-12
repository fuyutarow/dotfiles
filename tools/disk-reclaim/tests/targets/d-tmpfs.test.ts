import { describe, expect, test } from "bun:test";
import {
  existsSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTmpfsTarget } from "../../src/targets/tmpfs.ts";

describe("tmpfs target", () => {
  test("plan identifies stale temp dirs and purges unconfigured RAM graveyards with inode counts", async () => {
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
    const linked = join(root, "graveyard-link");
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
    symlinkSync(opened, linked);
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
      statfs: () => ({
        type: 0x01021994n,
        files: 1000n,
        ffree: 50n,
        blocks: 100n,
        bfree: 50n,
        bsize: 4096n,
      }),
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
    expect(rows.find((row) => row.path === linked)?.verdict).toBe("KEEP");
    const graveyardRow = rows.find((row) => row.path === graveyard);
    expect(graveyardRow).toMatchObject({
      verdict: "RECLAIM",
      action: { kind: "delete", argv: [graveyard] },
    });
    expect(graveyardRow?.reason).toContain("2 inodes");
    expect(graveyardRow?.bytes).not.toBeNull();
    const ramDestinationTarget = createTmpfsTarget({
      mounts: () => [{ path: root, type: "tmpfs" }],
      isOpen: (path) => path === opened,
      ripGraveyard: () => {},
      diskGraveyard: () => destination,
      isDiskPath: () => false,
      statfs: () => ({
        type: 0x01021994n,
        files: 1000n,
        ffree: 50n,
        blocks: 100n,
        bfree: 50n,
        bsize: 4096n,
      }),
    });
    expect(
      ramDestinationTarget.plan(context).find((row) => row.path === graveyard),
    ).toMatchObject({
      verdict: "RECLAIM",
    });
    if (graveyardRow !== undefined) {
      chmodSync(graveyard, 0o555);
      expect(
        await target.act(graveyardRow, { ...context, mode: "run" }),
      ).toMatchObject({ ok: true });
      expect(existsSync(destination)).toBe(false);
      expect(existsSync(graveyard)).toBe(false);
    }
    const nested = join(root, "nested", "graveyard");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "data"), "deleted");
    const nestedTarget = createTmpfsTarget({
      mounts: () => [{ path: root, type: "ramfs" }],
      isOpen: () => false,
      ripGraveyard: () => nested,
      statfs: () => ({
        type: 0x858458f6n,
        files: 1000n,
        ffree: 50n,
        blocks: 100n,
        bfree: 50n,
        bsize: 4096n,
      }),
    });
    expect(
      nestedTarget.plan(context).find((row) => row.path === nested),
    ).toMatchObject({
      verdict: "RECLAIM",
      action: { kind: "delete", argv: [nested] },
    });
  });
});
