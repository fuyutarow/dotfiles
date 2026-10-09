import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pkg from "../package.json" with { type: "json" };

const CLI = join(import.meta.dir, "../src/agx.ts");
const ROOT = join(import.meta.dir, "../../..");
const testEnv: NodeJS.ProcessEnv = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !/^(?:AGENT_|AGX_|DISPATCH_|FAKE_)/u.test(name),
    ),
  ),
  NO_COLOR: "1",
  FORCE_COLOR: "0",
  TERM: "dumb",
};
const scratch: string[] = [];
afterEach(() => {
  for (const path of scratch.splice(0))
    rmSync(path, { recursive: true, force: true });
});
const invoke = (args: string[], env: NodeJS.ProcessEnv = testEnv, cwd = ROOT) =>
  Bun.spawnSync([process.execPath, CLI, ...args], {
    env,
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5_000,
  });

const commandNames = (output: string): string[] => {
  const commands = output.split("COMMANDS:")[1]?.split("FLAGS:")[0] ?? "";
  return commands
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/u)[0] ?? "");
};

test("the suite has one bin and a major version for the CLI break", () => {
  expect(pkg.name).toBe("agx");
  expect(pkg.version).toBe("2.0.0");
  expect(pkg.bin).toEqual({ agx: "src/agx.ts" });
});

test("bare and unknown commands list exactly the four nouns", () => {
  for (const args of [
    [],
    ["unknown"],
    ["run"],
    ["resume"],
    ["ack"],
    ["stats"],
    ["judge"],
    ["ticket", "unknown"],
    ["ledger", "unknown"],
    ["pick", "unknown"],
  ]) {
    const result = invoke(args);
    expect(result.exitCode).toBe(2);
    const output = result.stdout.toString();
    expect(commandNames(output)).toEqual([
      "ticket",
      "pick",
      "dispatch",
      "ledger",
    ]);
  }
});

test("minimal environment and piped stdout list all nouns from an unrelated cwd", () => {
  const cwd = mkdtempSync(join(tmpdir(), "agx-minimal-help-"));
  scratch.push(cwd);
  const minimal = { HOME: process.env.HOME, PATH: process.env.PATH };
  for (const args of [[], ["unknown"], ["--help"]]) {
    const result = invoke(args, minimal, cwd);
    expect(result.exitCode).toBe(args.includes("--help") ? 0 : 2);
    expect(commandNames(result.stdout.toString())).toEqual([
      "ticket",
      "pick",
      "dispatch",
      "ledger",
    ]);
  }
});

test("forced color, no color and narrow columns keep suite headings and nouns stable", () => {
  for (const env of [
    { ...testEnv, FORCE_COLOR: "1" },
    { ...testEnv, FORCE_COLOR: "3", COLUMNS: "0" },
    { ...testEnv, NO_COLOR: "1", COLUMNS: "1" },
  ]) {
    for (const args of [
      [],
      ["unknown"],
      ["ticket", "unknown"],
      ["ledger", "unknown"],
      ["pick", "unknown"],
      ["--help"],
    ]) {
      const result = invoke(args, env);
      expect(result.exitCode).toBe(args.includes("--help") ? 0 : 2);
      expect(commandNames(result.stdout.toString())).toEqual([
        "ticket",
        "pick",
        "dispatch",
        "ledger",
      ]);
    }
  }
});

test("the CLI ignores previous state paths and previous environment overrides", () => {
  const base = mkdtempSync(join(tmpdir(), "agx-state-layout-"));
  scratch.push(base);
  const previous = join(base, ["agent", "router"].join("-"));
  mkdirSync(join(previous, "active"), { recursive: true });
  writeFileSync(
    join(previous, "active/live.json"),
    JSON.stringify({
      schema: 1,
      run_id: "previous-live",
      pid: process.pid,
      label: "previous",
      choice: "luna-low",
      pick_source: "default",
      started_at: "2026-10-09T00:00:00Z",
      cwd: base,
    }),
  );
  const env: NodeJS.ProcessEnv = {
    ...testEnv,
    XDG_STATE_HOME: base,
    [["AGENT", "ROUTER", "STATE_DIR"].join("_")]: previous,
  };
  delete env.AGX_STATE_DIR;
  const result = invoke(["ledger", "ls"], env);
  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString().trim()).toBe('{"schema":1,"active":[]}');
});
