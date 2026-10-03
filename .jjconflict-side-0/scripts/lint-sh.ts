import { $ } from "bun";

// File list reused from shfmt -f (same discovery shfmt/fmt:sh use).
const files = (
  await $`shfmt -f scripts tmux/scripts agents/claude lazygit macos .githooks`.text()
).trim();
if (!files) {
  console.log("no shell files");
  process.exit(0);
}
await $`echo ${files} | xargs shellcheck -x`;
