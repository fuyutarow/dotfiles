// `mise run codex:remote-control` — converge the Codex app-server daemon's remote control to
// agents/codex/app-server.toml. Idempotent: no drift → no command (so a live daemon is never
// restarted for nothing). On drift it runs `codex app-server daemon enable-remote-control` (or
// disable-), which persists the setting AND restarts a running daemon — measured 2026-10-01, the
// help text's "currently running" means a restart, so sessions on it are resumed, not kept.
// Also run by agents/codex/codex-update.ts after every update. No argv (no Cleye boundary owed).
// Exit: 0 converged/skipped · 1 still drifting after the command · 2 broken declaration.
import { homedir } from "node:os";
import { join } from "node:path";
import { drift, readDeclared, readLive } from "./remote-control.ts";

const home = process.env.HOME ?? homedir();
const dotfiles = process.env.DOTFILES ?? join(home, "dotfiles");

if (Bun.which("codex") === null) {
  console.log("codex-remote-control: codex absent — skipped");
  process.exit(0);
}
const declared = await readDeclared(dotfiles);
if (declared instanceof Error) {
  console.error(`codex-remote-control: ${declared.message}`);
  process.exit(2);
}
const before = drift(declared, await readLive(home));
if (before.length === 0) {
  console.log(
    `codex-remote-control: remote control ${declared ? "enabled" : "disabled"} — matches the declaration`,
  );
  process.exit(0);
}
console.log(`codex-remote-control: drift — ${before.join("; ")}`);
const verb = declared ? "enable-remote-control" : "disable-remote-control";
const proc = Bun.spawn(["codex", "app-server", "daemon", verb], {
  stdout: "inherit",
  stderr: "inherit",
  timeout: 2 * 60_000,
});
await proc.exited;
const after = drift(declared, await readLive(home));
if (after.length > 0) {
  console.error(
    `codex-remote-control: still drifting after '${verb}' — ${after.join("; ")}`,
  );
  process.exit(1);
}
console.log(`codex-remote-control: converged (${verb})`);
