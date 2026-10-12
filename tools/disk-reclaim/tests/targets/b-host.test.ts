import { expect, test } from "bun:test";
import { chmodSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { jsonOf } from "../../../shared/src/zod.ts";
import { Plan } from "../../src/model.ts";
import { ReclaimRecord } from "../../src/records.ts";
import { cliEnv } from "../fixtures/cli-env.ts";
import { tempRoot } from "../fixtures/temp.ts";
import {
  hostAction,
  hostFunctions,
  hostProbe,
} from "../../src/targets/host-powershell.ts";
import {
  classifySwaps,
  createHostTarget,
  parseProbe,
  HOST_PROBE_TIMEOUT_MS,
} from "../../src/targets/host.ts";
import type { Context } from "../../src/targets/index.ts";

const context: Context = {
  mode: "plan",
  config: {
    repo_roots: [],
    repos: [],
    scratch_roots: [],
    delete_roots: [],
    regenerable_ignored: [],
    session_grace_hours: 24,
    ignore_unreadable_procs: ["sshd"],
  },
  log: () => {},
};
test("host parses separate cleanup tiers and allocated VHDX reports", async () => {
  const s = parseProbe(
    "c_free=123\r\nc_total=999\r\nlever=user-temp|42|C:\\Temp\r\nlever=windows-update-components|?|C:\\Windows\\WinSxS\r\nvhdx=456|Ubuntu|Running|C:\\WSL\\ext4.vhdx\r\n",
  );
  expect(s).toMatchObject({
    cFree: 123,
    cTotal: 999,
    levers: [
      { id: "user-temp", bytes: 42 },
      { id: "windows-update-components", bytes: null },
    ],
    vhdx: [{ bytes: 456, distro: "Ubuntu", state: "Running" }],
  });
  const target = createHostTarget({
    snapshot: () => Promise.resolve(s),
    runner: () => Promise.resolve({ code: 0, out: "", timedOut: false }),
  });
  const rows = await target.plan(context);
  expect(rows.at(-1)).toMatchObject({ verdict: "KEEP", action: { argv: [] } });
  expect(rows.at(-1)?.reason).toContain("plan vhdx");
});
test("approval tiers refuse direct act without their exact approval", async () => {
  let calls = 0;
  const target = createHostTarget({
    snapshot: () =>
      Promise.resolve(
        parseProbe(
          "lever=recycle-bin|10|C:\\$Recycle.Bin\nlever=hibernate-off|20|C:\\hiberfil.sys",
        ),
      ),
    runner: () => {
      calls++;
      return Promise.resolve({ code: 0, out: "", timedOut: false });
    },
  });
  for (const c of await target.plan(context)) {
    expect(c.verdict).toBe("ASK");
    expect((await target.act(c, { ...context, mode: "run" })).ok).toBe(false);
  }
  expect(calls).toBe(0);
});
test("PowerShell selection preserves young temp files, junctions, and all virtual disks", () => {
  expect(hostProbe).toContain("AddDays(-1)");
  expect(hostProbe).toContain("ReparsePoint");
  expect(hostProbe).toContain("'.vhdx','.vhd'");
  expect(hostProbe).toContain("GetCompressedFileSizeW");
  expect(hostProbe).toContain(
    "if ([string]::IsNullOrWhiteSpace($p.BasePath)) { return }",
  );
  expect(hostAction("windows-update-components", "ignored")).toContain(
    "/StartComponentCleanup",
  );
  expect(hostAction("hibernate-off", "ignored")).toContain(
    "powercfg.exe /h off",
  );
  expect(hostAction("orphan-swap", "C:\\it's\\swap.vhdx")).toContain("it''s");
});
test("host cleanup roots exclude installed WinGet portable packages and links", () => {
  const rootBlock = hostFunctions.match(/\$roots=@\{([\s\S]*?)\n\}/u)?.[1];
  expect(rootBlock).toBeDefined();
  if (rootBlock === undefined) return;
  const rootPaths = [...rootBlock.matchAll(/@\(([^)]*)\)/gu)].flatMap((entry) =>
    [...(entry[1] ?? "").matchAll(/"([^"]+)"|'([^']+)'/gu)].map(
      (path) => path[1] ?? path[2] ?? "",
    ),
  );
  expect(rootPaths).toContain("$env:TEMP\\WinGet");
  expect(
    rootPaths.filter((path) =>
      /\\WinGet\\(?:Packages|Links)(?:\\|$)/iu.test(path),
    ),
  ).toEqual([]);
  expect(rootPaths).not.toContain("$env:LOCALAPPDATA\\Microsoft\\WinGet");
});
test("non-WSL CLI uses only encoded SSH stubs, records per-lever deltas, and gates approvals", async () => {
  const root = tempRoot("reclaim-host-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const env = { ...cliEnv(root), HOST_STUB_LOG: join(root, "ssh.log") };
  symlinkSync(process.execPath, join(env.PATH, "bun"));
  const stub = join(env.PATH, "ssh");
  await Bun.write(
    stub,
    `#!/usr/bin/env bun\n${await Bun.file(resolve(import.meta.dir, "../fixtures/host-ssh.ts")).text()}`,
  );
  chmodSync(stub, 0o755);
  const invoke = (args: string[], overrides: Record<string, string> = {}) =>
    Bun.spawnSync(
      [
        process.execPath,
        resolve(import.meta.dir, "../fixtures/cli-fixture.ts"),
        ...args,
      ],
      { env: { ...env, ...overrides }, cwd: root, timeout: 120_000 },
    );
  const preview = invoke(["plan", "host", "--host", "r99-lan", "--json"]);
  expect(preview.exitCode, preview.stderr.toString()).toBe(0);
  const parsed = jsonOf(Plan).safeParse(preview.stdout.toString());
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  const rows = parsed.data.targets[0]?.candidates ?? [];
  expect(rows).toHaveLength(21);
  const records = invoke(["plan", "host", "--host", "r99-lan"]);
  expect(records.exitCode, records.stderr.toString()).toBe(0);
  const jsonl = records.stdout
    .toString()
    .trim()
    .split("\n")
    .map((line) => jsonOf(ReclaimRecord).safeParse(line));
  expect(jsonl.every((row) => row.success)).toBe(true);
  const leverNames = jsonl.flatMap((row) =>
    row.success ? [row.data.target] : [],
  );
  expect(leverNames).toContain("windows-update-download");
  expect(leverNames).toContain("windows-update-components");
  expect(leverNames).toContain("browser-crash-dumps");
  expect(leverNames).toContain("npm-cache");
  expect(leverNames).toContain("pagefile-size");
  expect(leverNames).toContain("claude-vm-bundles");
  expect(
    rows
      .filter(
        (c) =>
          c.host_lever?.approval !== null &&
          c.host_lever?.approval !== undefined,
      )
      .map((c) => c.verdict),
  ).toEqual(["ASK", "ASK", "ASK", "ASK"]);
  expect(readFileSync(env.HOST_STUB_LOG, "utf8")).not.toContain("c_before");
  const refused = invoke(["run", "host", "--approve", "recycle-bin", "--json"]);
  expect(refused.exitCode).toBe(2);
  const ran = invoke(["run", "host", "--yes", "--host", "r99-lan", "--json"]);
  expect(ran.exitCode, ran.stderr.toString()).toBe(0);
  const executed = jsonOf(Plan).safeParse(ran.stdout.toString());
  expect(executed.success).toBe(true);
  if (!executed.success) return;
  const acted =
    executed.data.targets[0]?.candidates.filter((c) => c.result !== null) ?? [];
  expect(acted).toHaveLength(16);
  expect(
    acted.every(
      (c) =>
        c.result?.c_free_before !== undefined &&
        c.result?.c_free_after !== undefined,
    ),
  ).toBe(true);
  expect(acted.some((c) => c.result?.c_free_delta === 2097152)).toBe(true);
  expect(ran.stderr.toString()).toContain("inert here");
  let log = readFileSync(env.HOST_STUB_LOG, "utf8");
  expect(log).toContain("r99-lan");
  expect(log).toContain(".ps1'");
  expect(log).toContain("[Console]::In.ReadLine()");
  expect(log).toContain("[Convert]::FromBase64String");
  expect(log).toContain('"ConnectTimeout=10"');
  expect(log).toContain('"BatchMode=yes"');
  expect(log).toContain('"ConnectionAttempts=1"');
  expect(log).toContain('"-T"');
  expect(log).toContain("Remove-Item -LiteralPath $scriptPath");
  expect(log).not.toContain("Clear-RecycleBin");
  expect(log).not.toContain("powercfg.exe /h off");
  const approved = invoke([
    "run",
    "host",
    "--yes",
    "--approve",
    "recycle-bin",
    "--approve",
    "hibernate-off",
    "--json",
  ]);
  expect(approved.exitCode, approved.stderr.toString()).toBe(0);
  log = readFileSync(env.HOST_STUB_LOG, "utf8");
  expect(log).toContain("Clear-RecycleBin");
  expect(log).toContain("powercfg.exe /h off");
  expect(log).toContain('"r99"');
  expect(log).not.toContain("Remove-Item -LiteralPath 'C:\\WSL\\ext4.vhdx'");
  const emptyProbe = invoke(["plan", "host", "--host", "r99-lan", "--json"], {
    HOST_STUB_EMPTY: "1",
  });
  expect(emptyProbe.exitCode).toBe(1);
  expect(jsonOf(Plan).safeParse(emptyProbe.stdout.toString()).success).toBe(
    true,
  );
  expect(emptyProbe.stderr.toString()).toContain(
    "FAILED host: host PowerShell probe failed: PowerShell returned no usable probe records",
  );
  expect(emptyProbe.stderr.toString()).toContain("stdout: <empty>");
}, 300_000);

test("Windows CLI times out a real SSH child and names its last PowerShell step", async () => {
  expect(HOST_PROBE_TIMEOUT_MS).toBeLessThan(180_000);
  const root = tempRoot("reclaim-host-timeout-");
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const env = {
    ...cliEnv(root),
    HOST_STUB_LOG: join(root, "ssh.log"),
    HOST_STUB_HANG: "1",
  };
  symlinkSync(process.execPath, join(env.PATH, "bun"));
  const stub = join(env.PATH, "ssh");
  await Bun.write(
    stub,
    `#!/usr/bin/env bun\n${await Bun.file(resolve(import.meta.dir, "../fixtures/host-ssh.ts")).text()}`,
  );
  chmodSync(stub, 0o755);
  for (const connect of [false, true]) {
    const started = performance.now();
    const run = Bun.spawnSync(
      [
        process.execPath,
        resolve(import.meta.dir, "../fixtures/host-timeout-cli.ts"),
        "plan",
        "--on",
        "windows",
      ],
      {
        env: { ...env, HOST_STUB_HANG_CONNECT: connect ? "1" : "0" },
        cwd: root,
        timeout: 15_000,
      },
    );
    const step = connect
      ? "SSH connect/authenticate"
      : "lever npm-cache allocation scan";
    expect(run.exitCode, run.stderr.toString()).toBe(1);
    expect(performance.now() - started).toBeLessThan(15_000);
    expect(run.stdout.toString()).toBe("");
    expect(run.stderr.toString()).toContain(`waiting for ${step}`);
    expect(run.stderr.toString()).toContain(`step=${step}`);
    expect(run.stderr.toString()).toContain("timed out after 5000 ms");
  }
}, 40_000);

test("host plan matches dry-run swap selection and runner is injected", async () => {
  const data = parseProbe(
    "swap=100|10|C:\\Temp\\old\\swap.vhdx\nswap=300|20|C:\\Temp\\live\\swap.vhdx\nwinget_cache=0\n",
  );
  expect(classifySwaps(data.swaps).orphans.map((x) => x.path)).toEqual([
    "C:\\Temp\\old\\swap.vhdx",
  ]);
  let calls = 0;
  const target = createHostTarget({
    snapshot: () => Promise.resolve(data),
    runner: () => {
      calls++;
      return Promise.resolve({ code: 0, out: "", timedOut: false });
    },
  });
  const plan = await target.plan({
    mode: "plan",
    explicit: false,
    config: {
      repo_roots: [],
      repos: [],
      scratch_roots: [],
      delete_roots: [],
      regenerable_ignored: [],
      session_grace_hours: 24,
      ignore_unreadable_procs: ["sshd"],
    },
    log: () => {},
  });
  expect(plan.map((c) => c.id)).toEqual(["C:\\Temp\\old\\swap.vhdx"]);
  expect(calls).toBe(0);
});

test("host classifies no swaps without a live or reclaimable path", () => {
  expect(classifySwaps([])).toEqual({
    live: null,
    orphans: [],
    reclaimBytes: 0,
  });
});

test("host keeps its only swap and never marks it orphaned", () => {
  const only = { path: "A", mtimeMs: 100, bytes: 16 * 1024 ** 3 };
  expect(classifySwaps([only])).toEqual({
    live: only,
    orphans: [],
    reclaimBytes: 0,
  });
});

test("host keeps newest swap and reports every older swap's reclaimable bytes", () => {
  const dead1 = { path: "old1", mtimeMs: 100, bytes: 15 * 1024 ** 3 };
  const live = { path: "new", mtimeMs: 300, bytes: 16 * 1024 ** 3 };
  const dead2 = { path: "old2", mtimeMs: 200, bytes: 2 * 1024 ** 3 };
  const result = classifySwaps([dead1, live, dead2]);
  expect(result.live).toBe(live);
  expect(result.orphans.map((item) => item.path).toSorted()).toEqual([
    "old1",
    "old2",
  ]);
  expect(result.reclaimBytes).toBe(17 * 1024 ** 3);
});

test("host swap classification depends on mtime rather than input order", () => {
  const a = { path: "a", mtimeMs: 1, bytes: 1 };
  const b = { path: "b", mtimeMs: 3, bytes: 10 };
  const c = { path: "c", mtimeMs: 2, bytes: 100 };
  expect(classifySwaps([a, b, c]).live).toBe(b);
  expect(classifySwaps([c, b, a]).live).toBe(b);
  expect(classifySwaps([b, a, c]).live).toBe(b);
});
