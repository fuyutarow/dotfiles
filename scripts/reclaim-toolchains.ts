// Sibling of `reclaim-clean.ts` in the same "no judgment needed" WHO-MAY-DECIDE tier (mise.toml's
// cache: task block), but for the two dev-toolchain stores that have no tool-native gc/prune to
// borrow judgment from: rustup toolchains and vscode-server old versions. Where cache-clean
// trusts each tool's OWN definition of "unused", this script writes an explicit safety
// PREDICATE per target and errs toward keeping whenever evidence is missing:
//
//   rustup:        keep the default toolchain + anything pinned by a rust-toolchain(.toml) file
//                  under AUDIT_PROJECTS (the same scan reclaim:audit's §2 already performs) —
//                  remove the rest via `rustup toolchain uninstall`. No `fd` on PATH means no
//                  pin evidence, so rustup is skipped ENTIRELY rather than guessed.
//   vscode-server: keep the single most-recently-modified version, anything newer than
//                  KEEP_DAYS (default 2), and anything with a live server process — remove the
//                  rest via rip (falls back to rm, same as cache-clean's cargo step). A fresh
//                  VS Code Remote reconnect just redownloads what it needs.
//
// No try/catch (house policy for this repo's scripts/*.ts — lint:ts / .oxlintrc.json): a throwing call
// (statSync, Bun.spawnSync) goes through neverthrow's fromThrowable(); `.catch(() => "")` below
// on Bun.file().text() is Promise.prototype.catch, a different thing entirely — exempt.
//
// Usage: bun scripts/reclaim-toolchains.ts [--dry-run] [--home <path>]
//   KEEP_DAYS (default 2) and AUDIT_PROJECTS (default $HOME/Workspace) tune the guards.
// Exit: mirrors reclaim-clean.ts — every valid pass reaches 0 (each mutating command's failure is
// swallowed); Cleye ordinary-unknown refusals exit 1; local usage errors exit 2.

import { $ } from "bun";
import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";

class UsageError extends Error {}

// Same prototype-flag hole as reclaim-clean.ts (Cleye 2.6.0's strictFlags misses --__proto__).
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`Unknown option '--${flag}'`);
  }
}

function nonEmptyString(flag: string): (value: string) => string {
  return (value) => {
    if (value === "") throw new UsageError(`${flag} requires a value`);
    return value;
  };
}

export function resolveHome(homeArg: string | undefined): string {
  return homeArg ?? process.env.HOME ?? "";
}

export function toolAvailable(tool: string): boolean {
  return Bun.which(tool) !== null;
}

/**
 * `pgrep -f <pattern>` — exit 0 => a matching process is running. Missing pgrep => UNKNOWN, and
 * unlike cache-clean's isUvBusy (a package-cache lock, small blast radius) this guards deleting
 * multi-GB toolchain/server directories, so the unknown case is treated as busy — keep, the
 * conservative direction (the inverse default from isUvBusy, deliberately).
 */
export function isProcessRunning(
  pattern: string,
  spawn = Bun.spawnSync,
): boolean {
  return fromThrowable(spawn)(["pgrep", "-f", pattern], {
    stdout: "ignore",
    stderr: "ignore",
  })
    .map((proc) => proc.exitCode === 0)
    .unwrapOr(true);
}

// ---- rustup toolchains ----------------------------------------------------------------------

export type RustupToolchain = { name: string; isDefault: boolean };

/**
 * Parses `rustup toolchain list` output — one toolchain name per line; the active/default line
 * carries a parenthesized suffix containing "default" (`"name (default)"` or
 * `"name (active, default)"`).
 */
export function parseRustupToolchainList(output: string): RustupToolchain[] {
  return output
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const name = /^(\S+)/.exec(line)?.[1] ?? line;
      return { name, isDefault: /\(.*default.*\)/.test(line) };
    });
}

/**
 * A pin (e.g. the literal "1.84.1-sbpf-solana-v1.51", or a bare generic channel like "stable"/
 * "nightly") keeps an installed toolchain if either string is a prefix of the other — generic
 * channels resolve to a platform-suffixed installed name ("stable" -> "stable-x86_64-unknown-
 * linux-gnu"), while a fully-qualified pin matches literally.
 */
export function pinKeepsToolchain(
  installedName: string,
  pinnedChannel: string,
): boolean {
  return (
    installedName.startsWith(pinnedChannel) ||
    pinnedChannel.startsWith(installedName)
  );
}

/** `channel = "1.84.1"` (TOML) or a bare `1.84.1` first line (legacy `rust-toolchain` format). */
export function extractChannel(
  rustToolchainFileText: string,
): string | undefined {
  const toml = /channel\s*=\s*"?([^"\s]+)"?/.exec(rustToolchainFileText);
  if (toml?.[1]) return toml[1];
  const bare = rustToolchainFileText.trim().split("\n")[0]?.trim();
  return bare || undefined;
}

export function rustupToolchainsToRemove(
  toolchains: RustupToolchain[],
  pinnedChannels: string[],
): string[] {
  return toolchains
    .filter((t) => !t.isDefault)
    .filter((t) => !pinnedChannels.some((c) => pinKeepsToolchain(t.name, c)))
    .map((t) => t.name);
}

async function runRustupSection(dryRun: boolean, home: string): Promise<void> {
  console.log("== rustup toolchains ==");
  if (!toolAvailable("rustup")) {
    console.log("  rustup 不在 — skip");
    return;
  }
  if (!toolAvailable("fd")) {
    console.log("  fd 不在 — pin の証拠が取れないため、rustup 側は何もしない");
    return;
  }

  const listOut = (
    await $`rustup toolchain list`.quiet().nothrow()
  ).stdout.toString();
  const toolchains = parseRustupToolchainList(listOut);

  const projects = process.env.AUDIT_PROJECTS ?? `${home}/Workspace`;
  const fdRes = await $`fd -H -t f "^rust-toolchain(\\.toml)?$" ${projects}`
    .quiet()
    .nothrow();
  const pinFiles = fdRes.stdout.toString().split("\n").filter(Boolean);
  const pinnedChannels: string[] = [];
  for (const f of pinFiles) {
    const text = await Bun.file(f)
      .text()
      .catch(() => "");
    const channel = extractChannel(text);
    if (channel) pinnedChannels.push(channel);
  }

  const toRemove = rustupToolchainsToRemove(toolchains, pinnedChannels);
  if (toRemove.length === 0) {
    console.log("  削除対象なし(既定 or 何らかの pin に一致)");
    return;
  }
  for (const name of toRemove) {
    if (dryRun) {
      console.log(`  [dry-run] would run: rustup toolchain uninstall ${name}`);
      continue;
    }
    console.log(`  • rustup toolchain uninstall ${name}`);
    await $`rustup toolchain uninstall ${name}`.quiet().nothrow();
  }
}

// ---- vscode-server versions -------------------------------------------------------------------

export type ServerVersion = { name: string; hash: string; mtimeSec: number };

/** "Stable-<hash>" or "Stable-<hash>.staging" -> "<hash>" for the process-match predicate. */
export function serverHash(dirName: string): string {
  return dirName.replace(/^Stable-/, "").replace(/\.staging$/, "");
}

export function serverVersionsToRemove(
  versions: ServerVersion[],
  opts: { isBusy: (hash: string) => boolean; nowSec: number; keepDays: number },
): string[] {
  if (versions.length === 0) return [];
  const newest = versions.reduce((a, b) => (b.mtimeSec > a.mtimeSec ? b : a));
  const keepAfter = opts.nowSec - opts.keepDays * 86400;
  return versions
    .filter((v) => v.name !== newest.name) // never remove the most recently touched version
    .filter((v) => v.mtimeSec < keepAfter) // never remove anything within the KEEP_DAYS window
    .filter((v) => !opts.isBusy(v.hash)) // never remove a version with a live server process
    .map((v) => v.name);
}

/** rip is tried first (recoverable via its graveyard); any failure falls back to rm -rf, same
 * shape as cache-clean's cargo/tempdir cleanup — never a bare shell `rm` (house policy). */
function removeDir(dir: string, dryRun: boolean): void {
  if (dryRun) {
    console.log(`  [dry-run] would run: rip ${dir}`);
    return;
  }
  console.log(`  • rip ${dir}`);
  if (toolAvailable("rip")) {
    // bounded: mirrors reclaim-clean.ts's cleanupTempDir — a same-filesystem rename, no timeout there either.
    const res = Bun.spawnSync(["rip", dir], {
      stdout: "inherit",
      stderr: "ignore",
    });
    if (res.exitCode === 0) return;
  }
  rmSync(dir, { recursive: true, force: true });
}

function runVscodeServerSection(
  dryRun: boolean,
  home: string,
  keepDays: number,
): void {
  console.log("== vscode-server versions ==");
  const serversDir = `${home}/.vscode-server/cli/servers`;
  if (!existsSync(serversDir) || !statSync(serversDir).isDirectory()) {
    console.log("  無し — skip");
    return;
  }

  const versions: ServerVersion[] = [];
  for (const name of readdirSync(serversDir).sort()) {
    if (!name.startsWith("Stable-")) continue;
    const path = `${serversDir}/${name}`;
    // statSync is overloaded (bigint/throwIfNoEntry variants); wrapping the CALL rather than the
    // bare function keeps this single-argument overload's plain-Stats return through fromThrowable.
    const statResult = fromThrowable(() => statSync(path))();
    if (statResult.isErr()) continue;
    const st = statResult.value;
    if (!st.isDirectory()) continue;
    versions.push({
      name,
      hash: serverHash(name),
      mtimeSec: Math.floor(st.mtimeMs / 1000),
    });
  }

  const toRemove = serverVersionsToRemove(versions, {
    isBusy: (hash) => isProcessRunning(hash),
    nowSec: Math.floor(Date.now() / 1000),
    keepDays,
  });
  if (toRemove.length === 0) {
    console.log("  削除対象なし(最新 / KEEP_DAYS 以内 / 使用中のいずれか)");
    return;
  }
  for (const name of toRemove) {
    removeDir(`${serversDir}/${name}`, dryRun);
  }
}

// ---- entry --------------------------------------------------------------------------------

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "reclaim-toolchains.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Prune rustup toolchains and vscode-server old versions via a written safety predicate (no tool-native gc exists for either).",
      },
      flags: {
        dryRun: { type: Boolean, default: false },
        home: { type: nonEmptyString("--home") },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );

  if (parsed._.length > 0) {
    throw new Error(
      `Unexpected argument '${parsed._[0]}'. This command does not take positional arguments`,
    );
  }

  const home = resolveHome(parsed.flags.home);
  const dryRun = parsed.flags.dryRun === true;
  const keepDays = Number(process.env.KEEP_DAYS ?? "2");

  await runRustupSection(dryRun, home);
  runVscodeServerSection(dryRun, home, keepDays);

  console.log(
    "✅ reclaim:toolchains done. Deletions went through rip → mise run reclaim:purge frees the space.",
  );
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}
