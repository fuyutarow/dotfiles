import { $ } from "bun";
import { consola } from "consola";

// Bash file discovery is centralised via `shfmt -f <dirs>` (extension+shebang detection).
const files = (
  await $`shfmt -f scripts config/tmux/scripts agents/claude config/lazygit config/macos .githooks`.text()
).trim();
if (files === "") {
  consola.info("no shell files");
  process.exit(0);
}
await $`echo ${files} | xargs shfmt -w -ln bash -i 2 -ci -sr -bn -s`;
