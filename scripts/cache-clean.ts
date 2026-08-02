// Port of mise task `cache:clean` (see mise.toml). Structural port only — same tools, same
// order, same guards, same printed lines as the original shell body. Consumer: human/agent
// running `mise run cache:clean` — output is verdict-style lines meant for eyeballing, not a
// machine envelope, matching the shell original.
//
// Reclaims disk by clearing package-manager GLOBAL caches (brew/bun/npm/pnpm/yarn/uv/pip/go/
// docker/cargo). Safe — only regenerable caches. Best-effort by construction: every step is
// independently guarded (tool present? not busy?) and every mutating command's failure is
// swallowed (mirrors the original's `|| true` — this script never fails because ONE tool's
// cache-clean command failed).
//
// Usage: bun scripts/cache-clean.ts [--dry-run] [--home <path>]
//   --home defaults to $HOME — pass a fixture dir to test without touching the real one.
// Exit: every valid cleanup invocation reaches 0. The original shell body has no `set -e` —
// every guard (`command -v x && ...`) and every mutating command's failure (`... || true`) is
// local, so no cleanup operation — including a missing/empty HOME or failed tempdir setup — may
// abort the pass. Parser refusal happens before cleanup: Cleye ordinary unknowns exit 1; local
// usage errors (including `--__proto__` and missing flag values) exit 2.

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";

class UsageError extends Error {}

// Cleye 2.6.0's strictFlags misses --__proto__; reject that prototype-sensitive name before
// assignment. Every ordinary unknown remains Cleye strictFlags' responsibility.
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

// ---- pure/testable helpers -------------------------------------------------------------

/** `df -h <home> | awk 'NR==2{print $4" free"}'` — read-only, safe against any existing path. */
export function freeSpace(home: string, spawn = Bun.spawnSync): string {
  let out = "";
  try {
    const proc = spawn(["df", "-h", home], {
      stdout: "pipe",
      stderr: "inherit", // original `df -h "$HOME" | awk ...` never redirects df's own stderr
    });
    out = proc.stdout.toString();
  } catch {
    return "";
  }
  const rawLines = out.split("\n");
  if (rawLines[rawLines.length - 1] === "") rawLines.pop(); // drop trailing-newline artifact
  if (rawLines.length < 2) return ""; // awk's NR==2 never fires -> no output at all
  const fields = rawLines[1]!.trim().split(/\s+/).filter(Boolean);
  const avail = fields[3] ?? "";
  return `${avail} free`;
}

/** `command -v <tool>` equivalent. */
export function toolAvailable(tool: string): boolean {
  return Bun.which(tool) !== null;
}

/**
 * `pgrep -f '[u]v tool|[u]vx' >/dev/null 2>&1` — exit 0 => busy. A missing pgrep binary mirrors
 * the shell's own behavior: the `if` condition is simply false (not an error), so uv is treated
 * as NOT busy and cache prune proceeds.
 */
export function isUvBusy(spawn = Bun.spawnSync): boolean {
  try {
    const proc = spawn(["pgrep", "-f", "[u]v tool|[u]vx"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return proc.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * `command -v rip >/dev/null 2>&1 && rip "$dir" 2>/dev/null || rm -rf "$dir"` — rip is tried
 * first (recoverable via its graveyard); ANY failure (rip absent, or rip itself non-zero) falls
 * back to a plain recursive remove, exactly like the shell `&&`/`||` chain.
 */
export function cleanupTempDir(
  dir: string,
  opts: { ripAvailable?: boolean; spawn?: typeof Bun.spawnSync } = {},
): void {
  const ripAvailable = opts.ripAvailable ?? toolAvailable("rip");
  const spawn = opts.spawn ?? Bun.spawnSync;
  let ripOk = false;
  if (ripAvailable) {
    try {
      // original: `rip "$_bt" 2>/dev/null` — only rip's stderr is redirected; its stdout
      // (e.g. any confirmation line) still reaches the terminal.
      const proc = spawn(["rip", dir], { stdout: "inherit", stderr: "ignore" });
      ripOk = proc.exitCode === 0;
    } catch {
      ripOk = false;
    }
  }
  if (!ripOk) {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- step runners -----------------------------------------------------------------------

export type SimpleStep = {
  tool: string;
  label: string; // printed verbatim after "• " in a real run (matches the shell's own echo,
  // which is sometimes a shorter/looser description than the full command below)
  cmd: string[];
  suppressStderr?: boolean;
};

export function runSimpleStep(step: SimpleStep, dryRun: boolean): void {
  if (!toolAvailable(step.tool)) return;
  if (dryRun) {
    console.log(`[dry-run] would run: ${step.cmd.join(" ")}`);
    return;
  }
  console.log(`• ${step.label}`);
  try {
    // bounded: no timeout in the original shell body either (`cmd || true`) — a hanging tool
    // is the same pre-existing risk as bash, not a regression this port introduces.
    Bun.spawnSync(step.cmd, {
      stdout: "inherit",
      stderr: step.suppressStderr ? "ignore" : "inherit",
    });
  } catch {
    // mirror `|| true`: a failed/missing command must not stop the rest of the pass
  }
}

// bun: native `bun pm cache rm` errors outside a project (oven-sh/bun #16101/#18733), so it
// runs inside an ephemeral package.json dir, then that dir is cleaned up via rip-or-rm.
function runBunStep(dryRun: boolean): void {
  if (!toolAvailable("bun")) return;
  if (dryRun) {
    console.log(
      "[dry-run] would run: bun pm cache rm (in an ephemeral package.json dir)",
    );
    return;
  }
  console.log("• bun pm cache rm");
  // original: `_bt="$(mktemp -d)" && printf '{}' > "$_bt/package.json" && ( cd "$_bt" &&
  // bun pm cache rm ) || true` — the header echo above already ran unconditionally, and this
  // whole && chain (tempdir creation included) is guarded by a trailing `|| true`: a failure
  // ANYWHERE in it (ENOSPC/EACCES on mkdtemp is exactly the full-disk case this task exists
  // for) must not escape and must not stop the rest of the pass. Wrap the entire sequence,
  // not just the bun subprocess, to mirror that.
  try {
    const dir = mkdtempSync(join(tmpdir(), "cache-clean-bun-"));
    try {
      writeFileSync(join(dir, "package.json"), "{}");
      try {
        // bounded: mirrors the original `( cd "$_bt" && bun pm cache rm ) || true` — no timeout there.
        Bun.spawnSync(["bun", "pm", "cache", "rm"], {
          cwd: dir,
          stdout: "inherit",
          stderr: "inherit",
        });
      } catch {
        // mirror `|| true`
      }
    } finally {
      cleanupTempDir(dir);
    }
  } catch {
    // mirror `|| true`: tempdir setup itself failed (dir was never created, so there is
    // nothing to clean up) — swallow and let main() proceed to the remaining steps.
  }
}

// uv: `uv cache clean/prune` blocks on the cache lock while ANY uv process runs (e.g. uvx-
// launched MCP servers during an AI session) — skip rather than hang.
function runUvStep(dryRun: boolean): void {
  if (!toolAvailable("uv")) return;
  if (isUvBusy()) {
    console.log(
      "• uv cache prune — skipped (uv/uvx active; would block on the cache lock)",
    );
    return;
  }
  if (dryRun) {
    console.log("[dry-run] would run: uv cache prune");
    return;
  }
  console.log("• uv cache prune");
  try {
    // bounded: mirrors the original `uv cache prune || true` — no timeout there either.
    Bun.spawnSync(["uv", "cache", "prune"], {
      stdout: "inherit",
      stderr: "inherit",
    });
  } catch {
    // mirror `|| true`
  }
}

// cargo: no built-in cache cleaner on stable — rip the regenerable download caches instead
// (recoverable via rip's graveyard). Requires BOTH cargo and rip; no rm fallback here (matches
// the original, which has no `|| rm -rf` on this line, only `|| true`).
function runCargoStep(home: string, dryRun: boolean): void {
  if (!toolAvailable("cargo") || !toolAvailable("rip")) return;
  // Template-literal concatenation, NOT path.join: the original shell body builds these paths
  // as literal `"$HOME"/.cargo/...` concatenation, which keeps its leading separator even when
  // $HOME is empty (yielding e.g. "/.cargo/registry/src"). path.join(home, ...) would instead
  // DROP that leading separator for an empty `home`, silently turning an absolute path into a
  // CWD-relative one — dangerous here since the result is handed straight to `rip`.
  const paths = [
    `${home}/.cargo/registry/src`,
    `${home}/.cargo/registry/cache`,
    `${home}/.cargo/git/checkouts`,
  ];
  if (dryRun) {
    console.log(`[dry-run] would run: rip ${paths.join(" ")}`);
    return;
  }
  console.log("• cargo registry/git caches (rip → graveyard)");
  try {
    // bounded: mirrors the original `rip ... 2>/dev/null || true` — no timeout there either.
    Bun.spawnSync(["rip", ...paths], { stdout: "inherit", stderr: "ignore" });
  } catch {
    // mirror `|| true`
  }
}

// ---- entry --------------------------------------------------------------------------------

/**
 * `${homeArg:-$HOME}`-ish resolution. Deliberately returns "" rather than throwing/exiting
 * when neither is set — the original shell's bare `"$HOME"` never validates its own value
 * either, so an empty result must degrade gracefully (passed through to df/cargo-path joins),
 * never abort the script or change its exit code.
 */
export function resolveHome(homeArg: string | undefined): string {
  return homeArg ?? process.env.HOME ?? "";
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "cache-clean.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: { description: "Clear regenerable global package-manager caches." },
      flags: {
        dryRun: { type: Boolean, default: false },
        home: { type: nonEmptyString("--home") },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );

  // The explicit [] schema leaves excess operands visible for the pre-existing fatal contract.
  if (parsed._.length > 0) {
    // Preserve the flag-only contract: the explicit empty positional schema leaves any operand
    // visible here for refusal before cleanup begins.
    throw new Error(
      `Unexpected argument '${parsed._[0]}'. This command does not take positional arguments`,
    );
  }

  // original never validates $HOME — an unset/empty $HOME is passed straight through to
  // `df -h "$HOME"` and the cargo-path joins, degrading gracefully rather than aborting; no
  // hard-fail here would have an analogue in the shell (see resolveHome's doc comment).
  const home = resolveHome(parsed.flags.home);
  const dryRun = parsed.flags.dryRun === true;

  console.log(`before: ${freeSpace(home)}`);

  runSimpleStep(
    {
      tool: "brew",
      label: "brew cleanup --prune=all",
      cmd: ["brew", "cleanup", "--prune=all"],
    },
    dryRun,
  );
  runBunStep(dryRun);
  runSimpleStep(
    {
      tool: "npm",
      label: "npm cache clean",
      cmd: ["npm", "cache", "clean", "--force"],
    },
    dryRun,
  );
  runSimpleStep(
    {
      tool: "pnpm",
      label: "pnpm store prune",
      cmd: ["pnpm", "store", "prune"],
    },
    dryRun,
  );
  runSimpleStep(
    {
      tool: "yarn",
      label: "yarn cache clean",
      cmd: ["yarn", "cache", "clean"],
    },
    dryRun,
  );
  runUvStep(dryRun);
  runSimpleStep(
    { tool: "pip", label: "pip cache purge", cmd: ["pip", "cache", "purge"] },
    dryRun,
  );
  runSimpleStep(
    { tool: "go", label: "go clean -cache", cmd: ["go", "clean", "-cache"] },
    dryRun,
  );
  runSimpleStep(
    {
      tool: "docker",
      label: "docker builder prune",
      cmd: ["docker", "builder", "prune", "-f"],
      suppressStderr: true,
    },
    dryRun,
  );
  runCargoStep(home, dryRun);

  console.log(`after:  ${freeSpace(home)}`);
  console.log(
    "✅ cache:clean done. Project build artifacts (node_modules/target/…) → mise run cache:projects",
  );
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}
