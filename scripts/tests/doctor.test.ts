// bun test for scripts/doctor.ts — spawned end-to-end against throwaway HOME / DOTFILES trees
// (DOCTOR_ONLY narrows to the checks a fixture can drive); the real $HOME is never touched.
// Each FAIL case is paired with its PASS twin so a check that always passes, or always fails,
// is caught (writing-bun-scripts BG4: prove the check fires).
import { describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { release, tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { sshSupportsAttachMatch } from "../link-dots.ts";
import {
  checkCccDbMap,
  checkCodexRemote,
  checkCodexRuntime,
  checkGoogleDrive,
  checkRipGraveyard,
  checkWslGpuManagerPath,
  type Ctx,
} from "../doctor.ts";
import {
  inspectRipGraveyard,
  RIP_GRAVEYARD_MAX_BYTES,
} from "../../tools/disk-reclaim/src/lib/graveyards.ts";
import { STEPS } from "../post-merge.ts";

// The smart-open fixtures scope the forward with Match sessiontype (OpenSSH >= 9.9; Ubuntu 24.04
// ships 9.6, which rejects the line). The repo case also needs a machine that attaches to r99-u24
// (its ~/.ssh/config.local names a HostName) — doctor SKIPs smart-open everywhere else.
const sshV = Bun.spawnSync(["ssh", "-V"], { stderr: "pipe" }).stderr.toString();
const OLD_SSH = !sshSupportsAttachMatch(sshV);
const ATTACHES_TO_R99 = !Bun.spawnSync(
  ["ssh", "-G", "-F", join(import.meta.dir, "../../ssh/config"), "r99-u24"],
  {
    stdout: "pipe",
  },
)
  .stdout.toString()
  .split("\n")
  .includes("hostname r99-u24");

const REPO = join(import.meta.dir, "..", "..");
const SCRIPT = join(REPO, "scripts", "doctor.ts");
const BUN_EXEC = join(REPO, "scripts", "bun-exec.sh");
const RENDER_HOME = join(REPO, "scripts", "render-home.ts");

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

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
    const privateOverlay = join(scratch, "missing-settings.private.json");
    const proc = Bun.spawnSync([BUN_EXEC, RENDER_HOME], {
      env: {
        ...process.env,
        HOME: scratch,
        COMMAND_TARGET_HOME: process.env.HOME ?? userInfo().homedir,
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

  test("links: a dangling link into the repo is reported, not pruned", () => {
    const home = tmp("doctor-home-");
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
        PATH: `${bin}:${process.env.PATH ?? ""}`,
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

  test.skipIf(OLD_SSH)(
    "smart-open: a forward joining the paths the code uses PASSes; drift on either end FAILs naming both sides",
    () => {
      const home = tmp("doctor-home-");
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
      const home = tmp("doctor-home-");
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
    const home = tmp("doctor-home-");
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
      const home = tmp("doctor-home-");
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

  test.skipIf(OLD_SSH || !ATTACHES_TO_R99)(
    "smart-open: the repo's own ssh/config agrees with tools/shared/src/sockets.ts",
    () => {
      if (Bun.which("ssh") === null) return; // the check SKIPs without ssh; nothing to assert
      // ssh expands %d from the passwd entry, so the real account's home is the HOME that must agree.
      const r = doctor("smart-open", {
        HOME: userInfo().homedir,
        DOTFILES: REPO,
      });
      expect(r.out).toMatch(/^PASS {2}smart-open /mu);
      expect(r.code).toBe(0);
    },
  );

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
  function fixtureBunHome(installed: string[], pin: string): string {
    const home = tmp("doctor-bun-");
    const installs = join(home, ".local/share/mise/installs/bun");
    mkdirSync(installs, { recursive: true });
    for (const v of installed) mkdirSync(join(installs, v));
    symlinkSync(`./${installed[0]}`, join(installs, "latest"));
    const repo = join(home, "repo");
    mkdirSync(repo);
    writeFileSync(join(repo, "mise.toml"), `[tools]\nbun = "${pin}"\n`);
    const tracked = join(home, ".local/state/mise/tracked-configs");
    mkdirSync(tracked, { recursive: true });
    symlinkSync(join(repo, "mise.toml"), join(tracked, "abc123"));
    return home;
  }

  test("bun-floor: a sub-1.4 install and a sub-1.4 pin are both named", () => {
    const home = fixtureBunHome(["1.4.2", "1.3.14"], "1.2.22");
    const r = doctor("bun-floor", { HOME: home, DOTFILES: REPO });
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/^FAIL {2}bun-floor {2}2 bun < 1\.4 /mu);
    expect(r.out).toContain("installed: bun 1.3.14");
    expect(r.out).toContain('(bun = "1.2.22")');
    expect(r.out).toContain("mise uninstall bun@1.3.14");
  });

  test("bun-floor: only >= 1.4 installs and a minor-line pin pass", () => {
    const home = fixtureBunHome(["1.4.2", "1.4.0"], "1.4");
    const r = doctor("bun-floor", { HOME: home, DOTFILES: REPO });
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/^PASS {2}bun-floor {2}no bun < 1\.4/mu);
  });
});
