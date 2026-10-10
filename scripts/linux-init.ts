// `mise run linux:init` — Homebrew installs Brewfile.core on EVERY Linux box, then agent CLIs
// and dotfile links. Bootstrap root once with scripts/bootstrap-linux.sh; brew always runs as
// the target user. Existing hosts use linux:migrate-brew. Standard prefix is
// /home/linuxbrew/.linuxbrew; LAND_HOSTS declares ~/.linuxbrew for shared no-root hosts.
// Source builds are permitted and timed. Bun/uv come from Homebrew, including hook/SSH runtime
// reach. ~/.local/bin holds vendor agents, not a second core downloader. Experiment versions
// (Julia, CUDA, Python) stay in each repo's mise.toml; no global mise [tools] (INV-6).
// Exit: 0 done · 1 a step failed (its output says which).
import { existsSync, realpathSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";
import { $ } from "bun";
import { buildLinuxInitEnv } from "./linux-init-env.ts";
import { declareRentedCodexHost, hostDeclarationProbes } from "./agx-host.ts";
import { sudoIsOurs } from "./sudo-group.ts";
import { brewPrefix } from "./core-tools.ts";
import { installLinuxbrew, bundleCore } from "./linux-brew.ts";
import { migrateLinuxbrew } from "./linux-migrate-brew.ts";

const HOME = homedir();
const DOTFILES = join(HOME, "dotfiles");
const PREFIX = brewPrefix(HOME);
const MISE = join(PREFIX, "bin/mise");
const CHILD_ENV = buildLinuxInitEnv(HOME, process.env);
process.env.HOME = HOME;
process.env.PATH = CHILD_ENV.PATH ?? "";
$.env(CHILD_ENV);

const say = (line: string): void => {
  process.stdout.write(`linux:init: ${line}\n`);
};

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (
    type === "unknown-flag" &&
    (flag === "__proto__" || flag === "constructor")
  ) {
    process.stderr.write(`unknown flag(s): --${flag}\n`);
    process.exit(2);
  }
}

const parsed = cli(
  {
    name: "linux-init.ts",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    flags: {
      migrateBrew: {
        type: Boolean,
        description: "migrate existing core installs to Homebrew",
      },
      dryRun: {
        type: Boolean,
        description: "print the migration plan without any writes",
      },
      rented: {
        type: Boolean,
        description: "declare this owner's rented box for agx",
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);
if (parsed._.length > 0) {
  process.stderr.write(`unexpected argument(s): ${parsed._.join(" ")}\n`);
  process.exit(2);
}

if (parsed.flags.migrateBrew === true || parsed.flags.dryRun === true) {
  await migrateLinuxbrew(HOME, parsed.flags.dryRun ?? false);
  process.exit(0);
}

const codexHostDeclaration = declareRentedCodexHost({
  home: homedir(),
  rented: parsed.flags.rented ?? false,
  hostname: hostname(),
  date: Temporal.Now.plainDateISO().toString(),
  probes: hostDeclarationProbes(),
  say,
});
if (codexHostDeclaration === "invalid") process.exit(1);

const started = performance.now();
await installLinuxbrew(PREFIX, say);
say(`brew bundle Brewfile.core at ${PREFIX}`);
if ((await bundleCore(PREFIX, DOTFILES, CHILD_ENV, say)) !== 0) process.exit(1);
say(
  `Homebrew install/build elapsed: ${((performance.now() - started) / 1000).toFixed(1)} seconds`,
);

// deps first: scripts/link-dots.ts imports Cleye from node_modules.
say("repo dependencies");
await $`${MISE} trust ${DOTFILES}/mise.toml`;
await $`${MISE} run deps`.cwd(DOTFILES);

say("linking dotfiles");
await $`${MISE} run link:dots`.cwd(DOTFILES);
// The post-merge hook relinks on every pull; without this a pull leaves new links unmade.
await $`git -C ${DOTFILES} config core.hooksPath .githooks`;
// Agents record and sync this repo through jj (`mise run commit` / `mise run pull`), but the
// bootstrap clones with git: sol's checkout had no .jj and `mise run pull` failed with "There is no
// jj repo" (2026-10-06). Colocate once; jj is a Brewfile.core tool, linked above.
if (!existsSync(join(DOTFILES, ".jj"))) {
  say("jj: colocating the dotfiles checkout");
  await $`${join(PREFIX, "bin/jj")} git init --colocate`.cwd(DOTFILES);
  await $`${join(PREFIX, "bin/jj")} bookmark track alpha --remote=origin`.cwd(
    DOTFILES,
  );
}

// The agent CLIs are core too, but not Brewfile entries: each comes from its vendor's self-updating
// installer into ~/.local/bin (mise.toml install:ai-clis says why not brew/npm).
say("agent CLIs (Claude Code, Codex)");
await $`${MISE} run install:ai-clis`.cwd(DOTFILES);
// Antigravity's native installer, outside Brewfile.core like Claude Code/Codex.
const agyInstaller =
  await $`curl -fsSL https://antigravity.google/cli/install.sh`.text();
await $`bash -c ${agyInstaller}`;
// Their MCP servers (.mcp.json), registered in Claude Code AND Codex. Codex starts an OAuth login
// a headless box cannot finish; install-mcp bounds that and says so (scripts/install-mcp.ts).
await $`${MISE} run cc:install-mcp`.cwd(DOTFILES);

// sshd: let the newest attach re-bind smart-open's forwarded socket (wsl/sshd-dotfiles.conf says
// why). Without it a dropped session leaves a dead /tmp/smart-open-*.sock and the next attach loses
// its forward (doctor:remote FAILed exactly that on a rented box, 2026-10-06). Needs root, so only
// where sudo is ours (scripts/sudo-group.ts) — never tried elsewhere, where it would be reported.
// The reload is a HUP to the LISTENER alone: session sshd processes are left alone, so no
// connection drops (a container's sshd has no systemd unit to reload).
const SSHD_DROPIN = "/etc/ssh/sshd_config.d/50-dotfiles.conf";
if (await sudoIsOurs()) {
  const source = join(DOTFILES, "wsl/sshd-dotfiles.conf");
  // WSL's link:dots already links this destination to the source; GNU install refuses itself.
  const alreadyLinked =
    existsSync(SSHD_DROPIN) &&
    realpathSync(SSHD_DROPIN) === realpathSync(source);
  if (!alreadyLinked) await $`sudo -n install -m 644 ${source} ${SSHD_DROPIN}`;
  const listener = (await $`pgrep -f "^sshd: .*\[listener\]"`.nothrow().text())
    .trim()
    .split("\n")[0];
  if (listener !== undefined && listener !== "") {
    await $`sudo -n kill -HUP ${listener}`;
    say(`sshd: ${SSHD_DROPIN} in place, listener ${listener} reloaded`);
  } else {
    say(
      `sshd: ${SSHD_DROPIN} in place; no sshd listener found to reload — it applies at sshd's next start`,
    );
  }
} else {
  say(
    `sshd: skipped — sudo is not ours here (scripts/sudo-group.ts); a dropped session can leave a dead smart-open socket (doctor:remote names it)`,
  );
}

say("sheldon plugins");
await $`${join(PREFIX, "bin/sheldon")} lock`;
say("done — check from your machine: mise run doctor:remote -- <host>");
