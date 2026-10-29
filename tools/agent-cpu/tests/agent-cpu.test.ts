import { test, expect } from "bun:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  chmod,
  symlink,
  unlink,
  rename,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { produce, run, type Options } from "../src/agent-cpu.ts";

const id = "12345678-1234-4234-8234-123456789abc";
async function fixture(mode = "ok") {
  const root = await mkdtemp(join(tmpdir(), "agent-cpu-test-"));
  const proc = join(root, "proc"),
    cgroup = join(root, "cgroup"),
    home = join(root, "home");
  await mkdir(join(home, ".claude", "sessions"), { recursive: true });
  await mkdir(join(cgroup, "app", "agt_one.service"), { recursive: true });
  await mkdir(proc, { recursive: true });
  await writeFile(
    join(cgroup, "app", "agt_one.service", "memory.current"),
    "4096\n",
  );
  await writeFile(
    join(proc, "meminfo"),
    "MemTotal: 1024 kB\nMemAvailable: 256 kB\n",
  );
  await writeFile(
    join(home, ".claude", "sessions", "10.json"),
    JSON.stringify({ sessionId: id }),
  );
  const agx = join(root, "fake-agx");
  let command = `echo '[{"dispatcher_session":"${id}","lease":{"unit":"agt_one.service"}}]'`;
  if (mode === "timeout") command = "exec sleep 5";
  if (mode === "fail") command = "exit 1";
  await writeFile(agx, `#!/bin/sh\necho x >> '${root}/calls'\n${command}\n`);
  await chmod(agx, 0o755);
  const nvidia = join(root, "fake-nvidia");
  await writeFile(
    nvidia,
    `#!/bin/sh\ncase "$1" in\n  --query-compute-apps=*) printf '11, 2\\n12, 3\\n13, 4\\n20, 5\\n' ;;\n  --query-gpu=*) printf '100, 1000\\n200, 2000\\n' ;;\nesac\n`,
  );
  await chmod(nvidia, 0o755);
  async function setSample(end: boolean) {
    await mkdir(proc, { recursive: true });
    await writeFile(
      join(proc, "stat"),
      `cpu ${end ? 300 : 100} 0 0 ${end ? 300 : 100}\ncpu0 1 0 0 1\ncpu1 1 0 0 1\n`,
    );
    const entries = [
      [10, 1, "claude", 20, ""],
      [11, 10, "child", 40, ""],
      [12, 10, "codex", 30, ""],
      [13, 12, "child", 10, ""],
      [20, 10, "worker", 100, "/app/agt_one.service"],
      [30, 1, "alpha", 100, ""],
      [31, 1, "beta", 80, ""],
      [32, 1, "gamma", 60, ""],
      [33, 1, "small", 2, ""],
      [34, 1, "edge", 10, ""],
      [35, 1, "service-process", 20, "/user/demo.service"],
    ] as const;
    for (const [pid, parent, name, ticks, group] of entries) {
      const dir = join(proc, String(pid));
      await mkdir(dir, { recursive: true });
      const fields = [
        "S",
        String(parent),
        ...Array.from({ length: 9 }, () => "0"),
        String(end ? ticks : 0),
        "0",
        ...Array.from({ length: 6 }, () => "0"),
        "1",
      ];
      await writeFile(
        join(dir, "stat"),
        `${pid} (${name}) ${fields.join(" ")}\n`,
      );
      await writeFile(join(dir, "cmdline"), `${name}\0`);
      await writeFile(join(dir, "cgroup"), `0::${group}\n`);
      await writeFile(
        join(dir, "status"),
        `Name:\t${name}\nVmRSS:\t${ticks} kB\n`,
      );
    }
    await writeFile(
      join(cgroup, "app", "agt_one.service", "cpu.stat"),
      `usage_usec ${end ? 1000000 : 0}\n`,
    );
  }
  await setSample(false);
  const options: Options = {
    proc,
    cgroup,
    home,
    hz: 100,
    now: () => "2026-01-01T00:00:02Z",
    sleep: async () => setSample(true),
    agx,
    timeout: mode === "timeout" ? 1000 : 2000,
    nvidia,
    nvidiaTimeout: 5000,
  };
  return { root, options, reset: () => setSample(false) };
}
test("attributes nearest agents, worker cgroups and top unowned", async () => {
  const f = await fixture();
  const doc = await produce(f.options);
  expect(doc).not.toBeNull();
  if (doc === null) return;
  expect(doc.schema).toBe(2);
  expect(doc.host).toEqual({
    cpu_pct: 100,
    cores: 2,
    ram_bytes: 786432,
    ram_total_bytes: 1048576,
    vram_bytes: 314572800,
    vram_total_bytes: 3145728000,
  });
  expect(doc.sessions).toEqual([
    {
      session_id: id,
      pid: 10,
      vendor: "claude",
      cpu_pct: 30,
      ram_bytes: 60 * 1024,
      vram_bytes: 2097152,
      workers: { count: 1, cpu_pct: 50, ram_bytes: 4096, vram_bytes: 5242880 },
    },
  ]);
  expect(doc.unresolved_agents).toEqual([
    {
      pid: 12,
      vendor: "codex",
      cpu_pct: 20,
      ram_bytes: 40 * 1024,
      vram_bytes: 7340032,
    },
  ]);
  expect(doc.unowned).toEqual([
    { label: "orphan:alpha", cpu_pct: 50, ram_bytes: 100 * 1024 },
    { label: "orphan:beta", cpu_pct: 40, ram_bytes: 80 * 1024 },
    { label: "orphan:gamma", cpu_pct: 30, ram_bytes: 60 * 1024 },
  ]);
  expect((await readFile(join(f.root, "calls"), "utf8")).trim()).toBe("x");
});
test("resolves a Codex session from its open rollout", async () => {
  const f = await fixture();
  const fd = join(f.options.proc, "12", "fd");
  await mkdir(fd);
  const rollout = join(f.root, "rollout-test.jsonl");
  await writeFile(
    rollout,
    `${JSON.stringify({ type: "session_meta", payload: { id } })}\n`,
  );
  await symlink(rollout, join(fd, "4"));
  const doc = await produce(f.options);
  expect(doc).not.toBeNull();
  if (doc === null) return;
  expect(doc.sessions.find((row) => row.pid === 12)?.session_id).toBe(id);
  expect(doc.unresolved_agents).toEqual([]);
});
test("unowned excludes values below five percent", async () => {
  const f = await fixture();
  for (const pid of [30, 31, 32])
    await unlink(join(f.options.proc, String(pid), "stat"));
  const doc = await produce(f.options);
  expect(doc).not.toBeNull();
  if (doc === null) return;
  expect(doc.unowned).toEqual([
    { label: "demo.service", cpu_pct: 10, ram_bytes: 20 * 1024 },
    { label: "orphan:edge", cpu_pct: 5, ram_bytes: 10 * 1024 },
  ]);
});
test("nvidia-smi absent makes every VRAM field null", async () => {
  const f = await fixture();
  const doc = await produce({
    ...f.options,
    nvidia: join(f.root, "absent-nvidia"),
  });
  expect(doc?.host.vram_bytes).toBeNull();
  expect(doc?.host.vram_total_bytes).toBeNull();
  expect(doc?.sessions[0]?.vram_bytes).toBeNull();
  expect(doc?.sessions[0]?.workers?.vram_bytes).toBeNull();
  expect(doc?.unresolved_agents[0]?.vram_bytes).toBeNull();
});
test("pid absent from successful GPU query has zero VRAM", async () => {
  const f = await fixture();
  const nvidia = join(f.root, "empty-gpu");
  await writeFile(
    nvidia,
    "#!/bin/sh\ncase \"$1\" in\n  --query-compute-apps=*) : ;;\n  --query-gpu=*) printf '100, 1000\\n' ;;\nesac\n",
  );
  await chmod(nvidia, 0o755);
  const doc = await produce({ ...f.options, nvidia });
  expect(doc?.sessions[0]?.vram_bytes).toBe(0);
});
for (const mode of ["fail", "timeout"])
  test(`agx ${mode} produces null workers`, async () => {
    const f = await fixture(mode);
    const doc = await produce(f.options);
    expect(doc).not.toBeNull();
    if (doc === null) return;
    expect(doc).not.toBeNull();
    if (doc === null) return;
    expect(doc.agx).toBe("unavailable");
    expect(doc.sessions[0]?.workers).toBeNull();
    expect((await readFile(join(f.root, "calls"), "utf8")).trim()).toBe("x");
  });
test("atomic output, failure and stdout parity", async () => {
  const f = await fixture();
  const path = join(f.root, "out.json");
  let stdout = "";
  expect(
    await run(path, f.options, (s) => {
      stdout += s;
    }),
  ).toBe(0);
  expect(await readFile(path, "utf8")).toBe(stdout);
  await f.reset();
  expect(
    await run(path, { ...f.options, proc: join(f.root, "missing") }, (s) => {
      stdout += s;
    }),
  ).toBe(1);
  expect(await readFile(path, "utf8")).toBe(stdout);
  await f.reset();
  await writeFile(join(f.options.proc, "stat"), "invalid\n");
  expect(await run(path, f.options, () => {})).toBe(1);
  expect(await readFile(path, "utf8")).toBe(stdout);
  await f.reset();
  expect(
    await run(
      path,
      f.options,
      () => {},
      (from) => rename(from, join(f.root, "missing", "out")),
    ),
  ).toBe(1);
  expect(await readFile(path, "utf8")).toBe(stdout);
  await f.reset();
  expect(await run(join(f.root, "missing", "out"), f.options)).toBe(1);
});
test("Darwin CLI reports unsupported platform", async () => {
  if (process.platform !== "darwin") return;
  const p = Bun.spawn({
    cmd: ["bun", "tools/agent-cpu/src/agent-cpu.ts", "--out", "/unused"],
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  expect(code).toBe(1);
  expect(out).toBe("");
  expect(err).toContain("unsupported platform");
});
