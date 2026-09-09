import { $ } from "bun";
import { existsSync, copyFileSync } from "node:fs";

// Deploy wsl/wslconfig.host to the Windows profile as %USERPROFILE%\.wslconfig.
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
// MACHINE-SPECIFIC SIZING IS GUARDED, NOT ASSUMED. wslconfig.host's memory= is tuned to r99's
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

const src = `${process.env.DOTFILES ?? `${process.env.HOME}/dotfiles`}/wsl/wslconfig.host`;
if (!existsSync(src)) {
  console.log(`missing source: ${src}`);
  process.exit(1);
}

// Windows-side %USERPROFILE%, derived rather than hardcoded — CLAUDE.md forbids machine-absolute
// paths in shared files. cmd.exe is deliberately absent from this box's non-interactive PATH
// (it made Zed misdetect WSL2 as Windows), so PowerShell is the interop path. cwd must be a
// Windows-reachable path or interop warns about the UNC fallback and pollutes stdout.
const profileRaw = (
  await $`powershell.exe -NoProfile -NonInteractive -Command ${"Write-Output $env:USERPROFILE"}`
    .cwd("/mnt/c")
    .quiet()
    .nothrow()
    .text()
)
  .replace(/\r/g, "")
  .trim();

if (profileRaw === "") {
  console.log(
    "could not read %USERPROFILE% via powershell.exe interop — is interop enabled?",
  );
  console.log(
    "  (/etc/wsl.conf [interop] enabled=true, and powershell.exe on PATH)",
  );
  process.exit(1);
}

const profile = (
  await $`wslpath -u ${profileRaw}`.quiet().nothrow().text()
).trim();
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
const totalRaw = (
  await $`powershell.exe -NoProfile -NonInteractive -Command ${"Write-Output (Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory"}`
    .cwd("/mnt/c")
    .quiet()
    .nothrow()
    .text()
)
  .replace(/\r/g, "")
  .trim();
const hostGb = Number(totalRaw) / 1024 ** 3;
if (wanted?.[1] !== undefined && Number.isFinite(hostGb) && hostGb > 0) {
  const askGb = Number(wanted[1]);
  console.log(`host RAM ${hostGb.toFixed(1)} GB, config asks for ${askGb} GB`);
  if (askGb > hostGb - RESERVE_GB) {
    console.log(
      `REFUSED: memory=${askGb}GB leaves Windows under ${RESERVE_GB} GB on a ${hostGb.toFixed(1)} GB host.`,
    );
    console.log(
      "Lower memory= in wsl/wslconfig.host for this machine, then re-run.",
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
  copyFileSync(dest, backup);
  console.log(`drift found — previous host copy saved to ${backup}`);
}

copyFileSync(src, dest);
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
