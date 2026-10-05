// `mise run link:dots` — the single source of truth for dotfile symlinks (macOS, WSL, plain Linux).
// Do not duplicate link lists anywhere else; add new links to LINKS below. Layout is topic-first:
// one tool = one directory. Consumer: a human or agent reading verdict lines
// (linked / skip / pruned / drift), and `mise run doctor`, which reads the `drift: ` lines.
//
// Port of scripts/link-dots.sh (2026-10-05). It had grown OS branches, a version gate, two prune
// passes and a read-only mode — exactly the "first conditional is the signal" of writing-bun-scripts
// BG0. Its old exemption ("runs before brew/bun exist") had stopped being true: the .sh already
// called `bun render-claude-settings.ts`, and every caller (mac:init, wsl-init.ts, linux-init.ts,
// the post-merge hook) runs after bun and `mise run deps`. Deliberate changes from the .sh:
//   - plain Linux (a rented box, a VM) is a real target, not "neither macOS nor WSL" noise;
//   - `--force` onto a REAL DIRECTORY skips loudly: `ln -sfn src dir` put the link INSIDE it;
//   - an unknown platform is FATAL instead of a warning followed by a partial run.
//
// Modes (one script + a flag, not two scripts):
//   (default)  SAFE  — idempotent: never replace a non-symlink, no sudo unless a link is missing.
//                      Default so the post-merge hook can relink on every pull.
//   --force          — replace a regular file with the symlink (initial setup / fixing drift).
//   --check          — READ-ONLY: change nothing, print one `drift: ` line per declared link that
//                      is not realized, exit 1 if any. The settings render is skipped here;
//                      doctor compares it separately.
// Inputs from the environment (so tests and doctor can point it at fixtures): HOME, DOTFILES.
// Exit: 0 done / no drift · 1 drift (--check) · 2 FATAL or usage error.

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  renameSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { homedir, release } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";

type Os = "mac" | "wsl" | "linux";
type Mode = "safe" | "force" | "check";
export type Ctx = {
  home: string;
  dotfiles: string;
  os: Os;
  mode: Mode;
  drift: string[];
};

// Where a link applies. Required on every row: no row is "everywhere" by omission.
type When = "all" | "mac" | "wsl" | "linux" | "not-mac";

// [when, repo-relative source, home-relative destination]
const LINKS: readonly (readonly [When, string, string])[] = [
  // --- zsh ---
  ["all", "zsh/zshenv", ".zshenv"],
  ["all", "zsh/zshrc", ".zshrc"],
  ["mac", "zsh/zprofile.mac", ".zprofile"],
  // zprofile.wsl is the Linux login profile (brew shellenv, PATH, sheldon → aliases); its WSL-only
  // parts are guarded. Plain Linux gets it too: without it linuxbrew is off PATH, sheldon never
  // runs and no alias exists (2026-10-05, Vast box: `l`/`p`/`h` not found).
  ["not-mac", "zsh/zprofile.wsl", ".zprofile"],
  ["all", "sheldon", ".config/sheldon"],

  // --- git (per-OS identity/credential include) ---
  ["all", "git/gitconfig", ".gitconfig"],
  ["mac", "git/local.mac", ".local-gitconfig"],
  ["wsl", "git/local.wsl", ".local-gitconfig"],

  // --- ssh (client POLICY only; the host inventory stays machine-local) ---
  // ssh/config Includes ~/.ssh/config.local FIRST, and that file holds HostName/Port/User — a
  // tailnet map that must never enter this PUBLIC repo. A missing config.local is not an error
  // (ssh -G still resolves, exit 0), so a fresh clone links cleanly and simply has no hosts yet.
  // The smart-open attach file is linked separately: it needs OpenSSH >= 9.9 (linkSshAttach).
  ["all", "ssh/config", ".ssh/config"],

  // --- tmux / herdr (herdr: the config file only — ~/.config/herdr/ also holds live sockets) ---
  ["all", "tmux/tmux.conf", ".tmux.conf"],
  ["all", "herdr/config.toml", ".config/herdr/config.toml"],

  // --- claude code (user-level config; the repo's own project .claude/ is separate) ---
  [
    "all",
    "agents/claude/statusline-command.ts",
    ".claude/statusline-command.ts",
  ],
  ["all", "agents/claude/hooks", ".claude/hooks"],
  ["all", "agents/claude/CLAUDE.md", ".claude/CLAUDE.md"],
  ["all", "agents/claude/keybindings.json", ".claude/keybindings.json"],
  // Per-file, NOT the whole ~/.claude/agents dir — that directory also holds an unrelated
  // personal agent this repo does not own. Each Claude row of the dispatch roster is its own link.
  [
    "all",
    "agents/claude/agents/sonnet-high.md",
    ".claude/agents/sonnet-high.md",
  ],
  [
    "all",
    "agents/claude/agents/opus-medium.md",
    ".claude/agents/opus-medium.md",
  ],
  [
    "all",
    "agents/claude/agents/sonnet-medium.md",
    ".claude/agents/sonnet-medium.md",
  ],

  // --- third-party skill provenance ledger ---
  // `bunx skills add -g` records where each vendored skill came from in ~/.agents/.skill-lock.json,
  // one level ABOVE ~/.agents/skills, so without this link the provenance would never be committed.
  // Measured: the CLI writes THROUGH this symlink and leaves it intact.
  ["all", "agents/skills-lock.json", ".agents/.skill-lock.json"],

  // --- codex (user-level hooks; AGENTS.md / prompts / skills fan out via link:skills) ---
  ["all", "agents/codex/hooks.json", ".codex/hooks.json"],
  ["all", "agents/codex/hooks", ".codex/hooks"],

  // --- vendor-neutral hooks (the hook analogue of ~/.agents/skills) ---
  // hooks.toml there is wired into BOTH agents/claude/settings.json and agents/codex/hooks.json by
  // `mise run hooks:wire`, and both call them through this one path.
  ["all", "agents/hooks", ".agents/hooks"],

  // NOTE for every systemd unit below: `systemctl --user disable <unit>` DELETES the symlink placed
  // in ~/.config/systemd/user/ (systemd treats any symlink in the unit path as an enablement link),
  // so a disable leaves the unit `not-found`, not `disabled`. Re-run `mise run link:dots` after one.
  //
  // --- cocoindex-code (declarative global settings = no interactive `ccc init`) ---
  [
    "all",
    "cocoindex/global_settings.yml",
    ".cocoindex_code/global_settings.yml",
  ],
  // The daemon needs a systemd owner or it is spawned uncapped by whichever client calls first.
  // Linking the unit also arms the client-side guard in zsh/zshenv. Activate: mise run wsl:ccc-daemon
  [
    "wsl",
    "cocoindex/ccc-daemon.service.wsl",
    ".config/systemd/user/ccc-daemon.service",
  ],
  [
    "wsl",
    "cocoindex/repo-retrieve-rerank.socket.wsl",
    ".config/systemd/user/repo-retrieve-rerank.socket",
  ],
  [
    "wsl",
    "cocoindex/repo-retrieve-rerank.service.wsl",
    ".config/systemd/user/repo-retrieve-rerank.service",
  ],
  [
    "wsl",
    "wsl/wsl-capacity-recover.service.wsl",
    ".config/systemd/user/wsl-capacity-recover.service",
  ],
  [
    "wsl",
    "wsl/wsl-capacity-recover.timer.wsl",
    ".config/systemd/user/wsl-capacity-recover.timer",
  ],

  // --- update steps, process monitor, jj ---
  ["all", "topgrade/topgrade.toml", ".config/topgrade.toml"],
  ["all", "bottom/bottom.toml", ".config/bottom/bottom.toml"],
  ["all", "jj/config.toml", ".config/jj/config.toml"],

  // --- lazygit (config dir differs by OS) ---
  [
    "mac",
    "lazygit/config.yml",
    "Library/Application Support/lazygit/config.yml",
  ],
  ["not-mac", "lazygit/config.yml", ".config/lazygit/config.yml"],

  // --- karabiner (whole directory; a real one is moved aside only under --force) ---
  ["mac", "karabiner", ".config/karabiner"],

  // --- smart-open receiver (macOS: the machine you sit at; opens URLs forwarded from remote `o`) ---
  [
    "mac",
    "smart-open/smart-open-receiver.plist.mac",
    "Library/LaunchAgents/dotfiles.smart-open-receiver.plist",
  ],
];

// WSL system config under /etc: needs root, so sudo is attempted only when a link is missing (a
// pull must not re-prompt). Symlinks, not copies: each reader follows links fine.
// .wslconfig is NOT here on purpose: the Windows-side WSL service cannot follow a WSL symlink, so
// it is COPIED by `mise run wsl:wslconfig` (scripts/wsl-wslconfig.ts).
const ETC_LINKS: readonly (readonly [string, string, string])[] = [
  ["wsl/wsl.conf", "/etc/wsl.conf", "restart the distro"],
  // 50- so it applies after the distro's own 10-* drop-ins and before 99-sysctl.conf.
  ["wsl/sysctl.conf", "/etc/sysctl.d/50-dotfiles.conf", "sudo sysctl --system"],
  // Lets the newest ssh connection re-bind smart-open's forwarded socket.
  [
    "wsl/sshd-dotfiles.conf",
    "/etc/ssh/sshd_config.d/50-dotfiles.conf",
    "sudo systemctl reload ssh",
  ],
];

// Prune: a link this script USED to create keeps pointing into the repo after the source is
// renamed or deleted. Only symlinks INTO this repo that no longer resolve are removed — foreign or
// healthy links are never touched. EVERY directory linked into is swept: until 2026-09-10 only
// ~/.claude was, and retiring mcp-reaper left dead links in ~/.local/bin and the systemd dir.
// A new destination directory needs a line here.
const PRUNE_DIRS = [
  ".claude",
  ".claude/agents",
  ".local/bin",
  ".config/systemd/user",
  ".codex",
  ".config",
  ".ssh/config.d",
] as const;

// Retired destinations: links that still RESOLVE but must not exist (the dangling prune cannot see
// them). Until 2026-09-13 three .ts CLIs were hand-symlinked into ~/.local/bin; they are now
// package.json `bin` entries that `bun link` (mise run deps) installs into ~/.bun/bin.
const RETIRED = [
  ".local/bin/repo-search",
  ".local/bin/agent-resource-run",
  ".local/bin/serena-foreground",
] as const;

class UsageError extends Error {}

// Cleye 2.6.0's strictFlags misses --__proto__; reject that prototype-sensitive name before
// assignment. Every ordinary unknown remains Cleye strictFlags' responsibility.
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`unknown flag(s): --${flag}`);
  }
}

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

function drift(ctx: Ctx, line: string): void {
  ctx.drift.push(line);
  say(`drift: ${line}`);
}

/** The raw target of a symlink (never resolved); null when p is not a symlink or is absent. */
function readLink(p: string): string | null {
  const st = lstatSync(p, { throwIfNoEntry: false });
  return st?.isSymbolicLink() === true ? readlinkSync(p) : null;
}

function isDir(p: string): boolean {
  return statSync(p, { throwIfNoEntry: false })?.isDirectory() === true;
}

function whatIs(p: string): string {
  const target = readLink(p);
  if (target !== null) return target;
  return existsSync(p) ? "a real file" : "nothing";
}

const WHEN: Record<When, readonly Os[]> = {
  all: ["mac", "wsl", "linux"],
  mac: ["mac"],
  wsl: ["wsl"],
  linux: ["linux"],
  "not-mac": ["wsl", "linux"],
};

export function applies(when: When, os: Os): boolean {
  return WHEN[when].includes(os);
}

/** Link <repo-relative source> to an absolute destination, honoring the mode. */
export function link(ctx: Ctx, rel: string, dst: string): void {
  const src = join(ctx.dotfiles, rel);
  if (!existsSync(src)) {
    say(`skip (missing): ${src}`);
    return;
  }
  if (readLink(dst) === src) return;
  if (ctx.mode === "check") {
    drift(ctx, `${dst} (want -> ${src}; have ${whatIs(dst)})`);
    return;
  }
  const st = lstatSync(dst, { throwIfNoEntry: false });
  if (st?.isSymbolicLink() === true) unlinkSync(dst);
  else if (st !== undefined && !moveAside(ctx, dst)) return;
  mkdirSync(dirname(dst), { recursive: true });
  symlinkSync(src, dst);
  say(`linked: ${dst} -> ${src}`);
}

// A real file or directory where a link belongs. SAFE leaves it; --force MOVES it to
// <dst>.pre-dotfiles, never deletes it: the .sh unlinked files and `rm -rf`ed a real karabiner dir,
// so a --force on a hand-edited config was unrecoverable. An existing backup is never overwritten.
function moveAside(ctx: Ctx, dst: string): boolean {
  const backup = `${dst}.pre-dotfiles`;
  if (ctx.mode === "safe") {
    say(`skip (exists, not symlink): ${dst}`);
    return false;
  }
  if (lstatSync(backup, { throwIfNoEntry: false }) !== undefined) {
    say(
      `skip (exists, and ${backup} is taken — compare and remove one by hand): ${dst}`,
    );
    return false;
  }
  renameSync(dst, backup);
  say(`moved aside: ${dst} -> ${backup}`);
  return true;
}

/** OpenSSH >= 9.9 parses `Match sessiontype` / `Match command`; older clients die on them. */
export function sshSupportsAttachMatch(sshV: string): boolean {
  const m = /OpenSSH_(\d+)\.(\d+)/u.exec(sshV);
  if (m === null) return false;
  return Number(m[1]) * 100 + Number(m[2]) >= 909;
}

function sshVersion(): string {
  if (Bun.which("ssh") === null) return "no ssh client";
  const r = Bun.spawnSync(["ssh", "-V"], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  return `${r.stderr.toString()}${r.stdout.toString()}`.trim();
}

// The smart-open attach forward uses Match keywords OpenSSH added in 9.9; an older client treats
// them as a FATAL parse error and every ssh fails (see ssh/config). Link it only where they parse;
// on an older client a leftover link into the repo is drift (it breaks ssh), not a harmless extra.
export function linkSshAttach(ctx: Ctx, sshV: string): void {
  const dst = join(ctx.home, ".ssh/config.d/smart-open-attach.conf");
  if (sshSupportsAttachMatch(sshV)) {
    link(ctx, "ssh/smart-open-attach.conf", dst);
    return;
  }
  const target = readLink(dst);
  if (target === null || !target.startsWith(`${ctx.dotfiles}/`)) return;
  if (ctx.mode === "check") {
    drift(ctx, `${dst} (needs OpenSSH >= 9.9; this client: ${sshV})`);
    return;
  }
  unlinkSync(dst);
  say(`removed (ssh < 9.9): ${dst}`);
}

// ~/.ssh must exist and be 700 before ssh reads anything in it; unlike ~/.config the linker cannot
// assume a fresh machine has it.
function ensureSshDir(ctx: Ctx): void {
  const dir = join(ctx.home, ".ssh");
  if (ctx.mode === "check" || isDir(dir)) return;
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);
}

function linkEtc(ctx: Ctx, rel: string, dst: string, apply: string): void {
  const src = join(ctx.dotfiles, rel);
  if (readLink(dst) === src) return;
  if (ctx.mode === "check") {
    drift(ctx, `${dst} (want -> ${src})`);
    return;
  }
  // bounded: sudo may wait for a password typed at this terminal; a timeout would cut the human off.
  const r = Bun.spawnSync(["sudo", "ln", "-sfn", src, dst], {
    stdin: "inherit",
    stdout: "ignore",
    stderr: "ignore",
  });
  say(
    r.exitCode === 0
      ? `linked: ${dst} -> ${src} (sudo) — apply: ${apply}`
      : `skip: ${dst} needs root — run: sudo ln -sfn ${src} ${dst}, then ${apply}`,
  );
}

// settings.json is GENERATED, not linked — forced: `autoMode` is read from user settings ONLY and
// its content is machine- and repo-specific, so a symlink at this PUBLIC repo meant publishing a
// private project's paths. Committed base + untracked ~/.claude/settings.private.json, merged by
// the zero-dependency renderer (it runs before `mise run deps` on a fresh machine).
function renderSettings(ctx: Ctx): void {
  const r = Bun.spawnSync(
    [process.execPath, join(ctx.dotfiles, "scripts/render-claude-settings.ts")],
    {
      stdout: "inherit",
      stderr: "inherit",
      timeout: 60_000,
      env: { ...process.env, HOME: ctx.home, DOTFILES: ctx.dotfiles },
    },
  );
  if (r.exitCode !== 0)
    process.stderr.write(
      "warn: settings render failed — ~/.claude/settings.json left as-is\n",
    );
}

function loadSmartOpenReceiver(ctx: Ctx): void {
  const uid = process.getuid?.();
  if (uid === undefined) return;
  const label = "dotfiles.smart-open-receiver";
  const loaded = Bun.spawnSync(["launchctl", "print", `gui/${uid}/${label}`], {
    stdout: "ignore",
    stderr: "ignore",
    timeout: 10_000,
  });
  if (loaded.exitCode === 0) return;
  const plist = join(ctx.home, "Library/LaunchAgents", `${label}.plist`);
  const r = Bun.spawnSync(["launchctl", "bootstrap", `gui/${uid}`, plist], {
    timeout: 10_000,
  });
  say(
    r.exitCode === 0
      ? `loaded: ${label} (launchd)`
      : `warn: launchctl bootstrap ${label} failed (exit ${r.exitCode})`,
  );
}

function pruneOne(ctx: Ctx, p: string, retired: boolean): void {
  const target = readLink(p);
  if (target === null || !target.startsWith(`${ctx.dotfiles}/`)) return;
  if (!retired && existsSync(p)) return;
  const why = retired
    ? "retired: now a package bin"
    : "dangling link into the repo";
  if (ctx.mode === "check") {
    drift(ctx, `${p} (${why})`);
    return;
  }
  unlinkSync(p);
  say(`pruned (${why}): ${p}`);
}

export function prune(ctx: Ctx): void {
  for (const rel of PRUNE_DIRS) {
    const dir = join(ctx.home, rel);
    const names = isDir(dir) ? readdirSync(dir) : [];
    for (const name of names) pruneOne(ctx, join(dir, name), false);
  }
  for (const rel of RETIRED) pruneOne(ctx, join(ctx.home, rel), true);
}

// Every prune decision is "a dangling link whose target starts with <dotfiles>/", so the root must
// be THIS checkout, absolute — a relative or foreign DOTFILES would aim the prune at the wrong tree.
// Checked before anything is touched.
export function assertRoots(home: string, dotfiles: string): void {
  if (!isAbsolute(home)) throw new Error(`HOME is not absolute: "${home}"`);
  if (!isAbsolute(dotfiles))
    throw new Error(`DOTFILES is not absolute: "${dotfiles}"`);
  if (!existsSync(join(dotfiles, "scripts/link-dots.ts")))
    throw new Error(
      `DOTFILES is not a dotfiles checkout (no scripts/link-dots.ts): ${dotfiles}`,
    );
}

function detectOs(): Os {
  if (process.platform === "darwin") return "mac";
  if (process.platform !== "linux")
    throw new Error(`unsupported platform: ${process.platform}`);
  // Same test as zsh/aliases.zsh: the WSL kernel names itself in `uname -r`.
  return /microsoft/iu.test(release()) ? "wsl" : "linux";
}

export function linkAll(ctx: Ctx, sshV: string): void {
  ensureSshDir(ctx);
  for (const [when, src, dst] of LINKS) {
    if (applies(when, ctx.os)) link(ctx, src, join(ctx.home, dst));
  }
  linkSshAttach(ctx, sshV);
  if (ctx.os === "wsl") {
    for (const [src, dst, apply] of ETC_LINKS) linkEtc(ctx, src, dst, apply);
  }
  prune(ctx);
}

function main(): void {
  const parsed = cli(
    {
      name: "link-dots.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Create the dotfile symlinks this repo declares (SAFE by default).",
      },
      flags: {
        force: {
          type: Boolean,
          default: false,
          description: "replace a regular file with its symlink",
        },
        check: {
          type: Boolean,
          default: false,
          description: "read-only: print drift, exit 1 if any",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0)
    throw new UsageError(`unexpected positional argument: ${parsed._[0]}`);
  if (parsed.flags.force && parsed.flags.check)
    throw new UsageError("--force and --check are mutually exclusive");
  const home = process.env.HOME ?? homedir();
  // Empty counts as unset, like the .sh's ${DOTFILES:-…} (callers export DOTFILES= in places).
  const envDotfiles = process.env.DOTFILES;
  const mode: Mode = parsed.flags.check ? "check" : "safe";
  const ctx: Ctx = {
    home,
    dotfiles:
      envDotfiles === undefined || envDotfiles === ""
        ? join(home, "dotfiles")
        : envDotfiles,
    os: detectOs(),
    mode: parsed.flags.force ? "force" : mode,
    drift: [],
  };
  assertRoots(ctx.home, ctx.dotfiles);
  linkAll(ctx, sshVersion());
  if (ctx.mode === "check") {
    say(`check: ${ctx.drift.length} drift(s)`);
    process.exitCode = ctx.drift.length > 0 ? 1 : 0;
    return;
  }
  renderSettings(ctx);
  if (ctx.os === "mac") loadSmartOpenReceiver(ctx);
  say("done.");
}

if (import.meta.main) {
  const r = await attempt(main);
  if (!r.ok) {
    const usage = r.error instanceof UsageError;
    const msg = errorMessage(r.error);
    process.stderr.write(
      usage
        ? `${msg}\nUsage: bun scripts/link-dots.ts [--force | --check]\n`
        : `FATAL: ${msg}\n`,
    );
    process.exitCode = 2;
  }
}
