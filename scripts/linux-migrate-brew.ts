// Consumer: owner/agent. Dry-run is read-only; failure stops before retiring any legacy links.
import { resolve } from "node:path";
import { $ } from "bun";
import { coreCommands, brewPrefix, corePathProblems } from "./core-tools.ts";
import { buildLinuxInitEnv } from "./linux-init-env.ts";
import {
  installLinuxbrew,
  bundleCore,
  legacyLinks,
  legacyPathUsers,
  removeLegacyLinks,
} from "./linux-brew.ts";

const say = (line: string): void => {
  process.stdout.write(`linux:migrate-brew: ${line}\n`);
};

export async function migrateLinuxbrew(
  home: string,
  dryRun: boolean,
  relink = true,
): Promise<void> {
  if (!dryRun && process.platform !== "linux") process.exit(2);
  const root = resolve(import.meta.dir, "..");
  const prefix = brewPrefix(home);
  say(`declared prefix: ${prefix}`);
  say(
    "plan: sudo bootstrap if absent; brew bundle Brewfile.core as user; link:dots; verify login and SSH-command PATH; retire verified legacy links only when old process PATH is unused",
  );
  say(
    "bun/uv: Homebrew; ~/.bun/bin: agent packages and repo bins; mise installs: retained for experiments and existing jobs",
  );
  if (dryRun) return;
  const started = performance.now();
  await installLinuxbrew(prefix, say);
  const env = {
    ...buildLinuxInitEnv(home, process.env, prefix),
    HOMEBREW_MAKE_JOBS: "2",
  };
  $.env(env);
  if ((await bundleCore(prefix, root, env, say)) !== 0) process.exit(1);
  say(
    `Homebrew install/build elapsed: ${((performance.now() - started) / 1000).toFixed(1)} seconds`,
  );
  if (relink) await $`${prefix}/bin/mise run link:dots`.cwd(root);
  else
    say(
      "using already-deployed shell links; temporary workspace does not deploy dotfiles; PATH verification still required",
    );
  const commands = await coreCommands(root);
  for (const mode of ["-lc", "-lic", "-c"]) {
    // A clean base PATH means .zshenv/.zprofile, not this launcher's PATH, proves delivery.
    const path =
      (
        await $`zsh ${mode} ${"cd ~; print -r -- $PATH"}`
          .env({ ...env, PATH: "/usr/bin:/bin", TERM: "dumb" })
          .quiet()
          .text()
      )
        .trim()
        .split("\n")
        .at(-1) ?? "";
    const problems = corePathProblems(commands, prefix, path);
    if (problems.length > 0) {
      problems.forEach((problem) => {
        say(`${mode}: FAIL ${problem}`);
      });
      process.exit(1);
    }
    say(
      `${mode}: all ${commands.length} core commands resolve under ${prefix}`,
    );
  }
  const users = await legacyPathUsers(home, process.pid, prefix);
  const links = await legacyLinks(home, root, prefix);
  if (users.length > 0) {
    say(
      `cleanup deferred: ${links.length} legacy links retained for ${users.length} existing process PATHs (${users.slice(0, 12).join(", ")}); rerun after those sessions/jobs finish`,
    );
    for (const link of links) say(`deferred: ${link}`);
  } else {
    await removeLegacyLinks(links, home);
    say(
      `retired ${links.length} verified legacy links; mise installations untouched`,
    );
  }
  say(
    "done; new shells use Homebrew. Existing processes were not signalled or restarted.",
  );
}
