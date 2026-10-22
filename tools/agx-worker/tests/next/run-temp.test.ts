import { prepareTicketRepo } from "../ticket-repo.ts";
import { afterAll, afterEach, describe, expect, spyOn, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err } from "neverthrow";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { createTempTracker } from "../temp.ts";
import { createRunTemp, sweepStaleTemps } from "../../src/temp.ts";

const tempDirs = createTempTracker();
afterAll(tempDirs.assertRemoved);

const servers: ReturnType<typeof Bun.spawn>[] = [];
const roots: string[] = [];
const makeWritable = (path: string) => {
  if (!existsSync(path) || !lstatSync(path).isDirectory()) return;
  chmodSync(path, 0o700);
  for (const name of readdirSync(path)) makeWritable(join(path, name));
};
afterEach(() => {
  for (const server of servers.splice(0)) server.kill();
  for (const root of roots.splice(0)) {
    makeWritable(root);
    rmSync(root, { recursive: true, force: true });
  }
});
const scratch = (prefix: string): string => {
  const root = tempDirs.register(
    mkdtempSync(join(tmpdir(), `agx-test-${process.pid}-${prefix}`)),
  );
  roots.push(root);
  return root;
};

const CLI = "tools/agx-worker/src/next/cli.ts";

// A fixture agx project: fake Jev, a ticket, and a worker script that reports its temp variables.
async function fixture(workerBody: string, verify: string | string[]) {
  const root = scratch("run-temp-");
  await prepareTicketRepo(root);
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
    `+++\nschema = 2\nname = "temp-fixture"\nwrites = []\noutcome = "temp fixture"\nverify = ${JSON.stringify(Array.isArray(verify) ? verify : [verify])}\n[proposition]\nid = "TMP-1"\nclaim = "run owns temp"\nrefuted_by = "leftover"\n+++\nRun the fixture.\n`,
  );
  writeFileSync(worker, workerBody);
  const env = {
    ...process.env,
    AGX_STATE_DIR: join(root, "state"),
    JEV_URL: `http://127.0.0.1:${jevPort}/choice`,
    AGX_WORKER_BIN: worker,
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

describe("agx worker run owns its temp space", () => {
  test("bare service environment shares user tools, mise PATH and temp with verify; records failure kinds", async () => {
    const f = await fixture(
      `import { writeFileSync } from "node:fs";
       const tools = Bun.spawnSync(["sh", "-c", "cargo-only --help && bun-only --help && repo-only --help"]);
       if (tools.exitCode !== 0) process.exit(1);
       writeFileSync("worker-env.txt", [process.env.PATH, process.env.TMPDIR, process.env.AGX_MISE_FIXTURE].join("\\n"));
       ${DONE}`,
      [
        'cargo-only --help && bun-only --help && repo-only --help && printf "%s\\n%s\\n%s" "$PATH" "$TMPDIR" "$AGX_MISE_FIXTURE" > verify-env.txt',
        "agx-command-that-does-not-exist",
        "./not-executable",
        "kill -KILL $$",
        "exit 7",
      ],
    );
    const home = join(f.root, "home");
    for (const [dir, name] of [
      [".cargo/bin", "cargo-only"],
      [".bun/bin", "bun-only"],
      ["repo-bin", "repo-only"],
    ]) {
      const bin = join(home, dir ?? "");
      mkdirSync(bin, { recursive: true });
      const path = join(bin, name ?? "");
      writeFileSync(path, '#!/bin/sh\n[ "$1" = --help ]\n');
      chmodSync(path, 0o755);
    }
    mkdirSync(join(home, ".local/bin"), { recursive: true });
    const mise = join(home, ".local/bin/mise");
    writeFileSync(
      mise,
      `#!/bin/sh\nprintf '{"PATH":"%s:${join(home, "repo-bin")}","AGX_MISE_FIXTURE":"repo-value"}' "$PATH"\n`,
    );
    chmodSync(mise, 0o755);
    writeFileSync(join(f.root, "not-executable"), "not executable\n");
    const env = {
      HOME: home,
      PATH: "/usr/bin:/bin",
      AGX_STATE_DIR: f.env.AGX_STATE_DIR,
      JEV_URL: f.env.JEV_URL,
      AGX_WORKER_BIN: f.env.AGX_WORKER_BIN,
      AGX_TMP_ROOT: f.env.AGX_TMP_ROOT,
      TYPESAFE_API_KEY: f.env.TYPESAFE_API_KEY,
      DISPATCH_ROSTER_PATH: f.env.DISPATCH_ROSTER_PATH,
    };
    const child = Bun.spawn(
      [process.execPath, CLI, "run", f.ticket, "--cd", f.root],
      {
        env,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10_000,
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exit, stderr).toBe(0);
    expect(stdout).toContain('"outcome":"verify-killed"');
    expect(readFileSync(join(f.root, "worker-env.txt"), "utf8")).toBe(
      readFileSync(join(f.root, "verify-env.txt"), "utf8"),
    );
    const listed = Bun.spawnSync([process.execPath, CLI, "ls", "--json"], {
      env,
    });
    expect(listed.exitCode).toBe(0);
    const records = readFileSync(
      join(f.env.AGX_STATE_DIR, "records.jsonl"),
      "utf8",
    );
    for (const kind of ["passed", "unrunnable", "killed", "failed"])
      expect(records).toContain(`"kind":"${kind}"`);
    const rows = jsonOf(
      z.array(
        z.looseObject({
          outcome: z.string(),
          verify: z.array(
            z.looseObject({
              exit: z.number(),
              kind: z.string(),
              log_path: z.string(),
            }),
          ),
        }),
      ),
    ).safeParse(listed.stdout.toString());
    expect(rows.success).toBe(true);
    if (!rows.success) return;
    expect(rows.data[0]?.outcome).toBe("verify-killed");
    expect(
      rows.data[0]?.verify.map(({ exit: code, kind }) => ({
        exit: code,
        kind,
      })),
    ).toEqual([
      { exit: 0, kind: "passed" },
      { exit: 127, kind: "unrunnable" },
      { exit: 126, kind: "unrunnable" },
      { exit: 137, kind: "killed" },
      { exit: 7, kind: "failed" },
    ]);
    expect(
      rows.data[0]?.verify.every(({ log_path }) => existsSync(log_path)),
    ).toBe(true);
  }, 15_000);

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
  }, 45_000);

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

  test("a read-only worker subtree is removed after the ended record is written", async () => {
    const f = await fixture(
      `import { chmodSync, mkdirSync } from "node:fs";\nconst child = process.env.TMPDIR + "/readonly";\nmkdirSync(child);\nchmodSync(child, 0o555);\n${DONE}`,
      "true",
    );
    const result = Bun.spawnSync(
      [process.execPath, CLI, "run", f.ticket, "--cd", f.root],
      { cwd: process.cwd(), env: f.env, timeout: 10_000, stdout: "pipe" },
    );
    expect(result.exitCode).toBe(0);
    expect(readdirSync(f.tempRoot)).toEqual([]);
    const state = readFileSync(
      join(f.env.AGX_STATE_DIR, "records.jsonl"),
      "utf8",
    );
    const parsed = jsonOf(
      z.array(z.looseObject({ kind: z.string(), exit: z.number().optional() })),
    ).safeParse(`[${state.trim().split("\n").join(",")}]`);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.at(-1)?.kind).toBe("ended");
    expect(parsed.data.at(-1)?.exit).toBe(0);
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

  test("read-only stale subdirectories are made writable before removal", () => {
    const root = scratch("sweep-readonly-");
    const deadPid = 2 ** 22 + 12345;
    const child = join(root, "dead", "graveyard-fuyu");
    mkdirSync(child, { recursive: true });
    chmodSync(child, 0o555);
    writeFileSync(join(root, "dead.pid"), `${deadPid}\n`);
    expect(sweepStaleTemps(root, -1)).toEqual(["dead"]);
    expect(existsSync(join(root, "dead"))).toBe(false);
  });

  test("a failed stale entry warns once and does not block a new run", () => {
    const root = scratch("sweep-failure-");
    const deadPid = 2 ** 22 + 12345;
    const dead = join(root, "dead");
    writeFileSync(join(root, "dead.pid"), `${deadPid}\n`);
    mkdirSync(dead);
    const write = spyOn(process.stderr, "write").mockImplementation(() => true);
    const injectedError = Object.assign(new Error("fixture rm failure"), {
      code: "EACCES",
    });
    expect(sweepStaleTemps(root, -1, () => err(injectedError))).toEqual([]);
    const warningCalls = write.mock.calls;
    write.mockRestore();
    expect(warningCalls).toHaveLength(1);
    expect(String(warningCalls[0]?.[0])).toContain(dead);
    expect(String(warningCalls[0]?.[0])).toContain("EACCES");
    const created = createRunTemp("new-run", root)._unsafeUnwrap();
    expect(existsSync(created.dir)).toBe(true);
    expect(existsSync(dead)).toBe(false);
    created.remove();
  });
});
