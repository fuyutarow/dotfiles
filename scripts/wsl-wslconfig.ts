import { existsSync, copyFileSync } from "node:fs";
import { fromThrowable } from "neverthrow";

// Bounds and failure handling, in the shape practicing-tiger-style asks for.
//
// INTEROP_MS — the two PowerShell calls below cross the WSL/Windows boundary, and that boundary
// hangs: an interop call wedged an entire ssh session during the 2026-09-09 incident. Measured
// on r99 2026-09-10 over three runs, a round trip took 0.85 / 0.85 / 1.92 s including ~0.2 s of
// ssh. 20 s is ~12x the slowest of those — wide enough that a loaded box never trips it, narrow
// enough that a wedged call fails in twenty seconds instead of never.
//
// The copies are the OTHER hazard, and it is not hypothetical: the destination lives on C:, the
// drive that reached 1,134,592 bytes free twice in one week. copyFileSync throws on ENOSPC, and
// an unhandled throw here would surface as a stack trace — technically visible, operationally
// useless, and worst of all it could leave the .bak written and the real file half-replaced.
// fromThrowable turns both copies into values so the failure is reported as what it is: an
// OPERATIONAL error (the disk is full), not a programmer error worth crashing over.
const INTEROP_MS = 20_000;
const copyFile = fromThrowable(copyFileSync);

// Same rule as scripts/reclaim-system.ts: no subprocess runs unbounded. Bun.$ has no timeout, so
// interop goes through Bun.spawn with a native AbortSignal, and the overrun is read off the
// SIGNAL — proc.killed is true after any clean exit and cannot answer "did this overrun?".
async function capture(cmd: string[], ms: number): Promise<string> {
  if (!Bun.which(cmd[0] ?? "")) return "";
  const sig = AbortSignal.timeout(ms);
  const proc = Bun.spawn(cmd, {
    stdout: "pipe",
    stderr: "ignore",
    signal: sig,
  });
  const [out] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  return sig.aborted ? "" : out.replace(/\r/g, "").trim();
}

// Deploy wsl/wslconfig.win to the Windows profile as %USERPROFILE%\.wslconfig.
// Consumer: human/agent running `mise run wsl:wslconfig`; output is verdict lines.
//
// WHY A COPY AND NOT A SYMLINK — the one place this repo cannot use its usual mechanism.
// Every other dotfile is a symlink (scripts/link-dots.sh), because the consumer is a Linux or
// macOS program that follows them. .wslconfig is read by the Windows-side WSL service, and
// Windows does not follow a symlink created inside WSL. So this file is COPIED, and a copy can
// go stale — which is exactly why it gets a task of its own that reports drift instead of a
// silent link that can never drift. It is the second generated-not-linked exception in this
// repo, after ~/.claude/settings.json (scripts/render-claude-settings.ts).
//
// WHY IT IS TRACKED AT ALL. On 2026-09-09 this file was edited by scp'ing straight to the
// Windows host — the machine ended up with settings that existed nowhere in the repo, which is
// precisely the drift the single-source rule exists to prevent. Bringing it here undoes that.
//
// MACHINE-SPECIFIC SIZING IS GUARDED, NOT ASSUMED. wslconfig.win's memory= is tuned to r99's
// 63.9 GB of physical RAM. On a smaller host the same number would over-commit Windows into the
// instability this repo already hit once. So the deploy REFUSES on a host whose RAM cannot
// afford the configured memory=, rather than trusting that only one machine will ever run it.

const RESERVE_GB = 6; // Windows needs headroom; 60GB on a 63.9GB host measurably destabilised it

if (
  !(
    await Bun.file("/proc/sys/kernel/osrelease")
      .text()
      .catch(() => "")
  )
    .toLowerCase()
    .includes("microsoft")
) {
  console.log(
    "not running inside WSL — .wslconfig lives on the Windows host, so this task",
  );
  console.log("must run from inside the WSL distro that host is running.");
  process.exit(1);
}

const src = `${process.env.DOTFILES ?? `${process.env.HOME}/dotfiles`}/wsl/wslconfig.win`;
if (!existsSync(src)) {
  console.log(`missing source: ${src}`);
  process.exit(1);
}

// Windows-side %USERPROFILE%, derived rather than hardcoded — CLAUDE.md forbids machine-absolute
// paths in shared files. cmd.exe is deliberately absent from this box's non-interactive PATH
// (it made Zed misdetect WSL2 as Windows), so PowerShell is the interop path. cwd must be a
// Windows-reachable path or interop warns about the UNC fallback and pollutes stdout.
const profileRaw = await capture(
  [
    "powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Write-Output $env:USERPROFILE",
  ],
  INTEROP_MS,
);

if (profileRaw === "") {
  console.log(
    "could not read %USERPROFILE% via powershell.exe interop — is interop enabled?",
  );
  console.log(
    "  (/etc/wsl.conf [interop] enabled=true, and powershell.exe on PATH)",
  );
  process.exit(1);
}

const profile = await capture(["wslpath", "-u", profileRaw], INTEROP_MS);
if (profile === "" || !existsSync(profile)) {
  console.log(`wslpath could not map ${profileRaw} to a readable directory`);
  process.exit(1);
}
const dest = `${profile}/.wslconfig`;

// The sizing guard. Windows reports total RAM in bytes; compare against the memory= this file
// actually asks for, and refuse rather than deploy a config that over-commits the host.
const wanted = (await Bun.file(src).text()).match(
  /^\s*memory\s*=\s*(\d+)\s*GB/im,
);
const totalRaw = await capture(
  [
    "powershell.exe",
    "-NoProfile",
    "-NonInteractive",
    "-Command",
    "Write-Output (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
  ],
  INTEROP_MS,
);
const hostGb = Number(totalRaw) / 1024 ** 3;
if (wanted?.[1] !== undefined && Number.isFinite(hostGb) && hostGb > 0) {
  const askGb = Number(wanted[1]);
  console.log(`host RAM ${hostGb.toFixed(1)} GB, config asks for ${askGb} GB`);
  if (askGb > hostGb - RESERVE_GB) {
    console.log(
      `REFUSED: memory=${askGb}GB leaves Windows under ${RESERVE_GB} GB on a ${hostGb.toFixed(1)} GB host.`,
    );
    console.log(
      "Lower memory= in wsl/wslconfig.win for this machine, then re-run.",
    );
    process.exit(1);
  }
}

// Idempotent: byte-identical means nothing to do. Report drift explicitly rather than silently
// overwriting, so a hand-edit on the Windows side is noticed before it is destroyed.
const srcBytes = await Bun.file(src).arrayBuffer();
if (existsSync(dest)) {
  const destBytes = await Bun.file(dest).arrayBuffer();
  const same =
    srcBytes.byteLength === destBytes.byteLength &&
    Buffer.from(srcBytes).equals(Buffer.from(destBytes));
  if (same) {
    console.log(`already current: ${dest} (${srcBytes.byteLength} bytes)`);
    process.exit(0);
  }
  const backup = `${dest}.bak`;
  // Back up BEFORE overwriting, and stop if that fails: the point of the .bak is to survive a
  // failed replace, so a run that could not write it must not go on to replace anything.
  const saved = copyFile(dest, backup);
  if (saved.isErr()) {
    console.log(`could not back up ${dest} to ${backup}: ${saved.error}`);
    console.log("host copy left untouched — nothing was written.");
    process.exit(1);
  }
  console.log(`drift found — previous host copy saved to ${backup}`);
}

// ENOSPC here is an OPERATIONAL error on a drive this repo has watched hit 1,134,592 bytes free,
// not a programmer error: report it as itself and leave the .bak in place, rather than exiting
// through a stack trace that says nothing about what to do next.
const wroteRes = copyFile(src, dest);
if (wroteRes.isErr()) {
  console.log(`could not write ${dest}: ${wroteRes.error}`);
  console.log(
    "If this is ENOSPC, free space on C: first — the .bak (if any) still holds the",
  );
  console.log("previous contents, so the host is in its pre-run state.");
  process.exit(1);
}
const wrote = (await Bun.file(dest).arrayBuffer()).byteLength;
console.log(`deployed: ${dest} (${wrote} bytes)`);
console.log("---");
console.log(
  "NOT live yet: .wslconfig is read when the WSL VM starts. To apply, stop the",
);
console.log(
  "keepalive task first or `wsl --shutdown` is undone within seconds:",
);
console.log("  (Windows) Disable-ScheduledTask -TaskName WSL-keepalive");
console.log(
  "  (Windows) wsl --shutdown          # every distro and every session dies here",
);
console.log(
  "  (Windows) Enable-ScheduledTask -TaskName WSL-keepalive; Start-ScheduledTask ...",
);
