import { lstat, mkdir, symlink, unlink } from "node:fs/promises";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cli } from "cleye";
import { consola } from "consola";

const USAGE =
  "Usage: bun scripts/link-agent-assets.ts [--dry-run] [--dotfiles <path>] [--home <path>]\n";
let failures = 0;

function print(line: string): void {
  consola.info(line);
}

function reportFailure(line: string): void {
  failures += 1;
  consola.error(line);
}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    consola.error(`unknown flag(s): --${flag}\n${USAGE}`);
    process.exit(2);
  }
}

async function isSymlink(path: string): Promise<boolean> {
  const info = await lstat(path).catch(() => null);
  return info?.isSymbolicLink() === true;
}

async function linkPath(
  source: string,
  destination: string,
  dryRun: boolean,
): Promise<void> {
  const sourceExists = await access(source).then(
    () => true,
    () => false,
  );
  if (!sourceExists) {
    print(`skip (missing): ${source}`);
    return;
  }
  const directory = dirname(destination);
  if (!dryRun) {
    const made = await mkdir(directory, { recursive: true }).then(
      () => null,
      (error: unknown) => error,
    );
    if (made !== null) {
      reportFailure(`cannot prepare ${directory}: ${errorText(made)}`);
      return;
    }
  }
  if (
    !(await isSymlink(destination)) &&
    (await access(destination).then(
      () => true,
      () => false,
    ))
  ) {
    print(`skip (exists, not symlink): ${destination}`);
    return;
  }
  if (dryRun) {
    print(`[dry-run] would link: ${destination} -> ${source}`);
    return;
  }
  if (await isSymlink(destination)) {
    const removed = await unlink(destination).then(
      () => null,
      (error: unknown) => error,
    );
    if (removed !== null) {
      reportFailure(`cannot unlink ${destination}: ${errorText(removed)}`);
      return;
    }
  }
  const linked = await symlink(source, destination).then(
    () => null,
    (error: unknown) => error,
  );
  if (linked !== null) {
    reportFailure(`cannot link ${destination}: ${errorText(linked)}`);
    return;
  }
  print(`linked: ${destination} -> ${source}`);
}

function errorText(error: unknown): string {
  return error instanceof Error
    ? error.message
    : (JSON.stringify(error) ?? "unknown error");
}

async function activatePostMergeHook(
  dotfiles: string,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) {
    print(`[dry-run] would set core.hooksPath for ${dotfiles}`);
    return;
  }
  const child = Bun.spawn(
    ["git", "-C", dotfiles, "config", "core.hooksPath", ".githooks"],
    {
      stdout: "ignore",
      stderr: "ignore",
      timeout: 5_000,
    },
  );
  await child.exited;
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "link-agent-assets.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description: "Link agent commands and Codex guidance into tool homes.",
      },
      flags: {
        dryRun: { type: Boolean, default: false },
        dotfiles: { type: String },
        home: { type: String },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    consola.error(`unexpected positional argument: ${parsed._[0]}\n${USAGE}`);
    process.exitCode = 2;
    return;
  }
  if (parsed.flags.dotfiles === "" || parsed.flags.home === "") {
    consola.error(`--dotfiles and --home require non-empty values\n${USAGE}`);
    process.exitCode = 2;
    return;
  }

  const home = parsed.flags.home ?? process.env["HOME"] ?? homedir();
  const dotfiles = resolve(
    parsed.flags.dotfiles ?? process.env["DOTFILES"] ?? join(home, "dotfiles"),
  );
  await activatePostMergeHook(dotfiles, parsed.flags.dryRun);
  await linkPath(
    resolve(dotfiles, "agents/commands"),
    resolve(home, ".claude/commands"),
    parsed.flags.dryRun,
  );
  await linkPath(
    resolve(dotfiles, "agents/codex/AGENTS.md"),
    resolve(home, ".codex/AGENTS.md"),
    parsed.flags.dryRun,
  );
  await linkPath(
    resolve(dotfiles, "agents/commands"),
    resolve(home, ".codex/prompts"),
    parsed.flags.dryRun,
  );
  await linkPath(
    resolve(dotfiles, "agents/commands"),
    resolve(home, ".gemini/antigravity/global_workflows"),
    parsed.flags.dryRun,
  );
  print(`✅ Agent asset links complete. Source root: ${dotfiles}`);
  if (failures > 0) process.exitCode = 1;
}

await main();
