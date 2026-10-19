import { expect, test } from "bun:test";
import { watch } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const runner = join(
  import.meta.dir,
  "../../tools/agent-resource-run/src/agent-resource-run.ts",
);

test.each([false, true])(
  "runner announces wants before waiting for CCC release; timeout=%s",
  async (timeout) => {
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
if (args.at(-1) === 'true' && args.some(a => a.includes('/slots/gpu.')) && !args.includes('--shared')) process.exit(42);
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
      `#!${process.execPath}\nawait Bun.write(process.env.ENTERED, 'admitted');`,
      { mode: 0o755 },
    );
    await chmod(join(bin, "systemctl"), 0o755);
    await chmod(join(bin, "systemd-run"), 0o755);
    const policy = join(root, "policy.toml");
    await Bun.write(policy, "schema=1\ngpu_max_concurrent_jobs=1\n");
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
        walltime_seconds: timeout ? 1 : 10,
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
    const { promise: announced, resolve: onWant } =
      Promise.withResolvers<void>();
    const watcher = watch(wants, () => {
      onWant();
    });
    cleanup.defer(() => {
      watcher.close();
    });
    const entered = join(root, "entered");
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
    const sawWant = await Promise.race([
      announced.then(() => true),
      completed.then(() => false),
    ]);
    expect(sawWant).toBe(true);
    expect(await readdir(wants)).toHaveLength(1);
    expect(await Bun.file(entered).exists()).toBe(false);
    if (!timeout) {
      await ccc.stdin.end();
      expect(await ccc.exited).toBe(0);
    }
    const [out, err, code] = await completed;
    expect(code, out + err).toBe(timeout ? 75 : 0);
    expect(await Bun.file(entered).exists()).toBe(!timeout);
    expect(await readdir(wants)).toEqual([]);
    if (timeout) expect(out).toContain("flock wait expired");
  },
  20000,
);
