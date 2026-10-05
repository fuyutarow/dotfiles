// `mise run linux:init` — the core dev utilities on a throwaway Linux box (a rented GPU container,
// a fresh VM): linuxbrew, the Brewfile entries marked `@core` (shell, search, VCS, herdr, mise …),
// the dotfile links, and what `herdr --remote` needs. Experiment environments (Julia, CUDA, Python)
// are NOT dotfiles: each repo's mise.toml installs its own (`mise install` in that repo). Run as the target user (never root: Homebrew refuses it), after
// scripts/bootstrap-linux.sh has made the user and installed linuxbrew + bun + mise.
//
// Not wsl:init: that one adds systemd units (ccc daemon, capacity) a container cannot run, and the
// whole Brewfile, whose TeX toolchain alone takes longer than most rentals last.
// Exit: 0 done · 1 a step failed (its output says which).
import {
  existsSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const DOTFILES = join(homedir(), "dotfiles");
const BREW = "/home/linuxbrew/.linuxbrew/bin";

const remote = readFileSync(join(DOTFILES, "Brewfile"), "utf8")
  .split("\n")
  .flatMap((l) => {
    const m = /^brew "([^"]+)".*#\s*@core\b/u.exec(l);
    return m?.[1] === undefined ? [] : [m[1]];
  });
console.log(
  `linux:init: brew install ${remote.length} @core entries: ${remote.join(" ")}`,
);
await $`${BREW}/brew install ${remote}`;

console.log("linux:init: linking dotfiles");
await $`bash ${join(DOTFILES, "scripts/link-dots.sh")} --force`;

// `herdr --remote` and `mise run …` over a NON-interactive ssh see only what zsh/zshenv puts on
// PATH (~/.local/bin, ~/.bun/bin), not linuxbrew. Expose exactly the commands a remote driver needs.
const bin = join(homedir(), ".local/bin");
mkdirSync(bin, { recursive: true });
for (const cmd of ["herdr", "mise", "jj", "bun"]) {
  const link = join(bin, cmd);
  if (existsSync(link)) unlinkSync(link);
  symlinkSync(join(BREW, cmd), link);
}

console.log("linux:init: sheldon plugins and repo dependencies");
await $`${BREW}/sheldon lock`.nothrow();
await $`${BREW}/mise trust ${DOTFILES}/mise.toml`;
await $`${BREW}/mise run deps`.cwd(DOTFILES);
console.log("linux:init: done — connect with `herdr --remote <host>`");
