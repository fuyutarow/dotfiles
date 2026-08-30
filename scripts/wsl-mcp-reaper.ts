import { $ } from "bun";

// STOPGAP: sweep leaked stdio MCP server processes on a timer (link:dots must have run
// first). Two-step by design, like wsl:ccc-daemon: link:dots places the units, this
// activates them.
// WHY: codex's app-server spawns the full stdio MCP set per session and never reaps it
// (2026-08-23: 2365 processes, 53 GB). The configs are now url-only, but a running
// app-server keeps its startup config, so this bounds memory until it restarts.
// RETIRE IT once that has happened: mise run wsl:mcp-reaper:off
const unit = `${process.env.HOME}/.config/systemd/user/mcp-reaper.timer`;
const unitLinked = (await $`test -e ${unit}`.nothrow()).exitCode === 0;
if (!unitLinked) {
  console.log("units not linked — run: mise run link:dots");
  process.exit(1);
}

// No runtime check: the reaper is POSIX sh on purpose. Its first version was bun TS and
// died under systemd with `/usr/bin/env: 'bun': No such file or directory` — the user
// manager's PATH does not carry linuxbrew, and a memory-emergency reaper must not depend on
// that.
// Prove the matcher before arming a process-killer on a timer.
console.log("--- dry run (no signals sent) ---");
await $`${process.env.HOME}/.local/bin/mcp-reaper --dry-run --min-age-sec 600 | head -5`;
console.log("---");
await $`systemctl --user daemon-reload`;
await $`systemctl --user enable --now mcp-reaper.timer`;
await $`systemctl --user list-timers mcp-reaper.timer --no-pager`;
