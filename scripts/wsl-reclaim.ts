import { $ } from "bun";

// Reclaim disk INSIDE a WSL2 distro — the Linux system caches that `cache:clean` does not own,
// then fstrim. Consumer: human/agent running `mise run wsl:reclaim`; output is verdict lines.
//
// WHY THIS IS A SEPARATE TASK FROM cache:clean. cache:clean is the OS-neutral, sudo-free,
// per-user PACKAGE-manager cache task (brew/bun/npm/pnpm/yarn/uv/pip/go/docker/cargo). Everything
// here is root-owned Linux SYSTEM state (apt archives, the journal, snap revisions) plus fstrim,
// which is not a cache at all but the WSL↔Windows disk boundary. Splitting on "who owns the
// bytes" keeps cache:clean runnable on macOS and keeps sudo out of it.
//
// WHY IT MATTERS MORE THAN IT LOOKS (measured on r99, 2026-09-09). Freeing space in here DOES
// return it to the Windows drive, live, with the distro running: ~127 GB deleted inside the guest
// moved C: free from 40.97 GB to 146.06 GB (+105 GB) while Ubuntu-24.04 stayed Running. The vhdx
// carries the NTFS sparse attribute, and discard reaches the host file. So this task is a direct
// lever on a full C:, not merely a brake on future growth.
//
// MEASURE THE VHDX WITH `du`, NEVER WITH PowerShell's `Get-Item.Length`. On a sparse file Length
// is the LOGICAL high-water mark: 540 GB apparent vs 406 GB actually allocated on the same file.
// Reading Length as if it were disk usage produced a confident, wrong conclusion on 2026-09-07 —
// that fstrim had failed and only a shutdown could reclaim — from an `fstrim -v /` that reported
// 522.9 GiB trimmed while C: free moved 15.79 -> 15.81 GB. The trim was a no-op because those
// blocks were ALREADY deallocated, and a no-op is not evidence about the mechanism.
//   du -sh --apparent-size <vhdx>   # logical
//   du -sh <vhdx>                   # allocated  <- the one that matters
//
// THE CAP. `.wslconfig` does have a storage key — `defaultVhdSize` — but it sizes NEWLY created
// VHDs and cannot shrink an existing distro. On r99 the existing max is the 1007 GB default,
// larger than C: itself (931 GB), which is precisely why WSL could fill the whole system drive.
// Capping an existing distro needs `wsl --manage <distro> --resize`, with the distro Stopped.

const osrelease = await Bun.file("/proc/sys/kernel/osrelease")
  .text()
  .catch(() => "");
if (!osrelease.toLowerCase().includes("microsoft")) {
  console.log(
    "not running inside WSL — this task is WSL-only (see: mise run cache:clean)",
  );
  process.exit(1);
}

// Every step below is root-owned. Probe once with `sudo -n` (non-interactive) rather than letting
// each step hang on a password prompt inside a task runner that may have no tty.
const canSudo = (await $`sudo -n true`.quiet().nothrow()).exitCode === 0;
if (!canSudo) {
  console.log(
    "passwordless sudo unavailable — run this task from an interactive shell:",
  );
  console.log("  sudo -v && mise run wsl:reclaim");
  process.exit(1);
}

const df = async () =>
  (await $`df -h --output=used,avail,pcent /`.text()).trim();
console.log(`before:\n${await df()}`);

if (Bun.which("apt-get")) {
  console.log("• apt-get clean (downloaded .deb archives — regenerable)");
  await $`sudo -n apt-get clean`.nothrow();
}

// The journal is capped by SystemMaxUse in journald.conf, which defaults to 10% of the
// filesystem — on a 1 TB vhdx that is a 100 GB ceiling nobody intended. Vacuum to a size the
// box can actually afford; this is lossy for OLD logs only, never for the current boot.
if (Bun.which("journalctl")) {
  console.log("• journalctl --vacuum-size=200M (old archived journals)");
  await $`sudo -n journalctl --vacuum-size=200M`.nothrow();
}

// snap keeps the previous revision of every package so it can roll back. Those are whole
// squashfs images; four disabled revisions measured 388 MB on r99. `snap remove --revision`
// drops only the DISABLED ones, never the active install.
if (Bun.which("snap")) {
  const listed = await $`snap list --all`.text().catch(() => "");
  const disabled = listed
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((f) => f.length >= 6 && f[5]?.includes("disabled"))
    .map((f) => ({ name: f[0] ?? "", revision: f[2] ?? "" }))
    .filter((s) => s.name !== "" && s.revision !== "");
  console.log(`• snap disabled revisions: ${disabled.length}`);
  for (const s of disabled) {
    await $`sudo -n snap remove ${s.name} --revision=${s.revision}`.nothrow();
  }
}

// fstrim LAST: it can only release blocks the steps above have actually freed.
console.log("• fstrim / (marks freed blocks discardable)");
await $`sudo -n fstrim -v /`.nothrow();

console.log(`after:\n${await df()}`);
console.log("---");
console.log(
  "Guest space reclaimed. The sparse vhdx releases these blocks to the Windows drive LIVE —",
);
console.log(
  "no shutdown needed. Verify from Windows, or from here with `du -sh` (NOT Get-Item.Length,",
);
console.log("which reports a sparse file's logical size) on the vhdx.");
console.log(
  "Sibling tasks: cache:clean (package caches) / cache:toolchains (rustup, vscode-server)",
);
