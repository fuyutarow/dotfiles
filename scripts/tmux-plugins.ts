import { $ } from "bun";
import { existsSync, statSync } from "node:fs";

// Install tmux plugins via TPM (non-interactive; run after link-dots).
const tpmDir = `${process.env.HOME}/.tmux/plugins/tpm`;
const gitDir = `${tpmDir}/.git`;
if (!(existsSync(gitDir) && statSync(gitDir).isDirectory())) {
  await $`git clone --depth 1 https://github.com/tmux-plugins/tpm ${tpmDir}`;
}
await $`${tpmDir}/bin/install_plugins`;
