import { expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { cliEnv } from "./fixtures/cli-env.ts";
import { tempRoot } from "./fixtures/temp.ts";
import { jsonOf } from "../../shared/src/zod.ts";
import { Plan } from "../src/model.ts";

const fixture = resolve(import.meta.dir, "fixtures/progress-cli.ts");
function invoke(
  tty: boolean,
  args: string[],
  controls: Record<string, string> = {},
) {
  const root = tempRoot("reclaim-progress-cli-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const cmd = [process.execPath, fixture, "plan", ...args];
  const pty =
    process.platform === "darwin"
      ? ["script", "-q", join(root, "tty.log"), ...cmd]
      : [
          "script",
          "-qec",
          cmd.map((arg) => `'${arg.replaceAll("'", "'\\''")}'`).join(" "),
          "/dev/null",
        ];
  const result = Bun.spawnSync(tty ? pty : cmd, {
    env: {
      ...cliEnv(root),
      PATH: process.env.PATH,
      RECLAIM_FIXTURE_ROOT: root,
      TERM: "xterm-256color",
      CI: "",
      ...controls,
    },
    timeout: 10000,
  });
  return {
    exit: result.exitCode,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
}

test("TTY and plain CLI emit one aggregated process summary; verbose shows forty facts", () => {
  for (const tty of [false, true]) {
    const result = invoke(tty, []);
    expect(result.exit).toBe(0);
    const transcript = stripVTControlCharacters(result.out + result.err);
    expect(transcript.split("live-process scan:")).toHaveLength(2);
    expect(transcript).toContain("40 fds (40 probes)");
    expect(transcript).toContain("SUMMARY");
    expect(transcript).toContain("ASK targets: probe, peer");
    expect(transcript).not.toContain("fd/10:");
    if (!tty) expect(result.out + result.err).not.toContain("\u001B");
  }
  const verbose = invoke(false, ["--verbose"]);
  expect(verbose.exit).toBe(0);
  expect(
    verbose.err.split("\n").filter((line) => line.startsWith("pid ")),
  ).toHaveLength(40);
}, 30_000);

test("JSON plan remains a single valid document without escape codes", () => {
  const result = invoke(false, ["--json"]);
  expect(result.exit).toBe(0);
  expect(jsonOf(Plan).safeParse(result.out).success).toBe(true);
  expect(result.out.trim().split("\n")).toHaveLength(1);
  expect(result.out + result.err).not.toContain("\u001B");
  expect(result.out).toContain("fd/10:");
}, 15_000);

test("real PTY abort and engine failure finalize Clack without terminal-mode leaks", () => {
  const modes: Record<string, string>[] = [
    { RECLAIM_FIXTURE_ABORT: "1", RECLAIM_FIXTURE_SLOW: "1" },
    { RECLAIM_FIXTURE_ERROR: "1" },
  ];
  for (const controls of modes) {
    const result = invoke(true, [], controls);
    const transcript = result.out + result.err;
    expect(transcript).toContain("Progress interrupted");
    expect(transcript).not.toContain("?25l");
    expect(stripVTControlCharacters(transcript).endsWith("\n")).toBe(true);
  }
}, 30_000);
