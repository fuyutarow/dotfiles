import { $ } from "bun";

// TS via `fd -e ts -E agents/skills` (house source only — agents/skills/** holds vendored
// skill templates, excluded like it is for shfmt/rumdl).
const files = (await $`fd -e ts -E agents/skills .`.text()).trim();
if (!files) {
  console.log("no ts files");
  process.exit(0);
}
await $`echo ${files} | xargs biome format --write --indent-style=space --indent-width=2`;
