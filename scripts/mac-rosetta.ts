import { $ } from "bun";

// Install Rosetta 2 on Apple Silicon; an idempotent no-op anywhere else (Intel mac, Linux/WSL).
// Moved out of mise.toml 2026-09-22: a branch in a TOML body cannot be imported or tested
// (wiring-mise-tasks body rule, mise-contract HARD FAIL).
if (process.platform !== "darwin" || process.arch !== "arm64") {
  console.log("skip: not Apple Silicon");
  process.exit(0);
}
await $`softwareupdate --install-rosetta --agree-to-license`;
