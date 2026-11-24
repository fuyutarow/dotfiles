#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import { resolve } from "node:path";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import { newestThread } from "#src/threads.ts";
import pkg from "#root/package.json" with { type: "json" };

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, pkg, cliArgv);

// A failure reason, or null when the id reached a clipboard route.
export type Copy = (id: string) => Promise<string | null>;

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
  const failure = await copy(thread.id);
  if (failure !== null) {
    error(`could not copy thread id (${failure})`);
    return 1;
  }
  write(thread.id);
  return 0;
}

// The `smart-copy` command (tools/smart-copy) is the one clipboard route; it is spawned from PATH.
export async function copyToClipboard(id: string): Promise<string | null> {
  const command = Bun.which("smart-copy", { PATH: process.env["PATH"] ?? "" });
  if (command === null)
    return "smart-copy is not on PATH; run mise run deps in the dotfiles checkout";
  const child = Bun.spawn([command], {
    stdin: "pipe",
    stdout: "ignore",
    stderr: "pipe",
  });
  await child.stdin.write(id);
  await child.stdin.end();
  const [stderr, exitCode] = await Promise.all([
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode === 0) return null;
  const detail = stderr.trim();
  return detail === "" ? `smart-copy exited ${exitCode}` : detail;
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
