import { afterAll, afterEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTempTracker } from "../temp.ts";
import { createRunTemp, sweepStaleTemps } from "../../src/temp.ts";

const tempDirs = createTempTracker();
afterAll(tempDirs.assertRemoved);

const servers: ReturnType<typeof Bun.spawn>[] = [];
const roots: string[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.kill();
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const scratch = (prefix: string): string => {
  const root = tempDirs.register(
    mkdtempSync(join(tmpdir(), `agx-test-${process.pid}-${prefix}`)),
  );
  roots.push(root);
  return root;
};

const CLI = "tools/agx/src/next/cli.ts";

// A fixture agx project: fake Jev, a ticket, and a worker script that reports its temp variables.
async function fixture(workerBody: string, verify: string) {
  const root = scratch("run-temp-");
  const tempRoot = join(root, "agx-tmp");
  const ticket = join(root, "ticket.md");
  const worker = join(root, "fake-worker.ts");
  const jevFile = join(root, "fake-jev.ts");
  const portProbe = Bun.serve({ port: 0, fetch: () => new Response() });
  const jevPort = portProbe.port;
  await portProbe.stop(true);
  writeFileSync(
    jevFile,
    `Bun.serve({ hostname: "127.0.0.1", port: ${jevPort}, fetch: () => Response.json({ answers: { worker: { choice: "luna-high", confidence: 0.9 } } }) });\n`,
  );
  servers.push(
    Bun.spawn([process.execPath, jevFile], {
      stdout: "ignore",
      stderr: "ignore",
    }),
  );
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (
      (await fetch(`http://127.0.0.1:${jevPort}/health`).catch(() => null)) !==
      null
    )
      break;
    await Bun.sleep(25);
  }
  writeFileSync(
    ticket,
    `+++\nschema = 2\nname = "temp-fixture"\nwrites = []\noutcome = "temp fixture"\nverify = [${JSON.stringify(verify)}]\n[proposition]\nid = "TMP-1"\nclaim = "run owns temp"\nrefuted_by = "leftover"\n+++\nRun the fixture.\n`,
  );
  writeFileSync(worker, workerBody);
  const env = {
    ...process.env,
    AGX_NEXT_STATE_DIR: join(root, "state"),
    AGX_NEXT_JEV_URL: `http://127.0.0.1:${jevPort}/choice`,
    AGX_NEXT_WORKER: worker,
    AGX_TMP_ROOT: tempRoot,
    TYPESAFE_API_KEY: "test-key",
    DISPATCH_ROSTER_PATH: join(
      process.cwd(),
      "agents/models/dispatch-roster.toml",
    ),
  };
  return { root, tempRoot, ticket, env };
}

const DONE = `process.stdout.write(JSON.stringify({ exit: 0, report: { summary: "done", changes: [], checks: [], for_coordinator: [], open: [] } }) + "\\n");\n`;

describe("agx run owns its temp space", () => {
  test("worker and verify see TMPDIR under the temp root; the run removes it", async () => {
    const root0 = scratch("probe-");
    const seen = join(root0, "seen.txt");
    const f = await fixture(
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(seen)}, [process.env.TMPDIR, process.env.TMP, process.env.TEMP].join("\\n"));\n${DONE}`,
      `printf %s "$TMPDIR" > ${join(root0, "verify.txt")}`,
    );
    const result = Bun.spawnSync(
      [process.execPath, CLI, "run", f.ticket, "--cd", f.root],
      {
        cwd: process.cwd(),
        env: f.env,
        timeout: 10_000,
      },
    );
    expect(result.exitCode).toBe(0);
    const [tmpdirSeen, tmpSeen, tempSeen] = readFileSync(seen, "utf8").split(
      "\n",
    );
    expect(tmpdirSeen?.startsWith(`${f.tempRoot}/`)).toBe(true);
    expect(tmpSeen).toBe(tmpdirSeen ?? "");
    expect(tempSeen).toBe(tmpdirSeen ?? "");
    expect(readFileSync(join(root0, "verify.txt"), "utf8")).toBe(
      tmpdirSeen ?? "",
    );
    expect(existsSync(tmpdirSeen ?? "")).toBe(false);
    expect(readdirSync(f.tempRoot)).toEqual([]);
  });

  test("a SIGKILLed run leaves its directory and the next run removes it", async () => {
    const root0 = scratch("kill-");
    const marker = join(root0, "worker-pid.txt");
    const stuck = await fixture(
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, String(process.pid));\nawait Bun.sleep(30000);\n`,
      "true",
    );
    const victim = Bun.spawn(
      [process.execPath, CLI, "run", stuck.ticket, "--cd", stuck.root],
      {
        cwd: process.cwd(),
        env: stuck.env,
        stdout: "ignore",
        stderr: "ignore",
      },
    );
    servers.push(victim);
    for (let attempt = 0; attempt < 200 && !existsSync(marker); attempt += 1)
      await Bun.sleep(25);
    expect(existsSync(marker)).toBe(true);
    victim.kill("SIGKILL");
    await victim.exited;
    process.kill(Number(readFileSync(marker, "utf8")), "SIGKILL");
    const leftover = readdirSync(stuck.tempRoot).filter(
      (name) => !name.endsWith(".pid"),
    );
    expect(leftover).toHaveLength(1);

    writeFileSync(join(stuck.root, "fake-worker.ts"), DONE);
    const next = Bun.spawnSync(
      [process.execPath, CLI, "run", stuck.ticket, "--cd", stuck.root],
      { cwd: process.cwd(), env: stuck.env, timeout: 10_000 },
    );
    expect(next.exitCode).toBe(0);
    expect(readdirSync(stuck.tempRoot)).toEqual([]);
  });

  test("SIGTERM removes the run directory", async () => {
    const root0 = scratch("term-");
    const marker = join(root0, "worker-pid.txt");
    const f = await fixture(
      `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "up");\nawait Bun.sleep(30000);\n`,
      "true",
    );
    const child = Bun.spawn(
      [process.execPath, CLI, "run", f.ticket, "--cd", f.root],
      {
        cwd: process.cwd(),
        env: f.env,
        stdout: "ignore",
        stderr: "ignore",
      },
    );
    servers.push(child);
    for (let attempt = 0; attempt < 200 && !existsSync(marker); attempt += 1)
      await Bun.sleep(25);
    expect(readdirSync(f.tempRoot).length).toBeGreaterThan(0);
    child.kill("SIGTERM");
    await child.exited;
    expect(readdirSync(f.tempRoot)).toEqual([]);
  });
});

describe("createRunTemp", () => {
  test("refuses a temp root that is /tmp itself and leaves /tmp untouched", () => {
    expect(createRunTemp("run-1", "/tmp")._unsafeUnwrapErr()).toContain(
      "refusing",
    );
    expect(existsSync("/tmp/run-1")).toBe(false);
    expect(existsSync("/tmp/run-1.pid")).toBe(false);
  });

  test("refuses ids that would escape the root", () => {
    const root = scratch("ids-");
    for (const id of ["", ".", "..", "a/b"])
      expect(createRunTemp(id, root)._unsafeUnwrapErr()).toContain(
        "invalid run id",
      );
  });

  test("sweep removes dead-owner directories and keeps live ones", () => {
    const root = scratch("sweep-");
    const live = createRunTemp("live", root)._unsafeUnwrap();
    const deadPid = 2 ** 22 + 12345;
    writeFileSync(join(root, "dead.pid"), `${deadPid}\n`);
    mkdirSync(join(root, "dead"));
    expect(sweepStaleTemps(root, -1)).toEqual(["dead"]);
    expect(existsSync(join(root, "dead"))).toBe(false);
    expect(existsSync(live.dir)).toBe(true);
    live.remove();
    expect(readdirSync(root)).toEqual([]);
  });
});
