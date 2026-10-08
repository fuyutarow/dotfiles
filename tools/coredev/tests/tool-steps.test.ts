import { describe, expect, test } from "bun:test";
import {
  ensureSoksGovern,
  probeSccache,
  probeSoksGovern,
  verifySoksGovern,
  type ToolStepDependencies,
} from "../src/tool-steps.ts";
import type { StepCommand } from "../src/transfer-steps.ts";

describe("coredev tool steps", () => {
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
