import { afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTmpfsTarget } from "../../src/targets/tmpfs.ts";

const roots: string[] = [];
function restoreDirectories(path: string): void {
  if (!existsSync(path)) return;
  const stat = lstatSync(path);
  if (!stat.isDirectory()) return;
  chmodSync(path, stat.mode | 0o700);
  for (const name of readdirSync(path)) restoreDirectories(join(path, name));
}
const fixtureContext = {
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
const fixtureFs = () => ({
  type: 0x01021994n,
  files: 1_048_576n,
  ffree: 900_000n,
  blocks: 100n,
  bfree: 50n,
  bsize: 4096n,
});
function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), "reclaim-tmpfs-fixture-"));
  roots.push(root);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) {
    restoreDirectories(root);
    rmSync(root, { recursive: true, force: true });
  }
});

describe("tmpfs target", () => {
  test("all observed holder names qualify, including a tree above 10,000 entries", async () => {
    const root = fixtureRoot();
    const old = Temporal.Now.instant().epochMilliseconds / 1000 - 7200;
    const firstName = "reclaim-acceptance-complete-state";
    const names = [
      firstName,
      "reclaim-host-cache",
      "reclaim-host-cache-v2",
      "agx-leasefold-v352",
      "agx-leasefold-v352-live",
      "agx-test-ABCDEF",
      "agx-next-fixed-import",
    ];
    for (const name of names) {
      const dir = join(root, name);
      mkdirSync(dir);
      writeFileSync(join(dir, "entry"), "fixture");
      utimesSync(join(dir, "entry"), old, old);
      utimesSync(dir, old, old);
    }
    const cache = join(root, firstName, "scan-cache");
    mkdirSync(cache);
    for (let index = 0; index < 10_050; index += 1) {
      const file = join(cache, String(index));
      writeFileSync(file, "");
      utimesSync(file, old, old);
    }
    utimesSync(cache, old, old);
    utimesSync(join(root, firstName), old, old);
    const target = createTmpfsTarget({
      mounts: () => [{ path: root, type: "tmpfs" }],
      statfs: fixtureFs,
      isOpen: () => false,
    });
    const rows = await target.plan(fixtureContext);
    for (const name of names)
      expect(rows.find((row) => row.path === join(root, name))?.verdict).toBe(
        "RECLAIM",
      );
    writeFileSync(join(cache, "0"), "recent content deep in tree");
    expect(
      (await target.plan(fixtureContext)).find(
        (row) => row.path === join(root, firstName),
      )?.verdict,
    ).toBe("KEEP");
  });

  test("entry and time bounds fail closed, and configured protection and foreign ownership stay kept", async () => {
    const root = fixtureRoot();
    const dir = join(root, "reclaim-host-cache");
    mkdirSync(dir);
    const old = Temporal.Now.instant().epochMilliseconds / 1000 - 7200;
    for (const name of ["one", "two", "three"]) {
      writeFileSync(join(dir, name), "fixture");
      utimesSync(join(dir, name), old, old);
    }
    utimesSync(dir, old, old);
    const options = {
      mounts: () => [{ path: root, type: "tmpfs" }],
      statfs: fixtureFs,
      isOpen: () => false,
    };
    for (const limit of [{ scanMaxEntries: 2 }, { scanMaxMs: 0 }]) {
      const rows = await createTmpfsTarget({ ...options, ...limit }).plan(
        fixtureContext,
      );
      expect(rows.find((row) => row.path === dir)).toMatchObject({
        verdict: "ASK",
        action: { kind: "command", argv: [] },
      });
    }
    expect(
      (
        await createTmpfsTarget(options).plan({
          ...fixtureContext,
          config: { ...fixtureContext.config, protected: [join(dir, "one")] },
        })
      ).find((row) => row.path === dir)?.verdict,
    ).toBe("KEEP");
    expect(
      (
        await createTmpfsTarget({
          ...options,
          uid: () => (process.getuid?.() ?? 0) + 1,
        }).plan(fixtureContext)
      ).find((row) => row.path === dir)?.verdict,
    ).toBe("KEEP");
  });

  test("plan identifies stale temp dirs and purges unconfigured RAM graveyards with inode counts", async () => {
    const root = mkdtempSync(join(tmpdir(), "reclaim-tmpfs-fixture-"));
    roots.push(root);
    const graveyard = join(root, "graveyard-fuyu");
    const stale = join(root, "hooktest-abcdef012345");
    const fixed = join(root, "reclaim-host-cache");
    const fresh = join(root, "doctor-home-abcdef012345");
    const freshTree = join(root, "agx-leasefold-v352");
    const session = join(root, "claude-12345");
    const opened = join(root, "cargo-install-abcdef012345");
    const linked = join(root, "graveyard-link");
    const destination = join(root, "disk", "graveyard");
    for (const path of [
      graveyard,
      stale,
      fixed,
      fresh,
      freshTree,
      session,
      opened,
    ])
      mkdirSync(path);
    writeFileSync(
      join(graveyard, ".record"),
      "2026-10-12T00:00:00Z\t/tmp/original\t/tmp/removed\n",
    );
    writeFileSync(join(stale, "entry"), "stale");
    writeFileSync(join(fixed, "entry"), "fixed-name stale");
    writeFileSync(join(fresh, "entry"), "fresh");
    writeFileSync(join(freshTree, "entry"), "new child");
    writeFileSync(join(opened, "entry"), "busy");
    symlinkSync(opened, linked);
    const old = (Temporal.Now.instant().epochMilliseconds - 61 * 60_000) / 1000;
    utimesSync(stale, old, old);
    utimesSync(join(stale, "entry"), old, old);
    utimesSync(fixed, old, old);
    utimesSync(join(fixed, "entry"), old, old);
    utimesSync(freshTree, old, old);
    const recent =
      (Temporal.Now.instant().epochMilliseconds - 5 * 60_000) / 1000;
    utimesSync(join(freshTree, "entry"), recent, recent);
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
      scanCacheDir: join(root, "state"),
      log: () => {},
    };
    const rows = await target.plan(context);
    expect(rows.find((row) => row.path === root)?.reason).toContain(
      "tmpfs use:",
    );
    expect(rows.find((row) => row.path === stale)).toMatchObject({
      verdict: "RECLAIM",
      reason: "stale mkdtemp-style directory; not open",
    });
    expect(rows.find((row) => row.path === fixed)).toMatchObject({
      verdict: "RECLAIM",
      reason: "stale fixed-name directory; not open",
    });
    expect(rows.find((row) => row.path === freshTree)?.reason).toBe(
      "younger than 60 minutes",
    );
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
      (await ramDestinationTarget.plan(context)).find(
        (row) => row.path === graveyard,
      ),
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
      (await nestedTarget.plan(context)).find((row) => row.path === nested),
    ).toMatchObject({
      verdict: "RECLAIM",
      action: { kind: "delete", argv: [nested] },
    });
  });

  test("keeps live user-session dbus and gnupg sockets even when their names look stale", async () => {
    const root = fixtureRoot();
    const old = Temporal.Now.instant().epochMilliseconds / 1000 - 7200;
    const paths = ["dbus-1", "gnupg"].map((name) => join(root, name));
    for (const path of paths) {
      mkdirSync(path);
      writeFileSync(join(path, "socket"), "fixture");
      utimesSync(join(path, "socket"), old, old);
      utimesSync(path, old, old);
    }
    const rows = await createTmpfsTarget({
      mounts: () => [{ path: root, type: "tmpfs" }],
      statfs: fixtureFs,
      isOpen: () => false,
    }).plan(fixtureContext);
    for (const path of paths)
      expect(rows.find((row) => row.path === path)).toMatchObject({
        verdict: "KEEP",
        reason: "protected session or system directory",
      });
  });
});
