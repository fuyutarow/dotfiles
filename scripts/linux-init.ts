// `mise run linux:init` — the core dev utilities on a Linux box that is not this repo's WSL host: a
// rented GPU container, a fresh VM, or a shared server where we have no root. It installs the
// Brewfile entries marked `@core` (shell, search, VCS, herdr …), the agent CLIs, the dotfile links,
// and what `herdr --remote` needs. Experiment environments (Julia, CUDA, Python) are NOT dotfiles:
// each repo's mise.toml installs its own (`mise install` in that repo). Run as the target user.
//
// TWO INSTALL PATHS, ONE LIST. The list is always Brewfile `@core`; only the installer differs.
//   brew      /home/linuxbrew/.linuxbrew exists (scripts/bootstrap-linux.sh made it, as root).
//   rootless  it does not — a shared server (sol, 2026-10-05). Homebrew under ~ is not an option:
//             most bottles relocate only into a prefix of <= 26 characters (the length of
//             /home/linuxbrew/.linuxbrew), so a home prefix falls back to building every formula
//             from source. Instead mise DOWNLOADS each tool's prebuilt release and its executables
//             are linked into ~/.local/bin — the same status a linuxbrew bin has on PATH. Nothing is
//             declared in ~/.config/mise (INV-6: no global [tools]); mise is only the downloader.
//             Runtimes (bun, uv) are skipped there: repos declare them, dotfiles' mise.toml too.
// Bootstrap for the rootless path (no root, nothing but curl + git):
//   curl -fsSL https://mise.run | sh
//   git clone https://github.com/fuyutarow/dotfiles ~/dotfiles
//   ~/.local/bin/mise x bun@1.4 -- bun ~/dotfiles/scripts/linux-init.ts
//
// Not wsl:init: that one adds systemd units (ccc daemon, capacity) a container cannot run, and the
// whole Brewfile, whose TeX toolchain alone takes longer than most rentals last.
// Exit: 0 done · 1 a step failed (its output says which).
import {
  existsSync,
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

const HOME = homedir();
const DOTFILES = join(HOME, "dotfiles");
const BIN = join(HOME, ".local/bin");
const BREW = "/home/linuxbrew/.linuxbrew/bin";
const ROOTLESS = !existsSync(join(BREW, "brew"));
const MISE = ROOTLESS ? join(BIN, "mise") : join(BREW, "mise");

// Brewfile formula → mise tool, only where the names differ. Every other @core formula is looked up
// in mise's registry under its own name; a missing one fails the install loudly, never silently.
const MISE_NAME: Readonly<Record<string, string>> = {
  "git-delta": "delta",
  "choose-rust": "choose",
  tldr: "tealdeer",
  "rm-improved": "github:nivekuil/rip",
  procs: "github:dalance/procs",
};
// Not installed by the rootless path, each for a stated reason (printed, never silent).
const ROOTLESS_SKIP: Readonly<Record<string, string>> = {
  mise: "already the installer (~/.local/bin/mise)",
  bun: "a runtime: declared per repo (INV-6), dotfiles' own mise.toml included",
  uv: "a runtime: declared per repo (INV-6)",
};

const say = (line: string): void => {
  process.stdout.write(`linux:init: ${line}\n`);
};

const core = readFileSync(join(DOTFILES, "Brewfile"), "utf8")
  .split("\n")
  .flatMap((l) => {
    const m = /^brew "([^"]+)".*#\s*@core\b/u.exec(l);
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

async function installRootless(): Promise<void> {
  const tools = core.filter((f) => ROOTLESS_SKIP[f] === undefined);
  for (const f of core.filter((x) => ROOTLESS_SKIP[x] !== undefined))
    say(`skip ${f}: ${ROOTLESS_SKIP[f]}`);
  const ids = tools.map((f) => `${MISE_NAME[f] ?? f}@latest`);
  say(`rootless: mise install ${ids.length} @core tools (prebuilt releases)`);
  await $`${MISE} install ${ids}`;
  mkdirSync(BIN, { recursive: true });
  for (const id of ids) {
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
    for (const exe of exes) relink(join(BIN, exe.split("/").pop() ?? ""), exe);
  }
}

async function installBrew(): Promise<void> {
  say(`brew install ${core.length} @core entries: ${core.join(" ")}`);
  await $`${BREW}/brew install ${core}`;
  // `herdr --remote` over a NON-interactive ssh sees only what zsh/zshenv puts on PATH
  // (~/.local/bin, ~/.bun/bin, the mise shims), not linuxbrew. Expose exactly the brew commands a
  // remote driver needs. NOT bun: a bun reachable from every directory is the implicit global
  // toolchain INV-6 forbids (doctor's mise-scope FAILed on it, 2026-10-05).
  mkdirSync(BIN, { recursive: true });
  for (const cmd of ["herdr", "mise", "jj"])
    relink(join(BIN, cmd), join(BREW, cmd));
}

if (ROOTLESS) await installRootless();
else await installBrew();

const staleBun = join(BIN, "bun");
if (lstatSync(staleBun, { throwIfNoEntry: false })?.isSymbolicLink() === true) {
  unlinkSync(staleBun);
  say(`removed ${staleBun} (INV-6: bun comes from mise, per repo)`);
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
// installer into ~/.local/bin (mise.toml install:ai-clis says why not brew/npm). Missing on the first
// rented box (2026-10-05: `claude: command not found` in a repo checkout).
say("agent CLIs (Claude Code, Codex)");
await $`${MISE} run install:ai-clis`.cwd(DOTFILES);

say("sheldon plugins");
await $`${ROOTLESS ? join(BIN, "sheldon") : join(BREW, "sheldon")} lock`;
say("done — connect with `herdr --remote <host>`");
