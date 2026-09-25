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
//   mcp         .mcp.json                        every declared server registered in Claude Code
//                                                (and Codex, when installed)
//   wslconfig   wsl/wslconfig.win   (WSL only)   %USERPROFILE%\.wslconfig is a byte-equal copy
//   ccc-daemon  cocoindex unit      (WSL only)   ccc-daemon.service is active under systemd --user
//   ccc-db-map  zsh/zshenv + unit                the ccc daemon relocates index DBs exactly as
//                                                this shell does (`ccc doctor` DB path mappings)
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

/* oxlint-disable eslint-js/no-restricted-syntax -- zero-dep by design (see header): try/catch stays, neverthrow is a graduation import */
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

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
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
  try {
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
    const want = readJson(join(scratch, ".claude", "settings.json"));
    const have = readJson(live);
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
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
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
  const pkg = readJson(join(ctx.dotfiles, "package.json"));
  if (pkg === null) return skip("deps", "no package.json in this checkout");
  const pins: Record<string, string> = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };
  const off: string[] = [];
  for (const [name, want] of Object.entries(pins)) {
    const installed = readJson(
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
  const pkg = readJson(join(ctx.dotfiles, "package.json"));
  if (pkg === null) return skip("bins", "no package.json in this checkout");
  const binDir = join(ctx.home, ".bun", "bin");
  const problems: string[] = [];
  const resolved = (p: string): string | null => {
    try {
      return realpathSync(p);
    } catch {
      return null;
    }
  };
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
  let stale: string[] = [];
  try {
    stale = readdirSync(binDir)
      .map((n) => join(binDir, n))
      .filter((p) => lstatSync(p).isSymbolicLink() && !existsSync(p))
      .filter((p) => readlinkSync(p).includes("node_modules/dotfiles/"));
  } catch {
    /* no bin dir: the per-bin loop above already reported every declared command */
  }
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
  return have === ".githooks"
    ? pass("git-hooks", "core.hooksPath = .githooks")
    : fail(
        "git-hooks",
        `core.hooksPath is ${have === "" ? "unset" : `'${have}'`}, not .githooks — post-merge relink and pre-commit fmt never run`,
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
    readJson(join(ctx.dotfiles, ".mcp.json"))?.mcpServers ?? {},
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
  return missing.length === 0
    ? pass(
        "mcp",
        `${declared.length} declared server(s) registered${codex.missing ? " (Codex not installed)" : " in Claude Code and Codex"}`,
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

// ccc resolves a project's DB dir in TWO processes: the daemon writes the index where its own
// COCOINDEX_CODE_DB_PATH_MAPPING points, while `ccc reset`/`ccc status` and repo-retrieve's
// watermark look where the client's points. zsh/zshenv declares the client value and
// cocoindex/ccc-daemon.service.wsl the daemon's; a daemon started before either changed keeps
// the old one until restarted. `ccc doctor` is the only CLI that reports the daemon's mapping.
export async function checkCccDbMap(ctx: Ctx): Promise<Finding> {
  if (!Bun.which("ccc")) return skip("ccc-db-map", "ccc is not installed");
  let client: string[];
  try {
    client = parseMapping(process.env[MAPPING_ENV]).map(
      (m) => `${m.source}=${m.target}`,
    );
  } catch (e) {
    return fail(
      "ccc-db-map",
      `${MAPPING_ENV} is malformed: ${e instanceof Error ? e.message : String(e)}`,
      "fix the export in zsh/zshenv",
    );
  }
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
  return same
    ? pass("ccc-db-map", `daemon and this shell both map ${client.join(",")}`)
    : fail(
        "ccc-db-map",
        `daemon maps ${daemon.join(",") || "nothing"}, this shell maps ${client.join(",")}`,
        ctx.isWsl
          ? "systemctl --user daemon-reload && systemctl --user restart ccc-daemon"
          : "ccc daemon restart (from a shell that exports the mapping)",
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
  { name: "mcp", run: checkMcp, applies: always },
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
              warn(
                c.name,
                `check crashed: ${e instanceof Error ? e.message : String(e)}`,
              ),
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
