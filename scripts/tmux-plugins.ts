import { $ } from "bun";
import { access, stat } from "node:fs/promises";
import { attempt } from "../agents/hooks/attempt.ts";

// Install tmux plugins via TPM (non-interactive; run after link-dots).
const tpmDir = `${process.env["HOME"]}/.tmux/plugins/tpm`;
const gitDir = `${tpmDir}/.git`;
const git = await attempt(() => access(gitDir));
if (!(git.ok && (await stat(gitDir)).isDirectory())) {
  await $`git clone --depth 1 https://github.com/tmux-plugins/tpm ${tpmDir}`;
}
await $`${tpmDir}/bin/install_plugins`;
