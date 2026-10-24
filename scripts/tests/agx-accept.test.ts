import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

test("composer refuses excess positional arguments", async () => {
  const result = await runProcess(
    [process.execPath, "scripts/agx-accept.ts", "ticket", "extra"],
    { cwd: process.cwd() },
  );
  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toContain(
    "agx-accept: unexpected positional argument 'extra'",
  );
});

test("composer presents the latest ticket run from fixture records and fake jj", async () => {
  const root = await mkdtemp(join(tmpdir(), "agx-accept-test-"));
  roots.push(root);
  const state = join(root, "state");
  const runDir = join(state, "runs", "run-latest");
  const workspace = join(root, "workspace");
  const bin = join(root, "bin");
  await mkdir(runDir, { recursive: true });
  await mkdir(workspace);
  await mkdir(bin);
  await writeFile(
    join(runDir, "report.json"),
    JSON.stringify({
      summary: "latest report line",
      changes: ["scripts/agx-accept.ts"],
      checks: [],
      for_coordinator: [],
      open: [],
    }),
  );
  await writeFile(
    join(runDir, "verify.log"),
    "ordinary output\n(fail) assertion failed\n",
  );
  // Public listing recorded from release 1.3.1 through the dotfiles mise pin.
  const listing = (
    await Bun.file(
      join(import.meta.dir, "fixtures/agx-accept-runs.json"),
    ).text()
  )
    .replaceAll("__ROOT__", root)
    .replaceAll(
      "__ACTIVE_AT__",
      Temporal.Now.instant().subtract({ minutes: 5 }).toString(),
    );
  await writeFile(join(state, "listing.json"), listing);
  await writeFile(
    join(bin, "agx"),
    `#!${process.execPath}
const args = process.argv.slice(2);
if (JSON.stringify(args.slice(0, 3)) !== JSON.stringify(["worker", "ls", args[2]]) || args[3] !== "--json" || args.length !== 4) process.exit(2);
const rows = await Bun.file(${JSON.stringify(join(state, "listing.json"))}).json();
process.stdout.write(JSON.stringify(process.env.AGX_FAKE_LEGACY === "1" ? rows : rows.filter(row => row.ticket === args[2])));
`,
  );
  await writeFile(
    join(bin, "jj"),
    "#!/bin/sh\nprintf 'fixture diff for %s\\n' \"$2\"\n",
  );
  await chmod(join(bin, "agx"), 0o755);
  await chmod(join(bin, "jj"), 0o755);

  const result = await runProcess(
    [process.execPath, "scripts/agx-accept.ts", "accept-fold"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGX_STATE_DIR: state,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      },
    },
  );
  const output = result.stdout.toString();
  expect(result.exitCode).toBe(0);
  expect(output).toContain(
    "RUN id=run-latest row=terra-medium state=ended exit=1 elapsed=2m30s",
  );
  expect(output).toContain("VERIFY exit=1 bun test");
  expect(output).toContain("(fail) assertion failed");
  expect(output).toContain("latest report line");
  expect(output).toContain(`fixture diff for ${workspace}`);
  expect(output).toContain(
    'agx worker judge run-latest accept --note "<note>"',
  );
  expect(output).toContain('mise run land -- <workspace-name> -m "<message>"');
  expect(output).not.toContain("agx worker judge run-earlier");

  await rm(workspace, { recursive: true, force: true });
  const removed = await runProcess(
    [process.execPath, "scripts/agx-accept.ts", "accept-fold"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGX_STATE_DIR: state,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      },
    },
  );
  expect(removed.exitCode).toBe(0);
  expect(removed.stdout.toString()).toContain(
    `workspace removed after land: ${workspace}; diff unavailable`,
  );

  const active = await runProcess(
    [process.execPath, "scripts/agx-accept.ts", "hooksearch-active"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGX_STATE_DIR: state,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      },
    },
  );
  expect(active.exitCode).toBe(0);
  expect(active.stdout.toString()).toContain(
    "RUN id=run-active row=luna-high state=running exit=- elapsed=",
  );
  expect(active.stdout.toString()).toMatch(/elapsed=\d+m\d{2}s/u);

  const oldAgx = await runProcess(
    [process.execPath, "scripts/agx-accept.ts", "accept-fold"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGX_STATE_DIR: state,
        AGX_FAKE_LEGACY: "1",
        PATH: `${bin}:${process.env.PATH ?? ""}`,
      },
    },
  );
  expect(oldAgx.exitCode).toBe(2);
  expect(oldAgx.stderr.toString()).toContain("returned multiple tickets");
}, 60_000);

// Drain both pipes while waiting for the bounded subprocess.
async function runProcess(
  argv: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    stdin?: "ignore";
    stdout?: "pipe";
    stderr?: "pipe";
  } = {},
) {
  const child = Bun.spawn(argv, {
    ...options,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeout ?? 120_000,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).arrayBuffer(),
    child.exited,
  ]);
  return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode };
}
