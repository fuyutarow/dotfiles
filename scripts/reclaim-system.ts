// Reclaim disk INSIDE a WSL2 distro — the Linux system caches that `reclaim:clean` does not own,
// then fstrim. Consumer: human/agent running `mise run reclaim:system`; output is verdict lines.
//
// WHY THIS IS A SEPARATE TASK FROM reclaim:clean. reclaim:clean is the OS-neutral, sudo-free,
// per-user PACKAGE-manager cache task (brew/bun/npm/pnpm/yarn/uv/pip/go/docker/cargo). Everything
// here is root-owned Linux SYSTEM state (apt archives, the journal, snap revisions) plus fstrim,
// which is not a cache at all but the WSL↔Windows disk boundary. Splitting on "who owns the
// bytes" keeps reclaim:clean runnable on macOS and keeps sudo out of it.
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
    "not running inside WSL — this task is WSL-only (see: mise run reclaim:clean)",
  );
  process.exit(1);
}

// --- bounded step runner -------------------------------------------------------------------
// Every reclaim step is a sudo subprocess, and an unbounded one is the failure this task can
// least afford: `mise run reclaim:system` would sit forever holding a sudo session, on a machine
// whose whole problem was that it had run out of disk. apt can block on the dpkg lock, snapd
// can wedge, and fstrim walks the entire filesystem.
//
// The bounds are measured on r99 (2026-09-10), not chosen for their roundness:
//     fstrim, cold       32457 ms      <- the only slow step, by two orders of magnitude
//     fstrim, warm          94 ms
//     apt-get clean          9 ms
//     journalctl            18 ms
//     snap list            165 ms
// FSTRIM_MS is ~9x the cold measurement, so a bigger filesystem or a busy device does not trip
// it; STEP_MS is ~360x the slowest of the rest. Both are wide on purpose — the bound exists to
// convert a HANG into a reported failure, not to police normal variance.
//
// AbortSignal, and the timeout is read off the SIGNAL rather than the process: `proc.killed` is
// true after any clean exit and `signalCode` cannot tell our timeout apart from an external
// kill, so neither can answer "did this overrun?".
const FSTRIM_MS = 300_000;
const STEP_MS = 60_000;
const SNAP_MAX = 32; // r99 held 4 disabled revisions on 2026-09-07; 8x headroom

type Outcome = "ok" | "failed" | "timeout" | "skipped";
type Ran = { code: number; out: string; err: string; timedOut: boolean };
const tally: Array<{ label: string; outcome: Outcome; detail: string }> = [];

// EVERY subprocess in this file goes through here, with no exceptions — including the ones that
// only read. That rule was earned: an earlier version bounded the reclaim steps but left the
// `sudo -n true` probe on Bun.$, and a fixture `sudo` that never returns hung the whole script
// before it printed a single line. A bound that covers the work but not the gate in front of it
// is not a bound. `df` and `snap list` are here for the same reason.
async function run(cmd: string[], ms: number): Promise<Ran> {
  const sig = AbortSignal.timeout(ms);
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", signal: sig });

  // One Promise.all for the two pipes and the exit: draining them sequentially deadlocks on
  // whichever one is not being read, and the only symptom would be our own timeout firing on a
  // healthy command.
  const work = Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).then(([out, err, code]) => ({ out, err, code }));

  // RACE it against the abort, and do not wait for the pipes once the bound has passed. This is
  // not belt-and-braces; awaiting the drain is itself unbounded. The signal kills the process we
  // SPAWNED, and a shell wrapper's grandchild survives that kill holding the write end of the
  // same pipe open, so text() waits for an EOF that never comes and the bound never reports.
  // Measured 2026-09-10 on r99, against a fixture `sudo` of `#!/bin/sh` + `sleep 999`: the run
  // printed nothing and was still alive at 80s under a 60s bound, until an external `timeout`
  // killed it (exit 124). A local probe missed it because it spawned `sleep` DIRECTLY, with no
  // shell in between and therefore no grandchild — only the end-to-end shape exposes this.
  const aborted = new Promise<null>((resolve) => {
    sig.addEventListener("abort", () => resolve(null), { once: true });
  });
  const done = await Promise.race([work, aborted]);

  // Read the overrun off the SIGNAL. proc.killed is true after ANY clean exit, and signalCode
  // cannot tell our timeout apart from an external kill — neither can answer "did this overrun?".
  if (done === null) {
    // Residual risk, accepted and named: an orphaned grandchild may outlive this process. It is
    // strictly better than the alternative it replaces, which was this script never returning.
    return { code: -1, out: "", err: "", timedOut: true };
  }
  return { ...done, timedOut: sig.aborted };
}

async function step(
  label: string,
  cmd: string[],
  ms: number = STEP_MS,
): Promise<Outcome> {
  if (!Bun.which(cmd[0] ?? "")) {
    tally.push({ label, outcome: "skipped", detail: `${cmd[0]} not on PATH` });
    return "skipped";
  }
  const r = await run(cmd, ms);
  const outcome: Outcome = r.timedOut
    ? "timeout"
    : r.code === 0
      ? "ok"
      : "failed";
  const detail = r.timedOut
    ? `no exit within ${ms / 1000}s — killed`
    : (r.out.trim() || r.err.trim() || `exit ${r.code}`).slice(0, 200);
  tally.push({ label, outcome, detail });
  console.log(`• ${label}: ${outcome}${detail ? ` — ${detail}` : ""}`);
  return outcome;
}

// Free bytes, as a NUMBER, so the run can report what it actually reclaimed. `df -h` is for
// eyes; a caller cannot subtract "12G" from "9.4G".
async function freeBytes(): Promise<number> {
  const r = await run(["df", "-B1", "--output=avail", "/"], STEP_MS);
  const n = Number(r.out.split("\n")[1]?.trim());
  return Number.isFinite(n) ? n : Number.NaN;
}

// The gate, now bounded like everything else. `sudo -n` is non-interactive on purpose: a task
// runner may have no tty, and a password prompt there is indistinguishable from a hang.
if (!Bun.which("sudo")) {
  console.log("no sudo on PATH — this task needs root to reclaim system state");
  process.exit(1);
}
const probe = await run(["sudo", "-n", "true"], STEP_MS);
if (probe.timedOut || probe.code !== 0) {
  console.log(
    probe.timedOut
      ? `sudo did not answer within ${STEP_MS / 1000}s — refusing to start`
      : "passwordless sudo unavailable — run this task from an interactive shell:",
  );
  if (!probe.timedOut) console.log("  sudo -v && mise run reclaim:system");
  process.exit(1);
}

const before = await freeBytes();
console.log(`before: ${(before / 1024 ** 3).toFixed(2)} GiB free`);

await step("apt-get clean (downloaded .deb archives)", [
  "sudo",
  "-n",
  "apt-get",
  "clean",
]);

// The journal is capped by SystemMaxUse in journald.conf, which defaults to 10% of the
// filesystem — on a 1 TB vhdx that is a 100 GB ceiling nobody intended. Vacuum to a size the
// box can actually afford; this is lossy for OLD logs only, never for the current boot.
// 200M is a JUDGEMENT, not a measurement: it is comfortably more than the 571 MB the journal
// held on r99 minus its archives, and small next to the 100 GB default ceiling. If a real
// retention requirement ever appears, measure how far back incidents are actually read and
// size it from that instead.
await step("journalctl --vacuum-size=200M (old archived journals)", [
  "sudo",
  "-n",
  "journalctl",
  "--vacuum-size=200M",
]);

// snap keeps the previous revision of every package so it can roll back. Those are whole
// squashfs images; four disabled revisions measured 388 MB on r99. `snap remove --revision`
// drops only the DISABLED ones, never the active install.
//
// The cap matters more than it looks: without it the number of sudo invocations is a function
// of text this script parsed, so malformed or unexpected `snap list` output turns into an
// unbounded run of privileged deletions. Bounded, and the remainder is REPORTED — a silent
// truncation would read as "there were only 32", which is the failure mode of every quiet cap.
if (Bun.which("snap")) {
  const listed = (await run(["snap", "list", "--all"], STEP_MS)).out;
  const disabled = listed
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .filter((f) => f.length >= 6 && f[5]?.includes("disabled"))
    .map((f) => ({ name: f[0] ?? "", revision: f[2] ?? "" }))
    .filter((s) => s.name !== "" && s.revision !== "");
  const take = disabled.slice(0, SNAP_MAX);
  if (disabled.length > SNAP_MAX) {
    console.log(
      `• snap: ${disabled.length} disabled revisions found, removing ${SNAP_MAX} this run — ${disabled.length - SNAP_MAX} left for the next`,
    );
  }
  for (const s of take) {
    await step(`snap remove ${s.name} --revision=${s.revision}`, [
      "sudo",
      "-n",
      "snap",
      "remove",
      s.name,
      `--revision=${s.revision}`,
    ]);
  }
  if (take.length === 0) {
    tally.push({
      label: "snap disabled revisions",
      outcome: "skipped",
      detail: "none",
    });
    console.log("• snap disabled revisions: none");
  }
}

// fstrim LAST: it can only release blocks the steps above have actually freed. Its own bound is
// the wide one — this is the step that walks the whole filesystem.
await step(
  "fstrim / (release freed blocks to Windows)",
  ["sudo", "-n", "fstrim", "-v", "/"],
  FSTRIM_MS,
);

const after = await freeBytes();
const gained = after - before;

console.log("---");
for (const t of tally) console.log(`  ${t.outcome.padEnd(8)} ${t.label}`);

const attempted = tally.filter((t) => t.outcome !== "skipped");
const failed = attempted.filter((t) => t.outcome !== "ok");
console.log("---");
console.log(
  `after: ${(after / 1024 ** 3).toFixed(2)} GiB free  (${gained >= 0 ? "+" : ""}${(gained / 1024 ** 3).toFixed(2)} GiB)`,
);
console.log(
  "The sparse vhdx releases these blocks to the Windows drive LIVE — no shutdown needed.",
);
console.log(
  "Verify with `du -sh <vhdx>`, NOT Get-Item.Length, which reports the logical size.",
);
console.log(
  "Siblings: reclaim:clean (package caches) / reclaim:toolchains (rustup, vscode-server)",
);

// Exit code answers ONE question: did this run do anything at all? A partial failure still
// reclaimed space and is worth reporting as success — the tally above says which step fell over.
// Every attempted step failing is different in kind: it means the run had no effect, and the
// usual cause is a sudo timestamp that expired between the gate and here, which a caller must
// be able to detect without parsing this output.
if (attempted.length > 0 && failed.length === attempted.length) {
  console.log(
    `FATAL: all ${attempted.length} attempted step(s) failed — nothing was reclaimed`,
  );
  process.exit(1);
}
