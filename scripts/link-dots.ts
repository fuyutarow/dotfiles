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
// Exit: 0 done / no drift · 1 drift or unreachable links · 2 FATAL or usage error.

import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  readFileSync,
  renameSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { access, lstat, realpath } from "node:fs/promises";
import { hostname, homedir, release } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { deployCccDaemon } from "../cocoindex/deploy-daemon.ts";
import { renderRefusal } from "./render-source.ts";
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
  changedLinks?: Set<string>;
  unreachable?: Set<string>;
  failures?: Error[];
};

const unreachableError = z.object({
  code: z.enum(["ENODEV", "ENOTCONN", "EIO", "ESTALE"]),
  path: z.string().optional(),
});

/** A stale optional filesystem must not prevent unrelated links or units from deploying. */
function withReachablePath(ctx: Ctx, path: string, apply: () => void): void {
  if (
    [...(ctx.unreachable ?? [])].some(
      (root) => path === root || path.startsWith(`${root}${sep}`),
    )
  )
    return;
  const result = fromThrowable(apply)();
  if (result.isOk()) return;
  const parsed = unreachableError.safeParse(result.error);
  if (!parsed.success) {
    ctx.failures ??= [];
    ctx.failures.push(new Error(errorMessage(result.error)));
    return;
  }
  const failedPath = parsed.data.path ?? path;
  ctx.unreachable ??= new Set();
  if (ctx.unreachable.has(failedPath)) return;
  ctx.unreachable.add(failedPath);
  process.stderr.write(
    `skip (unreachable ${parsed.data.code}): ${failedPath}; repair: mise run wsl:drive-mount && sudo mount /mnt/g\n`,
  );
  if (ctx.mode === "check")
    drift(ctx, `${failedPath} (unreachable ${parsed.data.code})`);
}

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
  withReachablePath(ctx, dst, () => {
    const src = join(ctx.dotfiles, rel);
    if (!existsSync(src)) {
      say(`skip (missing): ${src}`);
      return;
    }
    linkTarget(ctx, src, dst);
  });
}

function linkTarget(ctx: Ctx, src: string, dst: string): void {
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
  ctx.changedLinks?.add(dst);
  say(`linked: ${dst} -> ${src}`);
}

/** Resolve Drive without persisting the user's Google account folder name. */
type DriveCache = {
  version: 1;
  host: string;
  root: string;
  personal: string | null;
};
const driveCacheSchema = jsonOf(
  z.object({
    version: z.literal(1),
    host: z.string(),
    root: z.string(),
    personal: z.string().nullable(),
  }),
);

const DRIVE_MAX_DEPTH = 6;
const DRIVE_MAX_DISCOVERY_MS = 15_000;

function driveCachePath(home: string): string {
  const host = hostname().replaceAll(/[^a-zA-Z0-9._-]/gu, "_");
  return join(home, ".local/state/dotfiles", `google-drive-${host}.json`);
}

function readDriveCache(path: string): DriveCache | undefined {
  const text = fromThrowable(() => readFileSync(path, "utf8"))();
  if (text.isErr()) return undefined;
  const parsed = driveCacheSchema.safeParse(text.value);
  return parsed.success && parsed.data.host === hostname()
    ? parsed.data
    : undefined;
}

function writeDriveCache(
  path: string,
  root: string,
  personal: string | undefined,
): void {
  fromThrowable(() => {
    mkdirSync(dirname(path), { recursive: true });
    const value: DriveCache = {
      version: 1,
      host: hostname(),
      root,
      personal: personal ?? null,
    };
    const temp = `${path}.${randomUUID()}.tmp`;
    writeFileSync(temp, `${JSON.stringify(value)}\n`, { mode: 0o600 });
    renameSync(temp, path);
  })();
}

function cachedWslDriveTargets(
  home: string,
  root: string,
  cachePath: string,
  maxDiscoveryMs: number,
  persistCache: boolean,
): { root?: string; personal?: string } {
  const cached = readDriveCache(cachePath);
  if (cached !== undefined) {
    const rootResolves = isDir(cached.root);
    const personalResolves = cached.personal === null || isDir(cached.personal);
    if (rootResolves && personalResolves) {
      return {
        root: cached.root,
        ...(cached.personal === null ? {} : { personal: cached.personal }),
      };
    }
  }

  if (!isDir(root)) return {};

  // Existing links are the previous successful discovery receipt. Promote it into the cache so
  // hosts already deployed before this cache existed do not repeat the expensive Drive walk.
  const linkedPersonal = readLink(join(home, "Personal-Drive"));
  const relativeTarget =
    linkedPersonal === null
      ? undefined
      : relative(resolve(root), resolve(linkedPersonal));
  if (
    linkedPersonal !== null &&
    isAbsolute(linkedPersonal) &&
    isDir(linkedPersonal) &&
    relativeTarget !== undefined &&
    (relativeTarget === "" ||
      (!isAbsolute(relativeTarget) &&
        relativeTarget !== ".." &&
        !relativeTarget.startsWith(`..${sep}`)))
  ) {
    if (persistCache) writeDriveCache(cachePath, root, linkedPersonal);
    return { root, personal: linkedPersonal };
  }

  const myDrive = join(root, "My Drive");
  if (!isDir(myDrive)) {
    if (persistCache) writeDriveCache(cachePath, root, undefined);
    return { root };
  }

  say(
    `discover Google Drive Personal-Drive: waiting on drvfs directory metadata under My Drive (depth ≤ ${DRIVE_MAX_DEPTH}, time ≤ ${maxDiscoveryMs / 1000}s)`,
  );
  const start = performance.now();
  const pending: { dir: string; depth: number }[] = [
    { dir: myDrive, depth: 0 },
  ];
  let next = 0;
  let personal: string | undefined;
  while (next < pending.length && performance.now() - start < maxDiscoveryMs) {
    const current = pending[next];
    next += 1;
    if (current === undefined || current.depth > DRIVE_MAX_DEPTH) continue;
    const listed = fromThrowable(() =>
      readdirSync(current.dir, { withFileTypes: true }),
    )();
    if (listed.isErr()) continue;
    const directories = listed.value.filter((entry) => entry.isDirectory());
    const target = directories.find((entry) => entry.name === "Personal-Drive");
    if (target !== undefined) {
      personal = join(current.dir, target.name);
      break;
    }
    if (current.depth < DRIVE_MAX_DEPTH)
      pending.push(
        ...directories.map((entry) => ({
          dir: join(current.dir, entry.name),
          depth: current.depth + 1,
        })),
      );
  }
  if (personal === undefined && performance.now() - start >= maxDiscoveryMs)
    say(
      `Google Drive discovery stopped at its ${maxDiscoveryMs / 1000}s time limit`,
    );
  if (persistCache) writeDriveCache(cachePath, root, personal);
  return { root, ...(personal === undefined ? {} : { personal }) };
}

export function googleDriveTargets(
  home: string,
  os: Os,
  options: {
    wslRoot?: string;
    cachePath?: string;
    maxDiscoveryMs?: number;
    persistCache?: boolean;
  } = {},
): { root?: string; personal?: string } {
  let root: string | undefined;
  if (os === "mac") {
    const cloud = join(home, "Library/CloudStorage");
    const matches = existsSync(cloud)
      ? readdirSync(cloud)
          .filter((name) => name.startsWith("GoogleDrive-"))
          .map((name) => join(cloud, name))
          .filter((path) => isDir(path))
      : [];
    if (matches.length === 1) root = matches[0];
  } else if (os === "wsl") {
    root = options.wslRoot ?? "/mnt/g";
    return cachedWslDriveTargets(
      home,
      root,
      options.cachePath ?? driveCachePath(home),
      options.maxDiscoveryMs ?? DRIVE_MAX_DISCOVERY_MS,
      options.persistCache ?? true,
    );
  }
  if (root === undefined) return {};

  const myDrive = join(root, "My Drive");
  const found: string[] = [];
  const visit = (dir: string, depth: number): void => {
    if (depth > 6 || found.length > 1) return;
    const listed = fromThrowable(() =>
      readdirSync(dir, { withFileTypes: true }),
    )();
    if (listed.isErr()) return;
    for (const entry of listed.value) {
      if (!entry.isDirectory()) continue;
      const child = join(dir, entry.name);
      if (entry.name === "Personal-Drive") found.push(child);
      else visit(child, depth + 1);
    }
  };
  if (isDir(myDrive)) visit(myDrive, 0);
  return {
    root,
    ...(found.length === 1 ? { personal: found[0] } : {}),
  };
}

export function linkGoogleDrive(ctx: Ctx): void {
  if (ctx.os === "linux") return;
  withReachablePath(
    ctx,
    ctx.os === "wsl" ? "/mnt/g" : join(ctx.home, "Library/CloudStorage"),
    () => {
      const targets = googleDriveTargets(ctx.home, ctx.os, {
        persistCache: ctx.mode !== "check",
      });
      for (const [, source, name] of LINKS) {
        if (!source.startsWith("@google-drive/")) continue;
        const isRoot = source === "@google-drive/root";
        const token = isRoot ? "root" : "personal";
        const target = isRoot ? targets.root : targets.personal;
        const dst = join(ctx.home, name);
        if (target === undefined) {
          reportDriveUnavailable(ctx, dst, token);
          continue;
        }
        withReachablePath(ctx, dst, () => {
          linkTarget(ctx, target, dst);
        });
      }
    },
  );
}

function reportDriveUnavailable(ctx: Ctx, dst: string, token: string): void {
  if (ctx.mode === "check") {
    drift(
      ctx,
      `${dst} (Google Drive ${token} target unavailable or ambiguous)`,
    );
    return;
  }
  say(`skip (Google Drive ${token} unavailable or ambiguous): ${dst}`);
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
function renderHome(ctx: Ctx, fromWorkingCopy: boolean): Error | undefined {
  const r = Bun.spawnSync(
    [process.execPath, join(ctx.dotfiles, "scripts/render-home.ts")],
    {
      stdout: "inherit",
      stderr: "inherit",
      timeout: 60_000,
      env: {
        ...process.env,
        HOME: ctx.home,
        DOTFILES: ctx.dotfiles,
        DOTFILES_RENDER_FROM_WORKING_COPY: fromWorkingCopy ? "1" : "0",
      },
    },
  );
  if (r.exitCode !== 0)
    return new Error("render-home failed; link:dots did not complete");
  return undefined;
}

type LaunchctlResult = { exitCode: number; stdout: string };
type LaunchctlRunner = (args: string[]) => LaunchctlResult;

function runLaunchctl(args: string[]): LaunchctlResult {
  const r = Bun.spawnSync(["launchctl", ...args], {
    stdout: "pipe",
    stderr: "ignore",
    timeout: 10_000,
  });
  return { exitCode: r.exitCode, stdout: r.stdout.toString() };
}

function plistProgramArguments(xml: string): string[] | undefined {
  const block =
    /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/u.exec(xml)?.[1];
  if (block === undefined) return undefined;
  return Array.from(
    block.matchAll(/<string>([\s\S]*?)<\/string>/gu),
    ([, value]) =>
      (value ?? "")
        .replaceAll("&quot;", '"')
        .replaceAll("&apos;", "'")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&amp;", "&"),
  );
}

function loadedProgramArguments(output: string): string[] | undefined {
  const block = /\barguments\s*=\s*\{([\s\S]*?)\}/u.exec(output)?.[1];
  if (block === undefined) return undefined;
  return block
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function loadSmartOpenReceiver(
  ctx: Ctx,
  run: LaunchctlRunner = runLaunchctl,
): void {
  if (ctx.os !== "mac") return;
  const uid = process.getuid?.();
  if (uid === undefined) return;
  const label = "dotfiles.smart-open-receiver";
  const plist = join(ctx.home, "Library/LaunchAgents", `${label}.plist`);
  const domain = `gui/${uid}`;
  const loaded = run(["print", `${domain}/${label}`]);
  const linkChanged = ctx.changedLinks?.has(plist) === true;
  const expected = existsSync(plist)
    ? plistProgramArguments(readFileSync(plist, "utf8"))
    : undefined;
  const actual = loadedProgramArguments(loaded.stdout);
  const argumentsChanged =
    loaded.exitCode === 0 &&
    expected !== undefined &&
    (actual === undefined ||
      JSON.stringify(actual) !== JSON.stringify(expected));

  if (loaded.exitCode === 0 && (linkChanged || argumentsChanged)) {
    const bootout = run(["bootout", `${domain}/${label}`]);
    if (bootout.exitCode !== 0) {
      say(`warn: launchctl bootout ${label} failed (exit ${bootout.exitCode})`);
      return;
    }
    const r = run(["bootstrap", domain, plist]);
    if (r.exitCode === 0) {
      const why = [
        linkChanged ? "plist link target changed" : undefined,
        argumentsChanged ? "program arguments changed" : undefined,
      ]
        .filter((reason) => reason !== undefined)
        .join("; ");
      say(`reloaded: ${label} (launchd; ${why})`);
    } else {
      say(
        `warn: launchctl bootstrap ${label} failed after reload (exit ${r.exitCode})`,
      );
    }
    return;
  }
  if (loaded.exitCode === 0) return;
  const r = run(["bootstrap", domain, plist]);
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
    withReachablePath(ctx, dir, () => {
      const names = isDir(dir) ? readdirSync(dir) : [];
      for (const name of names)
        withReachablePath(ctx, join(dir, name), () => {
          pruneOne(ctx, join(dir, name), false);
        });
    });
  }
  for (const rel of RETIRED)
    withReachablePath(ctx, join(ctx.home, rel), () => {
      pruneOne(ctx, join(ctx.home, rel), true);
    });
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
  withReachablePath(ctx, join(ctx.home, ".ssh"), () => {
    ensureSshDir(ctx);
  });
  for (const [when, src, dst] of LINKS) {
    if (src.startsWith("@google-drive/")) continue;
    if (applies(when, ctx.os)) link(ctx, src, join(ctx.home, dst));
  }
  linkGoogleDrive(ctx);
  withReachablePath(
    ctx,
    join(ctx.home, ".ssh/config.d/smart-open-attach.conf"),
    () => {
      linkSshAttach(ctx, sshV);
    },
  );
  if (ctx.os === "wsl") {
    for (const [src, dst, apply] of ETC_LINKS)
      withReachablePath(ctx, dst, () => {
        linkEtc(ctx, src, dst, apply);
      });
  }
  prune(ctx);
  for (const rel of TOOL_OWNED)
    withReachablePath(ctx, join(ctx.home, rel), () => {
      ensureToolOwned(ctx, join(ctx.home, rel));
    });
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

/** Snapshot before linkAll: an installed timer's inactivity is an intentional stop. */
export async function captureDeclaredTimers(ctx: Ctx) {
  if (ctx.os === "mac" || ctx.mode === "check") return [];
  return Promise.all(
    LINKS.filter(
      ([when, , destination]) =>
        applies(when, ctx.os) &&
        dirname(destination) === ".config/systemd/user" &&
        destination.endsWith(".timer"),
    ).map(async ([, source, destination]) => {
      const path = join(ctx.home, destination);
      // lstat counts dangling links and masks as installed too; never infer a new
      // installation from a missing target or from a changed symlink.
      const state = await attempt(() => lstat(path));
      const installed =
        state.ok ||
        !z.object({ code: z.literal("ENOENT") }).safeParse(state.error).success;
      if (!state.ok && installed) {
        ctx.failures ??= [];
        ctx.failures.push(
          new Error(`cannot inspect ${path}: ${errorMessage(state.error)}`),
        );
      }
      return {
        unit: destination.slice(destination.lastIndexOf("/") + 1),
        source,
        path,
        installed,
      };
    }),
  );
}

/** Enable every declared timer, activating only timers absent before this deploy. */
export async function deployDeclaredTimers(
  ctx: Ctx,
  timers: Awaited<ReturnType<typeof captureDeclaredTimers>>,
  probe = async (args: string[]) => {
    const child = Bun.spawn(["systemctl", "--user", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    const [out, err, code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    return { code, out: `${out}${err}`.trim() };
  },
  available?: boolean,
  report: (line: string) => void = say,
): Promise<Error | undefined> {
  if (ctx.os === "mac" || ctx.mode === "check") return undefined;
  const systemd =
    available ??
    (Bun.which("systemctl") !== null &&
      Bun.which("systemctl") !== undefined &&
      (await access("/run/systemd/system").then(
        () => true,
        () => false,
      )));
  if (!systemd) return undefined;
  const run = async (args: string[]) => {
    const result = await probe(args);
    return result.code === 0
      ? undefined
      : new Error(
          `systemctl --user ${args.join(" ")} failed (exit ${result.code}): ${result.out}; repair: mise run link:dots`,
        );
  };
  const reloadError = await run(["daemon-reload"]);
  if (reloadError !== undefined) return reloadError;
  for (const timer of timers) {
    const source = await realpath(join(ctx.dotfiles, timer.source)).catch(
      () => null,
    );
    const target = await realpath(timer.path).catch(() => null);
    if (source === null || target !== source)
      return new Error(
        `${timer.unit} is not the declared link; repair: mise run link:dots`,
      );
    const enableError = await run(["enable", timer.unit]);
    if (enableError !== undefined) return enableError;
    const active = await probe(["is-active", timer.unit]);
    if (active.code === 0) continue;
    if (active.code !== 3)
      return new Error(
        `systemctl --user is-active ${timer.unit} failed (exit ${active.code}): ${active.out}`,
      );
    if (timer.installed) {
      report(
        `left inactive: ${timer.unit} (already installed before deploy; user stop preserved)`,
      );
      continue;
    }
    const startError = await run(["start", timer.unit]);
    if (startError !== undefined) return startError;
    report(`started: ${timer.unit} (first installation)`);
  }
  return undefined;
}

/** Enable the registry-linked timer; activation belongs to deployDeclaredTimers. */
export async function deployWsGc(
  ctx: Ctx,
  probe = async (args: string[]) => {
    const child = Bun.spawn(["systemctl", "--user", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    const [out, err, code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    return { code, out: `${out}${err}`.trim() };
  },
  available?: boolean,
): Promise<Error | undefined> {
  if (ctx.os === "mac" || ctx.mode === "check") return undefined;
  const systemd =
    available ??
    (Bun.which("systemctl") !== null &&
      (await access("/run/systemd/system").then(
        () => true,
        () => false,
      )));
  if (!systemd) {
    say("skip: ws-gc (no systemd on this host)");
    return undefined;
  }
  for (const unit of ["ws-gc.service", "ws-gc.timer"]) {
    const target = await realpath(
      join(ctx.home, ".config/systemd/user", unit),
    ).catch(() => null);
    const source = await realpath(join(ctx.dotfiles, "systemd", unit)).catch(
      () => null,
    );
    if (source === null || target !== source)
      return new Error(
        `${unit} is not the declared link; repair: mise run link:dots`,
      );
  }
  for (const args of [["daemon-reload"], ["enable", "ws-gc.timer"]]) {
    const result = await probe(args);
    if (result.code !== 0)
      return new Error(
        `systemctl --user ${args.join(" ")} failed: ${result.out}; repair: mise run link:dots`,
      );
  }
  say("enabled: ws-gc.timer (hourly and after boot)");
  return undefined;
}

/** Enable the registry-linked timer; --check never talks to the user manager. */
export async function deployGpuSampler(
  ctx: Ctx,
  probe = async (args: string[]) => {
    const child = Bun.spawn(["systemctl", "--user", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    const [out, err, code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    return { code, out: `${out}${err}`.trim() };
  },
  available?: boolean,
): Promise<Error | undefined> {
  if (ctx.os === "mac" || ctx.mode === "check") return undefined;
  const systemd =
    available ??
    (Bun.which("systemctl") !== null &&
      (await access("/run/systemd/system").then(
        () => true,
        () => false,
      )));
  if (!systemd) {
    say("skip: gpu-sampler (no systemd on this host)");
    return undefined;
  }
  for (const unit of ["gpu-sampler.service", "gpu-sampler.timer"]) {
    const target = await realpath(
      join(ctx.home, ".config/systemd/user", unit),
    ).catch(() => null);
    const source = await realpath(join(ctx.dotfiles, "systemd", unit)).catch(
      () => null,
    );
    if (source === null || target !== source)
      return new Error(
        `${unit} is not the declared link; repair: mise run link:dots`,
      );
  }
  for (const args of [["daemon-reload"], ["enable", "gpu-sampler.timer"]]) {
    const result = await probe(args);
    if (result.code !== 0)
      return new Error(
        `systemctl --user ${args.join(" ")} failed: ${result.out}; repair: mise run link:dots`,
      );
  }
  say("enabled: gpu-sampler.timer (60s after completion and after boot)");
  return undefined;
}

/** Enable the registry-linked timer; --check never talks to the user manager. */
export async function deployStatuslineOwners(
  ctx: Ctx,
  probe = async (args: string[]) => {
    const child = Bun.spawn(["systemctl", "--user", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    });
    const [out, err, code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    return { code, out: `${out}${err}`.trim() };
  },
  available?: boolean,
): Promise<Error | undefined> {
  if (ctx.os === "mac" || ctx.mode === "check") return undefined;
  const systemd =
    available ??
    (Bun.which("systemctl") !== null &&
      (await access("/run/systemd/system").then(
        () => true,
        () => false,
      )));
  if (!systemd) {
    say("skip: statusline owners (no systemd on this host)");
    return undefined;
  }
  for (const unit of [
    "statusline-sampler.service",
    "statusline-sampler.timer",
    "agx-doctor.service",
    "agx-doctor.path",
  ]) {
    const target = await realpath(
      join(ctx.home, ".config/systemd/user", unit),
    ).catch(() => null);
    const source = await realpath(join(ctx.dotfiles, "systemd", unit)).catch(
      () => null,
    );
    if (source === null || target !== source)
      return new Error(
        `${unit} is not the declared link; repair: mise run link:dots`,
      );
  }
  for (const args of [
    ["daemon-reload"],
    ["enable", "statusline-sampler.timer"],
    ["enable", "--now", "agx-doctor.path"],
    ["start", "--no-block", "agx-doctor.service"],
  ]) {
    const result = await probe(args);
    if (result.code !== 0)
      return new Error(
        `systemctl --user ${args.join(" ")} failed (exit ${result.code}): ${result.out === "" ? "no output (systemctl may have timed out)" : result.out}; repair: mise run link:dots`,
      );
  }
  say(
    "enabled: statusline-sampler.timer (5s after completion; agx doctor follows its inputs)",
  );
  return undefined;
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(
      `Unknown option '--${flag}'\nUsage: bun scripts/link-dots.ts\n`,
    );
    process.exit(2);
  }
}

async function main(): Promise<Error | void> {
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
        fromWorkingCopy: {
          type: Boolean,
          default: false,
          description:
            "explicitly render local working-copy inputs (refused during deploy)",
        },
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
  // Empty counts as unset. Resolve the declaring checkout from the script, including workspaces.
  const envDotfiles = process.env.DOTFILES;
  const mode: Mode = parsed.flags.check ? "check" : "safe";
  const detectedOs = detectOs();
  if (detectedOs instanceof Error) return detectedOs;
  const ctx: Ctx = {
    home,
    dotfiles:
      envDotfiles === undefined || envDotfiles === ""
        ? join(import.meta.dir, "..")
        : envDotfiles,
    os: detectedOs,
    mode: parsed.flags.force ? "force" : mode,
    drift: [],
    changedLinks: new Set(),
  };
  const rootsError = assertRoots(ctx.home, ctx.dotfiles);
  if (rootsError !== undefined) return rootsError;
  if (ctx.mode !== "check") {
    const refused = await renderRefusal(
      ctx.dotfiles,
      parsed.flags.fromWorkingCopy,
      process.env.DOTFILES_RENDER_REV,
    );
    if (refused !== undefined) return refused;
  }
  const timers = await captureDeclaredTimers(ctx);
  if (ctx.failures?.[0] !== undefined) return ctx.failures[0];
  linkAll(ctx, sshVersion());
  if (ctx.failures?.[0] !== undefined) return ctx.failures[0];
  if (ctx.mode === "check") {
    say(`check: ${ctx.drift.length} drift(s)`);
    process.exitCode = ctx.drift.length > 0 ? 1 : 0;
    return;
  }
  const renderError = renderHome(ctx, parsed.flags.fromWorkingCopy);
  if (renderError !== undefined) return renderError;
  const gcError = await deployWsGc(ctx);
  if (gcError !== undefined) return gcError;
  const gpuSamplerError = await deployGpuSampler(ctx);
  if (gpuSamplerError !== undefined) return gpuSamplerError;
  const ownersError = await deployStatuslineOwners(ctx);
  if (ownersError !== undefined) return ownersError;
  const daemonError = deployCccDaemon(ctx);
  if (daemonError !== undefined) return daemonError;
  const timersError = await deployDeclaredTimers(ctx, timers);
  if (timersError !== undefined) return timersError;
  if (ctx.os === "mac") loadSmartOpenReceiver(ctx);
  const skipped = ctx.unreachable?.size ?? 0;
  say(skipped === 0 ? "done." : `done with ${skipped} unreachable path(s).`);
  process.exitCode = skipped > 0 ? 1 : 0;
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
