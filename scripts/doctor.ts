// `mise run doctor` — does THIS machine realize what the dotfiles declare? READ-ONLY: every check
// compares a declared source of truth against the live machine and changes nothing. Consumer: a
// human or agent reading verdict lines; each FAIL carries the command that repairs it.
//
// It owns no rules of its own. Each check delegates to the file that already owns the fact:
//   links       scripts/link-dots.sh --check     every declared symlink realized, no dangling ones
//   settings    scripts/render-claude-settings   ~/.claude/settings.json == a fresh render
//   skills      scripts/skills-doctor.ts         no shadowed skill, wiring + ledger intact
//   brew        Brewfile                         `brew bundle check` — declared tools installed
//   deps        package.json + node_modules      every pinned dependency installed at its pin
//   bins        package.json `bin`               each PATH command in ~/.bun/bin resolves here;
//                                                no dangling link left by a renamed bin
//   git-hooks   .githooks                        core.hooksPath points at it
//   login-shell zsh                              the account's login shell is zsh
//   mise-scope  scripts/test-mise-scope.ts       INV-6: no implicit global toolchain
//   bun-floor   mise installs + tracked pins     no bun < 1.4 (Temporal) installed or pinned
//   mcp         .mcp.json                        every declared server registered in Claude Code
//                                                (and Codex, when installed)
//   codex-remote agents/codex/app-server.toml     Codex daemon remote control (mobile app) as declared
//   wslconfig   wsl/wslconfig.win   (WSL only)   %USERPROFILE%\.wslconfig is a byte-equal copy
//   ccc-daemon  cocoindex unit      (WSL only)   ccc-daemon.service is active under systemd --user
//   capacity-guard WSL timer       (WSL only)   autonomous host recovery timer is enabled and active
//   ccc-db-map  zsh/zshenv + unit                the ccc daemon relocates index DBs exactly as
//                                                this shell does (`ccc doctor` DB path mappings)
//   smart-open  ssh/config + smart-open/sockets.ts
//                                                r99-wsl's RemoteForward joins the two socket paths
//                                                smart-open and its receiver actually use
//   iterm2      iterm2/             (mac only)   iTerm2 loads its prefs from this repo
//
// NO FLAGS, NO DEPENDENCIES — deliberate, like render-claude-settings.ts: the machine being
// diagnosed may be half set up (no node_modules yet), and that is exactly when this must run.
// With no argv read there is no Cleye boundary to owe (writing-bun-scripts BG1). Inputs come from
// the environment so tests can point it at fixtures:
//   DOTFILES      repo root         (default: $HOME/dotfiles)
//   HOME          machine root      (default: os.homedir())
//   DOCTOR_ONLY   comma list of check names to run (default: all that apply to this OS)
//
// Verdicts: PASS · FAIL (declared ≠ live; a `fix:` line follows) · WARN (could not be decided,
// e.g. a probe timed out — never reported as PASS) · SKIP (does not apply here; the reason prints,
// so a green run can never be mistaken for one that checked something).
// Exit: 0 no FAIL · 1 at least one FAIL · 2 FATAL (the doctor itself broke).

import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { homedir, release, tmpdir, userInfo } from "node:os";
import { basename, join } from "node:path";
import {
  MAPPING_ENV,
  parseMapping,
} from "../agents/retrieval-control/ccc-db-dir.ts";
import { attempt, attemptOr, errorMessage } from "../agents/hooks/attempt.ts";
import {
  drift,
  readDeclared,
  readLive,
} from "../agents/codex/remote-control.ts";
import { receiverSocket, remoteSocket } from "../smart-open/sockets.ts";

type Verdict = "PASS" | "FAIL" | "WARN" | "SKIP";
export type Finding = {
  name: string;
  verdict: Verdict;
  detail: string;
  lines?: string[];
  fix?: string;
};
export type Ctx = {
  home: string;
  dotfiles: string;
  isMac: boolean;
  isWsl: boolean;
};

// Generous on purpose: a doctor exists to be exhaustive, and a cap of 8 once hid the one dangling
// link among 22 fresh-machine drifts. Past the cap the overflow is counted, never silently dropped.
const LIST_CAP = 40;

// Bounded child: native AbortSignal timeout, both pipes drained in ONE Promise.all (a sequential
// drain deadlocks on the unread pipe), timeout read off the signal (writing-bun-scripts BG2).
async function run(
  cmd: string[],
  opts: { ms: number; env?: Record<string, string>; cwd?: string },
): Promise<{
  code: number;
  out: string;
  err: string;
  timedOut: boolean;
  missing: boolean;
}> {
  if (!Bun.which(cmd[0] ?? "")) {
    return { code: 127, out: "", err: "", timedOut: false, missing: true };
  }
  const sig = AbortSignal.timeout(opts.ms);
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    signal: sig,
    env: { ...process.env, ...opts.env },
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out, err, timedOut: sig.aborted, missing: false };
}

const capped = (items: string[]): string[] =>
  items.length <= LIST_CAP
    ? items
    : [...items.slice(0, LIST_CAP), `… and ${items.length - LIST_CAP} more`];

const pass = (name: string, detail: string): Finding => ({
  name,
  verdict: "PASS",
  detail,
});
const skip = (name: string, detail: string): Finding => ({
  name,
  verdict: "SKIP",
  detail,
});
const warn = (name: string, detail: string): Finding => ({
  name,
  verdict: "WARN",
  detail,
});
const fail = (
  name: string,
  detail: string,
  fix: string,
  lines: string[] = [],
): Finding => ({
  name,
  verdict: "FAIL",
  detail,
  fix,
  lines: capped(lines),
});

function readJson(path: string): Promise<any> {
  return attemptOr(() => JSON.parse(readFileSync(path, "utf8")), null);
}

export async function checkLinks(ctx: Ctx): Promise<Finding> {
  const r = await run(
    ["bash", join(ctx.dotfiles, "scripts/link-dots.sh"), "--check"],
    {
      ms: 30_000,
      env: { HOME: ctx.home, DOTFILES: ctx.dotfiles },
    },
  );
  if (r.timedOut)
    return warn("links", "link-dots.sh --check timed out after 30s");
  const drift = r.out.split("\n").filter((l) => l.startsWith("drift: "));
  if (r.code === 0 && drift.length === 0) {
    return pass(
      "links",
      "every link declared in scripts/link-dots.sh is realized",
    );
  }
  if (drift.length === 0) {
    return warn(
      "links",
      `link-dots.sh --check exited ${r.code} without a drift line`,
    );
  }
  return fail(
    "links",
    `${drift.length} declared link(s) not realized`,
    "mise run link:dots",
    drift.map((l) => l.slice("drift: ".length)),
  );
}

export async function checkSettings(ctx: Ctx): Promise<Finding> {
  const live = join(ctx.home, ".claude", "settings.json");
  if (!existsSync(join(ctx.dotfiles, "agents/claude/settings.json"))) {
    return skip("settings", "no agents/claude/settings.json in this checkout");
  }
  const scratch = mkdtempSync(join(tmpdir(), "doctor-settings-"));
  // Cleanup runs on return AND on throw, same as the prior try/finally: the scratch directory is
  // removed once this block ends, in either case.
  using _scratch = {
    [Symbol.dispose]: () => rmSync(scratch, { recursive: true, force: true }),
  };
  const r = await run(
    ["bun", join(ctx.dotfiles, "scripts/render-claude-settings.ts")],
    {
      ms: 30_000,
      env: {
        HOME: scratch,
        DOTFILES: ctx.dotfiles,
        CLAUDE_SETTINGS_PRIVATE: join(
          ctx.home,
          ".claude",
          "settings.private.json",
        ),
      },
    },
  );
  if (r.timedOut || r.code !== 0) {
    return warn(
      "settings",
      `could not render a reference copy (exit ${r.code}): ${r.out.trim()}`,
    );
  }
  const want = await readJson(join(scratch, ".claude", "settings.json"));
  const have = await readJson(live);
  if (have === null) {
    return fail(
      "settings",
      `${live} is missing or not JSON`,
      "mise run link:dots",
    );
  }
  if (!Bun.deepEquals(want, have, true)) {
    const keys = new Set([...Object.keys(want ?? {}), ...Object.keys(have)]);
    const differing = [...keys].filter(
      (k) => !Bun.deepEquals(want?.[k], have[k], true),
    );
    return fail(
      "settings",
      `${live} differs from a fresh render of the committed base + private overlay`,
      "mise run link:dots",
      differing.map((k) => `top-level key differs: ${k}`),
    );
  }
  return pass("settings", "~/.claude/settings.json matches a fresh render");
}

export async function checkSkills(ctx: Ctx): Promise<Finding> {
  const r = await run(
    [
      "bun",
      join(ctx.dotfiles, "scripts/skills-doctor.ts"),
      "--dotfiles",
      ctx.dotfiles,
      "--home",
      ctx.home,
    ],
    { ms: 30_000 },
  );
  if (r.timedOut) return warn("skills", "skills-doctor.ts timed out after 30s");
  if (r.code === 0)
    return pass("skills", "no shadowed skill; wiring and ledger intact");
  const bad = (r.out + r.err)
    .split("\n")
    .filter((l) => /FAIL|❌|shadow/i.test(l));
  return fail(
    "skills",
    "skills-doctor.ts reports drift",
    "mise run link:skills",
    bad,
  );
}

export async function checkBrew(ctx: Ctx): Promise<Finding> {
  const r = await run(
    [
      "brew",
      "bundle",
      "check",
      "--file",
      join(ctx.dotfiles, "Brewfile"),
      "--no-upgrade",
      "--verbose",
    ],
    { ms: 180_000 },
  );
  if (r.missing)
    return fail("brew", "Homebrew is not on PATH", "see README → bootstrap");
  if (r.timedOut) return warn("brew", "brew bundle check timed out after 180s");
  if (r.code === 0) return pass("brew", "every Brewfile entry is installed");
  const missing = (r.out + r.err)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("→"))
    .map((l) => l.replace(/^→\s*/, ""));
  return fail(
    "brew",
    `${missing.length || "some"} Brewfile entr(y/ies) not installed`,
    "mise run install:tools",
    missing,
  );
}

export async function checkDeps(ctx: Ctx): Promise<Finding> {
  const pkg = await readJson(join(ctx.dotfiles, "package.json"));
  if (pkg === null) return skip("deps", "no package.json in this checkout");
  const pins: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };
  const off: string[] = [];
  for (const [name, want] of Object.entries(pins)) {
    const installed = await readJson(
      join(ctx.dotfiles, "node_modules", name, "package.json"),
    );
    if (installed === null) off.push(`${name}: not installed (pinned ${want})`);
    else if (installed.version !== want)
      off.push(`${name}: ${installed.version} ≠ pinned ${want}`);
  }
  return off.length === 0
    ? pass(
        "deps",
        `${Object.keys(pins).length} pinned dependencies installed at their pins`,
      )
    : fail(
        "deps",
        `${off.length} dependency pin(s) not realized`,
        "mise run deps",
        off,
      );
}

export async function checkBins(ctx: Ctx): Promise<Finding> {
  const pkg = await readJson(join(ctx.dotfiles, "package.json"));
  if (pkg === null) return skip("bins", "no package.json in this checkout");
  const binDir = join(ctx.home, ".bun", "bin");
  const problems: string[] = [];
  // existsSync already swallows every stat failure (missing path, dangling symlink target,
  // permission error) and reports false, so a prior real path is safe to resolve unconditionally.
  const resolved = (p: string): string | null =>
    existsSync(p) ? realpathSync(p) : null;
  for (const [name, rel] of Object.entries<string>(pkg.bin ?? {})) {
    const link = join(binDir, name);
    const have = resolved(link);
    if (have === null) {
      problems.push(`${link} is missing or dangling (declared: ${rel})`);
    } else if (have !== resolved(join(ctx.dotfiles, rel))) {
      problems.push(`${link} resolves to ${have}, not ${rel}`);
    }
  }
  // A renamed or removed bin leaves bun's old link behind: it points through bun's global
  // node_modules/dotfiles link, so link-dots.sh's "$DOTFILES/*" prune never sees it.
  // No bin dir at all: the per-bin loop above already reported every declared command.
  const stale: string[] = existsSync(binDir)
    ? readdirSync(binDir)
        .map((n) => join(binDir, n))
        .filter((p) => lstatSync(p).isSymbolicLink() && !existsSync(p))
        .filter((p) => readlinkSync(p).includes("node_modules/dotfiles/"))
    : [];
  problems.push(
    ...stale.map(
      (p) => `${p} is a dangling link left by a renamed/removed bin — rip ${p}`,
    ),
  );
  return problems.length === 0
    ? pass(
        "bins",
        `${Object.keys(pkg.bin ?? {}).length} PATH command(s) resolve into this repo`,
      )
    : fail(
        "bins",
        `${problems.length} PATH command problem(s)`,
        "mise run deps (then rip any dangling link listed)",
        problems,
      );
}

export async function checkGitHooks(ctx: Ctx): Promise<Finding> {
  const r = await run(
    ["git", "-C", ctx.dotfiles, "config", "--get", "core.hooksPath"],
    { ms: 10_000 },
  );
  const have = r.out.trim();
  const haveLabel = have === "" ? "unset" : `'${have}'`;
  return have === ".githooks"
    ? pass("git-hooks", "core.hooksPath = .githooks")
    : fail(
        "git-hooks",
        `core.hooksPath is ${haveLabel}, not .githooks — post-merge relink and pre-commit fmt never run`,
        `git -C ${ctx.dotfiles} config core.hooksPath .githooks`,
      );
}

export async function checkLoginShell(ctx: Ctx): Promise<Finding> {
  const user = userInfo().username;
  const r = ctx.isMac
    ? await run(["dscl", ".", "-read", `/Users/${user}`, "UserShell"], {
        ms: 10_000,
      })
    : await run(["getent", "passwd", user], { ms: 10_000 });
  const shell = ctx.isMac
    ? (r.out.split(":").pop()?.trim() ?? "")
    : (r.out.trim().split(":")[6] ?? "");
  if (shell === "")
    return warn("login-shell", "could not read the account's login shell");
  return basename(shell) === "zsh"
    ? pass("login-shell", `login shell is ${shell}`)
    : fail(
        "login-shell",
        `login shell is ${shell}, not zsh`,
        `chsh -s "$(command -v zsh)"`,
      );
}

export async function checkMiseScope(ctx: Ctx): Promise<Finding> {
  const r = await run(
    ["bun", join(ctx.dotfiles, "scripts/test-mise-scope.ts")],
    { ms: 120_000 },
  );
  if (r.timedOut)
    return warn("mise-scope", "test-mise-scope.ts timed out after 120s");
  if (r.code === 0)
    return pass("mise-scope", "INV-6 holds: no implicit global toolchain");
  const failed = r.out
    .split("\n")
    .filter((l) => l.startsWith("[FAIL]"))
    .map((l) => l.slice(7));
  return fail(
    "mise-scope",
    `${failed.length || "some"} INV-6 check(s) fail`,
    "mise run test:mise-scope (read each [FAIL])",
    failed,
  );
}

export async function checkMcp(ctx: Ctx): Promise<Finding> {
  const declared = Object.keys(
    (await readJson(join(ctx.dotfiles, ".mcp.json")))?.mcpServers ?? {},
  );
  if (declared.length === 0)
    return skip("mcp", ".mcp.json declares no servers");
  const missing: string[] = [];
  const claude = await run(["claude", "mcp", "list"], { ms: 90_000 });
  if (claude.missing)
    return fail("mcp", "claude is not on PATH", "mise run install:ai-clis");
  if (claude.timedOut)
    return warn(
      "mcp",
      "claude mcp list timed out after 90s (it health-checks every server)",
    );
  const claudeNames = new Set(
    claude.out.split("\n").map((l) => l.split(":")[0]?.trim() ?? ""),
  );
  missing.push(
    ...declared
      .filter((n) => !claudeNames.has(n))
      .map((n) => `${n}: not registered in Claude Code`),
  );
  const codex = await run(["codex", "mcp", "list"], { ms: 30_000 });
  if (!codex.missing && !codex.timedOut) {
    const codexNames = new Set(
      codex.out.split("\n").map((l) => l.trim().split(/\s+/)[0] ?? ""),
    );
    missing.push(
      ...declared
        .filter((n) => !codexNames.has(n))
        .map((n) => `${n}: not registered in Codex`),
    );
  }
  const codexNote = codex.missing
    ? " (Codex not installed)"
    : " in Claude Code and Codex";
  return missing.length === 0
    ? pass(
        "mcp",
        `${declared.length} declared server(s) registered${codexNote}`,
      )
    : fail(
        "mcp",
        `${missing.length} declared MCP registration(s) missing`,
        "mise run cc:install-mcp",
        missing,
      );
}

export async function checkWslconfig(ctx: Ctx): Promise<Finding> {
  const src = join(ctx.dotfiles, "wsl", "wslconfig.win");
  // Same interop path as scripts/wsl-wslconfig.ts: cmd.exe is deliberately off this PATH.
  const r = await run(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Write-Output $env:USERPROFILE",
    ],
    { ms: 20_000, cwd: "/mnt/c" },
  );
  const profile = r.out.replace(/\r/g, "").trim();
  if (r.missing || r.timedOut || profile === "") {
    return warn(
      "wslconfig",
      "could not read %USERPROFILE% via powershell.exe interop",
    );
  }
  const w = await run(["wslpath", "-u", profile], { ms: 10_000 });
  const dst = join(w.out.trim(), ".wslconfig");
  if (!existsSync(dst))
    return fail("wslconfig", `${dst} does not exist`, "mise run wsl:wslconfig");
  const have = readFileSync(dst, "utf8").replace(/\r/g, "");
  const want = readFileSync(src, "utf8").replace(/\r/g, "");
  // .wslconfig comments are `#`; a copy that differs only there is stale prose, not stale config.
  const effective = (s: string) =>
    s
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("#"))
      .join("\n");
  if (have !== want && effective(have) === effective(want)) {
    return warn(
      "wslconfig",
      `${dst} differs from wsl/wslconfig.win in comments only — effective settings identical (mise run wsl:wslconfig to refresh)`,
    );
  }
  return have === want
    ? pass("wslconfig", `${dst} is a copy of wsl/wslconfig.win`)
    : fail(
        "wslconfig",
        `${dst} differs from wsl/wslconfig.win`,
        "mise run wsl:wslconfig (then wsl --shutdown)",
      );
}

export async function checkCccDaemon(_ctx: Ctx): Promise<Finding> {
  const r = await run(
    ["systemctl", "--user", "is-active", "ccc-daemon.service"],
    { ms: 10_000 },
  );
  const state = r.out.trim();
  if (r.missing) return skip("ccc-daemon", "no systemctl on this host");
  return state === "active"
    ? pass("ccc-daemon", "ccc-daemon.service is active (capped by its unit)")
    : fail(
        "ccc-daemon",
        `ccc-daemon.service is ${state || "unknown"} — a client will spawn it uncapped`,
        "mise run wsl:ccc-daemon",
      );
}

export async function checkCapacityGuard(ctx: Ctx): Promise<Finding> {
  const unit = "wsl-capacity-recover.timer";
  const active = await run(["systemctl", "--user", "is-active", unit], {
    ms: 10_000,
  });
  if (active.missing)
    return skip("capacity-guard", "no systemctl on this host");
  // A linked *.timer.wsl is reported as an "alias" by is-enabled even after enabling it.
  // Check the actual timers.target.wants edge and its target instead.
  const wants = join(
    ctx.home,
    ".config/systemd/user/timers.target.wants",
    unit,
  );
  const source = join(ctx.dotfiles, "wsl/wsl-capacity-recover.timer.wsl");
  const enabled =
    existsSync(wants) &&
    existsSync(source) &&
    realpathSync(wants) === realpathSync(source);
  if (enabled && active.out.trim() === "active") {
    return pass("capacity-guard", `${unit} is enabled and active`);
  }
  return fail(
    "capacity-guard",
    `${unit} is ${enabled ? "enabled" : "not enabled"} / ${active.out.trim() || "not active"}`,
    "mise run wsl:capacity:enable",
  );
}

// ccc resolves a project's DB dir in TWO processes: the daemon writes the index where its own
// COCOINDEX_CODE_DB_PATH_MAPPING points, while `ccc reset`/`ccc status` and repo-retrieve's
// watermark look where the client's points. zsh/zshenv declares the client value and
// cocoindex/ccc-daemon.service.wsl the daemon's; a daemon started before either changed keeps
// the old one until restarted. `ccc doctor` is the only CLI that reports the daemon's mapping.
export async function checkCccDbMap(ctx: Ctx): Promise<Finding> {
  if (!Bun.which("ccc")) return skip("ccc-db-map", "ccc is not installed");
  const parsed = await attempt(() =>
    parseMapping(process.env[MAPPING_ENV]).map(
      (m) => `${m.source}=${m.target}`,
    ),
  );
  if (!parsed.ok) {
    return fail(
      "ccc-db-map",
      `${MAPPING_ENV} is malformed: ${errorMessage(parsed.error)}`,
      "fix the export in zsh/zshenv",
    );
  }
  const client = parsed.value;
  if (client.length === 0) {
    return fail(
      "ccc-db-map",
      `${MAPPING_ENV} is unset in this shell — index DBs would be read from inside the repos`,
      "open a new shell (zsh/zshenv exports it)",
    );
  }
  const r = await run(["ccc", "doctor"], { ms: 60_000, cwd: ctx.home });
  if (r.timedOut) return warn("ccc-db-map", "`ccc doctor` timed out after 60s");
  const lines = r.out.split("\n");
  const start = lines.findIndex((l) => l.trim() === "DB path mappings:");
  const daemon: string[] = [];
  for (const l of start < 0 ? [] : lines.slice(start + 1)) {
    const m = l.match(/^ {4}(\S.*?) \u2192 (\S.*)$/);
    if (!m) break;
    daemon.push(`${m[1]}=${m[2]}`);
  }
  if (start < 0 && !r.out.includes("Loaded projects:")) {
    return warn("ccc-db-map", "`ccc doctor` did not reach the daemon");
  }
  const same =
    client.length === daemon.length && client.every((c, i) => c === daemon[i]);
  const restartFix = ctx.isWsl
    ? "systemctl --user daemon-reload && systemctl --user restart ccc-daemon"
    : "ccc daemon restart (from a shell that exports the mapping)";
  return same
    ? pass("ccc-db-map", `daemon and this shell both map ${client.join(",")}`)
    : fail(
        "ccc-db-map",
        `daemon maps ${daemon.join(",") || "nothing"}, this shell maps ${client.join(",")}`,
        restartFix,
      );
}

export async function checkIterm2(ctx: Ctx): Promise<Finding> {
  const r = await run(
    ["defaults", "read", "com.googlecode.iterm2", "PrefsCustomFolder"],
    { ms: 10_000 },
  );
  const have = r.out.trim().replace(/^~/, ctx.home);
  const want = join(ctx.dotfiles, "iterm2");
  return have === want
    ? pass("iterm2", "iTerm2 loads its prefs from iterm2/")
    : fail(
        "iterm2",
        `iTerm2 prefs folder is ${have || "unset"}, not ${want}`,
        "mise run mac:iterm2",
      );
}

// Temporal is on by default only from bun 1.4, and this repo's TS uses it — so "which bun runs
// a hook/statusline" is a correctness question, not a preference. That bun is NOT decided by
// dotfiles' own mise.toml: a Claude session inherits the PATH of the directory it was launched
// from, which can put an old mise install dir first; and mise auto_install re-creates an old
// install the moment any repo still pinning it runs `bun`. Both halves are therefore checked:
// the installs a frozen PATH could land on, and the tracked pins that would re-summon them.
const BUN_FLOOR: readonly [number, number] = [1, 4];
function belowFloor(v: string): boolean {
  const m = /^(\d+)\.(\d+)/.exec(v);
  if (!m) return false; // "latest", "1", a ref — not a sub-1.4 claim
  const [maj, min] = [Number(m[1]), Number(m[2])];
  return maj < BUN_FLOOR[0] || (maj === BUN_FLOOR[0] && min < BUN_FLOOR[1]);
}
function trackedBunPin(file: string): string | undefined {
  let section = "";
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const header = /^\s*\[([^\]]+)\]/.exec(line);
    if (header) section = header[1] ?? "";
    const pin = /^\s*"?bun"?\s*=\s*"([^"]+)"/.exec(line);
    if (section === "tools" && pin) return pin[1];
  }
  return undefined;
}
/** One tracked-config link -> "pinned: <file> (bun = ...)" when it pins below the floor. */
async function trackedOldPin(link: string): Promise<string | undefined> {
  // config deleted since mise last saw it, or unreadable (e.g. an unmounted drive): neither
  // can be a live pin on this machine, so a failure anywhere in this read is just "no pin here".
  const read = await attempt(() => {
    const file = realpathSync(link);
    if (!file.endsWith(".toml")) return undefined;
    const pin = trackedBunPin(file);
    return { file, pin };
  });
  if (!read.ok || read.value === undefined) return undefined;
  const { file, pin } = read.value;
  return pin !== undefined && belowFloor(pin)
    ? `pinned: ${file} (bun = "${pin}")`
    : undefined;
}
export async function checkBunFloor(ctx: Ctx): Promise<Finding> {
  const floor = BUN_FLOOR.join(".");
  const installs = join(ctx.home, ".local/share/mise/installs/bun");
  const tracked = join(ctx.home, ".local/state/mise/tracked-configs");
  const old: string[] = [];
  const oldVersions: string[] = [];
  // mise's own alias links ("1", "latest") point at a real dir already listed.
  const installed = existsSync(installs)
    ? readdirSync(installs).filter(
        (v) => !lstatSync(join(installs, v)).isSymbolicLink(),
      )
    : [];
  oldVersions.push(...installed.filter(belowFloor));
  old.push(...oldVersions.map((v) => `installed: bun ${v}`));
  const links = existsSync(tracked) ? readdirSync(tracked) : [];
  for (const link of links) {
    const hit = await trackedOldPin(join(tracked, link));
    if (hit !== undefined) old.push(hit);
  }
  if (old.length === 0)
    return pass("bun-floor", `no bun < ${floor} installed or pinned`);
  const fix = [
    `set each pin to bun = "${floor}"`,
    ...(oldVersions.length > 0
      ? [`mise uninstall ${oldVersions.map((v) => `bun@${v}`).join(" ")}`]
      : []),
  ].join(", then ");
  return fail(
    "bun-floor",
    `${old.length} bun < ${floor} install(s)/pin(s); Temporal-using TS breaks under them`,
    fix,
    capped(old),
  );
}

export async function checkCodexRemote(ctx: Ctx): Promise<Finding> {
  if (!Bun.which("codex")) return skip("codex-remote", "codex not installed");
  const declared = await readDeclared(ctx.dotfiles);
  if (declared instanceof Error)
    return fail(
      "codex-remote",
      declared.message,
      "fix agents/codex/app-server.toml",
    );
  const lines = drift(declared, await readLive(ctx.home));
  if (lines.length === 0)
    return pass(
      "codex-remote",
      `app-server remote control ${declared ? "enabled" : "disabled"} as declared`,
    );
  return fail(
    "codex-remote",
    "Codex app-server remote control differs from agents/codex/app-server.toml (mobile app cannot connect when it is off)",
    "mise run codex:remote-control",
    lines,
  );
}

// ssh/config's `Host r99-wsl` forwards the REMOTE's smart-open socket to THIS machine's receiver.
// Both ends are code (smart-open/sockets.ts); the forward is ssh syntax (%r, %d) that cannot
// import them, so the only guard against drift is to ask ssh what it RESOLVES and compare. A
// mismatch is silent in use: `o <url>` finds no socket (or one nobody answers) and opens on the
// remote's own screen. -F pins the declared source (this repo's ssh/config, not whatever
// ~/.ssh/config currently links to); -G prints the resolved options without connecting.
const SMART_OPEN_HOST = "r99-wsl";
export async function checkSmartOpen(ctx: Ctx): Promise<Finding> {
  const config = join(ctx.dotfiles, "ssh", "config");
  if (!existsSync(config))
    return skip("smart-open", "no ssh/config in this checkout");
  const r = await run(["ssh", "-G", "-F", config, SMART_OPEN_HOST], {
    ms: 10_000,
  });
  if (r.missing) return skip("smart-open", "ssh is not installed");
  if (r.timedOut || r.code !== 0) {
    return warn(
      "smart-open",
      `ssh -G ${SMART_OPEN_HOST} did not resolve (exit ${r.code}): ${r.err.trim()}`,
    );
  }
  const resolved = r.out.split("\n");
  const value = (key: string): string[] =>
    resolved
      .filter((l) => l.startsWith(`${key} `))
      .map((l) => l.slice(key.length + 1).trim());
  const user = value("user")[0];
  if (user === undefined)
    return warn("smart-open", "ssh -G printed no `user` line");
  const want = `${remoteSocket(user)} ${receiverSocket(ctx.home)}`;
  const have = value("remoteforward");
  if (have.includes(want)) {
    return pass(
      "smart-open",
      `${SMART_OPEN_HOST} forwards ${want.replace(" ", " → ")}`,
    );
  }
  const seen =
    have.length > 0
      ? have.map((h) => `have: ${h}`)
      : ["have: no RemoteForward at all"];
  return fail(
    "smart-open",
    `${SMART_OPEN_HOST}'s RemoteForward does not join the paths smart-open/sockets.ts uses — \`o <url>\` would open on the remote's screen`,
    "make the RemoteForward in ssh/config match smart-open/sockets.ts (or the reverse)",
    [`want: ${want}`, ...seen],
  );
}

type Check = {
  name: string;
  run: (ctx: Ctx) => Promise<Finding>;
  applies: (ctx: Ctx) => string | null;
};
const always = () => null;
export const CHECKS: Check[] = [
  { name: "links", run: checkLinks, applies: always },
  { name: "settings", run: checkSettings, applies: always },
  { name: "skills", run: checkSkills, applies: always },
  { name: "brew", run: checkBrew, applies: always },
  { name: "deps", run: checkDeps, applies: always },
  { name: "bins", run: checkBins, applies: always },
  { name: "git-hooks", run: checkGitHooks, applies: always },
  { name: "login-shell", run: checkLoginShell, applies: always },
  { name: "mise-scope", run: checkMiseScope, applies: always },
  { name: "bun-floor", run: checkBunFloor, applies: always },
  { name: "mcp", run: checkMcp, applies: always },
  { name: "codex-remote", run: checkCodexRemote, applies: always },
  { name: "smart-open", run: checkSmartOpen, applies: always },
  {
    name: "wslconfig",
    run: checkWslconfig,
    applies: (c) => (c.isWsl ? null : "WSL only"),
  },
  {
    name: "ccc-daemon",
    run: checkCccDaemon,
    applies: (c) => (c.isWsl ? null : "WSL only"),
  },
  {
    name: "capacity-guard",
    run: checkCapacityGuard,
    applies: (c) => (c.isWsl ? null : "WSL only"),
  },
  { name: "ccc-db-map", run: checkCccDbMap, applies: always },
  {
    name: "iterm2",
    run: checkIterm2,
    applies: (c) => (c.isMac ? null : "macOS only"),
  },
];

export function render(findings: Finding[]): string {
  const width = Math.max(...findings.map((f) => f.name.length));
  const out: string[] = [];
  for (const f of findings) {
    out.push(`${f.verdict.padEnd(4)}  ${f.name.padEnd(width)}  ${f.detail}`);
    for (const l of f.lines ?? []) out.push(`${" ".repeat(width + 8)}- ${l}`);
    if (f.fix) out.push(`${" ".repeat(width + 8)}fix: ${f.fix}`);
  }
  const n = (v: Verdict) => findings.filter((f) => f.verdict === v).length;
  out.push(
    `RESULT: ${n("FAIL") ? "FAIL" : "PASS"} · FAIL ${n("FAIL")} · WARN ${n("WARN")} · PASS ${n("PASS")} · SKIP ${n("SKIP")}`,
  );
  return `${out.join("\n")}\n`;
}

async function main(): Promise<void> {
  const home = process.env.HOME ?? homedir();
  const ctx: Ctx = {
    home,
    dotfiles: process.env.DOTFILES ?? join(home, "dotfiles"),
    isMac: process.platform === "darwin",
    isWsl: /microsoft/i.test(release()), // same test as link-dots.sh: `uname -r`
  };
  const only = (process.env.DOCTOR_ONLY ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const unknown = only.filter((n) => !CHECKS.some((c) => c.name === n));
  if (unknown.length > 0)
    throw new Error(
      `DOCTOR_ONLY names unknown check(s): ${unknown.join(", ")}`,
    );
  const selected =
    only.length > 0 ? CHECKS.filter((c) => only.includes(c.name)) : CHECKS;
  // Independent probes run concurrently; the report keeps the declared order.
  const findings = await Promise.all(
    selected.map((c) => {
      const why = c.applies(ctx);
      return why === null
        ? c
            .run(ctx)
            .catch((e: unknown) =>
              warn(c.name, `check crashed: ${errorMessage(e)}`),
            )
        : Promise.resolve(skip(c.name, why));
    }),
  );
  process.stdout.write(render(findings));
  process.exitCode = findings.some((f) => f.verdict === "FAIL") ? 1 : 0;
}

if (import.meta.main) {
  main().catch((e: unknown) => {
    process.stderr.write(
      `FATAL: ${e instanceof Error ? e.message : String(e)}\n`,
    );
    process.exitCode = 2;
  });
}
