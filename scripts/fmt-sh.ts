import { $ } from "bun";

// Bash file discovery is centralised via `shfmt -f <dirs>` (extension+shebang detection).
const files = (
  await $`shfmt -f scripts tmux/scripts agents/claude lazygit .githooks`.text()
).trim();
if (!files) {
  console.log("no shell files");
  process.exit(0);
}
await $`echo ${files} | xargs shfmt -w -ln bash -i 2 -ci -sr -bn -s`;
