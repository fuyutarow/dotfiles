import { jsonText } from "@dotfiles/shared/src/zod.ts";
import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile, chmod, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const cli = join(import.meta.dir, "../src/disk.ts");

// A fake `agx` on PATH records every argv it receives; the file is absent when agx is never invoked.
async function harness() {
  const root = await mkdtemp(join(tmpdir(), "disk-workspace-gc-"));
  const bin = join(root, "bin");
  const home = join(root, "home");
  const log = join(root, "agx-argv.log");
  await mkdir(bin, { recursive: true });
  await mkdir(home, { recursive: true });
  const agx = join(bin, "agx");
  await writeFile(agx, `#!/bin/sh\necho "$*" >> "${log}"\nexit 0\n`);
  await chmod(agx, 0o755);
  const run = async (args: string[]) => {
    const proc = Bun.spawn([process.execPath, cli, ...args], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env["PATH"] ?? ""}`,
        HOME: home,
        XDG_STATE_HOME: join(root, "state"),
        XDG_DATA_HOME: join(root, "data"),
        XDG_CONFIG_HOME: join(root, "config"),
        TZ: "UTC",
      },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, exit] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { out, err, exit };
  };
  const agxArgv = async () =>
    existsSync(log) ? (await readFile(log, "utf8")).trim().split("\n") : [];
  return { run, agxArgv };
}

test("workspace-gc rejects --legacy, which agx 9.0.0 removed, before any agx call", async () => {
  const { run, agxArgv } = await harness();
  for (const command of ["plan", "move"]) {
    const result = await run([command, "workspace-gc", "--legacy"]);
    expect(result.exit).toBe(2);
    expect(result.err).toContain("unknown option --legacy");
  }
  expect(await agxArgv()).toEqual([]);
});

test("workspace-gc sends no argv to agx; the action stays unknown and exits 4", async () => {
  const { run, agxArgv } = await harness();
  for (const command of ["plan", "move"]) {
    const result = await run([command, "workspace-gc", "--all"]);
    expect(result.exit).toBe(4);
    expect(jsonText.safeParse(result.out).data).toMatchObject({
      schema: "disk.result/1",
      command,
      mode: "workspace-gc",
      outcome: "unknown",
      items: [],
    });
  }
  expect(await agxArgv()).toEqual([]);
});

test("workspace-gc usage lines no longer offer --legacy", async () => {
  const { run } = await harness();
  for (const command of ["plan", "move"]) {
    const result = await run([command, "--help"]);
    expect(result.exit).toBe(0);
    const line = result.out
      .split("\n")
      .filter((text) => text.includes("workspace-gc"));
    expect(line.length).toBeGreaterThan(0);
    for (const text of line) expect(text).not.toContain("legacy");
  }
});
