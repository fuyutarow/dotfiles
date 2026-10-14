import {
  existsSync,
  lstatSync,
  mkdirSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";

const USAGE =
  "Usage: bun scripts/link-agent-assets.ts [--dry-run] [--dotfiles <path>] [--home <path>]\n";
let failures = 0;

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function reportFailure(line: string): void {
  failures += 1;
  process.stderr.write(`${line}\n`);
}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`unknown flag(s): --${flag}\n${USAGE}`);
    process.exit(2);
  }
}

function isSymlink(path: string): boolean {
  return fromThrowable((value: string) => lstatSync(value))(path)
    .map((info) => info.isSymbolicLink())
    .unwrapOr(false);
}

function linkPath(source: string, destination: string, dryRun: boolean): void {
  if (!existsSync(source)) {
    print(`skip (missing): ${source}`);
    return;
  }
  const directory = dirname(destination);
  if (!dryRun) {
    const made = fromThrowable(() =>
      mkdirSync(directory, { recursive: true }),
    )();
    if (made.isErr()) {
      reportFailure(
        `cannot prepare ${directory}: ${made.error instanceof Error ? made.error.message : String(made.error)}`,
      );
      return;
    }
  }
  if (!isSymlink(destination) && existsSync(destination)) {
    print(`skip (exists, not symlink): ${destination}`);
    return;
  }
  if (dryRun) {
    print(`[dry-run] would link: ${destination} -> ${source}`);
    return;
  }
  if (isSymlink(destination)) {
    const removed = fromThrowable(() => {
      unlinkSync(destination);
    })();
    if (removed.isErr()) {
      reportFailure(
        `cannot unlink ${destination}: ${removed.error instanceof Error ? removed.error.message : String(removed.error)}`,
      );
      return;
    }
  }
  const linked = fromThrowable(() => {
    symlinkSync(source, destination);
  })();
  if (linked.isErr()) {
    reportFailure(
      `cannot link ${destination}: ${linked.error instanceof Error ? linked.error.message : String(linked.error)}`,
    );
    return;
  }
  print(`linked: ${destination} -> ${source}`);
}

function activatePostMergeHook(dotfiles: string, dryRun: boolean): void {
  if (dryRun) {
    print(`[dry-run] would set core.hooksPath for ${dotfiles}`);
    return;
  }
  fromThrowable(() =>
    Bun.spawnSync(
      ["git", "-C", dotfiles, "config", "core.hooksPath", ".githooks"],
      {
        stdout: "ignore",
        stderr: "ignore",
        timeout: 5_000,
      },
    ),
  )();
}

function main(): void {
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
    process.stderr.write(
      `unexpected positional argument: ${parsed._[0]}\n${USAGE}`,
    );
    process.exitCode = 2;
    return;
  }
  if (parsed.flags.dotfiles === "" || parsed.flags.home === "") {
    process.stderr.write(
      `--dotfiles and --home require non-empty values\n${USAGE}`,
    );
    process.exitCode = 2;
    return;
  }

  const home = parsed.flags.home ?? process.env.HOME ?? homedir();
  const dotfiles = resolve(
    parsed.flags.dotfiles ?? process.env.DOTFILES ?? join(home, "dotfiles"),
  );
  activatePostMergeHook(dotfiles, parsed.flags.dryRun);
  linkPath(
    resolve(dotfiles, "agents/commands"),
    resolve(home, ".claude/commands"),
    parsed.flags.dryRun,
  );
  linkPath(
    resolve(dotfiles, "agents/codex/AGENTS.md"),
    resolve(home, ".codex/AGENTS.md"),
    parsed.flags.dryRun,
  );
  linkPath(
    resolve(dotfiles, "agents/commands"),
    resolve(home, ".codex/prompts"),
    parsed.flags.dryRun,
  );
  linkPath(
    resolve(dotfiles, "agents/commands"),
    resolve(home, ".gemini/antigravity/global_workflows"),
    parsed.flags.dryRun,
  );
  print(`✅ Agent asset links complete. Source root: ${dotfiles}`);
  if (failures > 0) process.exitCode = 1;
}

main();
