import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { attempt } from "../../shared/src/attempt.ts";

const ws = join(import.meta.dir, "../src/ws.ts");

// One long-lived parent drains both pipes, as the example-learner launcher does.
// Count external jj process starts, excluding repository setup and readiness commands.
test("WS-ADD-HANG-2: three piped adds have a fixed jj budget as history and workspace counts grow", async () => {
  const root = await mkdtemp(join(tmpdir(), "ws-add-sequence-"));
  const repo = join(root, "repo");
  const bin = join(root, "bin");
  const calls = join(root, "jj-calls.jsonl");
  const realJj = Bun.which("jj");
  expect(realJj).not.toBeNull();
  if (realJj === null) return;
  await mkdir(bin);
  const env = {
    ...stateTestEnv(),
    PATH: `${bin}:${process.env.PATH}`,
    JJ_USER: "test",
    JJ_EMAIL: "test@example.com",
    RIP_GRAVEYARD: join(root, "graveyard"),
    AGX_STATE_DIR: join(root, "state"),
  };
  for (const [name, body] of [
    ["stat", 'process.stdout.write("ext4\\n");'],
    ["agx", 'process.stdout.write("[]\\n");'],
    [
      "jj",
      `import {appendFile} from "node:fs/promises";
const args = process.argv.slice(2);
await appendFile(${JSON.stringify(calls)}, JSON.stringify(args) + "\\n");
const child = Bun.spawn([${JSON.stringify(realJj)}, ...args], {stdin:"ignore", stdout:"inherit", stderr:"inherit", timeout: 20000});
process.exitCode = await child.exited;`,
    ],
  ] as const) {
    const file = join(bin, name);
    await Bun.write(file, `#!/usr/bin/env bun\n${body}\n`);
    await chmod(file, 0o755);
  }
  const run = async (cmd: string[], cwd = root) => {
    const signal = AbortSignal.timeout(30_000);
    const child = Bun.spawn(cmd, {
      cwd,
      env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
      killSignal: "SIGKILL",
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(signal.aborted, `${cmd.join(" ")}: ${out}\n${err}`).toBe(false);
    expect(code, err).toBe(0);
    return { out, err };
  };
  const budgets: number[] = [];
  const diffs: string[] = [];
  const growHistory = async () => {
    for (let index = 0; index < 12; index++) {
      await Bun.write(join(repo, "history.txt"), `${index}\n`);
      await run([realJj, "commit", "-m", `history ${index}`], repo);
    }
    await run([realJj, "bookmark", "set", "main", "-r", "@-"], repo);
  };
  const growWorkspaces = async () => {
    for (let index = 0; index < 12; index++) {
      const dir = join(root, `old-${index}`);
      await run(
        [
          realJj,
          "workspace",
          "add",
          "--name",
          `old-${index}`,
          "-r",
          "main",
          dir,
        ],
        repo,
      );
      await Bun.write(join(dir, "unlanded.txt"), `${index}\n`);
      await run([realJj, "commit", "-m", `unlanded ${index}`], dir);
    }
  };
  const checked = await attempt(async () => {
    await run([realJj, "git", "init", repo]);
    await Bun.write(
      join(repo, ".ws.toml"),
      'trunk = "main"\nready = ["echo ready-finished"]\n',
    );
    await run([realJj, "commit", "-m", "base"], repo);
    await run([realJj, "bookmark", "create", "main", "-r", "@-"], repo);
    for (const stage of ["small", "history", "workspaces"]) {
      if (stage === "history") await growHistory();
      if (stage === "workspaces") await growWorkspaces();
      for (let index = 0; index < 3; index++) {
        await Bun.write(calls, "");
        const slug = `${stage}-${index}`;
        const result = await run(
          [process.execPath, ws, "add", slug, "--repo", repo, "--rev", "main"],
          repo,
        );
        expect(result.out).toContain("ready-finished");
        expect(result.out).toContain(join(`${repo}.ws`, `ws_${slug}`));
        const invocations = (await Bun.file(calls).text())
          .trim()
          .split("\n")
          .filter(Boolean);
        budgets.push(invocations.length);
        diffs.push(...invocations.filter((line) => line.includes('"diff"')));
      }
    }
    expect(budgets, JSON.stringify(budgets)).toEqual(
      Array.from({ length: 9 }, () => 6),
    );
    expect(diffs).toEqual([]);
  });
  await rm(root, { recursive: true, force: true });
  expect(checked.ok, checked.ok ? undefined : String(checked.error)).toBe(true);
}, 90_000);

// The shared preload still injects retired configuration; isolate refusal tests.
function stateTestEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.AGX_NEXT_STATE_DIR;
  return env;
}
