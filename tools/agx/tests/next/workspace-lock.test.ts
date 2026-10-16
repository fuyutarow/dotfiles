import { afterAll, afterEach, expect, test } from "bun:test";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { createTempTracker } from "../temp.ts";

const temps = createTempTracker();
afterAll(temps.assertRemoved);
const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function until(predicate: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (predicate()) return;
    await Bun.sleep(10);
  }
  expect(predicate()).toBe(true);
}

const Row = z.looseObject({
  id: z.string(),
  kind: z.string(),
  pid: z.number().optional(),
});

function fixture(delayRoute = false) {
  const root = temps.register(
    mkdtempSync(join(tmpdir(), `agx-test-${process.pid}-workspace-lock-`)),
  );
  const state = join(root, "state");
  mkdirSync(state);
  const log = join(state, "records.jsonl");
  const gate = join(root, "release");
  const routeGate = join(root, "release-route");
  let routing = false;
  const marker = join(root, "workers.jsonl");
  const worker = join(root, "worker.ts");
  const ticket = join(root, "ticket.md");
  const children: ReturnType<typeof Bun.spawn>[] = [];
  const workerPids: number[] = [];
  writeFileSync(
    ticket,
    `+++\nschema = 2\nname = "workspace-lock"\nwrites = []\noutcome = "one writer"\nverify = []\n[proposition]\nid = "ONE"\nclaim = "one worker per workspace"\nrefuted_by = "two workers"\n+++\nFixture.\n`,
  );
  writeFileSync(
    worker,
    `import { appendFileSync, existsSync } from "node:fs";
appendFileSync(${JSON.stringify(marker)}, JSON.stringify({pid: process.pid}) + "\\n");
while (!existsSync(${JSON.stringify(gate)})) await Bun.sleep(10);
console.log(JSON.stringify({ report: { summary: "done", changes: [], checks: [], for_coordinator: [], open: [] }, vendor_session: "fixture-session" }));
`,
  );
  const jev = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async () => {
      routing = true;
      if (delayRoute) while (!existsSync(routeGate)) await Bun.sleep(10);
      return Response.json({
        answers: { worker: { choice: "luna-high", confidence: 0.9 } },
      });
    },
  });
  const seed = (id: string, pid: number, ended = false, workspace = root) => {
    appendFileSync(
      log,
      `${JSON.stringify({ kind: "started", id, at: "2026-10-16T01:00:00Z", ticket: "prior", writes: [], cwd: workspace, workspace, row: "terra-high", dispatcher_session: null, vendor_session: "fixture-session", pid })}\n`,
    );
    if (ended)
      appendFileSync(
        log,
        `${JSON.stringify({ kind: "ended", id, at: "2026-10-16T01:10:00Z", exit: 0, report_path: null, vendor_session: "fixture-session", verify: [] })}\n`,
      );
  };
  seed("prior", process.pid, true);
  const env = {
    ...process.env,
    AGX_NEXT_STATE_DIR: state,
    AGX_TMP_ROOT: join(root, "tmp"),
    AGX_NEXT_WORKER: worker,
    AGX_NEXT_JEV_URL: `http://127.0.0.1:${jev.port}/choice`,
    TYPESAFE_API_KEY: "test-key",
    DISPATCH_ROSTER_PATH: join(
      process.cwd(),
      "agents/models/dispatch-roster.toml",
    ),
    AGX_DISPATCHER_SESSION: "fixture",
  };
  const launch = (resume = true, workspace = root) => {
    const child = Bun.spawn(
      [
        process.execPath,
        "tools/agx/src/next/cli.ts",
        "run",
        ticket,
        "--cd",
        workspace,
        ...(resume ? ["--continue", "prior"] : []),
      ],
      {
        env,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10_000,
      },
    );
    children.push(child);
    const result = Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]).then(([exit, stdout, stderr]) => ({ exit, stdout, stderr }));
    return { child, result };
  };
  const records = () =>
    readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .flatMap((line) => {
        const row = jsonOf(Row).safeParse(line);
        return row.success ? [row.data] : [];
      });
  const workers = () => {
    if (!existsSync(marker)) return [];
    return readFileSync(marker, "utf8")
      .trim()
      .split("\n")
      .flatMap((line) => {
        const row = jsonOf(z.object({ pid: z.number() })).safeParse(line);
        return row.success ? [row.data.pid] : [];
      });
  };
  const listed = async () => {
    const child = Bun.spawn(
      [process.execPath, "tools/agx/src/next/cli.ts", "ls", "--json"],
      { env, stdout: "pipe", stderr: "pipe" },
    );
    const text = await new Response(child.stdout).text();
    expect(await child.exited).toBe(0);
    const parsed = jsonOf(
      z.array(z.looseObject({ id: z.string(), state: z.string() })),
    ).safeParse(text);
    expect(parsed.success).toBe(true);
    return parsed.success ? parsed.data : [];
  };
  cleanups.push(async () => {
    writeFileSync(gate, "release");
    writeFileSync(routeGate, "release");
    for (const child of children) child.kill();
    await Promise.all(children.map((child) => child.exited));
    for (const pid of workerPids) process.kill(pid, "SIGKILL");
    await jev.stop(true);
    rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    gate,
    routeGate,
    ticket,
    routing: () => routing,
    seed,
    launch,
    records,
    workers,
    listed,
    workerPids,
  };
}

test("a recorded live workspace refuses fresh and continued runs before worker spawn", async () => {
  const f = fixture();
  f.seed("live-holder", process.pid);
  const before = f.records();
  for (const resume of [false, true]) {
    const result = await f.launch(resume, `${f.root}/unused/..`).result;
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain("live-holder");
    expect(result.stderr).toContain(f.root);
  }
  expect(f.records()).toEqual(before);
  expect(f.workers()).toEqual([]);
});

test("a live worker blocks both modes; another workspace and a run after completion start", async () => {
  const f = fixture();
  const first = f.launch(false);
  await until(() => f.workers().length === 1);
  const holder = f
    .records()
    .find((row) => row.kind === "started" && row.id !== "prior");
  expect(holder).toBeDefined();
  for (const resume of [false, true]) {
    const refused = await f.launch(resume).result;
    expect(refused.exit).toBe(2);
    expect(refused.stderr).toContain(holder?.id ?? "missing-holder");
  }
  const other = join(f.root, "other");
  mkdirSync(other);
  const independent = f.launch(true, other);
  await until(() => f.workers().length === 2);
  writeFileSync(f.gate, "release");
  expect((await first.result).exit).toBe(0);
  expect((await independent.result).exit).toBe(0);
  expect((await f.launch().result).exit).toBe(0);
  expect(f.workers()).toHaveLength(3);
}, 15_000);

test("simultaneous continuations admit exactly one worker and one started record", async () => {
  const f = fixture();
  const runs = Array.from({ length: 4 }, () => f.launch());
  await until(() => f.workers().length === 1);
  await until(
    () => runs.filter((run) => run.child.exitCode !== null).length === 3,
  );
  const started = f
    .records()
    .filter((row) => row.kind === "started" && row.id !== "prior");
  expect(started).toHaveLength(1);
  const refused = await Promise.all(
    runs.filter((run) => run.child.exitCode !== null).map((run) => run.result),
  );
  expect(refused).toHaveLength(3);
  for (const result of refused) {
    expect(result.exit).toBe(2);
    expect(result.stderr).toContain(started[0]?.id ?? "missing-holder");
  }
  writeFileSync(f.gate, "release");
  const results = await Promise.all(runs.map((run) => run.result));
  expect(results.filter((result) => result.exit === 0)).toHaveLength(1);
  expect(f.workers()).toHaveLength(1);
});

test("a dispatch delayed in routing refuses the run that acquired its workspace meanwhile", async () => {
  const f = fixture(true);
  const delayed = f.launch(false);
  await until(f.routing);
  const winner = f.launch();
  await until(() => f.workers().length === 1);
  const holder = f
    .records()
    .find((row) => row.kind === "started" && row.id !== "prior");
  writeFileSync(f.routeGate, "release");
  const refused = await delayed.result;
  expect(refused.exit).toBe(2);
  expect(refused.stderr).toContain(holder?.id ?? "missing-holder");
  expect(f.workers()).toHaveLength(1);
  writeFileSync(f.gate, "release");
  expect((await winner.result).exit).toBe(0);
});

test("workspace ownership lasts through verification after the worker exits", async () => {
  const f = fixture();
  const verifying = join(f.root, "verifying");
  const verifyGate = join(f.root, "release-verify");
  const verifier = join(f.root, "verify.ts");
  writeFileSync(
    verifier,
    `import { existsSync, writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(verifying)}, "ready");\nwhile (!existsSync(${JSON.stringify(verifyGate)})) await Bun.sleep(10);\n`,
  );
  const command = `bun ${verifier}`;
  writeFileSync(
    f.ticket,
    readFileSync(f.ticket, "utf8").replace(
      "verify = []",
      `verify = [${JSON.stringify(command)}]`,
    ),
  );
  // Register first so a failed assertion cannot strand the verifier during cleanup.
  cleanups.unshift(async () => {
    await Bun.write(verifyGate, "release");
  });
  writeFileSync(f.gate, "release");
  const first = f.launch();
  await until(() => existsSync(verifying));
  const holder = f
    .records()
    .find((row) => row.kind === "started" && row.id !== "prior");
  const refused = await f.launch().result;
  expect(refused.exit).toBe(2);
  expect(refused.stderr).toContain(holder?.id ?? "missing-holder");
  expect(f.workers()).toHaveLength(1);
  writeFileSync(verifyGate, "release");
  expect((await first.result).exit).toBe(0);
});

test("SIGKILL releases ownership despite a surviving worker and folds the old run as orphaned", async () => {
  const f = fixture();
  const first = f.launch();
  await until(() => f.workers().length === 1);
  const old = f
    .records()
    .find((row) => row.kind === "started" && row.id !== "prior");
  const pid = f.workers()[0];
  expect(pid).toBeDefined();
  if (pid === undefined) return;
  // This child outlives its dispatcher; keep it alive until the new dispatch acquires flock.
  f.workerPids.push(pid);
  first.child.kill("SIGKILL");
  await first.child.exited;
  expect((await f.listed()).find((row) => row.id === old?.id)?.state).toBe(
    "orphaned",
  );
  const next = f.launch();
  await until(() => f.workers().length === 2);
  expect(process.kill(pid, 0)).toBe(true);
  writeFileSync(f.gate, "release");
  expect((await next.result).exit).toBe(0);
  // Release also lets the orphaned fixture exit; reap through its inherited stdout pipe.
  await first.result;
  f.workerPids.splice(0);
});
