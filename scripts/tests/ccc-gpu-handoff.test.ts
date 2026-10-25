import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runner = join(
  import.meta.dir,
  "../../tools/agent-resource-run/src/agent-resource-run.ts",
);

test("GPU launch ignores a held legacy CCC handoff lock and writes no wants", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccc-handoff-"));
  await using cleanup = new AsyncDisposableStack();
  cleanup.defer(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const runtime = join(root, "runtime");
  const wants = join(runtime, "agent-resource/gpu-wants");
  const bin = join(root, "bin");
  await mkdir(wants, { recursive: true });
  await mkdir(bin);
  const realFlock = Bun.which("flock");
  expect(realFlock).toBeString();
  await Bun.write(
    join(bin, "flock"),
    `#!${process.execPath}
const args = process.argv.slice(2);
if (args.some(a => a.endsWith('/ccc-gpu.lock'))) process.exit(42);

const child = Bun.spawn([${JSON.stringify(realFlock)}, ...args], {stdin:'inherit',stdout:'inherit',stderr:'inherit',timeout:12000});
process.exit(await child.exited);
`,
  );
  await chmod(join(bin, "flock"), 0o755);
  await Bun.write(
    join(bin, "systemctl"),
    `#!${process.execPath}\nconsole.log('260');`,
    { mode: 0o755 },
  );
  // A fake manager observes admission without executing a GPU or starting a scope.
  await Bun.write(
    join(bin, "systemd-run"),
    `#!${process.execPath}\nawait Bun.write(process.env.LAUNCH_ARGV, JSON.stringify(process.argv.slice(2))); await Bun.write(process.env.ENTERED, 'admitted');`,
    { mode: 0o755 },
  );
  await chmod(join(bin, "systemctl"), 0o755);
  await chmod(join(bin, "systemd-run"), 0o755);
  const policy = join(root, "policy.toml");
  await Bun.write(
    policy,
    "schema=1\ngpu_max_concurrent_jobs=1\nmemory_high_fraction=0.9\n",
  );
  const manifest = join(root, "manifest.json");
  await Bun.write(
    manifest,
    JSON.stringify({
      schema: 1,
      job_id: "handoff-fixture",
      run_class: "test",
      cpu_threads: 1,
      processes: 1,
      host_ram_peak_bytes: 128 * 1024 ** 2,
      memory_bound: "fake command",
      device: { kind: "gpu", gpu_id: 0, vram_peak_bytes: 1 },
      scratch_bytes: 0,
      child_fanout: 0,
      walltime_seconds: 1,
      cleanup: { mode: "term-then-kill", grace_seconds: 1 },
    }),
  );
  const ccc = Bun.spawn(
    [
      "flock",
      "-F",
      join(runtime, "agent-resource/ccc-gpu.lock"),
      process.execPath,
      "-e",
      "console.log('context held'); await Bun.stdin.text();",
    ],
    { stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: 15000 },
  );
  let job: Bun.Subprocess<"ignore", "pipe", "pipe"> | undefined;
  cleanup.defer(async () => {
    ccc.kill();
    await ccc.exited;
    job?.kill();
    await job?.exited;
  });
  const reader = ccc.stdout.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain(
    "context held",
  );
  reader.releaseLock();
  const entered = join(root, "entered");
  const launchArgv = join(root, "launch-argv.json");
  job = Bun.spawn(
    [process.execPath, runner, "--manifest", manifest, "--", "true"],
    {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        HOME: root,
        XDG_RUNTIME_DIR: runtime,
        XDG_STATE_HOME: root,
        AGENT_RESOURCE_POLICY: policy,
        ENTERED: entered,
        LAUNCH_ARGV: launchArgv,
        AGENT_RESOURCE_ADMISSION_RECEIPT: undefined,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 12000,
    },
  );
  const completed = Promise.all([
    job.stdout.text(),
    job.stderr.text(),
    job.exited,
  ]);
  const [out, err, code] = await completed;
  expect(code, out + err).toBe(0);
  expect(await Bun.file(entered).exists()).toBe(true);
  const argv = await Bun.file(launchArgv).text();
  expect(argv).not.toContain("/ccc-gpu.lock");
  expect(argv).toContain("/slots/gpu.0.");
  expect(await readdir(wants)).toEqual([]);
  expect(ccc.exitCode).toBeNull();
}, 20000);
