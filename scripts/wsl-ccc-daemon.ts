import { $ } from "bun";

// Hand the ccc daemon to systemd with CPU/RAM caps (link:dots must have run first).
// Two-step by design, like cc:install-mcp: link:dots places the unit, this activates it.
// Stop the incumbent first — a fresh daemon unlinks and rebinds the socket at startup, so
// skipping this leaves the old uncapped process alive and orphaned from its socket.
const unit = `${process.env.HOME}/.config/systemd/user/ccc-daemon.service`;
const unitLinked = (await $`test -e ${unit}`.nothrow()).exitCode === 0;
if (!unitLinked) {
  console.log("unit not linked — run: mise run link:dots");
  process.exit(1);
}

// Without the binary the unit would crash-loop into systemd's start limit and stay dead,
// while zsh/zshenv has already forbidden clients from spawning their own — fail loudly
// instead.
if (!Bun.which("ccc")) {
  console.log(
    "ccc not on PATH — install it first (uv tool install cocoindex-code)",
  );
  process.exit(1);
}

// The stop is a ONE-TIME migration off an uncapped lazy-spawned daemon. Re-running it while
// the unit already owns a daemon would abort every project's in-flight index (a StopRequest
// cancels them with no resume), so an already-active unit skips it and this task stays
// idempotent.
const active =
  await $`systemctl --user is-active --quiet ccc-daemon.service`.nothrow();
if (active.exitCode === 0) {
  console.log("unit already active — skipping the one-time migration stop");
} else {
  await $`ccc daemon stop`.quiet().nothrow();
}
await $`systemctl --user daemon-reload`;
await $`systemctl --user enable --now ccc-daemon.service`;
await $`systemctl --user status ccc-daemon.service --no-pager | head -12`.nothrow();
console.log("---");
await $`systemctl --user show ccc-daemon.service -p CPUQuotaPerSecUSec -p MemoryHigh -p MemoryMax -p MemorySwapMax -p TasksMax`;
