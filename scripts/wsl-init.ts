import { $ } from "bun";

// Initialize WSL environment (after: install linuxbrew, brew install mise).
await $`sudo apt install -y zsh`;
await $`brew install sheldon topgrade`;
await $`mise run deps`; // before link-dots.ts: it imports Cleye from node_modules
await $`bun ${process.env.HOME}/dotfiles/scripts/link-dots.ts --force`;
await $`brew bundle --file=${process.env.HOME}/dotfiles/Brewfile`;
await $`mise run tmux:plugins`;
await $`topgrade`;
// After the tool installs: zsh/zshenv arms the no-self-spawn guard as soon as link-dots
// places the unit, so leaving the unit un-enabled would make every ccc call wait 30s and fail.
await $`mise run wsl:ccc-daemon`;
await $`mise run wsl:capacity:enable`;
await $`chsh -s $(which zsh)`;
console.log("---");
console.log("Setup complete. Run: exec zsh");
