import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";

const tempDirs: string[] = [];
const servers: ReturnType<typeof createServer>[] = [];
const SCRIPT = join(import.meta.dir, "..", "src", "btmp.ts");
const RequestSchema = jsonOf(z.record(z.string(), z.unknown()));
const AgentRequestSchema = z.object({
  params: z.object({
    pane_id: z.string(),
    source: z.string(),
    agent: z.string(),
    state: z.string(),
    resume_argv: z.array(z.string()),
  }),
});
const MetadataRequestSchema = z.object({
  params: z.object({
    pane_id: z.string(),
    source: z.string(),
    agent: z.string(),
    title: z.string(),
    ttl_ms: z.number(),
    tokens: z.object({
      btm_summary: z.string(),
      cpu: z.string(),
      ram: z.string(),
      tmp: z.string(),
    }),
  }),
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "herdr-btm-"));
  tempDirs.push(root);
  return root;
}

function fakeHerdrSocket(path: string) {
  const requests: Record<string, unknown>[] = [];
  const server = createServer((socket) => {
    let pending = "";
    socket.on("data", (data) => {
      pending += data.toString();
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (line === "") continue;
        const parsed = RequestSchema.safeParse(line);
        expect(parsed.success).toBe(true);
        if (parsed.success) {
          const request = parsed.data;
          requests.push(request);
          const result =
            request.method === "ping"
              ? { type: "pong", version: "0.9.3", protocol: 22 }
              : { type: "ok" };
          socket.write(`${JSON.stringify({ id: request.id, result })}\n`);
        }
      }
    });
  });
  servers.push(server);
  // Bind a relative socket name: the runner's absolute TMPDIR can exceed sun_path.
  const cwd = process.cwd();
  process.chdir(dirname(path));
  const listening = new Promise<typeof requests>((resolve, reject) => {
    server.once("error", reject);
    server.listen(basename(path), () => {
      resolve(requests);
    });
  });
  return listening.finally(() => {
    process.chdir(cwd);
  });
}

async function runEntry(
  root: string,
  env: NodeJS.ProcessEnv,
  args: string[] = [],
): Promise<number> {
  const processEntry = Bun.spawn([process.execPath, SCRIPT, ...args], {
    cwd: root,
    env,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
    timeout: 12000,
    killSignal: "SIGKILL",
  });
  const [status, stderr] = await Promise.all([
    processEntry.exited,
    new Response(processEntry.stderr).text(),
  ]);
  expect(stderr).toBe("");
  return status;
}

afterEach(async () => {
  await Promise.all(
    servers.map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        }),
    ),
  );
  servers.length = 0;
  await Promise.all(
    tempDirs.map((dir) => rm(dir, { recursive: true, force: true })),
  );
  tempDirs.length = 0;
});

test("reports btm lifecycle and shared host metrics to the current pane", async () => {
  const root = await tempRoot();
  const binDir = join(root, "bin");
  await mkdir(binDir);
  const marker = join(root, "btm-ran");
  const fakeBtm = join(binDir, "btm");
  await writeFile(fakeBtm, `#!/bin/sh\nprintf ran > '${marker}'\nsleep 3.4\n`);
  await chmod(fakeBtm, 0o755);
  const stateDir = join(root, "state");
  await mkdir(stateDir);
  const now = Temporal.Now.instant().epochMilliseconds;
  await Bun.write(
    join(stateDir, "gpu-owner.json"),
    JSON.stringify({
      schema: 1,
      attemptAt: now,
      sampledAt: now,
      devices: [],
      processes: [],
      samples: [
        {
          ts: now,
          nextTs: now + 60_000,
          utilPct: 40,
          memUsedGiB: 3.4,
          memTotalGiB: 12,
        },
      ],
    }),
  );
  const socketPath = join(root, "herdr.sock");
  const requests = await fakeHerdrSocket(socketPath);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    HOME: join(root, "home"),
    XDG_STATE_HOME: stateDir,
    TZ: "UTC",
    HERDR_ENV: "1",
    HERDR_SOCKET_PATH: basename(socketPath),
    HERDR_PANE_ID: "w1:p9",
  };

  expect(await runEntry(root, env, ["--basic", "value with spaces"])).toBe(0);
  expect(requests.map((request) => request.method)).toContain(
    "pane.report_agent",
  );
  expect(requests.map((request) => request.method)).toContain(
    "pane.report_metadata",
  );
  expect(requests.map((request) => request.method)).toContain(
    "pane.release_agent",
  );
  const agentRequest = requests.find(
    (request) => request.method === "pane.report_agent",
  );
  const parsedAgentRequest = AgentRequestSchema.safeParse(agentRequest);
  expect(parsedAgentRequest.success).toBe(true);
  if (parsedAgentRequest.success)
    expect(parsedAgentRequest.data.params).toEqual({
      pane_id: "w1:p9",
      source: "btm",
      agent: "btm",
      state: "idle",
      resume_argv: ["btmp", "--basic", "value with spaces"],
    });
  const metadata = requests.find(
    (request) => request.method === "pane.report_metadata",
  );
  const parsedMetadata = MetadataRequestSchema.safeParse(metadata);
  expect(parsedMetadata.success, JSON.stringify(metadata)).toBe(true);
  if (parsedMetadata.success) {
    expect(parsedMetadata.data.params).toMatchObject({
      pane_id: "w1:p9",
      source: "btm",
      agent: "btm",
      ttl_ms: 10000,
    });
    const { cpu, ram, tmp, btm_summary } = parsedMetadata.data.params.tokens;
    expect(btm_summary).toBe(
      `CPU ${cpu} · RAM ${ram} · tmpfs ${tmp} · GPU 3.4/12G 40%`,
    );
    expect(parsedMetadata.data.params.title).toBe(`btm · ${btm_summary}`);
  }
  const metadataRequests = requests.filter(
    (request) => request.method === "pane.report_metadata",
  );
  expect(metadataRequests.at(-1)?.params).toMatchObject({
    pane_id: "w1:p9",
    clear_title: true,
    tokens: { btm_summary: null },
  });
  expect(
    requests.filter((request) => request.method === "pane.report_agent"),
  ).toHaveLength(1);
  expect(
    requests.filter((request) => request.method === "pane.release_agent"),
  ).toHaveLength(1);
}, 15000);

test.each([
  [
    "paused GPU job",
    (now: number) => ({
      schema: 1,
      attemptAt: now,
      sampledAt: now,
      paused: true,
      holder: { slot: "gpu.0.0", pid: 2468 },
      devices: [],
      processes: [],
      samples: [],
    }),
    "GPU paused (job pid 2468)",
  ],
  [
    "unresponsive GPU sampler",
    (now: number) => ({
      schema: 1,
      attemptAt: now,
      sampledAt: now,
      unresponsiveSince: 0,
      devices: [],
      processes: [],
      samples: [],
    }),
    "GPU ⚠ stalled since 00:00",
  ],
  [
    "expired GPU sample",
    (now: number) => ({
      schema: 1,
      attemptAt: now - 120_001,
      sampledAt: now - 120_001,
      devices: [],
      processes: [],
      samples: [
        {
          ts: now - 120_001,
          nextTs: now - 60_001,
          utilPct: 40,
          memUsedGiB: 3.4,
          memTotalGiB: 12,
        },
      ],
    }),
    "GPU n/a(stale (GPU sample expired))",
  ],
])(
  "reports %s in the Herdr label without probing NVML",
  async (_name, state, expected) => {
    const root = await tempRoot();
    const binDir = join(root, "bin");
    await mkdir(binDir);
    const marker = join(root, "nvidia-smi-called");
    const fakeBtm = join(binDir, "btm");
    const fakeNvidiaSmi = join(binDir, "nvidia-smi");
    await writeFile(fakeBtm, "#!/bin/sh\nsleep 3.4\n");
    await writeFile(fakeNvidiaSmi, `#!/bin/sh\nprintf called > '${marker}'\n`);
    await Promise.all([chmod(fakeBtm, 0o755), chmod(fakeNvidiaSmi, 0o755)]);
    const stateDir = join(root, "state");
    await mkdir(stateDir);
    const now = Temporal.Now.instant().epochMilliseconds;
    await Bun.write(
      join(stateDir, "gpu-owner.json"),
      JSON.stringify(state(now)),
    );
    const socketPath = join(root, "herdr.sock");
    const requests = await fakeHerdrSocket(socketPath);
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ""}`,
      HOME: join(root, "home"),
      XDG_STATE_HOME: stateDir,
      TZ: "UTC",
      HERDR_ENV: "1",
      HERDR_SOCKET_PATH: basename(socketPath),
      HERDR_PANE_ID: "w1:p9",
    };

    expect(await runEntry(root, env)).toBe(0);
    const metadata = requests.find(
      (request) => request.method === "pane.report_metadata",
    );
    const parsed = MetadataRequestSchema.safeParse(metadata);
    expect(parsed.success, JSON.stringify(metadata)).toBe(true);
    if (parsed.success)
      expect(parsed.data.params.tokens.btm_summary).toContain(expected);
    expect(await Bun.file(marker).exists()).toBe(false);
  },
  15000,
);

test("reports a missing GPU owner state as n/a", async () => {
  const root = await tempRoot();
  const binDir = join(root, "bin");
  await mkdir(binDir);
  const fakeBtm = join(binDir, "btm");
  await writeFile(fakeBtm, "#!/bin/sh\nsleep 3.4\n");
  await chmod(fakeBtm, 0o755);
  const stateDir = join(root, "state");
  await mkdir(stateDir);
  const socketPath = join(root, "herdr.sock");
  const requests = await fakeHerdrSocket(socketPath);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    HOME: join(root, "home"),
    XDG_STATE_HOME: stateDir,
    HERDR_ENV: "1",
    HERDR_SOCKET_PATH: basename(socketPath),
    HERDR_PANE_ID: "w1:p9",
  };

  expect(await runEntry(root, env)).toBe(0);
  const metadata = requests.find(
    (request) => request.method === "pane.report_metadata",
  );
  const parsed = MetadataRequestSchema.safeParse(metadata);
  expect(parsed.success, JSON.stringify(metadata)).toBe(true);
  if (parsed.success)
    expect(parsed.data.params.tokens.btm_summary).toContain(
      "GPU n/a(stale (GPU sampler state unavailable))",
    );
});

test("runs btm without any Herdr reports outside a Herdr pane", async () => {
  const root = await tempRoot();
  const binDir = join(root, "bin");
  await mkdir(binDir);
  const marker = join(root, "btm-ran");
  const fakeBtm = join(binDir, "btm");
  await writeFile(
    fakeBtm,
    `#!/bin/sh\nprintf '%s\\n' "$@" > '${marker}'\nexit 37\n`,
  );
  await chmod(fakeBtm, 0o755);
  const socketPath = join(root, "herdr.sock");
  const requests = await fakeHerdrSocket(socketPath);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: `${binDir}:${process.env.PATH ?? ""}`,
    HOME: join(root, "home"),
  };
  delete env.HERDR_ENV;
  delete env.HERDR_SOCKET_PATH;
  delete env.HERDR_PANE_ID;

  expect(
    await runEntry(root, env, ["--basic", "value with spaces", "--", "-x"]),
  ).toBe(37);
  expect(await Bun.file(marker).text()).toBe(
    "--basic\nvalue with spaces\n--\n-x\n",
  );
  expect(requests).toHaveLength(0);
});
