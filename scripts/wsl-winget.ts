import { copyFileSync, existsSync } from "node:fs";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";

// The Windows half of the Brewfile: capture what winget manages on the host into
// wsl/winget.win.json, or restore the host from it. Consumer: human/agent running
// `mise run wsl:winget:dump` / `mise run wsl:winget:restore`; output is verdict lines.
//
// WHY THIS EXISTS. Brewfile is this repo's single source of truth for tools on macOS and WSL.
// The Windows host underneath WSL had no such record: 113 winget-managed packages (measured
// 2026-09-11) existed only on the machine, and nothing here could rebuild them. `winget export`
// emits a JSON manifest that `winget import` replays, so the same shape as Brewfile is possible
// — this task is the plumbing that makes it a tracked file rather than a one-off dump.
//
// WHAT IT CANNOT COVER, stated so nobody expects it. `winget export` writes only packages whose
// installed identity resolves in a winget source. On this host 344 entries are installed, 113 are
// winget-managed, and 96 survive export (17 fail source lookup: the tool prints "not available
// from any source" for each — that is winget's contract, not a bug here). Everything else is
// unmanaged: installers run by hand, the NVIDIA display driver (NOT in winget — CUDA is), Nsight,
// MSI leftovers. wsl/winget.win.json is the part that is reproducible, not an inventory of the box.
//
// DIRECTION. Both verbs are one-way. `dump` reads the host and writes the repo file; `restore`
// reads the repo file and drives the host. Neither reads the file it is about to write, so there
// is no merge, no reconciliation, and no path by which host state edits the repo silently. Drift
// between the two is visible as a git diff after `dump`, which is the point.
//
// Same interop trap as scripts/wsl-wslconfig.ts: winget.exe is a Windows binary, cwd must be a
// Windows-reachable path or interop complains about the UNC fallback, and every call is bounded
// because that boundary has hung an ssh session before.

const INTEROP_MS = 30_000; // interop measured 0.85-1.92 s; a source refresh can add several s
const EXPORT_MS = 180_000; // export resolves every package against the sources; 91 took ~40 s
const IMPORT_MS = 3_600_000; // import INSTALLS; an hour is a bound, not an estimate

class UsageError extends Error {}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError(`Unknown option '--${flag}'`);
  }
}

const copyFile = fromThrowable(copyFileSync);

async function run(
  cmd: string[],
  ms: number,
): Promise<{ code: number; out: string; timedOut: boolean }> {
  const sig = AbortSignal.timeout(ms);
  const proc = Bun.spawn(cmd, {
    cwd: "/mnt/c",
    stdout: "pipe",
    stderr: "pipe",
    signal: sig,
  });
  const work = Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).then(([out, err, code]) => ({ code, out: out + err }));
  // Raced against the abort: killing the child does not close a pipe a grandchild holds, so
  // awaiting the drain alone is unbounded (measured in scripts/reclaim-system.ts).
  const aborted = new Promise<null>((resolve) => {
    sig.addEventListener("abort", () => resolve(null), { once: true });
  });
  const done = await Promise.race([work, aborted]);
  if (done === null) return { code: -1, out: "", timedOut: true };
  return { ...done, out: done.out.replace(/\r/g, ""), timedOut: false };
}

async function requireWsl(): Promise<void> {
  const rel = await Bun.file("/proc/sys/kernel/osrelease")
    .text()
    .catch(() => "");
  if (!rel.toLowerCase().includes("microsoft")) {
    console.log(
      "not running inside WSL — winget lives on the Windows host, so this runs from its distro",
    );
    process.exit(1);
  }
  if (!Bun.which("wslpath") || !Bun.which("powershell.exe")) {
    console.log(
      "wslpath / powershell.exe not reachable — is [interop] enabled in /etc/wsl.conf?",
    );
    process.exit(1);
  }
}

// winget.exe is NOT on the WSL PATH, and that is this repo's own doing: the Windows PATH is
// stripped from WSL shells on purpose (zsh/ keeps /mnt/* off PATH so a DrvFs walk never slows
// command lookup). So resolve it from the Windows side — %LOCALAPPDATA%\Microsoft\WindowsApps is
// where the App Installer alias lives — and derive the user, never hardcode one (CLAUDE.md).
// An earlier guard checked `which winget.exe || which wslpath`, which passed on wslpath alone
// and then died at spawn time with "Executable not found". Measured; hence the resolve step.
async function wingetPath(): Promise<string> {
  const la = await run(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Write-Output $env:LOCALAPPDATA",
    ],
    INTEROP_MS,
  );
  const win = `${la.out.trim()}\\Microsoft\\WindowsApps\\winget.exe`;
  const w = await run(["wslpath", "-u", win], INTEROP_MS);
  const p = w.out.trim();
  if (p === "" || !existsSync(p)) {
    console.log(
      `winget.exe not found at ${win} — is App Installer (winget) installed on Windows?`,
    );
    process.exit(1);
  }
  return p;
}

const repoFile = `${process.env.DOTFILES ?? `${process.env.HOME}/dotfiles`}/wsl/winget.win.json`;

// A Windows temp path winget can write to, and the same path as seen from WSL.
async function scratch(): Promise<{ win: string; wsl: string }> {
  const t = await run(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Write-Output $env:TEMP",
    ],
    INTEROP_MS,
  );
  const win = `${t.out.trim()}\\winget-export.json`;
  const w = await run(["wslpath", "-u", win], INTEROP_MS);
  return { win, wsl: w.out.trim() };
}

async function dump(): Promise<void> {
  const { win, wsl } = await scratch();
  console.log(
    "• winget export (resolving every installed package against its source)",
  );
  const winget = await wingetPath();
  const r = await run(
    [winget, "export", "-o", win, "--accept-source-agreements"],
    EXPORT_MS,
  );
  if (r.timedOut) {
    console.log(`  timed out after ${EXPORT_MS / 1000}s — nothing written`);
    process.exit(1);
  }
  // winget reports each unmanageable package on its own line; surface the COUNT so a shrinking
  // manifest is explained rather than mistaken for uninstalls.
  const skipped = r.out
    .split("\n")
    .filter((l) =>
      /not available from any source|どのソースからも/.test(l),
    ).length;
  if (!existsSync(wsl)) {
    console.log(
      `  winget produced no file (exit ${r.code}):\n${r.out.slice(0, 600)}`,
    );
    process.exit(1);
  }
  const json = await Bun.file(wsl).json();
  const sources = (json.Sources ?? []) as Array<{
    SourceDetails: { Name: string };
    Packages: unknown[];
  }>;
  const total = sources.reduce((n, s) => n + s.Packages.length, 0);
  // Stable ordering so the tracked file diffs by content, not by winget's enumeration order.
  for (const s of sources) {
    (s.Packages as Array<{ PackageIdentifier: string }>).sort((a, b) =>
      a.PackageIdentifier.localeCompare(b.PackageIdentifier),
    );
  }
  sources.sort((a, b) =>
    a.SourceDetails.Name.localeCompare(b.SourceDetails.Name),
  );
  await Bun.write(repoFile, `${JSON.stringify(json, null, 2)}\n`);
  console.log(
    `  ${total} packages across ${sources.map((s) => `${s.SourceDetails.Name}(${s.Packages.length})`).join(", ")}`,
  );
  if (skipped > 0) {
    console.log(
      `  ${skipped} installed package(s) not exportable (no source resolves them) — winget's limit, not drift`,
    );
  }
  console.log(`wrote ${repoFile}`);
  console.log(
    "Review with `git diff wsl/winget.win.json`; commit if the change is intended.",
  );
}

async function restore(dryRun: boolean): Promise<void> {
  if (!existsSync(repoFile)) {
    console.log(
      `missing ${repoFile} — run \`mise run wsl:winget:dump\` on a configured host first`,
    );
    process.exit(1);
  }
  const { win, wsl } = await scratch();
  const staged = copyFile(repoFile, wsl);
  if (staged.isErr()) {
    console.log(`could not stage manifest at ${wsl}: ${staged.error}`);
    process.exit(1);
  }
  const winget = await wingetPath();
  const args = [
    winget,
    "import",
    "-i",
    win,
    "--accept-source-agreements",
    "--accept-package-agreements",
    "--ignore-unavailable",
    "--no-upgrade",
  ];
  if (dryRun) {
    console.log(`[dry-run] would run: ${args.join(" ")}`);
    return;
  }
  console.log(
    "• winget import (installs anything in the manifest that is missing; never upgrades)",
  );
  const r = await run(args, IMPORT_MS);
  if (r.timedOut) {
    console.log(
      `  timed out after ${IMPORT_MS / 1000}s — partial install is possible; re-run to continue`,
    );
    process.exit(1);
  }
  console.log(r.out.trim().split("\n").slice(-12).join("\n"));
  console.log(`winget import exit ${r.code}`);
  if (r.code !== 0) process.exit(1);
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "wsl-winget.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<verb>"],
      help: {
        description:
          "dump: capture the Windows host's winget packages into wsl/winget.win.json. restore: install what that file lists.",
      },
      flags: { dryRun: { type: Boolean, default: false } },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 1) {
    throw new UsageError(`Unexpected argument '${parsed._[1]}'`);
  }
  // Validate the boundary BEFORE the environment check, so a typo'd verb is exit 2 everywhere
  // and never masked by "not running inside WSL" on a Mac.
  const verb = parsed._.verb;
  if (verb !== "dump" && verb !== "restore") {
    throw new UsageError(`verb must be dump or restore, got '${verb}'`);
  }
  await requireWsl();
  if (verb === "dump") return dump();
  return restore(parsed.flags.dryRun === true);
}

main().catch((err) => {
  console.error(`FATAL: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(err instanceof UsageError ? 2 : 1);
});
