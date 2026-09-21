// Port of mise task `reclaim:clean` (see mise.toml). Structural port only — same tools, same
// order, same guards, same printed lines as the original shell body. Consumer: human/agent
// running `mise run reclaim:clean` — output is verdict-style lines meant for eyeballing, not a
// machine envelope, matching the shell original.
//
// Reclaims disk by clearing package/tool-manager GLOBAL caches (brew/bun/npm/pnpm/yarn/uv/pip/
// go/docker/cargo/mise/julia/huggingface_hub). Safe — only regenerable caches, and only via each
// tool's OWN gc/prune command: the tool itself judges what is unused, we never guess. That is the line
// that keeps this script agent-blind-safe — a target that has no such built-in judgment (rustup
// toolchains, vscode-server old versions) belongs in `reclaim:toolchains` instead, which writes an
// explicit safety predicate rather than borrowing one. Best-effort by construction: every step
// is independently guarded (tool present? not busy?) and every mutating command's failure is
// swallowed (mirrors the original's `|| true` — this script never fails because ONE tool's
// cache-clean command failed).
//
// No try/catch (house policy for this repo's scripts/*.ts — lint:ts / .oxlintrc.json): every call that
// can throw (Bun.spawnSync, mkdtempSync, writeFileSync) goes through neverthrow's
// fromThrowable(), and swallowing is done via .unwrapOr()/`if (result.isOk())`, not a catch
// block. `main().catch(...)` below is Promise.prototype.catch, not this statement — exempt.
//
// Usage: bun scripts/reclaim-clean.ts [--dry-run] [--home <path>]
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
import { fromThrowable } from "neverthrow";

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
  // spawn is called INSIDE the thunk (not passed bare to fromThrowable) so Bun.spawnSync's
  // generic return type resolves against these literal stdout/stderr options, not against
  // whatever defaults fromThrowable's own generic inference would otherwise pick.
  const result = fromThrowable(() =>
    spawn(["df", "-h", home], {
      stdout: "pipe",
      stderr: "inherit", // original `df -h "$HOME" | awk ...` never redirects df's own stderr
    }),
  )();
  if (result.isErr()) return "";
  const out = result.value.stdout.toString();
  const rawLines = out.split("\n");
  if (rawLines[rawLines.length - 1] === "") rawLines.pop(); // drop trailing-newline artifact
  if (rawLines.length < 2) return ""; // awk's NR==2 never fires -> no output at all
  const filesystemLine = rawLines[1];
  if (filesystemLine === undefined) return "";
  const fields = filesystemLine.trim().split(/\s+/).filter(Boolean);
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
  return fromThrowable(spawn)(["pgrep", "-f", "[u]v tool|[u]vx"], {
    stdout: "ignore",
    stderr: "ignore",
  })
    .map((proc) => proc.exitCode === 0)
    .unwrapOr(false);
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
  // original: `rip "$_bt" 2>/dev/null` — only rip's stderr is redirected; its stdout (e.g. any
  // confirmation line) still reaches the terminal.
  const ripOk = ripAvailable
    ? fromThrowable(spawn)(["rip", dir], {
        stdout: "inherit",
        stderr: "ignore",
      })
        .map((proc) => proc.exitCode === 0)
        .unwrapOr(false)
    : false;
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

/**
 * What a step DID — reported, never acted on. Failures stay swallowed (one tool must not stop
 * the pass, as the shell original's `|| true` guaranteed), but swallowed is not the same as
 * invisible: without this, a run where every tool errored still printed a clean ✅.
 *
 * Measured on r99 2026-09-21: `ssh host 'mise run reclaim:clean'` reclaimed 1 GB while npm,
 * pnpm, yarn, uv, pip and huggingface_hub each died with mise's "No version is set for shim"
 * — a tool is reachable only where a config DECLARES it (INV-6) — and the task still reported
 * success. `absent` is NOT a failure: a box without brew is not a broken run.
 */
export type StepOutcome = "absent" | "dry-run" | "skipped" | "ok" | "failed";

export function runSimpleStep(step: SimpleStep, dryRun: boolean): StepOutcome {
  if (!toolAvailable(step.tool)) return "absent";
  if (dryRun) {
    console.log(`[dry-run] would run: ${step.cmd.join(" ")}`);
    return "dry-run";
  }
  console.log(`• ${step.label}`);
  // bounded: no timeout in the original shell body either (`cmd || true`) — a hanging tool is
  // the same pre-existing risk as bash, not a regression this port introduces. The outcome is
  // REPORTED, never acted on: a thrown OR a nonzero exit are still both `|| true` here.
  return fromThrowable(Bun.spawnSync)(step.cmd, {
    stdout: "inherit",
    stderr: step.suppressStderr ? "ignore" : "inherit",
  })
    .map((proc): StepOutcome => (proc.exitCode === 0 ? "ok" : "failed"))
    .unwrapOr("failed");
}

// Split out of runBunStep only to keep its outcome expression one ternary deep (house lint bans
// nesting them). bounded: mirrors the original `( cd "$_bt" && bun pm cache rm ) || true`.
function bunCacheRm(dir: string): StepOutcome {
  return fromThrowable(Bun.spawnSync)(["bun", "pm", "cache", "rm"], {
    cwd: dir,
    stdout: "inherit",
    stderr: "inherit",
  })
    .map((proc): StepOutcome => (proc.exitCode === 0 ? "ok" : "failed"))
    .unwrapOr("failed");
}

// bun: native `bun pm cache rm` errors outside a project (oven-sh/bun #16101/#18733), so it
// runs inside an ephemeral package.json dir, then that dir is cleaned up via rip-or-rm.
function runBunStep(dryRun: boolean): StepOutcome {
  if (!toolAvailable("bun")) return "absent";
  if (dryRun) {
    console.log(
      "[dry-run] would run: bun pm cache rm (in an ephemeral package.json dir)",
    );
    return "dry-run";
  }
  console.log("• bun pm cache rm");
  // original: `_bt="$(mktemp -d)" && printf '{}' > "$_bt/package.json" && ( cd "$_bt" &&
  // bun pm cache rm ) || true` — the header echo above already ran unconditionally, and this
  // whole && chain (tempdir creation included) is guarded by a trailing `|| true`: a failure
  // ANYWHERE in it (ENOSPC/EACCES on mkdtemp is exactly the full-disk case this task exists
  // for) must not escape and must not stop the rest of the pass.
  //
  // `.map()`'s callback runs only when mkdtempSync succeeded (mirrors the outer try's scope: no
  // dir, nothing to write/spawn/clean up). Inside it, writeFileSync failing still runs
  // cleanupTempDir(dir) unconditionally — mirroring the original's `finally { cleanupTempDir }`,
  // which ran even when the write above it threw.
  // mkdtempSync is overloaded (encoding/buffer variants); wrapping the CALL rather than the bare
  // function keeps this single-argument overload's plain-string return through fromThrowable.
  return fromThrowable(() => mkdtempSync(join(tmpdir(), "cache-clean-bun-")))()
    .map((dir): StepOutcome => {
      const wrote = fromThrowable(writeFileSync)(
        join(dir, "package.json"),
        "{}",
      );
      const outcome: StepOutcome = wrote.isOk() ? bunCacheRm(dir) : "failed";
      cleanupTempDir(dir);
      return outcome;
    })
    .unwrapOr("failed");
}

// uv: `uv cache clean/prune` blocks on the cache lock while ANY uv process runs (e.g. uvx-
// launched MCP servers during an AI session) — skip rather than hang.
function runUvStep(dryRun: boolean): StepOutcome {
  if (!toolAvailable("uv")) return "absent";
  if (isUvBusy()) {
    console.log(
      "• uv cache prune — skipped (uv/uvx active; would block on the cache lock)",
    );
    return "skipped";
  }
  if (dryRun) {
    console.log("[dry-run] would run: uv cache prune");
    return "dry-run";
  }
  console.log("• uv cache prune");
  // bounded: mirrors the original `uv cache prune || true` — no timeout there either.
  return fromThrowable(Bun.spawnSync)(["uv", "cache", "prune"], {
    stdout: "inherit",
    stderr: "inherit",
  })
    .map((proc): StepOutcome => (proc.exitCode === 0 ? "ok" : "failed"))
    .unwrapOr("failed");
}

// julia: `Pkg.gc()` removes packages/artifacts no known environment manifest references — the
// Julia depot's own equivalent of `uv cache prune`/`brew cleanup`. Guarded broader than
// isUvBusy's tool-specific pattern: LanguageServer.jl, Pluto workers, and a plain REPL all count
// as "a julia process", since gc mutates the shared depot's manifest-usage log a live process
// may be reading. `-x` (exact comm-name match), not `-f` (cmdline substring): a `-f 'julia'`
// pattern also fires on any unrelated script whose PATH or filename merely contains "julia"
// (this host runs one, `raw-julia-watch.sh`) — `-x` matches only a process actually named
// `julia`. Missing pgrep mirrors isUvBusy's own fallback (`if pgrep ...` false -> proceeds).
export function isJuliaBusy(spawn = Bun.spawnSync): boolean {
  return fromThrowable(spawn)(["pgrep", "-x", "julia"], {
    stdout: "ignore",
    stderr: "ignore",
  })
    .map((proc) => proc.exitCode === 0)
    .unwrapOr(false);
}

function runJuliaStep(dryRun: boolean): StepOutcome {
  if (!toolAvailable("julia")) return "absent";
  if (isJuliaBusy()) {
    console.log("• julia Pkg.gc() — skipped (a julia process is running)");
    return "skipped";
  }
  if (dryRun) {
    console.log(
      "[dry-run] would run: julia --startup-file=no -e using Pkg; Pkg.gc()",
    );
    return "dry-run";
  }
  console.log("• julia Pkg.gc()");
  // bounded: mirrors every other step's `... || true` — no timeout there either.
  return fromThrowable(Bun.spawnSync)(
    ["julia", "--startup-file=no", "-e", "using Pkg; Pkg.gc()"],
    { stdout: "inherit", stderr: "inherit" },
  )
    .map((proc): StepOutcome => (proc.exitCode === 0 ? "ok" : "failed"))
    .unwrapOr("failed");
}

// cargo: no built-in cache cleaner on stable — rip the regenerable download caches instead
// (recoverable via rip's graveyard). Requires BOTH cargo and rip; no rm fallback here (matches
// the original, which has no `|| rm -rf` on this line, only `|| true`).
function runCargoStep(home: string, dryRun: boolean): StepOutcome {
  if (!toolAvailable("cargo") || !toolAvailable("rip")) return "absent";
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
    return "dry-run";
  }
  console.log("• cargo registry/git caches (rip → graveyard)");
  // bounded: mirrors the original `rip ... 2>/dev/null || true` — no timeout there either.
  return fromThrowable(Bun.spawnSync)(["rip", ...paths], {
    stdout: "inherit",
    stderr: "ignore",
  })
    .map((proc): StepOutcome => (proc.exitCode === 0 ? "ok" : "failed"))
    .unwrapOr("failed");
}

// huggingface_hub: `scan_cache_dir().delete_revisions(...)` removes only "detached" revisions —
// zero refs pointing to them (a moved default branch, a commit pulled once and never reused).
// No bare `huggingface-cli` flag exposes this; only the Python API sees each revision's `refs`
// set. PEP 723 single-file script (scripts/huggingface-gc.py), invoked via plain `uv run
// <path>` — its own header declares `dependencies = ["huggingface_hub"]`, so uv resolves an
// ephemeral env with no persistent install and no `--with` needed here.
function runHuggingfaceStep(dryRun: boolean): StepOutcome {
  if (!toolAvailable("uv")) return "absent";
  const scriptPath = join(import.meta.dir, "huggingface-gc.py");
  if (dryRun) {
    console.log(`[dry-run] would run: uv run ${scriptPath}`);
    return "dry-run";
  }
  console.log("• huggingface_hub gc (detached revisions)");
  // bounded: mirrors every other step's `... || true` — no timeout there either.
  return fromThrowable(Bun.spawnSync)(["uv", "run", scriptPath], {
    stdout: "inherit",
    stderr: "inherit",
  })
    .map((proc): StepOutcome => (proc.exitCode === 0 ? "ok" : "failed"))
    .unwrapOr("failed");
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
      name: "reclaim-clean.ts",
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

  // Collected, not acted on: the pass still runs every step regardless (best-effort is the
  // contract). What changes is the verdict — a run where every tool errored no longer ends in a
  // bare ✅.
  const failed: string[] = [];
  const record = (tool: string, outcome: StepOutcome): void => {
    if (outcome === "failed") failed.push(tool);
  };

  record(
    "brew",
    runSimpleStep(
      {
        tool: "brew",
        label: "brew cleanup --prune=all",
        cmd: ["brew", "cleanup", "--prune=all"],
      },
      dryRun,
    ),
  );
  record("bun", runBunStep(dryRun));
  record(
    "npm",
    runSimpleStep(
      {
        tool: "npm",
        label: "npm cache clean",
        cmd: ["npm", "cache", "clean", "--force"],
      },
      dryRun,
    ),
  );
  record(
    "pnpm",
    runSimpleStep(
      {
        tool: "pnpm",
        label: "pnpm store prune",
        cmd: ["pnpm", "store", "prune"],
      },
      dryRun,
    ),
  );
  record(
    "yarn",
    runSimpleStep(
      {
        tool: "yarn",
        label: "yarn cache clean",
        cmd: ["yarn", "cache", "clean"],
      },
      dryRun,
    ),
  );
  record("uv", runUvStep(dryRun));
  record(
    "pip",
    runSimpleStep(
      { tool: "pip", label: "pip cache purge", cmd: ["pip", "cache", "purge"] },
      dryRun,
    ),
  );
  record(
    "go",
    runSimpleStep(
      { tool: "go", label: "go clean -cache", cmd: ["go", "clean", "-cache"] },
      dryRun,
    ),
  );
  record(
    "docker",
    runSimpleStep(
      {
        tool: "docker",
        label: "docker builder prune",
        cmd: ["docker", "builder", "prune", "-f"],
        suppressStderr: true,
      },
      dryRun,
    ),
  );
  record("cargo", runCargoStep(home, dryRun));
  record(
    "mise",
    runSimpleStep(
      {
        tool: "mise",
        label: "mise prune --tools",
        cmd: ["mise", "prune", "--tools", "--yes"],
      },
      dryRun,
    ),
  );
  record("julia", runJuliaStep(dryRun));
  record("huggingface_hub", runHuggingfaceStep(dryRun));

  console.log(`after:  ${freeSpace(home)}`);
  if (failed.length > 0) {
    console.log(
      `⚠️  reclaimed nothing for ${failed.length} tool(s): ${failed.join(", ")}`,
    );
    console.log(
      '   A mise-shimmed tool exits "No version is set for shim" wherever no config DECLARES it',
    );
    console.log(
      "   (INV-6) — the CACHE is global but the shim is not, so a non-interactive",
    );
    console.log(
      "   `ssh host 'mise run reclaim:clean'` clears only the tools that host resolves. Re-run",
    );
    console.log(
      "   where those tools resolve; the free-space delta above is NOT this task's ceiling.",
    );
  }
  console.log(
    "✅ reclaim:clean done. Project build artifacts (node_modules/target/…) → mise run reclaim:pick. rustup/vscode-server → mise run reclaim:toolchains",
  );
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(err instanceof UsageError ? 2 : 1);
  });
}
