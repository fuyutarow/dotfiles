#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import { resolve } from "node:path";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import { newestThread } from "./threads.ts";
import pkg from "../package.json" with { type: "json" };

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, pkg, cliArgv);

export type Copy = (id: string) => Promise<number>;

export async function copyThread(
  args: {
    sessionsDirectory: string;
    cwd: string;
    anywhere: boolean;
  },
  copy: Copy,
  write: (id: string) => void,
  error: (message: string) => void,
): Promise<number> {
  const thread = await newestThread(
    args.sessionsDirectory,
    args.cwd,
    args.anywhere,
  );
  if (thread === undefined) {
    error(
      args.anywhere
        ? "no Codex thread found in sessions"
        : `no Codex thread found for ${args.cwd}`,
    );
    return 1;
  }
  const copied = await copy(thread.id);
  if (copied !== 0) {
    error(`could not copy thread id (clipboard helper exited ${copied})`);
    return 1;
  }
  write(thread.id);
  return 0;
}

async function copyToClipboard(id: string): Promise<number> {
  const dotfiles = resolve(import.meta.dir, "../../..");
  const script = resolve(dotfiles, "zsh/copy-to-clipboard.sh");
  const child = Bun.spawn(["sh", script], {
    env: { ...process.env, COPY_TO_CLIPBOARD_QUIET: "1" },
    stdin: "pipe",
    stdout: "ignore",
    stderr: "pipe",
  });
  await child.stdin.write(id);
  await child.stdin.end();
  return child.exited;
}

if (import.meta.main) {
  const args = cli({
    name: "codex-thread-copy",
    version: pkg.version,
    strictFlags: true,
    flags: {
      anywhere: {
        type: Boolean,
        description: "select the newest thread from any working directory",
      },
    },
    help: {
      description:
        "Print and copy the newest Codex thread id for the current directory, or any directory with --anywhere.",
    },
  });
  const sessionsDirectory = resolve(
    process.env["CODEX_HOME"] ?? `${process.env["HOME"] ?? ""}/.codex`,
    "sessions",
  );
  const result = await copyThread(
    {
      sessionsDirectory,
      cwd: process.cwd(),
      anywhere: args.flags.anywhere === true,
    },
    copyToClipboard,
    (id) => {
      process.stdout.write(`${id}\n`);
    },
    (message) => {
      process.stderr.write(`codex-thread-copy: ${message}\n`);
    },
  );
  process.exitCode = result;
}
