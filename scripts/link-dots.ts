// `mise run link:dots` — realizes the dotfile links (macOS, WSL, plain Linux) declared in
// scripts/config-registry.ts (LINKS, ETC_LINKS, RETIRED, TOOL_OWNED), then renders the generated half
// of $HOME. Do not duplicate link lists anywhere else; add a link to LINKS there. Layout is topic-first:
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
  writeFileSync,
} from "node:fs";
import { homedir, release } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import {
  ETC_LINKS,
  LINKS,
  RETIRED,
  TOOL_OWNED,
  type When,
} from "./config-registry.ts";

type Os = "mac" | "wsl" | "linux";
type Mode = "safe" | "force" | "check";
export type Ctx = {
  home: string;
  dotfiles: string;
  os: Os;
  mode: Mode;
  drift: string[];
};

// Prune: a link this script USED to create keeps pointing into the repo after the source is
// renamed or deleted. Only symlinks INTO this repo that no longer resolve are removed — foreign or
// healthy links are never touched. EVERY directory linked into is swept: until 2026-09-10 only
// ~/.claude was, and retiring mcp-reaper left dead links in ~/.local/bin and the systemd dir.
// A new destination directory needs a line here.
const PRUNE_DIRS = [
  ".config/git",
  ".config/jj/conf.d",
  ".claude",
  ".claude/agents",
  ".local/bin",
  ".config/systemd/user",
  ".codex",
  ".config",
  ".ssh/config.d",
] as const;

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

// The generated half of $HOME (settings.json, codex hooks.json, CLAUDE.md) is RENDERED, not linked:
// each is a function of several declarations plus machine facts, and a symlink can point at only
// one of them. scripts/render-home.ts is zero-dependency (it runs before `mise run deps` on a fresh
// machine) and all-or-nothing (a bad input leaves every deployed file as it was).
function renderHome(ctx: Ctx): void {
  const r = Bun.spawnSync(
    [process.execPath, join(ctx.dotfiles, "scripts/render-home.ts")],
    {
      stdout: "inherit",
      stderr: "inherit",
      timeout: 60_000,
      env: { ...process.env, HOME: ctx.home, DOTFILES: ctx.dotfiles },
    },
  );
  if (r.exitCode !== 0)
    process.stderr.write(
      "warn: render-home failed — every rendered file in $HOME left as-is\n",
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
    ? "retired: no longer declared (see RETIRED)"
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
export function assertRoots(home: string, dotfiles: string): Error | undefined {
  if (!isAbsolute(home)) return new Error(`HOME is not absolute: "${home}"`);
  if (!isAbsolute(dotfiles))
    return new Error(`DOTFILES is not absolute: "${dotfiles}"`);
  if (!existsSync(join(dotfiles, "scripts/link-dots.ts"))) {
    return new Error(
      `DOTFILES is not a dotfiles checkout (no scripts/link-dots.ts): ${dotfiles}`,
    );
  }
  return undefined;
}

function detectOs(): Os | Error {
  if (process.platform === "darwin") return "mac";
  if (process.platform !== "linux")
    return new Error(`unsupported platform: ${process.platform}`);
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
  for (const rel of TOOL_OWNED) ensureToolOwned(ctx, join(ctx.home, rel));
}

/** A real file the tool may write; an empty one when missing. Runs after prune, which removes a
 * retired link here first. A foreign symlink is reported, never replaced. */
export function ensureToolOwned(ctx: Ctx, p: string): void {
  const st = lstatSync(p, { throwIfNoEntry: false });
  if (st?.isFile() === true) return;
  if (st !== undefined) {
    if (ctx.mode === "check")
      drift(ctx, `${p} (want a real tool-owned file; have ${whatIs(p)})`);
    else
      say(
        `skip (tool-owned path is ${whatIs(p)}, not a file — fix by hand): ${p}`,
      );
    return;
  }
  if (ctx.mode === "check") {
    drift(ctx, `${p} (want a real tool-owned file; have nothing)`);
    return;
  }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, "");
  say(`created (tool-owned, empty): ${p}`);
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(
      `Unknown option '--${flag}'\nUsage: bun scripts/link-dots.ts\n`,
    );
    process.exit(2);
  }
}

function main(): Error | void {
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
    return new Error(`unexpected positional argument: ${parsed._[0]}`);
  if (parsed.flags.force && parsed.flags.check)
    return new Error("--force and --check are mutually exclusive");
  const home = process.env.HOME ?? homedir();
  // Empty counts as unset, like the .sh's ${DOTFILES:-…} (callers export DOTFILES= in places).
  const envDotfiles = process.env.DOTFILES;
  const mode: Mode = parsed.flags.check ? "check" : "safe";
  const detectedOs = detectOs();
  if (detectedOs instanceof Error) return detectedOs;
  const ctx: Ctx = {
    home,
    dotfiles:
      envDotfiles === undefined || envDotfiles === ""
        ? join(home, "dotfiles")
        : envDotfiles,
    os: detectedOs,
    mode: parsed.flags.force ? "force" : mode,
    drift: [],
  };
  const rootsError = assertRoots(ctx.home, ctx.dotfiles);
  if (rootsError !== undefined) return rootsError;
  linkAll(ctx, sshVersion());
  if (ctx.mode === "check") {
    say(`check: ${ctx.drift.length} drift(s)`);
    process.exitCode = ctx.drift.length > 0 ? 1 : 0;
    return;
  }
  renderHome(ctx);
  if (ctx.os === "mac") loadSmartOpenReceiver(ctx);
  say("done.");
}

if (import.meta.main) {
  const r = await attempt(main);
  if (!r.ok) {
    const msg = errorMessage(r.error);
    process.stderr.write(`FATAL: ${msg}\n`);
    process.exitCode = 2;
  } else if (r.value instanceof Error) {
    const msg = r.value.message;
    const usage =
      msg.startsWith("unknown flag(s):") ||
      msg.startsWith("unexpected positional") ||
      msg === "--force and --check are mutually exclusive";
    process.stderr.write(
      usage
        ? `${msg}\nUsage: bun scripts/link-dots.ts [--force | --check]\n`
        : `FATAL: ${msg}\n`,
    );
    process.exitCode = 2;
  }
}
