import { $ } from "bun";
import { consola } from "consola";

// File list reused from shfmt -f (same discovery shfmt/fmt:sh use).
const files = (
  await $`shfmt -f scripts config/tmux/scripts agents/claude config/lazygit config/macos .githooks`.text()
).trim();
if (files === "") {
  consola.info("no shell files");
  process.exit(0);
}
await $`echo ${files} | xargs shellcheck -x`;
