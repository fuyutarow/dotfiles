import { afterEach, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

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
  const records = [
    {
      kind: "started",
      id: "run-earlier",
      at: "2026-10-13T10:00:00Z",
      ticket: "accept-fold",
      writes: [],
      cwd: workspace,
      workspace,
      row: "sol-high",
      dispatcher_session: null,
      vendor_session: null,
      pid: 0,
    },
    {
      kind: "ended",
      id: "run-earlier",
      at: "2026-10-13T10:01:00Z",
      exit: 0,
      report_path: null,
      vendor_session: null,
      verify: [],
    },
    {
      kind: "started",
      id: "run-latest",
      at: "2026-10-14T10:00:00Z",
      ticket: "accept-fold",
      writes: [],
      cwd: workspace,
      workspace,
      row: "terra-medium",
      dispatcher_session: null,
      vendor_session: null,
      pid: 0,
    },
    {
      kind: "ended",
      id: "run-latest",
      at: "2026-10-14T10:02:30Z",
      exit: 1,
      report_path: join(runDir, "report.json"),
      vendor_session: null,
      verify: [
        { cmd: "bun test", exit: 1, log_path: join(runDir, "verify.log") },
      ],
    },
    {
      kind: "judged",
      id: "run-latest",
      at: "2026-10-14T10:03:00Z",
      decision: "accept",
      note: "accepted fixture",
    },
    {
      kind: "started",
      id: "run-active",
      at: Temporal.Now.instant().subtract({ minutes: 5 }).toString(),
      ticket: "hooksearch-active",
      writes: [],
      cwd: workspace,
      workspace,
      row: "luna-high",
      dispatcher_session: null,
      vendor_session: null,
      pid: process.pid,
    },
  ];
  await writeFile(
    join(state, "records.jsonl"),
    `${records.map((event) => JSON.stringify(event)).join("\n")}\n`,
  );

  const cli = join(process.cwd(), "tools/agx/src/next/cli.ts");
  await writeFile(
    join(bin, "agx"),
    `#!/bin/sh\nif [ "\${AGX_FAKE_LEGACY:-}" = "1" ]; then\n  exec ${shellQuote(process.execPath)} ${shellQuote(cli)} ls --json\nfi\nexec ${shellQuote(process.execPath)} ${shellQuote(cli)} "$@"\n`,
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
        AGX_NEXT_STATE_DIR: state,
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
  expect(output).toContain('agx judge run-latest accept --note "<note>"');
  expect(output).toContain('mise run land -- <workspace-name> -m "<message>"');
  expect(output).not.toContain("agx judge run-earlier");

  await rm(workspace, { recursive: true, force: true });
  const removed = await runProcess(
    [process.execPath, "scripts/agx-accept.ts", "accept-fold"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        AGX_NEXT_STATE_DIR: state,
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
        AGX_NEXT_STATE_DIR: state,
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
        AGX_NEXT_STATE_DIR: state,
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
