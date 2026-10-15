import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  episodeStep,
  guestPressure,
  loadGuestDrive,
  requestGuestRecovery,
  type Drive,
} from "../../tools/shared/src/storage-headroom.ts";
import {
  DISK_RECLAIM_STAGES,
  exitCode,
  expandHome,
  STAGE_TIMEOUT_MS,
  hasBuildProcess,
  recover,
  type Deps,
} from "../guest-capacity-recover.ts";

const GiB = 1024 ** 3;
const roots: string[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});
const scratch = (): string => {
  const dir = mkdtempSync(join(tmpdir(), "guest-recover-"));
  roots.push(dir);
  return dir;
};

const guest: Drive = {
  label: "guest /",
  name: "guest",
  path: "/",
  deny_gib: 40,
  deny_pct: 100,
  recover_gib: 48,
  recover_pct: 100,
  tmp_recover_pct: 85,
  reclaim_cargo_targets: ["/work/a", "/work/b"],
};
const free = (gib: number) => () => ({ free: gib * GiB, total: 400 * GiB });

describe("pressure and episode ledger", () => {
  test("guest levels: ok above recover, warn below it, deny below deny", async () => {
    expect(
      await guestPressure(guest, { measure: free(60), tmpUse: () => 10 }),
    ).toBe("ok");
    expect(
      await guestPressure(guest, { measure: free(45), tmpUse: () => 10 }),
    ).toBe("warn");
    expect(
      await guestPressure(guest, { measure: free(30), tmpUse: () => 10 }),
    ).toBe("deny");
  });

  test("tmpfs use above the declared line is pressure even when / is roomy", async () => {
    expect(
      await guestPressure(guest, { measure: free(300), tmpUse: () => 86 }),
    ).toBe("warn");
    expect(
      await guestPressure(guest, { measure: free(300), tmpUse: () => 96 }),
    ).toBe("deny");
  });

  test("an episode queues once, again on escalation, and re-arms when quiet", () => {
    expect(episodeStep(null, "warn")).toEqual({ queue: true, next: "warn" });
    expect(episodeStep("warn", "warn")).toEqual({ queue: false, next: "warn" });
    expect(episodeStep("warn", "deny")).toEqual({ queue: true, next: "deny" });
    expect(episodeStep("deny", "warn")).toEqual({ queue: false, next: "deny" });
    expect(episodeStep("deny", "ok")).toEqual({ queue: false, next: null });
  });

  test("requestGuestRecovery queues the unit once per pressure episode", async () => {
    const config = join(scratch(), "policy.toml");
    writeFileSync(
      config,
      `schema = 1
[drive.host]
label = "h"
path = "/"
deny_gib = 1
deny_pct = 1
[drive.guest]
label = "guest /"
path = "/"
deny_gib = 40
deny_pct = 100
recover_gib = 48
recover_pct = 100
`,
    );
    const stateDir = join(scratch(), "state");
    let starts = 0;
    const options = {
      stateDir,
      measure: free(45),
      tmpUse: () => null,
      start: () => {
        starts += 1;
        return true;
      },
    };
    for (let i = 0; i < 3; i++) await requestGuestRecovery(config, options);
    expect(starts).toBe(1);
    await requestGuestRecovery(config, { ...options, measure: free(30) });
    expect(starts).toBe(2);
    await requestGuestRecovery(config, { ...options, measure: free(80) });
    await requestGuestRecovery(config, options);
    expect(starts).toBe(3);
    expect(loadGuestDrive(config)?.name).toBe("guest");
  });

  test("the committed policy declares a valid guest drive with reclaim targets", () => {
    const drive = loadGuestDrive(
      join(import.meta.dir, "../../agents/hooks/storage-headroom.toml"),
    );
    expect(drive?.recover_gib).toBeGreaterThan(drive?.deny_gib ?? Infinity);
    expect(drive?.tmp_recover_pct).toBeDefined();
    expect(drive?.reclaim_cargo_targets?.length).toBeGreaterThan(0);
  });
});

/** A simulated disk: each command frees the given GiB; free space drives measure(). */
function harness(
  startFree: number,
  gains: Record<string, number>,
  over: Partial<Deps> = {},
) {
  let current = startFree;
  const cmds: string[] = [];
  const logs: string[] = [];
  const deps: Deps = {
    measure: () => ({ free: current * GiB, total: 400 * GiB }),
    tmpUse: () => 10,
    run: (cmd) => {
      const key = cmd[0] === "disk-reclaim" ? (cmd[2] ?? "") : "cargo-clean";
      cmds.push(cmd.join(" "));
      current += gains[key] ?? 0;
      return Promise.resolve({ code: 0, output: "" });
    },
    buildRunning: () => false,
    exists: () => true,
    log: (line) => {
      logs.push(line);
    },
    ...over,
  };
  return { deps, cmds, logs };
}

describe("recover", () => {
  test("stages run in the declared fast-first order", async () => {
    const h = harness(30, {});
    const outcome = await recover(guest, h.deps, false);
    expect(h.cmds.slice(0, 4)).toEqual(
      DISK_RECLAIM_STAGES.map((s) => `disk-reclaim run ${s} --yes`),
    );
    expect([...DISK_RECLAIM_STAGES]).toEqual([
      "tmpfs",
      "rip-expire",
      "clean",
      "builds",
    ]);
    expect(h.cmds).toHaveLength(6);
    expect(h.cmds[4]).toContain("cargo");
    expect(outcome.level).toBe("deny");
  });

  test("stops as soon as the drive is above the recover line", async () => {
    const h = harness(30, { tmpfs: 5, "rip-expire": 20 });
    const outcome = await recover(guest, h.deps, false);
    expect(h.cmds).toEqual([
      "disk-reclaim run tmpfs --yes",
      "disk-reclaim run rip-expire --yes",
    ]);
    expect(outcome.level).toBe("ok");
    expect(h.logs.some((l) => l.startsWith("STOP pressure gone"))).toBe(true);
  });

  test("does nothing when there is no pressure", async () => {
    const h = harness(100, {});
    const outcome = await recover(guest, h.deps, false);
    expect(h.cmds).toEqual([]);
    expect(outcome).toEqual({ level: "ok", ran: [], failed: [], reclaimed: 0 });
  });

  test("tmpfs inode pressure alone starts the same recovery", async () => {
    let used = 90;
    const h = harness(
      300,
      {},
      {
        tmpUse: () => used,
        run: (cmd) => {
          if (cmd[2] === "tmpfs") used = 5;
          return Promise.resolve({ code: 0, output: "" });
        },
      },
    );
    const outcome = await recover(guest, h.deps, false);
    expect(outcome.ran).toEqual(["tmpfs"]);
    expect(outcome.level).toBe("ok");
  });

  test("cargo clean runs only in declared workspaces and never beside a build", async () => {
    const busy = harness(30, {}, { buildRunning: () => true });
    await recover(guest, busy.deps, false);
    expect(busy.cmds.filter((c) => c.includes("cargo"))).toEqual([]);
    expect(
      busy.logs.filter((l) => l.includes("reason=build-running")),
    ).toHaveLength(2);

    const absent = harness(30, {}, { exists: () => false });
    await recover(guest, absent.deps, false);
    expect(
      absent.logs.filter((l) => l.includes("reason=no-Cargo.toml")),
    ).toHaveLength(2);
  });

  test("cargo clean stops after the first declared workspace frees enough", async () => {
    const h = harness(30, { "cargo-clean": 30 });
    const cwds: (string | undefined)[] = [];
    h.deps.run = (cmd, options) => {
      if (cmd[0] !== "disk-reclaim") cwds.push(options.cwd);
      h.cmds.push(cmd.join(" "));
      if (cmd[0] !== "disk-reclaim") h.deps.measure = free(100);
      return Promise.resolve({ code: 0, output: "" });
    };
    await recover(guest, h.deps, false);
    expect(cwds).toEqual(["/work/a"]);
  });

  test("a dry run only plans: every command is a read-only plan and nothing is cleaned", async () => {
    const h = harness(100, {});
    const outcome = await recover(guest, h.deps, true);
    expect(h.cmds).toEqual(
      DISK_RECLAIM_STAGES.map((s) => `disk-reclaim plan ${s}`),
    );
    expect(h.cmds.join("\n")).not.toContain(" run ");
    expect(h.cmds.join("\n")).not.toContain("cargo");
    expect(
      h.logs.filter((l) => l.startsWith("WOULD cargo-clean")),
    ).toHaveLength(2);
    expect(outcome.ran).toHaveLength(6);
  });

  test("a stage that times out is reported and the next stage still runs", async () => {
    const h = harness(
      30,
      {},
      {
        run: (cmd) => {
          h.cmds.push(cmd.join(" "));
          return Promise.resolve(
            cmd[2] === "rip-expire"
              ? { code: 143, output: "cancelled during scan", timedOut: true }
              : { code: 0, output: "" },
          );
        },
      },
    );
    const outcome = await recover(guest, h.deps, false);
    expect(outcome.failed).toEqual(["rip-expire"]);
    expect(h.cmds.slice(0, 4).map((c) => c.split(" ")[2])).toEqual([
      "tmpfs",
      "rip-expire",
      "clean",
      "builds",
    ]);
    expect(h.logs.some((l) => l.includes("rip-expire exit=143 TIMEOUT"))).toBe(
      true,
    );
    expect(exitCode(outcome)).toBe(1);
  });

  test("exit status: 0 only when pressure is gone and nothing failed", async () => {
    const ok = await recover(guest, harness(30, { tmpfs: 30 }).deps, false);
    expect(exitCode(ok)).toBe(0);
    expect(ok.reclaimed).toBe(30 * GiB);
    const fruitless = await recover(guest, harness(30, {}).deps, false);
    expect(fruitless.reclaimed).toBe(0);
    expect(exitCode(fruitless)).toBe(1);
  });

  test("cheap stages get smaller budgets than the slow one", () => {
    expect(STAGE_TIMEOUT_MS.tmpfs).toBeLessThan(STAGE_TIMEOUT_MS.builds);
    expect(Math.max(...Object.values(STAGE_TIMEOUT_MS))).toBeLessThanOrEqual(
      180_000,
    );
  });

  test("every action is a journal line", async () => {
    const h = harness(30, {});
    await recover(guest, h.deps, false);
    expect(h.logs[0]).toStartWith("START level=deny");
    expect(h.logs.filter((l) => l.startsWith("STAGE "))).toHaveLength(6);
    expect(h.logs.at(-1)).toStartWith("END level=deny");
  });
});

describe("helpers", () => {
  test("expandHome resolves only a leading ~", () => {
    expect(expandHome("~/Workspace/x", "/home/u")).toBe("/home/u/Workspace/x");
    expect(expandHome("/abs/~x", "/home/u")).toBe("/abs/~x");
  });

  test("hasBuildProcess reads comm under a fake proc root", async () => {
    const proc = scratch();
    mkdirSync(join(proc, "100"));
    writeFileSync(join(proc, "100/comm"), "bash\n");
    expect(await hasBuildProcess(proc)).toBe(false);
    mkdirSync(join(proc, "200"));
    writeFileSync(join(proc, "200/comm"), "rustc\n");
    expect(await hasBuildProcess(proc)).toBe(true);
    expect(await hasBuildProcess(join(proc, "missing"))).toBe(false);
  });
});
