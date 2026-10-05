// `mise run linux:init` — the core dev utilities (Brewfile.core) on a Linux box that is not this
// repo's WSL host: a rented GPU container, a fresh VM, a shared server without root. Then the agent
// CLIs, the dotfile links, and what `herdr --remote` needs. Experiment environments (Julia, CUDA,
// Python) are NOT dotfiles: each repo's mise.toml installs its own. Run as the target user.
//
// ONE INSTALLER: mise downloads each tool's prebuilt release and its executables are linked into
// ~/.local/bin — the same place on every such box, root or not. Homebrew is not used here: under ~
// most bottles cannot relocate (prefix must be <= 26 chars, the length of /home/linuxbrew/.linuxbrew),
// so it builds from source; and linuxbrew itself needs root and minutes. mise did 25 tools in ~20 s
// on sol (2026-10-05). Nothing is declared in ~/.config/mise (INV-6: no global [tools]); mise is
// only the downloader. Runtimes (bun, uv) go to ~/.local/share/dotfiles/runtime/bin instead, which
// zsh/zshrc puts on INTERACTIVE shells only — the reach brew's bun has on the Mac: Claude Code's
// hooks run `bun …`, but `ssh host 'cmd'` must not find an undeclared bun (INV-6). Skipping them
// outright (the first cut) left every Claude hook on sol failing.
//
// Bootstrap, no root needed (scripts/bootstrap-linux.sh does this as root after creating the user):
//   curl -fsSL https://mise.run | sh
//   git clone https://github.com/fuyutarow/dotfiles ~/dotfiles
//   ~/.local/bin/mise x bun@1.4 -- bun ~/dotfiles/scripts/linux-init.ts
// Exit: 0 done · 1 a step failed (its output says which).
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const DOTFILES = join(homedir(), "dotfiles");
const BIN = join(homedir(), ".local/bin");
const MISE = join(BIN, "mise");
const RUNTIME_BIN = join(homedir(), ".local/share/dotfiles/runtime/bin");
const RUNTIMES = new Set(["bun", "uv", "rustup"]);
// Core agent CLIs that are not Brewfile entries on Linux (on the Mac agy is a cask). Same mise path.
const AGENT_TOOLS = ["agy"] as const;

// Brewfile name → mise tool, only where they differ; any other name is looked up as-is, and a
// missing one fails `mise install` loudly.
const MISE_NAME: Readonly<Record<string, string>> = {
  "git-delta": "delta",
  "choose-rust": "choose",
  tldr: "tealdeer",
  "rm-improved": "github:nivekuil/rip",
  procs: "github:dalance/procs",
  rustup: "rust",
};
// Not installed here, for a stated reason (printed, never silent).
const SKIP: Readonly<Record<string, string>> = {
  mise: "already the installer (~/.local/bin/mise)",
};

const say = (line: string): void => {
  process.stdout.write(`linux:init: ${line}\n`);
};

const core = readFileSync(join(DOTFILES, "Brewfile.core"), "utf8")
  .split("\n")
  .flatMap((l) => {
    const m = /^brew "([^"]+)"/u.exec(l);
    return m?.[1] === undefined ? [] : [m[1]];
  });

function relink(link: string, target: string): void {
  if (lstatSync(link, { throwIfNoEntry: false }) !== undefined)
    unlinkSync(link);
  symlinkSync(target, link);
}

/** The executables in one of mise's bin dirs (mise's own answer, from `mise bin-paths`). */
function executables(binDir: string): string[] {
  return readdirSync(binDir)
    .map((name) => join(binDir, name))
    .filter((p) => {
      const st = statSync(p, { throwIfNoEntry: false });
      return st?.isFile() === true && (st.mode & 0o111) !== 0;
    });
}

for (const f of core.filter((x) => SKIP[x] !== undefined))
  say(`skip ${f}: ${SKIP[f]}`);
const tools = [...core.filter((f) => SKIP[f] === undefined), ...AGENT_TOOLS];
const ids = tools.map((f) => `${MISE_NAME[f] ?? f}@latest`);
say(`mise install ${ids.length} core tools (prebuilt releases)`);
await $`${MISE} install ${ids}`;
mkdirSync(BIN, { recursive: true });
mkdirSync(RUNTIME_BIN, { recursive: true });
for (const [i, id] of ids.entries()) {
  const dest = RUNTIMES.has(tools[i] ?? "") ? RUNTIME_BIN : BIN;
  // Ask mise where the binaries are: archive layouts differ (bat's sit under .mise-bins), so a
  // guessed <install>/bin missed them on the first real run (sol, 2026-10-05).
  const dirs = (await $`${MISE} bin-paths ${id}`.text())
    .split("\n")
    .filter((l) => l !== "");
  const exes = dirs.flatMap((d) => executables(d));
  if (exes.length === 0)
    throw new Error(
      `${id}: mise bin-paths named no executable (${dirs.join(", ")})`,
    );
  for (const exe of exes) relink(join(dest, exe.split("/").pop() ?? ""), exe);
}

// deps first: scripts/link-dots.ts imports Cleye from node_modules.
say("repo dependencies");
await $`${MISE} trust ${DOTFILES}/mise.toml`;
await $`${MISE} run deps`.cwd(DOTFILES);

say("linking dotfiles");
await $`${MISE} run link:dots`.cwd(DOTFILES);
// The post-merge hook relinks on every pull; without this a pull leaves new links unmade.
await $`git -C ${DOTFILES} config core.hooksPath .githooks`;

// The agent CLIs are core too, but not Brewfile entries: each comes from its vendor's self-updating
// installer into ~/.local/bin (mise.toml install:ai-clis says why not brew/npm).
say("agent CLIs (Claude Code, Codex)");
await $`${MISE} run install:ai-clis`.cwd(DOTFILES);

say("sheldon plugins");
await $`${join(BIN, "sheldon")} lock`;
say("done — check from your machine: mise run doctor:remote -- <host>");
