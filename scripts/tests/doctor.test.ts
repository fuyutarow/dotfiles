import { DoctorStatus } from "../../tools/shared/src/doctor-record.ts";
import { jsonOf } from "../../tools/shared/src/zod.ts";
// bun test for scripts/doctor.ts — spawned end-to-end against throwaway HOME / DOTFILES trees
// (DOCTOR_ONLY narrows to the checks a fixture can drive); the real $HOME is never touched.
// Each FAIL case is paired with its PASS twin so a check that always passes, or always fails,
// is caught (writing-bun-scripts BG4: prove the check fires).
import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { release, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { LINKS } from "../config-registry.ts";
import { applies, sshSupportsAttachMatch } from "../link-dots.ts";
import {
  checkAgx,
  checkToolFloor,
  checkRole,
  checkStatuslineOwners,
  CHECKS,
  checkCccDbMap,
  checkCodexRemote,
  checkCodexRuntime,
  checkGoogleDrive,
  checkGitRefLocks,
  checkRipGraveyard,
  checkRecoverHealth,
  checkTmpfsCapacity,
  checkWslGpuManagerPath,
  type Ctx,
} from "../doctor.ts";
import type { FloorIO } from "../../tools/tool-tiers/src/core-floor.ts";

test("doctor uses the same floor without upgrading", async () => {
  let upgrades = 0;
  const io: FloorIO = {
    read: (tool) =>
      Promise.resolve(`${tool} ${tool === "agx" ? "1.22.7" : "0.1.6"}`),
    installed: () => Promise.resolve(true),
    upgrade: () => {
      upgrades++;
      return Promise.resolve();
    },
  };
  const result = await checkToolFloor(
    { home: "", dotfiles: "", isMac: true, isWsl: false, isCoreBox: false },
    io,
  );
  expect(result.verdict).toBe("FAIL");
  expect(result.detail).toContain("installed 1.22.7, required 1.22.8");
  expect(upgrades).toBe(0);
});

test("doctor reports untrusted tap with its specific repair", async () => {
  const io: FloorIO = {
    read: (tool) =>
      Promise.resolve(`${tool} ${tool === "agx" ? "1.22.8" : "0.1.6"}`),
    installed: (tool) =>
      Promise.resolve(
        tool === "dx"
          ? {
              stderr:
                "Refusing to load formula fuyutarow/tap/dx from untrusted tap fuyutarow/tap.",
            }
          : true,
      ),
    upgrade: () => Promise.resolve(),
  };
  const result = await checkToolFloor(
    { home: "", dotfiles: "", isMac: true, isWsl: false, isCoreBox: false },
    io,
  );
  expect(result.verdict).toBe("FAIL");
  expect(result.detail).toContain("untrusted tap fuyutarow/tap");
  expect(result.fix).toBe("brew trust fuyutarow/tap");
});

test("doctor warns on a dx collision with the same repair", async () => {
  const io: FloorIO = {
    read: (tool) =>
      Promise.resolve(tool === "dx" ? "deno 2.9.8" : "agx 1.22.8"),
    installed: (tool) => Promise.resolve(tool === "agx"),
    upgrade: () => Promise.resolve(),
  };
  const result = await checkToolFloor(
    { home: "", dotfiles: "", isMac: true, isWsl: false, isCoreBox: false },
    io,
  );
  expect(result.verdict).toBe("WARN");
  expect(result.detail).toBe(
    "dx: fuyutarow/tap/dx not installed (PATH dx is another program); repair: mise run up",
  );
  expect(result.fix).toBe("mise run up");
});

test("role doctor reports bound and unbound host resolution", async () => {
  expect(await checkRole(undefined, "sol.cc.uec.ac.jp")).toMatchObject({
    verdict: "INFO",
    detail: "shared-light (host sol.cc.uec.ac.jp)",
  });
  expect(await checkRole(undefined, "unknown.example")).toMatchObject({
    verdict: "INFO",
    detail: "workstation (unbound host unknown.example; default)",
  });
});
import {
  inspectRipGraveyard,
  RIP_GRAVEYARD_MAX_BYTES,
} from "../../tools/disk-reclaim/src/lib/graveyards.ts";
import { REF_LOCK_STALE_MS } from "../../tools/shared/src/ref-locks.ts";
import { STEPS } from "../post-merge.ts";
import {
  desktopLauncherProblem,
  installDesktopFacade,
  launcherContents,
} from "../../agents/codex/codex-runtime.ts";

// The smart-open fixtures scope the forward with Match sessiontype (OpenSSH >= 9.9; Ubuntu 24.04
// ships 9.6, which rejects the line).
const sshV = Bun.spawnSync(["ssh", "-V"], { stderr: "pipe" }).stderr.toString();
const OLD_SSH = !sshSupportsAttachMatch(sshV);

const REPO = join(import.meta.dir, "..", "..");
const SCRIPT = join(REPO, "scripts", "doctor.ts");
const BUN_EXEC = join(REPO, "scripts", "bun-exec.sh");
const RENDER_HOME = join(REPO, "scripts", "render-home.ts");
const tmpfsStats =
  (bavail: bigint, ffree = 35n) =>
  () => ({
    files: 100n,
    ffree,
    blocks: 100n,
    bavail,
    bsize: 1024n * 1024n,
  });
const FAKE_CLAUDE = join(import.meta.dir, "fake-claude.ts");
const FAKE_CLAUDE_BIN = tmp("doctor-claude-bin-");
writeFileSync(
  join(FAKE_CLAUDE_BIN, "claude"),
  `#!/bin/sh\nexec '${process.execPath}' '${FAKE_CLAUDE}' "$@"\n`,
  { mode: 0o755 },
);
chmodSync(join(FAKE_CLAUDE_BIN, "claude"), 0o755);
afterAll(() => {
  rmSync(FAKE_CLAUDE_BIN, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

const c1Parsed = jsonOf(DoctorStatus).safeParse(
  await Bun.file(
    join(import.meta.dir, "fixtures/agx-status-schema1.json"),
  ).text(),
);
const c1Status = c1Parsed.success
  ? c1Parsed.data
  : expect.unreachable(c1Parsed.error.message);
const agxCtx: Ctx = {
  home: "/fixture/home",
  dotfiles: "/fixture/dotfiles",
  isMac: false,
  isWsl: false,
  isCoreBox: false,
};
const probeResult = {
  code: 0,
  out: "",
  err: "",
  timedOut: false,
  missing: false,
};

test("mac statusline owner reports loaded agent and failed or unavailable last exit", async () => {
  const ctx = { ...agxCtx, isMac: true };
  const check = CHECKS.find((entry) => entry.name === "statusline-owners");
  expect(check?.applies(ctx)).toBeNull();
  expect(check?.applies(agxCtx)).toBeNull();
  const ok = await checkStatuslineOwners(ctx, (cmd) => {
    expect(cmd[0]).toBe("launchctl");
    return Promise.resolve({ ...probeResult, out: "last exit code = 0\n" });
  });
  expect(ok.verdict).toBe("PASS");
  for (const result of [
    { ...probeResult, out: "last exit code = 1\n" },
    { ...probeResult, code: 1, err: "not found" },
    { ...probeResult, out: "no exit status" },
  ]) {
    const failed = await checkStatuslineOwners(ctx, () =>
      Promise.resolve(result),
    );
    expect(failed.verdict).toBe("FAIL");
    expect(failed.fix).toBe("mise run link:dots");
  }
});

test("owner health checks require the refresh timer and never probe the retired path", async () => {
  const calls: string[][] = [];
  const result = await checkStatuslineOwners(agxCtx, (cmd) => {
    calls.push(cmd);
    if (cmd.includes("agx-doctor.timer"))
      return Promise.resolve({ ...probeResult, code: 3, out: "inactive\n" });
    return Promise.resolve({ ...probeResult, out: "active\n" });
  });
  expect(result.verdict).toBe("FAIL");
  expect(result.detail).toContain("agx-doctor.timer: inactive");
  expect(calls).toContainEqual([
    "systemctl",
    "--user",
    "is-active",
    "agx-doctor.timer",
  ]);
  expect(calls.flat()).not.toContain("agx-doctor.path");
});

test("mise doctor reads findings through pinned status without refreshing", async () => {
  expect(CHECKS.some((check) => check.name === "agx")).toBe(true);
  const failed = await checkAgx(agxCtx, (cmd, opts) => {
    expect(cmd).toEqual([
      "mise",
      "-C",
      agxCtx.dotfiles,
      "exec",
      "--",
      "agx",
      "status",
      "--json",
    ]);
    expect(opts.cwd).toBe(agxCtx.dotfiles);
    return Promise.resolve({ ...probeResult, out: JSON.stringify(c1Status) });
  });
  expect(failed).toMatchObject({
    name: "agx",
    verdict: "FAIL",
    detail: "1 fleet finding(s)",
    lines: [JSON.stringify(c1Status.findings?.findings[0])],
  });
  const clean = await checkAgx(agxCtx, () =>
    Promise.resolve({
      ...probeResult,
      out: JSON.stringify({
        ...c1Status,
        findings: { ...c1Status.findings, findings: [], total: 0 },
      }),
    }),
  );
  expect(clean.verdict).toBe("PASS");
});

test.each([
  { name: "null", findings: null },
  { name: "incomplete", findings: { ...c1Status.findings, complete: false } },
  { name: "stale", findings: { ...c1Status.findings, stale: true } },
  { name: "unsupported", findings: { ...c1Status.findings, schema: 2 } },
])("doctor $name findings remain visibly unavailable", async ({ findings }) => {
  const result = await checkAgx(agxCtx, () =>
    Promise.resolve({
      ...probeResult,
      out: JSON.stringify({ ...c1Status, findings }),
    }),
  );
  expect(result.verdict).toBe("WARN");
  expect(result.detail).toMatch(
    /unavailable|incomplete or stale|invalid schema-1/u,
  );
});

test.each([
  { ...probeResult, out: "not JSON" },
  { ...probeResult, out: JSON.stringify({ ...c1Status, schema: 2 }) },
  { ...probeResult, code: 2, err: "fixture collection failed" },
  { ...probeResult, timedOut: true },
])("doctor status failure never becomes clean", async (response) => {
  expect(
    (await checkAgx(agxCtx, () => Promise.resolve(response))).verdict,
  ).toBe("WARN");
});

function doctor(
  only: string,
  env: {
    HOME: string;
    DOTFILES: string;
    PATH?: string;
    GRAVEYARD?: string;
    RIP_GRAVEYARD?: string;
    XDG_DATA_HOME?: string;
    USER?: string;
    DOCTOR_TEST_TMP_ROOT?: string;
  },
): { code: number; out: string } {
  const proc = Bun.spawnSync([process.execPath, SCRIPT], {
    // bun >= 1.4 writes its runtime transpiler cache to $HOME/.bun/install/cache/@t@/*.pile
    // (measured 2026-09-27; 1.3.14 did not). That is the runtime writing, not the doctor, so it
    // is pointed outside the fixture HOME to keep the "writes nothing" assertions about doctor.
    env: {
      ...process.env,
      ...env,
      PATH: `${FAKE_CLAUDE_BIN}:${env["PATH"] ?? process.env["PATH"] ?? ""}`,
      CODEX_CONFIG_HOME: env.HOME,
      DOCTOR_ONLY: only,
      BUN_RUNTIME_TRANSPILER_CACHE_PATH: tmp("doctor-bun-cache-"),
    },
  });
  return {
    code: proc.exitCode ?? -1,
    out: proc.stdout.toString() + proc.stderr.toString(),
  };
}

/** A dotfiles fixture with a package.json declaring one bin and one pinned dependency. */
function fixtureDotfiles(): string {
  const dir = tmp("doctor-dotfiles-");
  mkdirSync(join(dir, "tools"));
  writeFileSync(join(dir, "tools", "hello.ts"), "#!/usr/bin/env bun\n");
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      bin: { hello: "tools/hello.ts" },
      dependencies: { leftpad: "1.2.3" },
    }),
  );
  return dir;
}

describe("doctor", () => {
  test("git-ref-locks discovers registered repos and names stale ownerless locks", async () => {
    const home = tmp("doctor-ref-locks-");
    const repo = join(home, "Workspace", "fixture");
    mkdirSync(join(repo, ".cocoindex_code"), { recursive: true });
    writeFileSync(
      join(repo, ".cocoindex_code", "settings.yml"),
      "fixture: true\n",
    );
    mkdirSync(join(repo, ".git"), { recursive: true });
    const ctx = {
      home,
      dotfiles: REPO,
      isMac: false,
      isWsl: true,
      isCoreBox: false,
    } satisfies Ctx;

    const clean = await checkGitRefLocks(ctx);
    expect(clean.verdict).toBe("PASS");
    expect(clean.detail).toContain("1 registered repo");

    const lock = join(repo, ".git", "packed-refs.lock");
    writeFileSync(lock, "fixture\n");
    const oldSeconds =
      (Temporal.Now.instant().epochMilliseconds - REF_LOCK_STALE_MS - 10_000) /
      1_000;
    utimesSync(lock, oldSeconds, oldSeconds);
    const stale = await checkGitRefLocks(ctx);
    expect(stale.verdict).toBe("FAIL");
    expect(stale.lines?.join("\n")).toContain(lock);
    expect(stale.lines?.join("\n")).toContain("age=");
    expect(stale.fix).toContain("rip <path>");
    rmSync(home, { recursive: true, force: true });
  });

  test("tmpfs capacity FAILs for byte or inode pressure at the threshold", async () => {
    const ctx: Ctx = {
      home: tmp("doctor-tmpfs-home-"),
      dotfiles: REPO,
      isMac: false,
      isWsl: true,
      isCoreBox: false,
    };
    const full = await checkTmpfsCapacity(ctx, tmpfsStats(0n));
    expect(full.verdict).toBe("FAIL");
    expect(full.detail).toContain("bytes 100.0%");
    expect(full.detail).toContain("inodes 65.0%");
    expect(full.fix).toBe("mise run reclaim:yes");
    for (const measure of [tmpfsStats(20n), tmpfsStats(50n, 20n)]) {
      const finding = await checkTmpfsCapacity(ctx, measure);
      expect(finding.verdict).toBe("FAIL");
      expect(finding.fix).toBe("mise run reclaim:yes");
    }
    expect((await checkTmpfsCapacity(ctx, tmpfsStats(21n))).verdict).toBe(
      "PASS",
    );
    expect(
      (await checkTmpfsCapacity({ ...ctx, isWsl: false }, tmpfsStats(0n)))
        .verdict,
    ).toBe("SKIP");
  });

  test("recover health names a failed unit and its journal line, while HOLD passes", async () => {
    const fatalLine =
      "2026-10-15T15:57:15+09:00 R99 bun[17]: FATAL: Error: TMPFS_RECLAIM_PERCENT must be an integer from 1 to 84";
    const calls: string[][] = [];
    const ctx: Ctx = {
      home: tmp("doctor-recover-health-home-"),
      dotfiles: REPO,
      isMac: false,
      isWsl: true,
      isCoreBox: false,
    };
    const failed = await checkRecoverHealth(ctx, (cmd) => {
      calls.push(cmd);
      if (cmd[0] === "systemctl")
        return Promise.resolve({
          code: 0,
          out: "loaded\n",
          err: "",
          timedOut: false,
          missing: false,
        });
      return Promise.resolve({
        code: 0,
        out: `2026-10-15T15:57:00+09:00 R99 systemd[1]: Starting wsl-capacity-recover.service...\n${fatalLine}`,
        err: "",
        timedOut: false,
        missing: false,
      });
    });
    expect(failed.verdict).toBe("FAIL");
    expect(failed.detail).toContain("wsl-capacity-recover.service");
    expect(failed.lines).toContain(fatalLine);
    expect(calls).toHaveLength(1);

    const healthy = await checkRecoverHealth(ctx, (cmd) => {
      let out =
        "2026-10-15T15:58:15+09:00 R99 bun[17]: TMPFS HOLD inodes=799028/1048576 (76.2%) bytes=18.5GiB/27.5GiB (67.3%) threshold=80%";
      if (cmd[0] === "systemctl") {
        if (cmd.includes("guest-capacity-recover.service")) out = "not-found\n";
        else out = "loaded\n";
      }
      return Promise.resolve({
        code: 0,
        out,
        err: "",
        timedOut: false,
        missing: false,
      });
    });
    expect(healthy.verdict).toBe("PASS");
  });

  test("recover health checks the optional guest unit after a healthy WSL run", async () => {
    const guestLine =
      "2026-10-15T20:37:00+09:00 R99 bun[17]: TMPFS_RECLAIM exit=143 timeout=true reclaimed_inodes=0 reclaimed_bytes=0.0GiB";
    const queried: string[] = [];
    const ctx: Ctx = {
      home: tmp("doctor-guest-recover-health-home-"),
      dotfiles: REPO,
      isMac: false,
      isWsl: true,
      isCoreBox: false,
    };
    const finding = await checkRecoverHealth(ctx, (cmd) => {
      const unit = cmd.find((arg) => arg.startsWith("--unit="))?.slice(7);
      if (unit !== undefined) queried.push(unit);
      return Promise.resolve({
        code: 0,
        out:
          unit === "guest-capacity-recover.service"
            ? `2026-10-15T20:36:00+09:00 R99 systemd[1]: Starting ${unit}...\n${guestLine}`
            : `2026-10-15T20:35:00+09:00 R99 systemd[1]: Starting ${unit}...\n2026-10-15T20:35:10+09:00 R99 bun[17]: TMPFS HOLD threshold=80%`,
        err: "",
        timedOut: false,
        missing: false,
      });
    });
    expect(queried).toEqual([
      "wsl-capacity-recover.service",
      "guest-capacity-recover.service",
    ]);
    expect(finding.verdict).toBe("FAIL");
    expect(finding.detail).toContain("guest-capacity-recover.service");
    expect(finding.lines).toContain(guestLine);
  });

  test("skills fails when in-house copies are missing", () => {
    const home = tmp("doctor-skills-fresh-");
    const result = doctor("skills", { HOME: home, DOTFILES: REPO });
    expect(result.code).toBe(1);
    expect(result.out).toContain("FAIL  skills");
    expect(result.out).toContain("mise run skills:sync");
    rmSync(home, { recursive: true, force: true });
  });

  test("skill helper path doctor fails on a missing registered repo helper and passes when it exists", () => {
    const home = tmp("doctor-skill-helper-paths-");
    const repo = join(home, "Workspace", "fixture-repo");
    mkdirSync(join(repo, ".git"), { recursive: true });
    const missingHelper = [
      "~/.claude",
      "/skills/wiring-mise-tasks/scripts/jj-commit.ts",
    ].join("");
    writeFileSync(
      join(repo, "mise.toml"),
      `[tasks.commit]\nrun = "bun ${missingHelper}"\n`,
    );

    const missing = doctor("skill-helper-paths", {
      HOME: home,
      DOTFILES: REPO,
    });
    expect(missing.code).toBe(1);
    expect(missing.out).toContain("fixture-repo/mise.toml");
    expect(missing.out).toContain("use jj-commit");

    const helper = join(
      home,
      ".claude",
      "skills",
      "wiring-mise-tasks",
      "scripts",
      "jj-commit.ts",
    );
    mkdirSync(join(helper, ".."), { recursive: true });
    writeFileSync(helper, "#!/usr/bin/env bun\n");
    const present = doctor("skill-helper-paths", {
      HOME: home,
      DOTFILES: REPO,
    });
    expect(present.code).toBe(0);
    expect(present.out).toContain("PASS  skill-helper-paths");
  });

  test("skills fails when in-house copies are symlinks and names the repair", () => {
    const home = tmp("doctor-skills-links-");
    const skillRoot = join(REPO, "agents/skills");
    const skillNames = readdirSync(skillRoot, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(skillRoot, entry.name, "SKILL.md")),
      )
      .map((entry) => entry.name);
    mkdirSync(join(home, ".claude/skills"), { recursive: true });
    for (const name of skillNames)
      symlinkSync(join(skillRoot, name), join(home, ".claude/skills", name));

    const result = doctor("skills", { HOME: home, DOTFILES: REPO });
    expect(result.code).toBe(1);
    expect(result.out).toContain("FAIL  skills");
    expect(result.out).toContain(".claude/skills/");
    expect(result.out).toContain("is a symlink");
    expect(result.out).toContain("mise run skills:sync");
    rmSync(home, { recursive: true, force: true });
  });

  test("skills passes when all declared Claude and Codex copies match", () => {
    const home = tmp("doctor-skills-codex-missing-");
    const skillRoot = join(REPO, "agents/skills");
    const skillNames = readdirSync(skillRoot, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(skillRoot, entry.name, "SKILL.md")),
      )
      .map((entry) => entry.name);
    for (const name of skillNames)
      for (const root of [".agents/skills", ".claude/skills"])
        cpSync(join(skillRoot, name), join(home, root, name), {
          recursive: true,
        });
    const result = doctor("skills", { HOME: home, DOTFILES: REPO });
    expect(result.code).toBe(0);
    expect(result.out).toContain("PASS  skills");
    rmSync(home, { recursive: true, force: true });
  });

  test("skills fails when an in-house copy is stale", () => {
    const home = tmp("doctor-skills-stale-");
    const skillRoot = join(REPO, "agents/skills");
    const skillNames = readdirSync(skillRoot, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(skillRoot, entry.name, "SKILL.md")),
      )
      .map((entry) => entry.name);
    for (const name of skillNames)
      for (const root of [".agents/skills", ".claude/skills"])
        cpSync(join(skillRoot, name), join(home, root, name), {
          recursive: true,
        });
    writeFileSync(
      join(home, ".agents/skills/refactoring-code/SKILL.md"),
      "stale copy\n",
    );
    const result = doctor("skills", { HOME: home, DOTFILES: REPO });
    expect(result.code).toBe(1);
    expect(result.out).toContain(
      ".agents/skills/refactoring-code/SKILL.md is missing or stale",
    );
    expect(result.out).toContain("mise run skills:sync");
    rmSync(home, { recursive: true, force: true });
  });

  test("skills fails when the retired plugin remains installed", () => {
    const home = tmp("doctor-skills-plugin-");
    const skillRoot = join(REPO, "agents/skills");
    const skillNames = readdirSync(skillRoot, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(join(skillRoot, entry.name, "SKILL.md")),
      )
      .map((entry) => entry.name);
    for (const name of skillNames)
      for (const root of [".agents/skills", ".claude/skills"])
        cpSync(join(skillRoot, name), join(home, root, name), {
          recursive: true,
        });
    mkdirSync(join(home, ".claude/plugins"), { recursive: true });
    writeFileSync(
      join(home, ".claude/plugins/installed_plugins.json"),
      JSON.stringify({
        plugins: {
          "dotfiles@dotfiles": [
            { scope: "user", installPath: "/plugin/cache", version: "1.0.0" },
          ],
        },
      }),
    );
    const result = doctor("skills", { HOME: home, DOTFILES: REPO });
    expect(result.code).toBe(1);
    expect(result.out).toContain("dotfiles@dotfiles is still installed");
    expect(result.out).toContain("mise run skills:sync");
    rmSync(home, { recursive: true, force: true });
  });

  test("rip-graveyard warns when its bounded scan cannot confirm the cap", async () => {
    const home = tmp("doctor-rip-graveyard-bounded-");
    const finding = await checkRipGraveyard(
      { home, dotfiles: REPO, isMac: false, isWsl: true, isCoreBox: false },
      () => ({
        bytes: 512,
        ramBacked: false,
        complete: false,
        timedOut: true,
        visited: 12,
        elapsedMs: 5_000,
      }),
    );
    expect(finding.verdict).toBe("WARN");
    expect(finding.detail).toContain("measured at least 512 bytes");
    expect(finding.detail).toContain("time limit reached");
  });

  test("ccc-db-map names the bounded ccc doctor timeout", async () => {
    const home = tmp("doctor-ccc-timeout-");
    const finding = await checkCccDbMap(
      { home, dotfiles: REPO, isMac: false, isWsl: true, isCoreBox: false },
      (_cmd, options) => {
        expect(options.ms).toBe(8_000);
        expect(options.cwd).toBe(home);
        return Promise.resolve({
          code: 124,
          out: "",
          err: "",
          timedOut: true,
          missing: false,
        });
      },
      "/home/fuyu=/home/fuyu/.cache/cocoindex-code/db",
    );
    expect(finding.verdict).toBe("WARN");
    expect(finding.detail).toContain("timed out after 8s");
  });

  test("wsl-gpu-path checks the user manager PATH and gives the reexec repair", () => {
    const present = checkWslGpuManagerPath("/usr/lib/wsl/lib:/usr/bin");
    expect(present.verdict).toBe("PASS");
    const missing = checkWslGpuManagerPath("/usr/bin:/bin");
    expect(missing.verdict).toBe("FAIL");
    expect(missing.detail.includes("systemd user manager PATH")).toBe(true);
    expect(missing.fix?.includes("systemctl --user daemon-reexec")).toBe(true);
  });

  test("rip-graveyard evaluates both zshenv variables and rejects bad locations", () => {
    const home = tmp("doctor-rip-graveyard-");
    const xdg = join(home, ".local/share");
    const graveyard = join(xdg, "graveyard");
    mkdirSync(graveyard, { recursive: true });
    if (!inspectRipGraveyard(graveyard).ramBacked) {
      const valid = doctor("rip-graveyard", {
        HOME: home,
        DOTFILES: REPO,
        GRAVEYARD: "/tmp/doctor-must-ignore-this-inherited-value",
        RIP_GRAVEYARD: "/tmp/doctor-must-ignore-this-inherited-value",
        XDG_DATA_HOME: xdg,
      });
      expect(valid.code).toBe(0);
      expect(valid.out).toContain("PASS  rip-graveyard");
    }
    const oversized = join(graveyard, "over-limit");
    writeFileSync(oversized, "");
    truncateSync(oversized, RIP_GRAVEYARD_MAX_BYTES + 1);
    const tooLarge = doctor("rip-graveyard", {
      HOME: home,
      DOTFILES: REPO,
      GRAVEYARD: graveyard,
      RIP_GRAVEYARD: graveyard,
      XDG_DATA_HOME: xdg,
    });
    expect(tooLarge.code).toBe(1);
    expect(tooLarge.out).toContain(`limit is ${RIP_GRAVEYARD_MAX_BYTES}`);

    const undeclared = tmp("doctor-rip-graveyard-undeclared-");
    mkdirSync(join(undeclared, "zsh"), { recursive: true });
    writeFileSync(
      join(undeclared, "zsh/zshenv"),
      "# no graveyard declaration\n",
    );
    const unset = doctor("rip-graveyard", {
      HOME: home,
      DOTFILES: undeclared,
      GRAVEYARD: graveyard,
      RIP_GRAVEYARD: graveyard,
      XDG_DATA_HOME: xdg,
    });
    expect(unset.code).toBe(1);
    expect(unset.out).toContain(
      "GRAVEYARD and RIP_GRAVEYARD are not both declared in zshenv",
    );
  });

  test("rip-graveyard-tmp fails for any leftover and names reclaim", () => {
    const user = `doctor-${Temporal.Now.instant().epochMilliseconds}-${crypto.randomUUID().slice(0, 8)}`;
    const root = tmp("doctor-stale-root-");
    const stale = join(root, `graveyard-${user}`);
    mkdirSync(stale);
    writeFileSync(join(stale, "old-entry"), "deleted");
    const result = doctor("rip-graveyard-tmp", {
      HOME: tmp("doctor-rip-graveyard-tmp-home-"),
      DOTFILES: REPO,
      USER: user,
      DOCTOR_TEST_TMP_ROOT: root,
    });
    rmSync(stale, { recursive: true, force: true });
    expect(result.code).toBe(1);
    expect(result.out).toContain("FAIL  rip-graveyard-tmp");
    expect(result.out).toContain("disk-reclaim run --tier blind --yes");
    expect(result.out).toContain(stale);
    expect(
      doctor("rip-graveyard-tmp", {
        HOME: tmp("doctor-stale-home-"),
        DOTFILES: REPO,
        DOCTOR_TEST_TMP_ROOT: root,
      }).code,
    ).toBe(0);
  });

  test("google-drive: both declared links must match discovered Drive targets", async () => {
    const home = tmp("doctor-drive-home-");
    const root = join(home, "Library/CloudStorage/GoogleDrive-test");
    const personal = join(root, "My Drive", "private", "Personal-Drive");
    mkdirSync(personal, { recursive: true });
    symlinkSync(root, join(home, "Google Drive"));
    symlinkSync(personal, join(home, "Personal-Drive"));
    const ctx: Ctx = {
      home,
      dotfiles: REPO,
      isMac: true,
      isWsl: false,
      isCoreBox: false,
    };
    expect((await checkGoogleDrive(ctx)).verdict).toBe("PASS");

    symlinkSync(root, join(home, "wrong"));
    const { unlinkSync } = await import("node:fs");
    unlinkSync(join(home, "Personal-Drive"));
    symlinkSync(join(home, "wrong"), join(home, "Personal-Drive"));
    const finding = await checkGoogleDrive(ctx);
    expect(finding.verdict).toBe("FAIL");
    expect(finding.lines?.join(" ")).toContain("Personal-Drive");
  });

  test("google-drive: WSL reports when the Google Drive filesystem is not mounted", async () => {
    const finding = await checkGoogleDrive({
      home: tmp("doctor-drive-wsl-home-"),
      dotfiles: REPO,
      isMac: false,
      isWsl: true,
      isCoreBox: false,
      mountInfo: "42 23 0:39 / /mnt rw,relatime - ext4 /dev/sda rw\n",
    });
    expect(finding.verdict).toBe("FAIL");
    expect(finding.detail).toContain("G: is not mounted at /mnt/g");
    expect(finding.fix).toBe("mise run wsl:drive-mount && sudo mount /mnt/g");
  });

  test("rendered reference uses resolved Bun with a temporary HOME", () => {
    const scratch = tmp("doctor-render-home-");
    const target = tmp("doctor-render-target-");
    mkdirSync(join(target, ".bun/bin"), { recursive: true });
    writeFileSync(join(target, ".bun/bin/statusline"), "#!/bin/sh\n");
    // The scratch mise home deliberately has no installed tools. Supply the recorded
    // roster response so this Bun-resolution test never downloads the agx suite.
    const fixtureBin = join(scratch, "bin");
    mkdirSync(fixtureBin);
    writeFileSync(
      join(fixtureBin, "mise"),
      `#!${process.execPath}\nconst args = process.argv.slice(2);\nif (JSON.stringify(args) !== ${JSON.stringify(JSON.stringify(["-C", REPO, "exec", "--", "agx", "worker", "roster", "--json"]))}) process.exit(99);\nprocess.stdout.write(await Bun.file(${JSON.stringify(join(import.meta.dir, "fixtures/agx-roster-schema1.json"))}).text());\n`,
      { mode: 0o755 },
    );
    const privateOverlay = join(scratch, "missing-settings.private.json");
    const proc = Bun.spawnSync([BUN_EXEC, RENDER_HOME], {
      env: {
        ...process.env,
        HOME: scratch,
        COMMAND_TARGET_HOME: target,
        PATH: `${fixtureBin}:${process.env["PATH"] ?? ""}`,
        DOTFILES: REPO,
        // This fixture checks Bun resolution against WIP code, explicitly into scratch HOME.
        DOTFILES_RENDER_FROM_WORKING_COPY: "1",
        DOTFILES_RENDER_REV: undefined,
        DOTFILES_BUN_PATH: process.execPath,
        MISE_DATA_DIR: join(scratch, "empty-mise-data"),
        MISE_CACHE_DIR: join(scratch, "empty-mise-cache"),
        MISE_CONFIG_DIR: join(scratch, "empty-mise-config"),
        CLAUDE_SETTINGS_PRIVATE: privateOverlay,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    const output = proc.stdout.toString() + proc.stderr.toString();
    expect(proc.exitCode, output).toBe(0);
    expect(output).not.toContain("bun-exec: cannot resolve bun");
    expect(output).toContain("rendered");
    rmSync(scratch, { recursive: true, force: true });
    rmSync(target, { recursive: true, force: true });
  });

  test("brew: missing executable gives a named repair rather than a crash", () => {
    const home = tmp("doctor-home-");
    const r = doctor("brew", {
      HOME: home,
      DOTFILES: REPO,
      PATH: tmp("doctor-empty-path-"),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("Homebrew is required");
    expect(r.out).toContain(
      process.platform === "linux"
        ? "mise run linux:migrate-brew"
        : "mise run install:tools",
    );
    expect(r.out).not.toContain("check crashed");
  });

  test("brew-ondemand: missing Homebrew is INFO and never fails the doctor", () => {
    const home = tmp("doctor-home-");
    const r = doctor("brew-ondemand", {
      HOME: home,
      DOTFILES: REPO,
      PATH: tmp("doctor-empty-path-"),
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("INFO  brew-ondemand");
    expect(r.out).toContain("mise run tool:get <cmd>");
    expect(r.out).not.toMatch(/^FAIL\s/mu);
  });

  test("brew-ondemand: missing formulae and casks are one INFO line", () => {
    const home = tmp("doctor-home-");
    const bin = tmp("doctor-fake-brew-");
    writeFileSync(
      join(bin, "brew"),
      "#!/bin/sh\nprintf '→ poppler\\n→ Cask maccy is not installed\\n'\nexit 1\n",
    );
    chmodSync(join(bin, "brew"), 0o755);
    const r = doctor("brew-ondemand", {
      HOME: home,
      DOTFILES: REPO,
      PATH: bin,
    });
    expect(r.code).toBe(0);
    expect(r.out).toContain("INFO  brew-ondemand");
    expect(r.out).toContain("poppler, Cask maccy is not installed");
    expect(r.out).toContain("mise run tool:get <cmd>");
    expect(r.out).toContain("mise run install:tools");
    expect(r.out).not.toMatch(/^FAIL\s/mu);
  });

  test.skipIf(process.platform !== "linux")(
    "brew: a legacy runtime directory never exempts Linux from Homebrew",
    () => {
      const home = tmp("doctor-home-");
      mkdirSync(join(home, ".local/share/dotfiles/runtime/bin"), {
        recursive: true,
      });
      const r = doctor("brew", {
        HOME: home,
        DOTFILES: REPO,
        PATH: tmp("doctor-empty-path-"),
      });
      expect(r.code).toBe(1);
      expect(r.out).toContain("Homebrew is required");
    },
  );

  test("codex-remote: unmanaged server follows platform ownership", () => {
    const home = tmp("doctor-home-");
    const bin = tmp("doctor-fake-path-");
    writeFileSync(join(bin, "codex"), "#!/bin/sh\nexit 99\n");
    writeFileSync(
      join(bin, "ps"),
      "#!/bin/sh\nprintf '%s\\n' 'codex -c features.code_mode_host=true app-server --listen unix://'\n",
    );
    chmodSync(join(bin, "codex"), 0o755);
    chmodSync(join(bin, "ps"), 0o755);
    const r = doctor("codex-remote", { HOME: home, DOTFILES: REPO, PATH: bin });
    expect(r.code).toBe(0);
    if (/microsoft/iu.test(release())) {
      expect(r.out).toContain("SKIP  codex-remote");
      expect(r.out).toContain(
        "Windows Desktop owns the native Codex app-server",
      );
    } else {
      expect(r.out).toContain("WARN  codex-remote");
      expect(r.out).toContain(
        "restart it as a managed daemon when the desktop session is not in use",
      );
    }
  });
  test("codex-remote: non-WSL unmanaged server warns without taking it over", () => {
    const home = tmp("doctor-home-");
    const bin = tmp("doctor-fake-path-");
    writeFileSync(join(bin, "codex"), "#!/bin/sh\nexit 99\n");
    writeFileSync(
      join(bin, "ps"),
      "#!/bin/sh\nprintf '%s\\n' 'codex -c features.code_mode_host=true app-server --listen unix://'\n",
    );
    chmodSync(join(bin, "codex"), 0o755);
    chmodSync(join(bin, "ps"), 0o755);
    const ctx = {
      home,
      dotfiles: REPO,
      isMac: false,
      isWsl: false,
      isCoreBox: false,
    };
    const result = Bun.spawnSync(
      [
        process.execPath,
        "--eval",
        `import { checkCodexRemote } from ${JSON.stringify(SCRIPT)}; console.log(JSON.stringify(await checkCodexRemote(JSON.parse(process.argv[1]))));`,
        JSON.stringify(ctx),
      ],
      { env: { ...process.env, PATH: bin } },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('"verdict":"WARN"');
    expect(result.stdout.toString()).toContain(
      "restart it as a managed daemon when the desktop session is not in use",
    );
  });
  test("codex-remote: WSL leaves the native Windows Desktop app-server alone", async () => {
    const finding = await checkCodexRemote({
      home: tmp("doctor-wsl-codex-home-"),
      dotfiles: REPO,
      isMac: false,
      isWsl: true,
      isCoreBox: false,
    });

    expect(finding.verdict).toBe("SKIP");
    expect(finding.detail).toContain(
      "Windows Desktop owns the native Codex app-server",
    );
  });
  test("codex-runtime: WSL refuses a Windows-only Codex declaration before probing any launcher", async () => {
    const dotfiles = tmp("doctor-wsl-codex-runtime-");
    mkdirSync(join(dotfiles, "agents", "codex"), { recursive: true });
    writeFileSync(
      join(dotfiles, "agents", "codex", "runtime.toml"),
      '[providers]\nmac = "standalone"\nlinux = "standalone"\nwsl = "windows-desktop"\n',
    );
    const finding = await checkCodexRuntime({
      home: tmp("doctor-wsl-codex-home-"),
      dotfiles,
      isMac: false,
      isWsl: true,
      isCoreBox: false,
    });

    expect(finding.verdict).toBe("FAIL");
    expect(finding.detail).toContain("not the required standalone provider");
  });
  test("codex-runtime: launcher diagnosis distinguishes missing, stale, and non-executable deployments", async () => {
    const home = tmp("doctor-launcher-home-");
    const launcher = join(home, ".local/bin/codex.exe");
    const inspect = () => desktopLauncherProblem(home, process.execPath, REPO);
    expect(await inspect()).toContain("cannot read:");
    mkdirSync(dirname(launcher), { recursive: true });
    writeFileSync(launcher, launcherContents("/retired/bun", REPO));
    expect(await inspect()).toContain("contents differ from declaration");
    expect(await inspect()).toContain("mise run codex:runtime");
    writeFileSync(launcher, launcherContents(process.execPath, REPO));
    chmodSync(launcher, 0o644);
    expect(await inspect()).toContain("not executable:");
    await installDesktopFacade(home, launcherContents(process.execPath, REPO));
    expect(await inspect()).toBeUndefined();
    expect(existsSync(join(home, ".local/bin/codex"))).toBe(false);
  });
  test("codex-runtime: doctor keeps failure causes after successful runtime rows", async () => {
    const dotfiles = tmp("doctor-runtime-output-");
    const codex = join(dotfiles, "agents/codex");
    mkdirSync(codex, { recursive: true });
    writeFileSync(
      join(codex, "runtime.toml"),
      '[providers]\nmac = "standalone"\nlinux = "standalone"\nwsl = "standalone"\n',
    );
    writeFileSync(
      join(codex, "codex-runtime.ts"),
      'console.log("PASS launcher fixture\\nFAIL desktop config missing fixture\\nFAIL native assets missing fixture"); process.exit(1);',
    );
    const finding = await checkCodexRuntime({
      home: tmp("doctor-runtime-home-"),
      dotfiles,
      isMac: false,
      isWsl: true,
      isCoreBox: false,
    });
    expect(finding.detail).toBe("FAIL desktop config missing fixture");
    expect(finding.lines).toContain("FAIL native assets missing fixture");
    expect(finding.fix).toBe("mise run codex:runtime");
  });
  test("post-merge runs codex:config after relinking dotfiles", () => {
    const mise = readFileSync(join(REPO, "mise.toml"), "utf8");
    const hook =
      mise.match(
        /\[tasks\."hook:post-merge"\]([\s\S]*?)(?=\n\[tasks\.|$)/u,
      )?.[1] ?? "";
    expect(hook).toContain('exec "$(mise which bun)" scripts/post-merge.ts');
    const dots = STEPS.findIndex((step) => step.name === "link:dots");
    const codex = STEPS.findIndex((step) => step.name === "codex:config");
    expect(dots).toBeGreaterThanOrEqual(0);
    expect(codex).toBeGreaterThan(dots);
    expect(STEPS[codex]?.args).toEqual(["agents/codex/codex-config.ts"]);
  });

  test("links: an empty HOME is all drift, reported without writing anything", () => {
    const home = tmp("doctor-home-");
    const r = doctor("links", { HOME: home, DOTFILES: REPO });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(
      /^FAIL {2}links {2}\d+ declared link\(s\) not realized/mu,
    );
    expect(r.out).toContain(".zshrc (want -> ");
    expect(r.out).toContain("fix: mise run link:dots");
    expect(readdirSync(home)).toEqual([]);
  });

  test("links: a dangling link into the repo is reported, not pruned", async () => {
    const home = tmp("doctor-home-");
    // Realize the declared links so this fixture tests dangling links, not the display cap.
    let os: "mac" | "wsl" | "linux" = "linux";
    if (process.platform === "darwin") os = "mac";
    if (/microsoft/iu.test(release())) os = "wsl";
    for (const [when, source, destination] of LINKS) {
      if (!applies(when, os) || source.startsWith("@")) continue;
      const target = join(home, destination);
      await mkdir(dirname(target), { recursive: true });
      await symlink(join(REPO, source), target);
    }
    mkdirSync(join(home, ".local", "bin"), { recursive: true });
    symlinkSync(
      join(REPO, "no-such-file.ts"),
      join(home, ".local", "bin", "gone"),
    );
    const r = doctor("links", { HOME: home, DOTFILES: REPO });
    expect(r.out).toContain("gone (dangling link into the repo)");
    expect(readdirSync(join(home, ".local", "bin"))).toEqual(["gone"]);
  });

  test("codex-config: reports drift for every declared Codex key", () => {
    const home = tmp("doctor-home-");
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(
      join(home, ".codex/config.toml"),
      `model_context_window = 100000
model_auto_compact_token_limit = 940000
[sandbox_workspace_write]
network_access = true
`,
    );
    const r = doctor("codex-config", { HOME: home, DOTFILES: REPO });
    expect(r.code).toBe(1);
    expect(r.out).toContain("model_context_window=100000, declared 1000000");
    expect(r.out).toContain(
      "model_auto_compact_token_limit=940000, declared 950000",
    );
    expect(r.out).toContain("mcp_servers.context7 differs from .mcp.json");
    expect(r.out).toContain("fix: mise run codex:config");
  });

  test("codex-config: skips when ~/.codex does not exist", () => {
    const home = tmp("doctor-home-");
    const r = doctor("codex-config", { HOME: home, DOTFILES: REPO });
    expect(r.code).toBe(0);
    expect(r.out).toContain("SKIP  codex-config");
    expect(r.out).toContain("~/.codex does not exist yet");
  });

  test("bins: missing and dangling-renamed bins FAIL; a resolving bin PASSes", () => {
    const dotfiles = fixtureDotfiles();
    const home = tmp("doctor-home-");
    const binDir = join(home, ".bun", "bin");
    mkdirSync(binDir, { recursive: true });

    const missing = doctor("bins", { HOME: home, DOTFILES: dotfiles });
    expect(missing.code).toBe(1);
    expect(missing.out).toContain("hello is missing or dangling");

    symlinkSync(join(dotfiles, "tools", "hello.ts"), join(binDir, "hello"));
    expect(doctor("bins", { HOME: home, DOTFILES: dotfiles }).out).toMatch(
      /^PASS {2}bins/mu,
    );

    // The shape bun leaves after a bin rename: a link through its global node_modules/dotfiles.
    const packages = join(home, ".bun/install/global/node_modules");
    mkdirSync(packages, { recursive: true });
    symlinkSync(dotfiles, join(packages, "dotfiles"));
    symlinkSync(
      "../install/global/node_modules/dotfiles/tools/old.ts",
      join(binDir, "old"),
    );
    const stale = doctor("bins", { HOME: home, DOTFILES: dotfiles });
    expect(stale.code).toBe(1);
    expect(stale.out).toContain(
      "old is a dangling link left by a renamed/removed bin",
    );
  });

  test("deps: a missing or off-pin dependency FAILs; the pinned version PASSes", () => {
    const dotfiles = fixtureDotfiles();
    const home = tmp("doctor-home-");
    expect(doctor("deps", { HOME: home, DOTFILES: dotfiles }).out).toContain(
      "leftpad: not installed (pinned 1.2.3)",
    );
    const pkgDir = join(dotfiles, "node_modules", "leftpad");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({ version: "1.2.4" }),
    );
    expect(doctor("deps", { HOME: home, DOTFILES: dotfiles }).out).toContain(
      "leftpad: 1.2.4 ≠ pinned 1.2.3",
    );
    writeFileSync(
      join(pkgDir, "package.json"),
      JSON.stringify({ version: "1.2.3" }),
    );
    const ok = doctor("deps", { HOME: home, DOTFILES: dotfiles });
    expect(ok.code).toBe(0);
    expect(ok.out).toMatch(/^PASS {2}deps/mu);
  });

  test("git-hooks: unset core.hooksPath FAILs with the exact repair; .githooks PASSes", () => {
    const repo = tmp("doctor-git-");
    Bun.spawnSync(["git", "init", "-q", repo]);
    const home = tmp("doctor-home-");
    const unset = doctor("git-hooks", { HOME: home, DOTFILES: repo });
    expect(unset.code).toBe(1);
    expect(unset.out).toContain(
      `fix: git -C ${repo} config core.hooksPath .githooks`,
    );
    Bun.spawnSync(["git", "-C", repo, "config", "core.hooksPath", ".githooks"]);
    expect(doctor("git-hooks", { HOME: home, DOTFILES: repo }).code).toBe(0);
  });

  // capacity-guard applies on WSL only (doctor.ts CHECKS): elsewhere doctor SKIPs it, so the
  // FAIL this case expects cannot occur — declared, not failed.
  test.skipIf(!/microsoft/iu.test(release()))(
    "capacity-guard: both timer enablement and liveness are required",
    () => {
      const home = tmp("doctor-capacity-home-");
      const bin = tmp("doctor-capacity-bin-");
      const systemctl = join(bin, "systemctl");
      writeFileSync(systemctl, "#!/bin/sh\nprintf 'active\\n'\n");
      chmodSync(systemctl, 0o755);
      const env = {
        HOME: home,
        DOTFILES: REPO,
        PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      };
      const missing = doctor("capacity-guard", env);
      expect(missing.code).toBe(1);
      expect(missing.out).toContain("not enabled / active");

      const wants = join(
        home,
        ".config/systemd/user/timers.target.wants/wsl-capacity-recover.timer",
      );
      mkdirSync(join(wants, ".."), { recursive: true });
      symlinkSync(join(REPO, "wsl/wsl-capacity-recover.timer.wsl"), wants);
      const enabled = doctor("capacity-guard", env);
      expect(enabled.code).toBe(0);
      expect(enabled.out).toContain("is enabled and active");

      writeFileSync(systemctl, "#!/bin/sh\nprintf 'inactive\\n'\n");
      const inactive = doctor("capacity-guard", env);
      expect(inactive.code).toBe(1);
      expect(inactive.out).toContain("enabled / inactive");
    },
  );

  /**
   * A dotfiles fixture whose ssh/config gives `r99-u24` one User and (optionally) one forward.
   */
  function fixtureSshConfig(
    forward: string | null,
    editor: "same" | "absent" | "forwards" = "same",
    scoped = true,
  ): string {
    const dir = tmp("doctor-ssh-");
    mkdirSync(join(dir, "ssh"));
    const box = "    HostName r99.invalid\n    User tester\n";
    const shared =
      editor === "absent"
        ? `Host r99-u24\n${box}`
        : `Host r99-u24 r99-u24-code\n${box}`;
    const fwd = forward === null ? "" : `    RemoteForward ${forward}\n`;
    const leak =
      editor === "forwards" && forward !== null
        ? `Host r99-u24-code\n${fwd}`
        : "";
    // Scoped as ssh/config does it: only an interactive session carries the forward.
    const attach = scoped
      ? "Match originalhost r99-u24 sessiontype shell\n"
      : "Host r99-u24\n";
    writeFileSync(
      join(dir, "ssh", "config"),
      `${shared}${leak}${attach}${fwd}`,
    );
    return dir;
  }

  // ssh validates Unix socket path lengths even for -G. No socket or home is created:
  // this logical client home keeps the fixture valid under arbitrarily long TMPDIRs.
  const smartOpenHome = "/tmp/doctor-client";

  test.skipIf(OLD_SSH)(
    "smart-open: a forward joining the paths the code uses PASSes; drift on either end FAILs naming both sides",
    () => {
      const home = smartOpenHome;
      const remote = "/tmp/smart-open-tester--r99-u24.sock";
      const receiver = `${home}/.cache/smart-open/receiver.sock`;
      const pass = doctor("smart-open", {
        HOME: home,
        DOTFILES: fixtureSshConfig(`${remote} ${receiver}`),
      });
      expect(pass.code).toBe(0);
      expect(pass.out).toMatch(/^PASS {2}smart-open {2}r99-u24 forwards /mu);

      for (const [name, forward] of [
        ["remote path drifted", `/tmp/smart-open-other.sock ${receiver}`],
        // The pre-2026-10-03 name, without the alias: `oo` there could not name the host.
        [
          "remote name lost the alias",
          `/tmp/smart-open-tester.sock ${receiver}`,
        ],
        ["receiver path drifted", `${remote} ${home}/.cache/smart-open/r.sock`],
      ] as const) {
        const r = doctor("smart-open", {
          HOME: home,
          DOTFILES: fixtureSshConfig(forward),
        });
        expect([name, r.code]).toEqual([name, 1]);
        expect(r.out).toContain(`want: ${remote} ${receiver}`);
        expect(r.out).toContain(`have: ${forward}`);
        expect(r.out).toContain("fix: make the RemoteForward in ssh/config");
      }
    },
  );

  test.skipIf(OLD_SSH)(
    "smart-open: an editor alias that is missing, or carries the forward, FAILs naming the fix",
    () => {
      const home = smartOpenHome;
      const forward = `/tmp/smart-open-tester--r99-u24.sock ${home}/.cache/smart-open/receiver.sock`;
      const ok = doctor("smart-open", {
        HOME: home,
        DOTFILES: fixtureSshConfig(forward),
      });
      expect(ok.code).toBe(0);
      expect(ok.out).toContain(
        "r99-u24-code reaches the same box without the forward",
      );
      const absent = doctor("smart-open", {
        HOME: home,
        DOTFILES: fixtureSshConfig(forward, "absent"),
      });
      expect(absent.code).toBe(1);
      expect(absent.out).toContain("r99-u24-code does not reach the same box");
      expect(absent.out).toContain("Host r99-u24 r99-u24-code");
      const leaks = doctor("smart-open", {
        HOME: home,
        DOTFILES: fixtureSshConfig(forward, "forwards"),
      });
      expect(leaks.code).toBe(1);
      expect(leaks.out).toContain(
        "r99-u24-code carries the smart-open forward",
      );
    },
  );

  test("smart-open: a forward every command session carries FAILs (it would steal the socket)", () => {
    const home = smartOpenHome;
    const r = doctor("smart-open", {
      HOME: home,
      DOTFILES: fixtureSshConfig(
        `/tmp/smart-open-tester--r99-u24.sock ${home}/.cache/smart-open/receiver.sock`,
        "same",
        false,
      ),
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain(
      "a command session to r99-u24 carries the smart-open forward",
    );
  });

  test.skipIf(OLD_SSH)(
    "smart-open: a host with no RemoteForward at all FAILs, and an extra unrelated forward does not mask drift",
    () => {
      const home = smartOpenHome;
      const none = doctor("smart-open", {
        HOME: home,
        DOTFILES: fixtureSshConfig(null),
      });
      expect(none.code).toBe(1);
      expect(none.out).toContain("have: no RemoteForward at all");

      const unrelated = doctor("smart-open", {
        HOME: home,
        DOTFILES: fixtureSshConfig("/tmp/unrelated.sock /tmp/elsewhere.sock"),
      });
      expect(unrelated.code).toBe(1);
      expect(unrelated.out).toContain(
        "have: /tmp/unrelated.sock /tmp/elsewhere.sock",
      );
    },
  );

  test("smart-open: a checkout with no ssh/config is SKIPped with the reason, not PASSed", () => {
    const r = doctor("smart-open", {
      HOME: tmp("doctor-home-"),
      DOTFILES: tmp("doctor-empty-"),
    });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(
      /^SKIP {2}smart-open {2}no ssh\/config in this checkout/mu,
    );
  });

  test("two independent FAILs come back in one run, with a summary line", () => {
    const dotfiles = fixtureDotfiles();
    const home = tmp("doctor-home-");
    const r = doctor("deps,bins", { HOME: home, DOTFILES: dotfiles });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^FAIL {2}deps/mu);
    expect(r.out).toMatch(/^FAIL {2}bins/mu);
    expect(r.out).toContain("RESULT: FAIL · FAIL 2 · WARN 0 · PASS 0 · SKIP 0");
  });

  test("an unknown DOCTOR_ONLY name is FATAL (exit 2), never a silent empty PASS", () => {
    const r = doctor("links,nope", {
      HOME: tmp("doctor-home-"),
      DOTFILES: REPO,
    });
    expect(r.code).toBe(2);
    expect(r.out).toContain("FATAL: DOCTOR_ONLY names unknown check(s): nope");
  });

  /** A HOME with mise bun installs (real dirs + one alias link) and one tracked repo pin. */
  async function fixtureBunHome(
    installed: string[],
    pin: string,
  ): Promise<string> {
    const home = tmp("doctor-bun-");
    const installs = join(home, ".local/share/mise/installs/bun");
    await mkdir(installs, { recursive: true });
    for (const v of installed) {
      const bin = join(installs, v, "bin");
      await mkdir(bin, { recursive: true });
      await writeFile(join(bin, "bun"), `#!/bin/sh\nprintf '%s\\n' '${v}'\n`, {
        mode: 0o755,
      });
    }
    await symlink(`./${installed[0]}`, join(installs, "latest"));
    const repo = join(home, "repo");
    await mkdir(repo);
    await writeFile(join(repo, "mise.toml"), `[tools]\nbun = "${pin}"\n`);
    const tracked = join(home, ".local/state/mise/tracked-configs");
    await mkdir(tracked, { recursive: true });
    await symlink(join(repo, "mise.toml"), join(tracked, "abc123"));
    return home;
  }

  test("bun-floor: old binaries and tracked pins are named with a repair", async () => {
    const home = await fixtureBunHome(["1.4.3", "1.3.14"], "1.2.22");
    const binary = join(home, ".local/share/mise/installs/bun/1.3.14/bin/bun");
    const r = doctor("bun-floor", {
      HOME: home,
      DOTFILES: REPO,
      PATH: "/usr/bin:/bin",
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain(binary);
    expect(r.out).toContain('(bun = "1.2.22")');
    expect(r.out).toContain("mise install bun; brew upgrade bun");
  });

  test.each(["1.4.2", "1.4.3"])(
    "bun-floor probes reported patch %s under a mise minor alias and on PATH",
    async (version) => {
      const home = await fixtureBunHome(["1.4"], "1.4");
      const binary = join(home, ".local/share/mise/installs/bun/1.4/bin/bun");
      await writeFile(binary, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`, {
        mode: 0o755,
      });
      const r = doctor("bun-floor", {
        HOME: home,
        DOTFILES: REPO,
        PATH: `${dirname(binary)}:/usr/bin:/bin`,
      });
      expect(r.code).toBe(version === "1.4.2" ? 1 : 0);
      expect(r.out).toContain(binary);
      expect(r.out).toContain(version);
      if (version === "1.4.2") expect(r.out).toContain("fix:");
    },
  );

  test("bun-floor: a PATH binary reporting an unreadable version fails closed", async () => {
    const home = await fixtureBunHome(["1.4.3"], "1.4.3");
    const bin = join(home, "bin");
    await mkdir(bin);
    await writeFile(join(bin, "bun"), "#!/bin/sh\necho unknown\n", {
      mode: 0o755,
    });
    const r = doctor("bun-floor", { HOME: home, DOTFILES: REPO, PATH: bin });
    expect(r.code).toBe(1);
    expect(r.out).toContain(`${bin}/bun: cannot determine Bun version`);
  });

  test("brew-shadows: only the PATH-selected copy before Homebrew FAILs", () => {
    const home = tmp("doctor-brew-shadow-home-");
    const shadowBin = join(home, ".local/bin");
    const brewBin = join(home, "brew/bin");
    mkdirSync(shadowBin, { recursive: true });
    mkdirSync(brewBin, { recursive: true });
    writeFileSync(join(shadowBin, "mise"), "old mise");
    writeFileSync(join(brewBin, "mise"), "Homebrew mise");
    writeFileSync(join(brewBin, "brew"), "fake brew");
    chmodSync(join(shadowBin, "mise"), 0o755);
    chmodSync(join(brewBin, "mise"), 0o755);
    chmodSync(join(brewBin, "brew"), 0o755);

    const shadow = doctor("brew-shadows", {
      HOME: home,
      DOTFILES: REPO,
      PATH: `${shadowBin}:${brewBin}:/usr/bin:/bin`,
    });
    expect(shadow.code).toBe(1);
    expect(shadow.out).toContain(join(shadowBin, "mise"));
    expect(shadow.out).toContain(join(brewBin, "mise"));
    expect(shadow.out).toContain("fix: rip <shadow>");

    const laterDuplicate = doctor("brew-shadows", {
      HOME: home,
      DOTFILES: REPO,
      PATH: `${brewBin}:${shadowBin}:/usr/bin:/bin`,
    });
    expect(laterDuplicate.code).toBe(0);
    expect(laterDuplicate.out).toMatch(/^PASS {2}brew-shadows/mu);

    const clean = doctor("brew-shadows", {
      HOME: home,
      DOTFILES: REPO,
      PATH: `${brewBin}:/usr/bin:/bin`,
    });
    expect(clean.code).toBe(0);
    expect(clean.out).toMatch(/^PASS {2}brew-shadows/mu);
  });
});
