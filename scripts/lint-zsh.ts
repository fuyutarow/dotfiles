import { $ } from "bun";
import { existsSync } from "node:fs";

// zsh syntax gate: `zsh -n` parse-only on boot-critical zsh config (MUST use the zsh binary,
// never bash -n).
const files = [
  "zsh/aliases.zsh",
  "zsh/mac.zsh",
  "zsh/wsl.zsh",
  "zsh/zshrc",
  "zsh/zshenv",
  "zsh/zprofile.mac",
  "zsh/zprofile.wsl",
];

let rc = 0;
for (const f of files) {
  if (!existsSync(f)) continue;
  const res = await $`zsh -n ${f}`.nothrow();
  if (res.exitCode === 0) {
    console.log(`✅ ${f}`);
  } else {
    console.log(`❌ ${f}`);
    rc = 1;
  }
}
process.exit(rc);
