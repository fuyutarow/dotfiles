import { describe, expect, test } from "bun:test";
import {
  ensureSoksGovern,
  ensureCodexConfig,
  probeCodexConfig,
  probeSccache,
  probeSoksGovern,
  verifySoksGovern,
  type ToolStepDependencies,
} from "../src/tool-steps.ts";
import type { StepCommand } from "../src/transfer-steps.ts";

describe("coredev tool steps", () => {
  test("probes, runs, and skips Codex config based on ~/.codex", () => {
    const calls: { command: StepCommand; cwd?: string }[] = [];
    let codexDir = true;
    const dependencies = {
      home: "/home/test",
      dotfiles: "/repo/dotfiles",
      exists: () => codexDir,
      run(command: StepCommand, options?: { cwd?: string }) {
        calls.push({
          command,
          ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
        });
        return { status: 0, output: "" };
      },
    };
    expect(probeCodexConfig(dependencies).status).toBe("satisfied");
    expect(calls[0]).toEqual({
      command: {
        command: "bun",
        args: ["/repo/dotfiles/agents/codex/codex-config.ts", "--check"],
      },
      cwd: "/repo/dotfiles",
    });
    expect(ensureCodexConfig(dependencies).status).toBe(0);
    expect(calls[1]?.command.args).toEqual([
      "/repo/dotfiles/agents/codex/codex-config.ts",
    ]);
    codexDir = false;
    expect(probeCodexConfig(dependencies)).toEqual({
      status: "skipped",
      reason: "~/.codex does not exist yet",
    });
    expect(ensureCodexConfig(dependencies)).toEqual({
      status: 0,
      output: "skipped: ~/.codex does not exist yet",
    });
    expect(calls).toHaveLength(2);
  });

  test("rejects mise shim sccache and accepts a working standalone binary", () => {
    const calls: StepCommand[] = [];
    let resolved = "/home/test/.local/share/mise/shims/sccache";
    const dependencies = {
      resolveCommand: () => resolved,
      run(command: StepCommand) {
        calls.push(command);
        return { status: 0, output: "sccache 0.10.0" };
      },
    };
    expect(probeSccache("/repo", dependencies)).toMatchObject({
      status: "not-satisfied",
    });
    expect(calls).toHaveLength(0);
    resolved = "/home/test/.local/share/dotfiles/runtime/bin/sccache";
    const realBinary = probeSccache("/repo", dependencies);
    expect(realBinary.status).toBe("satisfied");
    expect(realBinary.reason.includes(resolved)).toBe(true);
    expect(calls).toEqual([{ command: resolved, args: ["--version"] }]);
  });

  test("clones only when needed and runs cargo install from the clone", () => {
    const calls: { command: StepCommand; cwd?: string }[] = [];
    let hasClone = false;
    const dependencies: Pick<
      ToolStepDependencies,
      "run" | "exists" | "mkdir" | "home"
    > = {
      home: "/home/test",
      mkdir: () => {},
      exists: () => hasClone,
      run(command, options) {
        calls.push({
          command,
          ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
        });
        if (command.command === "gh") hasClone = true;
        return { status: 0, output: "ok" };
      },
    };
    ensureSoksGovern(dependencies);
    expect(calls).toEqual([
      {
        command: {
          command: "gh",
          args: [
            "repo",
            "clone",
            "https://github.com/fuyutarow/soks.git",
            "/home/test/Workspace/soks",
          ],
        },
      },
      {
        command: {
          command: "cargo",
          args: ["install", "--locked", "--path", "soks-govern"],
        },
        cwd: "/home/test/Workspace/soks",
      },
    ]);

    calls.length = 0;
    ensureSoksGovern(dependencies);
    expect(calls).toEqual([
      {
        command: {
          command: "cargo",
          args: ["install", "--locked", "--path", "soks-govern"],
        },
        cwd: "/home/test/Workspace/soks",
      },
    ]);
  });

  test("probes and verifies soks-govern with --version", () => {
    const calls: StepCommand[] = [];
    const dependencies = {
      run(command: StepCommand) {
        calls.push(command);
        return { status: 0, output: "soks-govern 1.0.0" };
      },
    };
    expect(probeSoksGovern(dependencies).status).toBe("satisfied");
    expect(verifySoksGovern(dependencies)).toBe(true);
    expect(calls).toEqual([
      { command: "soks-govern", args: ["--version"] },
      { command: "soks-govern", args: ["--version"] },
    ]);
  });
});
