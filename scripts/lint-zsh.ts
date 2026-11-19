import { $ } from "bun";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { consola } from "consola";
import { loadToolDeclarations } from "@dotfiles/shared/src/tool-declaration.ts";

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

// Shell fragments come from the tool declarations (tools/<name>/tool.toml `shell`), not a list here.
const { declared } = await loadToolDeclarations(join(import.meta.dir, ".."));
for (const { dir, declaration } of declared)
  if (declaration.shell !== undefined)
    files.push(`tools/${dir}/${declaration.shell}`);

let rc = 0;
for (const f of files) {
  if (
    !(await access(f).then(
      () => true,
      () => false,
    ))
  )
    continue;
  const res = await $`zsh -n ${f}`.nothrow();
  if (res.exitCode === 0) {
    consola.success(`✅ ${f}`);
  } else {
    consola.error(`❌ ${f}`);
    rc = 1;
  }
}
process.exit(rc);
