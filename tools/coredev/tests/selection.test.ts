import { afterEach, describe, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  executeSelection,
  readSelection,
  remoteRunner,
  type CommandRunner,
  type Selection,
} from "../src/deployment.ts";

const roots: string[] = [];
const DOTFILES = join(import.meta.dir, "../../..");
const COREDEV = join(DOTFILES, "tools/coredev/src/coredev.ts");

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "coredev-selection-"));
  roots.push(root);
  return root;
}

async function fakeMise(root: string): Promise<{ bin: string; log: string }> {
  const bin = join(root, "bin");
  const log = join(root, "mise.log");
  await mkdir(bin);
  await writeFile(
    join(bin, "mise"),
    [
      "#!/usr/bin/env bun",
      'import { appendFileSync } from "node:fs";',
      'appendFileSync(process.env.COREDEV_MISE_LOG ?? "", `${Bun.argv.slice(2).join(" ")}\\n`);',
      "if (Bun.argv[3] === process.env.COREDEV_FAIL_TASK) process.exit(17);",
      "",
    ].join("\n"),
  );
  await chmod(join(bin, "mise"), 0o755);
  return { bin, log };
}

async function fakeRemote(root: string): Promise<{
  bin: string;
  dotfiles: string;
  home: string;
  log: string;
}> {
  const bin = join(root, "remote-bin");
  const dotfiles = join(root, "remote-dotfiles");
  const home = join(root, "remote-home");
  const log = join(root, "remote-mise.log");
  await mkdir(bin);
  await mkdir(join(dotfiles, "scripts"), { recursive: true });
  await mkdir(home);
  await writeFile(
    join(home, ".profile"),
    'PATH="' + bin + ':$PATH"; export PATH\n',
  );
  await writeFile(join(dotfiles, "mise.toml"), "[tasks]\n");
  await writeFile(
    join(bin, "bun"),
    ["#!/bin/sh", 'printf "%s\\n" "$COREDEV_SELECTION"'].join("\n"),
  );
  await writeFile(
    join(bin, "mise"),
    [
      "#!/bin/sh",
      'printf "%s|%s|%s\\n" "$HOSTNAME" "$PWD" "$*" >> "$COREDEV_MISE_LOG"',
      "",
    ].join("\n"),
  );
  await chmod(join(bin, "bun"), 0o755);
  await chmod(join(bin, "mise"), 0o755);
  return { bin, dotfiles, home, log };
}

function openSshJoinRunner(remote: {
  bin: string;
  dotfiles: string;
  home: string;
  log: string;
}): { calls: string[][]; runner: CommandRunner } {
  const calls: string[][] = [];
  return {
    calls,
    runner: {
      async run(command, options) {
        calls.push([command.command, ...command.args]);
        const joined = command.args.slice(1).join(" ");
        const proc = Bun.spawn(["sh", "-lc", joined], {
          cwd: options.cwd,
          env: {
            ...process.env,
            COREDEV_MISE_LOG: remote.log,
            COREDEV_SELECTION: JSON.stringify({
              kind: "linux",
              phase: "deploy",
              tasks: [{ task: "core:install", timeoutSeconds: 1 }],
            }),
            DOTFILES: remote.dotfiles,
            HOME: remote.home,
            HOSTNAME: "fixture-remote",
            PATH: `${remote.bin}:${process.env.PATH ?? ""}`,
          },
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        });
        const [stdout, stderr, status] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        return {
          status,
          output: `${stdout}${stderr}`,
          timedOut: false,
          missing: false,
        };
      },
    },
  };
}

async function invoke(
  args: readonly string[],
  bin: string,
  log: string,
  failTask?: string,
): Promise<{ status: number | null; output: string }> {
  const proc = Bun.spawn([process.execPath, COREDEV, ...args], {
    cwd: DOTFILES,
    env: {
      ...process.env,
      DOTFILES,
      COREDEV_MISE_LOG: log,
      ...(failTask === undefined ? {} : { COREDEV_FAIL_TASK: failTask }),
      PATH: `${bin}:${process.env.PATH ?? ""}`,
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, status] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { status, output: `${stdout}${stderr}` };
}

describe("coredev selection", () => {
  test("reads only the requested canonical task set", async () => {
    const calls: string[][] = [];
    const runner: CommandRunner = {
      run(command) {
        calls.push([command.command, ...command.args]);
        return Promise.resolve({
          status: 0,
          output: JSON.stringify({
            kind: "wsl",
            phase: "deploy",
            tasks: [{ task: "core:install", timeoutSeconds: 1 }],
          }),
          timedOut: false,
          missing: false,
        });
      },
    };
    const selected = await readSelection(DOTFILES, "wsl", "deploy", runner);
    expect(selected.isOk()).toBe(true);
    if (selected.isErr()) return;
    const selection = selected.value;
    expect(selection.tasks).toEqual([
      { task: "core:install", timeoutSeconds: 1 },
    ]);
    expect(calls).toEqual([
      [
        "bun",
        `${DOTFILES}/scripts/deployment-selection.ts`,
        "--kind",
        "wsl",
        "--phase",
        "deploy",
        "--json",
      ],
    ]);
  });

  test("executes selected mise tasks for local without the full WSL initializer", async () => {
    const root = await fixture();
    const { bin, log } = await fakeMise(root);
    const result = await invoke(["deploy", "local"], bin, log);
    expect(result.status).toBe(0);
    expect(result.output).toContain("RUN  core:install");
    const calls = await readFile(log, "utf8");
    expect(calls).toContain("run core:install");
    expect(calls).toContain("run codex:runtime");
    expect(calls).not.toContain("run wsl:init");
  });

  test("routes an approved remote selector and every selected task through SSH", async () => {
    const transportCalls: string[][] = [];
    const localTaskCalls: string[][] = [];
    const transport: CommandRunner = {
      run(command) {
        transportCalls.push([command.command, ...command.args]);
        if (command.command === "bun" || command.command === "mise")
          localTaskCalls.push([command.command, ...command.args]);
        const script = command.args.slice(1).join(" ");
        return Promise.resolve({
          status: 0,
          output: script.includes("deployment-selection.ts")
            ? JSON.stringify({
                kind: "linux",
                phase: "deploy",
                tasks: [
                  { task: "core:install", timeoutSeconds: 1 },
                  { task: "codex:runtime", timeoutSeconds: 1 },
                ],
              })
            : "",
          timedOut: false,
          missing: false,
        });
      },
    };
    const runner = remoteRunner("sol", transport);
    const selected = await readSelection(DOTFILES, "linux", "deploy", runner);
    expect(selected.isOk()).toBe(true);
    if (selected.isErr()) return;
    const executed = await executeSelection(
      DOTFILES,
      selected.value,
      runner,
      () => {},
    );
    expect(executed.isOk()).toBe(true);
    expect(localTaskCalls).toEqual([]);
    expect(transportCalls).toHaveLength(3);
    for (const call of transportCalls) {
      expect(call[0]).toBe("ssh");
      expect(call[1]).toBe("sol");
      expect(call).toHaveLength(3);
      const remoteCommand = call[2] ?? "";
      expect(remoteCommand).toMatch(/^sh -lc /u);
      expect(remoteCommand).toContain('DOTFILES="${DOTFILES:-$HOME/dotfiles}"');
      expect(remoteCommand).toContain('cd "$DOTFILES"');
    }
    expect(transportCalls[0]?.slice(2).join(" ")).toContain(
      "deployment-selection.ts",
    );
    expect(transportCalls[1]?.[2]).toContain("core:install");
    expect(transportCalls[2]?.[2]).toContain("codex:runtime");
  });

  test("keeps the SSH-joined selector script intact in the remote shell", async () => {
    const remote = await fakeRemote(await fixture());
    const transport = openSshJoinRunner(remote);
    const runner = remoteRunner("fixture-host", transport.runner);
    const selected = await readSelection(DOTFILES, "linux", "deploy", runner);
    expect(selected.isOk()).toBe(true);
    if (selected.isErr()) return;
    expect(selected.value.tasks).toEqual([
      { task: "core:install", timeoutSeconds: 1 },
    ]);
    const executed = await executeSelection(
      DOTFILES,
      selected.value,
      runner,
      () => {},
    );
    expect(executed.isOk()).toBe(true);
    expect(transport.calls).toHaveLength(2);
    expect(transport.calls[0]).toEqual([
      "ssh",
      "fixture-host",
      expect.stringContaining("deployment-selection.ts"),
    ]);
    expect(transport.calls[1]).toEqual([
      "ssh",
      "fixture-host",
      expect.stringMatching(/^sh -lc /u),
    ]);
    expect(await readFile(remote.log, "utf8")).toBe(
      `fixture-remote|${remote.dotfiles}|run core:install\n`,
    );
  });

  test("remote transport failure performs no local task", async () => {
    const calls: string[][] = [];
    const runner = remoteRunner("sol", {
      run(command) {
        calls.push([command.command, ...command.args]);
        return Promise.resolve({
          status: 255,
          output: "ssh: connect to host sol failed",
          timedOut: false,
          missing: false,
        });
      },
    });
    const selected = await readSelection(DOTFILES, "linux", "deploy", runner);
    expect(selected.isErr()).toBe(true);
    if (selected.isOk()) return;
    expect(selected.error.message).toContain("ssh: connect to host sol failed");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe("ssh");
    expect(calls[0]?.[2]).toContain("deployment-selection.ts");
  });

  test("stops on the first failed selected task", async () => {
    const selection: Selection = {
      kind: "linux",
      phase: "deploy",
      tasks: [
        { task: "first", timeoutSeconds: 1 },
        { task: "second", timeoutSeconds: 1 },
      ],
    };
    const calls: string[] = [];
    const runner: CommandRunner = {
      run(command) {
        const task = command.args[1] ?? "";
        calls.push(task);
        return Promise.resolve({
          status: task === "first" ? 9 : 0,
          output: "fixture failure",
          timedOut: false,
          missing: false,
        });
      },
    };
    const result = await executeSelection(
      DOTFILES,
      selection,
      runner,
      () => {},
    );
    expect(result.isErr()).toBe(true);
    if (result.isOk()) return;
    expect(result.error.message).toContain("coredev deploy first: exited 9");
    expect(calls).toEqual(["first"]);
  });

  test("doctor fails when the selected runtime check fails", async () => {
    const root = await fixture();
    const { bin, log } = await fakeMise(root);
    const result = await invoke(
      ["doctor", "local"],
      bin,
      log,
      "codex:runtime:check",
    );
    expect(result.status).toBe(1);
    expect(result.output).toContain(
      "coredev doctor codex:runtime:check: exited 17",
    );
    expect(await readFile(log, "utf8")).toContain("run codex:runtime:check");
  });
});
