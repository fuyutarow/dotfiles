import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import type { HostKind } from "./profiles.ts";
import type { Probe } from "./login-shell.ts";
import type { StepCommand, StepResult } from "./transfer-steps.ts";

export type ToolStepDependencies = {
  resolveCommand(name: string, cwd: string): string | null;
  run(command: StepCommand, options?: { cwd?: string }): StepResult;
  copyFile(source: string, destination: string): void;
  mkdir(path: string): void;
  exists(path: string): boolean;
  home: string;
};

export type CodexConfigDependencies = {
  run(command: StepCommand, options?: { cwd?: string }): StepResult;
  exists(path: string): boolean;
  home: string;
  dotfiles: string;
};

export function probeCodexConfig(
  dependencies: Pick<
    CodexConfigDependencies,
    "run" | "exists" | "home" | "dotfiles"
  >,
): Probe {
  if (!dependencies.exists(join(dependencies.home, ".codex")))
    return { status: "skipped", reason: "~/.codex does not exist yet" };
  const result = dependencies.run(
    {
      command: "bun",
      args: [
        join(dependencies.dotfiles, "agents/codex/codex-config.ts"),
        "--check",
      ],
    },
    { cwd: dependencies.dotfiles },
  );
  if (result.status === 0)
    return { status: "satisfied", reason: "Codex config matches declaration" };
  if (result.status === 1)
    return { status: "not-satisfied", reason: "Codex config has drift" };
  return { status: "not-satisfied", reason: result.output };
}

export function ensureCodexConfig(
  dependencies: Pick<
    CodexConfigDependencies,
    "run" | "exists" | "home" | "dotfiles"
  >,
): StepResult {
  if (!dependencies.exists(join(dependencies.home, ".codex")))
    return { status: 0, output: "skipped: ~/.codex does not exist yet" };
  return dependencies.run(
    {
      command: "bun",
      args: [join(dependencies.dotfiles, "agents/codex/codex-config.ts")],
    },
    { cwd: dependencies.dotfiles },
  );
}

const underMiseShims = (path: string): boolean =>
  path
    .split("/")
    .some(
      (part, index, parts) => part === "shims" && parts[index - 1] === "mise",
    );

export function probeSccache(
  cwd: string,
  dependencies: Pick<ToolStepDependencies, "resolveCommand" | "run">,
): Probe {
  const path = dependencies.resolveCommand("sccache", cwd);
  if (path === null)
    return { status: "not-satisfied", reason: "sccache is not on PATH" };
  if (underMiseShims(path))
    return {
      status: "not-satisfied",
      reason: `sccache resolves to mise shim ${path}`,
    };
  const version = dependencies.run(
    { command: path, args: ["--version"] },
    { cwd },
  );
  return version.status === 0
    ? { status: "satisfied", reason: `sccache resolves to ${path}` }
    : {
        status: "not-satisfied",
        reason: `sccache at ${path} failed --version (exit ${version.status})`,
      };
}

export function ensureSccache(
  cwd: string,
  dependencies: Pick<
    ToolStepDependencies,
    "resolveCommand" | "run" | "copyFile" | "mkdir" | "exists" | "home"
  >,
): StepResult {
  const source = dependencies.resolveCommand("sccache", cwd);
  if (source === null)
    return { status: 1, output: "cannot find sccache binary on PATH" };
  if (underMiseShims(source))
    return {
      status: 1,
      output: `cannot install sccache from mise shim ${source}; install the standalone binary first`,
    };
  const destinationDir = join(
    dependencies.home,
    ".local/share/dotfiles/runtime/bin",
  );
  const destination = join(destinationDir, "sccache");
  dependencies.mkdir(destinationDir);
  dependencies.copyFile(source, destination);
  const result = dependencies.run(
    { command: destination, args: ["--version"] },
    { cwd },
  );
  return result.status === 0
    ? {
        status: 0,
        output: `installed sccache from ${source} to ${destination}`,
      }
    : {
        status: result.status,
        output: `installed sccache at ${destination}, but --version failed`,
      };
}

export function probeSoksGovern(
  dependencies: Pick<ToolStepDependencies, "run">,
): Probe {
  const result = dependencies.run({
    command: "soks-govern",
    args: ["--version"],
  });
  return result.status === 0
    ? { status: "satisfied", reason: "soks-govern --version succeeded" }
    : {
        status: "not-satisfied",
        reason: `soks-govern --version failed (exit ${result.status})`,
      };
}

export function ensureSoksGovern(
  dependencies: Pick<ToolStepDependencies, "run" | "exists" | "mkdir" | "home">,
): StepResult {
  const workspace = join(dependencies.home, "Workspace");
  const clone = join(workspace, "soks");
  dependencies.mkdir(workspace);
  if (!dependencies.exists(clone)) {
    const cloned = dependencies.run({
      command: "gh",
      args: ["repo", "clone", "https://github.com/fuyutarow/soks.git", clone],
    });
    if (cloned.status !== 0) return cloned;
  }
  return dependencies.run(
    {
      command: "cargo",
      args: ["install", "--locked", "--path", "soks-govern"],
    },
    { cwd: clone },
  );
}

export function verifySoksGovern(
  dependencies: Pick<ToolStepDependencies, "run">,
): boolean {
  return probeSoksGovern(dependencies).status === "satisfied";
}

export function probeSccacheForHost(
  kind: HostKind,
  cwd: string,
  dependencies: Pick<ToolStepDependencies, "resolveCommand" | "run">,
): Probe {
  return kind === "linux" || kind === "wsl" || kind === "mac"
    ? probeSccache(cwd, dependencies)
    : { status: "skipped", reason: "unsupported host" };
}

export function createSystemToolStepDependencies(): ToolStepDependencies {
  return {
    resolveCommand(name, cwd) {
      const result = Bun.spawnSync(
        ["sh", "-c", 'cd "$1" && command -v "$2"', "sh", cwd, name],
        {
          stdout: "pipe",
          stderr: "ignore",
        },
      );
      const path = result.stdout.toString().trim();
      return result.exitCode === 0 && path.length > 0 ? path : null;
    },
    run(command, options) {
      const result = Bun.spawnSync([command.command, ...command.args], {
        ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
        stdout: "pipe",
        stderr: "pipe",
      });
      return {
        status: result.exitCode,
        output: `${result.stdout.toString()}${result.stderr.toString()}`.trim(),
      };
    },
    copyFile(source, destination) {
      copyFileSync(source, destination);
    },
    mkdir(path) {
      mkdirSync(path, { recursive: true });
    },
    exists(path) {
      return existsSync(path);
    },
    home: homedir(),
  };
}
