// `mise run reclaim:rust` — `cargo clean` every Rust project's target/ that has not been built for
// RUST_TARGET_DAYS (default 7). Blind tier, like reclaim:builds, but sooner: kondo's 30 days is
// one bar for every ecosystem, while a Rust target/ is cheap to rebuild here — sccache
// (RUSTC_WRAPPER, set in the profiles) serves the compiled crates back from its own cache. Without
// sccache on PATH the bar stays 30 days. Measured 2026-10-07: soks-govern's target/ held 486 MiB
// one day after a `cargo install` it no longer served.
//
// Predicate, erring toward keeping:
//   a target/ beside a Cargo.toml under AUDIT_PROJECTS (default ~/Workspace), depth ≤ 4;
//   last built = the newest mtime of target/ and its direct children (cargo touches the profile
//     dir and .fingerprint on every build);
//   kept when built within the bar, or when a running cargo/rustc works inside the project
//     (/proc/<pid>/cwd). No /proc (macOS) → no evidence → every target/ is kept.
// Removal is `cargo clean --manifest-path`, the tool's own — it frees space now (no graveyard).
//
// Usage: bun scripts/reclaim-rust-targets.ts [--dry-run]. Exit: 0 always for a valid pass (each
// clean's failure is reported, never fatal); Cleye refusals 1; usage 2.

import { readdirSync, readlinkSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { $ } from "bun";
import { cli } from "cleye";
import { fromThrowable } from "../agents/hooks/zod.ts";

export type Target = { project: string; builtSec: number };

/** Newest mtime (s) of `dir` and its direct children; undefined when unreadable. */
export function lastBuilt(dir: string): number | undefined {
  const own = fromThrowable(() => statSync(dir).mtimeMs)();
  if (own.isErr()) return undefined;
  const children = fromThrowable(() => readdirSync(dir))()
    .unwrapOr([])
    .map((n) =>
      fromThrowable(() => statSync(join(dir, n)).mtimeMs)().unwrapOr(0),
    );
  return Math.floor(Math.max(own.value, ...children) / 1000);
}

/** Working directories of running cargo/rustc processes; undefined where there is no /proc. */
export function buildCwds(procDir = "/proc"): string[] | undefined {
  const pids = fromThrowable(() => readdirSync(procDir))();
  if (pids.isErr()) return undefined;
  return pids.value
    .filter((p) => /^\d+$/u.test(p))
    .flatMap((p) => {
      const exe = fromThrowable(() => readlinkSync(join(procDir, p, "exe")))();
      const name = exe.isOk() ? (exe.value.split("/").pop() ?? "") : "";
      if (name !== "cargo" && name !== "rustc") return [];
      return fromThrowable(() => readlinkSync(join(procDir, p, "cwd")))()
        .map((cwd) => [cwd])
        .unwrapOr([]);
    });
}

/** The projects whose target/ may be cleaned (see the header for the predicate). */
export function targetsToClean(
  targets: readonly Target[],
  opts: {
    nowSec: number;
    keepDays: number;
    busy: readonly string[] | undefined;
  },
): string[] {
  const keepAfter = opts.nowSec - opts.keepDays * 86400;
  const { busy } = opts;
  return targets
    .filter((t) => t.builtSec < keepAfter)
    .filter(
      (t) =>
        busy !== undefined &&
        !busy.some(
          (cwd) => cwd === t.project || cwd.startsWith(`${t.project}/`),
        ),
    )
    .map((t) => t.project);
}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`usage: unknown flag(s): --${flag}\n`);
    process.exit(2);
  }
}

async function main(): Promise<number> {
  const parsed = cli(
    {
      name: "reclaim-rust-targets.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "cargo clean every Rust target/ not built for RUST_TARGET_DAYS (sccache makes the rebuild cheap).",
      },
      flags: { dryRun: { type: Boolean, default: false } },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    process.stderr.write(`usage: unexpected argument '${parsed._[0]}'\n`);
    return 2;
  }
  const dryRun = parsed.flags.dryRun;
  console.log("== Rust target/ (cargo clean) ==");
  if (Bun.which("cargo") === null || Bun.which("fd") === null) {
    console.log("  cargo or fd absent — skip");
    return 0;
  }
  const sccache = Bun.which("sccache") !== null;
  const keepDays = Number(
    process.env.RUST_TARGET_DAYS ?? (sccache ? "7" : "30"),
  );
  const roots = process.env.AUDIT_PROJECTS ?? join(homedir(), "Workspace");
  const found = (
    await $`fd -H -I -t d -d 4 --prune "^target$" ${roots}`.quiet().nothrow()
  ).stdout
    .toString()
    .split("\n")
    .filter((p) => p !== "")
    .map((p) => p.replace(/\/$/u, ""));
  const targets = found.flatMap((dir): Target[] => {
    const project = dirname(dir);
    const built = lastBuilt(dir);
    const isCargo = fromThrowable(() =>
      statSync(join(project, "Cargo.toml")).isFile(),
    )().unwrapOr(false);
    return isCargo && built !== undefined ? [{ project, builtSec: built }] : [];
  });
  const busy = buildCwds();
  const nowSec = Math.floor(Temporal.Now.instant().epochMilliseconds / 1000);
  const clean = targetsToClean(targets, { nowSec, keepDays, busy });
  console.log(
    `  ${targets.length} target/, keep ${targets.length - clean.length} (built within ${keepDays} d${sccache ? "" : ", no sccache"}${busy === undefined ? "; no /proc: all kept" : ""})`,
  );
  for (const project of clean) {
    if (dryRun) {
      console.log(
        `  [dry-run] would run: cargo clean --manifest-path ${project}/Cargo.toml`,
      );
      continue;
    }
    console.log(`  • cargo clean ${project}`);
    // bounded: a local delete; cargo prints what it removed.
    const r =
      await $`cargo clean --manifest-path ${join(project, "Cargo.toml")}`.nothrow();
    if (r.exitCode !== 0) console.log(`    failed (exit ${r.exitCode}) — kept`);
  }
  return 0;
}

if (import.meta.main) process.exit(await main());
