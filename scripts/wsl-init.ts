// `mise run wsl:init` — linux:init (Brewfile.core, dotfile links, agent CLIs) plus the WSL user
// services. Root-only steps never wait for a password: each one either runs through `sudo -n` or
// is listed at the end for a human to run. Re-running is safe; updating belongs to `mise run up`.
// Exit: 0 done (root steps may remain, listed) · 1 a step failed (its output says which).
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { sudoNow } from "./sudo-group.ts";

const DOTFILES = join(homedir(), "dotfiles");
const say = (line: string): void => {
  process.stdout.write(`wsl:init: ${line}\n`);
};

await $`mise run linux:init`.cwd(DOTFILES);
await $`mise run tmux:plugins`.cwd(DOTFILES);
// After link:dots: zsh/zshenv arms the no-self-spawn guard as soon as the unit is placed, so
// leaving the unit un-enabled would make every ccc call wait 30s and fail.
// linux:init's cc:install-mcp installs ccc; it skips that optional tool when uv is unavailable.
if (Bun.which("ccc") === null)
  say(
    "ccc is not installed — skipped its daemon; run: mise run cc:install-mcp && mise run wsl:ccc-daemon",
  );
else await $`mise run wsl:ccc-daemon`.cwd(DOTFILES);
await $`mise run wsl:capacity:enable`.cwd(DOTFILES);

const pending: string[] = [];
if (
  Bun.which("zsh") === null &&
  !(await sudoNow(["apt-get", "install", "-y", "zsh"]))
)
  pending.push("sudo apt-get install -y zsh");
const { username, shell } = userInfo();
const zsh = Bun.which("zsh") ?? "/usr/bin/zsh";
if (
  shell?.endsWith("/zsh") !== true &&
  !(await sudoNow(["chsh", "-s", zsh, username]))
)
  pending.push(`sudo chsh -s ${zsh} ${username}`);

if (pending.length > 0) {
  say("root steps left for you (sudo needs a password here):");
  for (const command of pending) say(`  ${command}`);
  say("then re-run: mise run link:dots   # /etc links it listed as skipped");
}
say("done. Run: exec zsh");
