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
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { release, tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { sshSupportsAttachMatch } from "../link-dots.ts";
import { STEPS } from "../post-merge.ts";

// The smart-open fixtures scope the forward with Match sessiontype (OpenSSH >= 9.9; Ubuntu 24.04
// ships 9.6, which rejects the line). The repo case also needs a machine that attaches to r99-u24
// (its ~/.ssh/config.local names a HostName) — doctor SKIPs smart-open everywhere else.
const sshV = Bun.spawnSync(["ssh", "-V"], { stderr: "pipe" }).stderr.toString();
const OLD_SSH = !sshSupportsAttachMatch(sshV);
const ATTACHES_TO_R99 = !Bun.spawnSync(["ssh", "-G", "r99-u24"], {
  stdout: "pipe",
})
  .stdout.toString()
  .split("\n")
  .includes("hostname r99-u24");

const REPO = join(import.meta.dir, "..", "..");
const SCRIPT = join(REPO, "scripts", "doctor.ts");

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function doctor(
  only: string,
  env: { HOME: string; DOTFILES: string; PATH?: string },
): { code: number; out: string } {
  const proc = Bun.spawnSync([process.execPath, SCRIPT], {
    // bun >= 1.4 writes its runtime transpiler cache to $HOME/.bun/install/cache/@t@/*.pile
    // (measured 2026-09-27; 1.3.14 did not). That is the runtime writing, not the doctor, so it
    // is pointed outside the fixture HOME to keep the "writes nothing" assertions about doctor.
    env: {
      ...process.env,
      ...env,
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
  test("brew: missing executable gives a named repair rather than a crash", () => {
    const home = tmp("doctor-home-");
    const r = doctor("brew", {
      HOME: home,
      DOTFILES: REPO,
      PATH: tmp("doctor-empty-path-"),
    });
    if (process.platform === "linux" && !/microsoft/iu.test(release())) {
      expect(r.out).toContain("SKIP");
    } else {
      expect(r.code).toBe(1);
      expect(r.out).toContain("Homebrew is required");
      expect(r.out).toContain("mise run install:tools");
    }
    expect(r.out).not.toContain("check crashed");
  });

  test.skipIf(process.platform !== "linux")(
    "brew: linux:init's runtime directory declares mise core mode",
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
      expect(r.code).toBe(0);
      expect(r.out).toContain("SKIP");
    },
  );

  test("codex-remote: unmanaged server warns without taking it over", () => {
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
    expect(r.out).toContain("WARN  codex-remote");
    expect(r.out).toContain(
      "restart it as a managed daemon when the desktop session is not in use",
    );
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
