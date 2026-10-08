import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pushAuth, type AuthPushDependencies } from "../auth-push.ts";

const SCRIPT = join(import.meta.dir, "..", "auth-push.ts");
const cli = (args: string[]) =>
  Bun.spawnSync(["bun", SCRIPT, ...args], {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5_000,
  });

const sha = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

function harness(
  options: {
    files?: Record<string, string>;
    platform?: NodeJS.Platform;
    target?: string;
    statuses?: Record<string, number>;
    security?: { code: number; out: string; err: string };
    gh?: { code: number; out: string; err: string };
  } = {},
) {
  const calls: { argv: string[]; stdin?: string }[] = [];
  const deps: AuthPushDependencies = {
    home: "/fake-home",
    platform: options.platform ?? "linux",
    user: "fixture-user",
    readFile: async (path) => {
      await Promise.resolve();
      return options.files?.[path] ?? null;
    },
    run: async (argv, stdin) => {
      await Promise.resolve();
      calls.push({
        argv: [...argv],
        ...(stdin === undefined ? {} : { stdin }),
      });
      if (argv[0] === "/usr/bin/security")
        return options.security ?? { code: 1, out: "", err: "" };
      if (argv[0] === "gh" && argv[2] === "token")
        return options.gh ?? { code: 1, out: "", err: "" };
      const remote = argv.at(-1) ?? "";
      if (remote.includes("sha256sum")) {
        if (options.target === undefined)
          return { code: 0, out: "MISSING\n", err: "" };
        return { code: 0, out: sha(options.target) + "\n", err: "" };
      }
      const status = [
        ["codex login status", "codex"],
        ["claude auth status", "claude"],
        ["gh auth status", "gh"],
      ].find(([command]) => remote.includes(command ?? ""))?.[1];
      if (status !== undefined)
        return { code: options.statuses?.[status] ?? 0, out: "", err: "" };
      return { code: 0, out: "", err: "" };
    },
  };
  return { deps, calls };
}

describe("auth:push transfer core", () => {
  test("Cleye owns help and rejects invalid CLI selections and prototype flags", () => {
    const help = cli(["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout.toString()).toContain("--only");
    expect(help.stdout.toString()).toContain("--force");
    const invalid = cli(["box", "--only", "codex,invalid"]);
    expect(invalid.exitCode).toBe(2);
    expect(invalid.stderr.toString()).toContain("--only accepts");
    const prototype = cli(["--__proto__"]);
    expect(prototype.exitCode).toBe(2);
    expect(prototype.stderr.toString()).toContain("__proto__");
  });

  test("missing local source skips without contacting ssh", async () => {
    const { deps, calls } = harness();
    expect(await pushAuth("box", ["codex"], false, deps)).toBe(0);
    expect(calls).toHaveLength(0);
  });

  test("unavailable gh source skips with no remote work", async () => {
    const { deps, calls } = harness();
    expect(await pushAuth("box", ["gh"], false, deps)).toBe(0);
    expect(calls.map((call) => call.argv)).toEqual([["gh", "auth", "token"]]);
  });

  test("same content avoids a write and verifies with the CLI status command", async () => {
    const content = '{"fixture":"codex"}';
    const { deps, calls } = harness({
      files: { "/fake-home/.codex/auth.json": content },
      target: content,
    });
    expect(await pushAuth("box", ["codex"], false, deps)).toBe(0);
    expect(calls.some((call) => call.stdin !== undefined)).toBe(false);
    expect(calls.at(-1)?.argv.at(-1)).toBe("codex login status");
  });

  test("different target refuses overwrite unless force is set", async () => {
    const { deps, calls } = harness({
      files: { "/fake-home/.codex/auth.json": "new fixture" },
      target: "old fixture",
    });
    expect(await pushAuth("box", ["codex"], false, deps)).toBe(1);
    expect(calls.some((call) => call.stdin !== undefined)).toBe(false);
  });

  test("force transfers over stdin with private file modes and fails on CLI verification", async () => {
    const content = '{"fixture":"claude"}';
    const { deps, calls } = harness({
      files: { "/fake-home/.claude/.credentials.json": content },
      target: "old fixture",
      statuses: { claude: 1 },
    });
    expect(await pushAuth("box", ["claude"], true, deps)).toBe(1);
    const write = calls.find((call) => call.stdin !== undefined);
    expect(write?.stdin).toBe(content);
    expect(write?.argv.at(-1)).toContain("umask 077");
    expect(write?.argv.at(-1)).toContain("chmod 700");
    expect(write?.argv.at(-1)).toContain("chmod 600");
    expect(calls.at(-1)?.argv.at(-1)).toBe("claude auth status");
  });

  test("macOS Claude Keychain source uses the known service and unavailable is a skip", async () => {
    const { deps, calls } = harness({
      platform: "darwin",
      security: { code: 1, out: "", err: "" },
    });
    expect(await pushAuth("box", ["claude"], false, deps)).toBe(0);
    expect(calls[0]?.argv).toEqual([
      "/usr/bin/security",
      "find-generic-password",
      "-s",
      "Claude Code-credentials",
      "-a",
      "fixture-user",
      "-w",
    ]);
    expect(calls).toHaveLength(1);
  });

  test("macOS Claude Keychain credential transfers on stdin without appearing in argv", async () => {
    const credential = '{"fixture":"keychain-claude"}';
    const { deps, calls } = harness({
      platform: "darwin",
      security: { code: 0, out: credential, err: "" },
    });
    expect(await pushAuth("box", ["claude"], false, deps)).toBe(0);
    const write = calls.find((call) => call.stdin !== undefined);
    expect(write?.stdin).toBe(credential);
    expect(write?.argv.join(" ")).not.toContain(credential);
  });

  test("gh token is sourced by CLI, sent only on stdin, and verified by gh auth status", async () => {
    const token = "synthetic-gh-token";
    const { deps, calls } = harness({ gh: { code: 0, out: token, err: "" } });
    expect(await pushAuth("box", ["gh"], false, deps)).toBe(0);
    expect(
      calls.some(
        (call) =>
          call.argv.at(-1)?.includes("gh auth login --with-token") === true &&
          call.stdin === token,
      ),
    ).toBe(true);
    expect(calls.at(-1)?.argv.at(-1)).toBe("gh auth status");
  });

  test("a failed remote inspect is a CLI failure", async () => {
    const { deps } = harness({
      files: { "/fake-home/.codex/auth.json": "fixture" },
    });
    const broken: AuthPushDependencies = {
      ...deps,
      run: async (argv) =>
        argv[0] === "ssh"
          ? { code: 255, out: "", err: "synthetic ssh failure" }
          : deps.run(argv),
    };
    expect(await pushAuth("box", ["codex"], false, broken)).toBe(1);
  });

  test("a failed stdin transfer is a CLI failure and does not run status", async () => {
    const { deps, calls } = harness({
      files: { "/fake-home/.codex/auth.json": "fixture" },
    });
    const broken: AuthPushDependencies = {
      ...deps,
      run: async (argv, stdin) => {
        if (stdin !== undefined)
          return { code: 1, out: "", err: "synthetic transfer failure" };
        return deps.run(argv, stdin);
      },
    };
    expect(await pushAuth("box", ["codex"], false, broken)).toBe(1);
    expect(
      calls.some((call) => call.argv.at(-1) === "codex login status"),
    ).toBe(false);
  });
});
