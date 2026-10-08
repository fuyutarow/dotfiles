import { describe, expect, test } from "bun:test";
import { readApprovedHost } from "../src/hosts.ts";
import {
  credentialStepResult,
  ensureCToolchain,
  probeCToolchainForHost,
  transferCredentials,
  type StepCommand,
} from "../src/transfer-steps.ts";

describe("coredev transfer steps", () => {
  test.each([
    [
      "codex,claude,gh",
      ["codex", "claude", "gh"],
      [["mise", "run", "auth:push", "--", "box", "--only", "codex,claude,gh"]],
    ],
    ["fnox", ["fnox"], [["mise", "run", "secrets:push", "--", "box"]]],
    [
      "mixed",
      ["fnox", "gh", "codex"],
      [
        ["mise", "run", "auth:push", "--", "box", "--only", "gh,codex"],
        ["mise", "run", "secrets:push", "--", "box"],
      ],
    ],
  ] as const)(
    "passes exact subprocess argv for %s",
    (_label, transfers, expected) => {
      const commands: StepCommand[] = [];
      const host = { alias: "box", kind: "linux" as const, transfers };
      const result = transferCredentials(host, {
        run(command) {
          commands.push(command);
          return { status: 0, output: "pushed" };
        },
      });
      const actual: string[][] = commands.map(({ command, args }) =>
        [command].concat(args),
      );
      expect(actual).toEqual(expected.map((args) => [...args]));
      expect(result.status).toBe(0);
    },
  );

  test("names the failing CLI when auth:push fails", () => {
    const result = credentialStepResult(
      { alias: "box", kind: "linux", transfers: ["claude"] },
      {
        run: () => ({
          status: 1,
          output: "auth:push: FAIL  claude  source unavailable",
        }),
      },
    );
    expect(result.status).toBe("not-satisfied");
    expect(result.reason).toContain("claude");
  });

  test("rejects codex-auth and names replacements", async () => {
    const result = readApprovedHost("old", "/dev/null");
    expect(result.isErr()).toBe(true);
    const registry = `/tmp/coredev-host-${crypto.randomUUID()}.toml`;
    await Bun.write(
      registry,
      '[hosts.old]\nkind = "mac"\ntransfers = ["codex-auth"]\n',
    );
    const parsed = readApprovedHost("old", registry);
    expect(parsed.isErr() && parsed.error.message).toContain(
      "'codex', 'claude' and/or 'gh'",
    );
  });

  test("probes Linux toolchain and runs exact apt install", () => {
    const seen: string[][] = [];
    expect(
      probeCToolchainForHost("linux", {
        hasCommand: (name) => name !== "make",
      }),
    ).toEqual({
      status: "not-satisfied",
      reason: "missing from PATH: make",
    });
    expect(
      probeCToolchainForHost("mac", { hasCommand: () => false }).status,
    ).toBe("skipped");
    const result = ensureCToolchain({
      run(command) {
        seen.push([command.command, ...command.args]);
        return { status: 0, output: "installed" };
      },
    });
    expect(seen).toEqual([
      [
        "sudo",
        "DEBIAN_FRONTEND=noninteractive",
        "apt-get",
        "install",
        "-y",
        "build-essential",
        "pkg-config",
      ],
    ]);
    expect(result.status).toBe(0);
  });
});
