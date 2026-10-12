#!/usr/bin/env bun
import { cli } from "cleye";
import { release } from "node:os";
import { join } from "node:path";
import {
  executeSelection,
  isApprovedRemoteAlias,
  readSelection,
  remoteRunner,
  renderSelection,
  systemRunner,
  type HostKind,
  type SelectionPhase,
} from "./deployment.ts";
import { readApprovedHost } from "./hosts.ts";
import pkg from "../package.json" with { type: "json" };
import { attempt } from "../../shared/src/attempt.ts";

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

const parsed = cli({
  name: "coredev",
  version: pkg.version,
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  parameters: ["<command>", "[arguments...]"],
  help: { description: "Select canonical core dotfiles deployment tasks." },
  flags: {
    dryRun: {
      type: Boolean,
      description: "Print the declared task selection without executing it.",
    },
  },
});

const [command, ...args] = parsed._;

function fail(message: string, code = 1): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = code;
}

function currentHostKind(): HostKind {
  if (process.platform === "darwin") return "mac";
  if (process.env.WSL_DISTRO_NAME !== undefined) return "wsl";
  return /microsoft/iu.test(release()) ? "wsl" : "linux";
}

async function targetKind(target: string): Promise<HostKind | Error> {
  if (target === "local") return currentHostKind();
  if (!isApprovedRemoteAlias(target))
    return new Error(`invalid approved host alias: ${target}`);
  const loaded = await attempt(() => readApprovedHost(target));
  if (!loaded.ok) return new Error(errorMessage(loaded.error));
  const approved = loaded.value;
  return approved.isErr() ? approved.error : approved.value.kind;
}

function dotfilesRoot(): string {
  return process.env.DOTFILES ?? join(import.meta.dir, "../../..");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown coredev failure";
}

async function main(): Promise<void> {
  const phase: SelectionPhase = command === "doctor" ? "doctor" : "deploy";
  if (command !== "deploy" && command !== "doctor") {
    fail(
      "usage: coredev deploy <target> [--dry-run] | coredev doctor [<target>]",
      2,
    );
    return;
  }
  if (
    (command === "deploy" && args.length !== 1) ||
    (command === "doctor" && args.length > 1)
  ) {
    fail(
      "usage: coredev deploy <target> [--dry-run] | coredev doctor [<target>]",
      2,
    );
    return;
  }
  if (command === "doctor" && parsed.flags.dryRun === true) {
    fail("coredev doctor does not accept --dry-run", 2);
    return;
  }
  const target = command === "doctor" ? (args[0] ?? "local") : args[0];
  if (target === undefined) {
    fail("deploy target is required", 2);
    return;
  }
  const kind = await targetKind(target);
  if (kind instanceof Error) {
    fail(kind.message);
    return;
  }
  const dotfiles = dotfilesRoot();
  const runner =
    target === "local" ? systemRunner : remoteRunner(target, systemRunner);
  const selected = await readSelection(dotfiles, kind, phase, runner);
  if (selected.isErr()) {
    fail(selected.error.message);
    return;
  }
  const selection = selected.value;
  if (parsed.flags.dryRun === true) {
    process.stdout.write(`${renderSelection(target, selection)}\n`);
    return;
  }
  process.stdout.write(`coredev ${phase}: ${target} (${kind})\n`);
  const executed = await executeSelection(
    dotfiles,
    selection,
    runner,
    (line) => {
      process.stdout.write(`${line}\n`);
    },
  );
  if (executed.isErr()) fail(executed.error.message);
}

const result = await attempt(main);
if (!result.ok) fail(errorMessage(result.error));
