// `mise run linux:init` — Homebrew installs Brewfile.core on EVERY Linux box, then agent CLIs
// and dotfile links. Bootstrap root once with scripts/bootstrap-linux.sh; brew always runs as
// the target user. Existing hosts use linux:migrate-brew. Standard prefix is
// /home/linuxbrew/.linuxbrew; LAND_HOSTS declares ~/.linuxbrew for shared no-root hosts.
// Source builds are permitted and timed; Bun uses its official Homebrew tap at nonstandard
// Linux prefixes. Bun/uv come from Homebrew, including hook/SSH runtime
// reach. ~/.local/bin holds vendor agents, not a second core downloader. Experiment versions
// (Julia, CUDA, Python) stay in each repo's mise.toml; no global mise [tools] (INV-6).
// Exit: 0 done · 1 a step failed (its output says which).
import { access, realpath } from "node:fs/promises";
import { homedir, hostname, release, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { cli } from "cleye";
import { $ } from "bun";
import { buildLinuxInitEnv } from "./linux-init-env.ts";
import { declareRentedCodexHost, hostDeclarationProbes } from "./agx-host.ts";
import { sudoIsOurs, sudoNow } from "./sudo-group.ts";
import { brewPrefix } from "./core-tools.ts";
import { installLinuxbrew, bundleCore } from "./linux-brew.ts";
import { migrateLinuxbrew } from "./linux-migrate-brew.ts";

const HOME = homedir();
const DOTFILES = join(HOME, "dotfiles");
const PREFIX = brewPrefix(HOME);
const MISE = join(PREFIX, "bin/mise");
const CHILD_ENV = buildLinuxInitEnv(HOME, process.env);
process.env["HOME"] = HOME;
process.env["PATH"] = CHILD_ENV["PATH"] ?? "";
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

// Host commands resolve the released agx pin through this checkout.
await $`${MISE} trust ${DOTFILES}/mise.toml`;
const codexHostDeclaration = await declareRentedCodexHost({
  home: homedir(),
  rented: parsed.flags.rented ?? false,
  hostname: hostname(),
  date: Temporal.Now.plainDateISO().toString(),
  probes: hostDeclarationProbes(),
  say,
});
if (codexHostDeclaration === "invalid") process.exit(1);

// One password, once, and only when a human is at the terminal: every root step below then runs
// through `sudo -n` on the cached credential instead of being listed for a later hand-run.
// Never where sudo is not ours (scripts/sudo-group.ts) — an attempt there is reported.
if (process.stdin.isTTY && userInfo().uid !== 0 && (await sudoIsOurs())) {
  say("sudo once, for the root steps (apt zsh, login shell, /etc links)");
  // bounded: a human types the password; a timeout would cut them off.
  Bun.spawnSync(["sudo", "-v"], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
}

const started = performance.now();
await installLinuxbrew(PREFIX, say);
// Homebrew refuses formulae from a tap it has not been told to trust; a fresh machine trusts none.
const brewfile = await Bun.file(join(DOTFILES, "Brewfile.core")).text();
for (const [, tap] of brewfile.matchAll(/^tap "([^"]+)"/gmu)) {
  await $`${join(PREFIX, "bin/brew")} tap ${tap}`;
  await $`${join(PREFIX, "bin/brew")} trust --tap ${tap}`;
}
say(`brew bundle Brewfile.core at ${PREFIX}`);
if ((await bundleCore(PREFIX, DOTFILES, CHILD_ENV, say)) !== 0) process.exit(1);
say(
  `Homebrew install/build elapsed: ${((performance.now() - started) / 1000).toFixed(1)} seconds`,
);

// One declared pipeline: COREDEV_SELECTION (scripts/config-registry.ts) lists every deploy task
// for this host kind, and coredev runs it. This script adds only what must precede it (Homebrew)
// and the steps that are not mise tasks. deps first: it links the coredev bin.
say("repo dependencies");
await $`${MISE} run deps`.cwd(DOTFILES);
say("declared deployment (coredev deploy local)");
await $`coredev deploy local`.cwd(DOTFILES);
// The post-merge hook relinks on every pull; without this a pull leaves new links unmade.
// Read first: a second run must change nothing, and must not need git's config lock.
const hooksPath = (
  await $`git -C ${DOTFILES} config --get core.hooksPath`.nothrow().text()
).trim();
if (hooksPath !== ".githooks")
  await $`git -C ${DOTFILES} config core.hooksPath .githooks`;
// Agents record and sync this repo through jj (`mise run commit` / `mise run pull`), but the
// bootstrap clones with git: sol's checkout had no .jj and `mise run pull` failed with "There is no
// jj repo" (2026-10-06). Colocate once; jj is a Brewfile.core tool, linked above.
if (
  !(await access(join(DOTFILES, ".jj")).then(
    () => true,
    () => false,
  ))
) {
  say("jj: colocating the dotfiles checkout");
  await $`${join(PREFIX, "bin/jj")} git init --colocate`.cwd(DOTFILES);
  await $`${join(PREFIX, "bin/jj")} bookmark track alpha --remote=origin`.cwd(
    DOTFILES,
  );
}

// Antigravity's native installer, outside Brewfile.core like Claude Code/Codex.
const agyInstaller =
  await $`curl -fsSL https://antigravity.google/cli/install.sh`.text();
await $`bash -c ${agyInstaller}`;
// sshd: let the newest attach re-bind smart-open's forwarded socket (wsl/sshd-dotfiles.conf says
// why). Without it a dropped session leaves a dead /tmp/smart-open-*.sock and the next attach loses
// its forward (doctor:remote FAILed exactly that on a rented box, 2026-10-06). Needs root, so only
// where sudo is ours (scripts/sudo-group.ts) — never tried elsewhere, where it would be reported.
// The reload is a HUP to the LISTENER alone: session sshd processes are left alone, so no
// connection drops (a container's sshd has no systemd unit to reload).
const SSHD_DROPIN = "/etc/ssh/sshd_config.d/50-dotfiles.conf";
const sshdInstalled = await access(dirname(SSHD_DROPIN)).then(
  () => true,
  () => false,
);
if (!sshdInstalled) {
  say("sshd: not installed here — no drop-in to place");
} else if (await sudoIsOurs()) {
  const source = join(DOTFILES, "wsl/sshd-dotfiles.conf");
  // WSL's link:dots already links this destination to the source; GNU install refuses itself.
  const alreadyLinked =
    (await access(SSHD_DROPIN).then(
      () => true,
      () => false,
    )) && (await realpath(SSHD_DROPIN)) === (await realpath(source));
  const placed =
    alreadyLinked ||
    (await sudoNow(["install", "-m", "644", source, SSHD_DROPIN]));
  const listener = (await $`pgrep -f "^sshd: .*\[listener\]"`.nothrow().text())
    .trim()
    .split("\n")[0];
  const reload =
    listener !== undefined && listener !== "" ? listener : undefined;
  if (!placed)
    say(
      `sshd: sudo needs a password here — run: sudo install -m 644 ${source} ${SSHD_DROPIN}${reload === undefined ? "" : ` && sudo kill -HUP ${reload}`}`,
    );
  else if (reload === undefined)
    say(
      `sshd: ${SSHD_DROPIN} in place; no sshd listener found to reload — it applies at sshd's next start`,
    );
  else
    say(
      (await sudoNow(["kill", "-HUP", reload]))
        ? `sshd: ${SSHD_DROPIN} in place, listener ${reload} reloaded`
        : `sshd: listener not reloaded — run: sudo kill -HUP ${reload}`,
    );
} else {
  say(
    `sshd: skipped — sudo is not ours here (scripts/sudo-group.ts); a dropped session can leave a dead smart-open socket (doctor:remote names it)`,
  );
}

// WSL's user services are rows of COREDEV_SELECTION.wsl; only the root steps remain here.
async function wslRootSteps(): Promise<void> {
  // Root steps never wait for a password: each runs through `sudo -n` or is listed.
  const pending: string[] = [];
  if (
    Bun.which("zsh") === null &&
    !(await sudoNow(["apt-get", "install", "-y", "zsh"]))
  )
    pending.push("sudo apt-get install -y zsh");
  const { username, shell } = userInfo();
  const zsh = Bun.which("zsh") ?? "/usr/bin/zsh";
  if (
    shell?.endsWith("/zsh") !== true &&
    !(await sudoNow(["chsh", "-s", zsh, username]))
  )
    pending.push(`sudo chsh -s ${zsh} ${username}`);
  if (pending.length > 0) {
    say("root steps left for you (sudo needs a password here):");
    for (const command of pending) say(`  ${command}`);
    say("then re-run: mise run link:dots   # /etc links it listed as skipped");
  }
}
if (/microsoft/iu.test(release())) await wslRootSteps();

say("sheldon plugins");
await $`${join(PREFIX, "bin/sheldon")} lock`;
// The run ends with what is still open, taken from doctor, so nobody has to remember a
// follow-up list: each FAIL line is followed by its own fix command.
say("what is left on this machine (mise run doctor):");
const doctor = await $`${MISE} run doctor`.cwd(DOTFILES).nothrow().quiet();
const open = doctor.stdout
  .toString()
  .split("\n")
  .filter((line) => /^FAIL |^\s+(?:- |fix: )/u.test(line));
for (const line of open) say(line);
say(open.length === 0 ? "nothing — done" : "done; the lines above remain");
