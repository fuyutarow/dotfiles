import { $ } from "bun";
import { consola } from "consola";

// Hand the ccc daemon to systemd with CPU/RAM caps (link:dots must have run first).
// Two-step by design, like cc:install-mcp: link:dots places the unit, this activates it.
// Stop the incumbent first — a fresh daemon unlinks and rebinds the socket at startup, so
// skipping this leaves the old uncapped process alive and orphaned from its socket.
const unit = `${process.env["HOME"]}/.config/systemd/user/ccc-daemon.service`;
const unitLinked = (await $`test -e ${unit}`.nothrow()).exitCode === 0;
if (!unitLinked) {
  consola.error("unit not linked — run: mise run link:dots");
  process.exitCode = 1;
} else if (Bun.which("ccc") === undefined) {
  consola.error(
    "ccc not on PATH — install it first (uv tool install cocoindex-code)",
  );
  process.exitCode = 1;
} else {
  const active =
    await $`systemctl --user is-active --quiet ccc-daemon.service`.nothrow();
  if (active.exitCode === 0) {
    consola.info("unit already active — skipping the one-time migration stop");
  } else {
    await $`ccc daemon stop`.quiet().nothrow();
  }
  await $`systemctl --user daemon-reload`;
  await $`systemctl --user enable --now ccc-daemon.service`;
  await $`systemctl --user status ccc-daemon.service --no-pager | head -12`.nothrow();
  consola.log("---");
  await $`systemctl --user show ccc-daemon.service -p CPUQuotaPerSecUSec -p MemoryHigh -p MemoryMax -p MemorySwapMax -p TasksMax`;
}
