import { afterAll, expect, setDefaultTimeout, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../shared/src/zod.ts";

setDefaultTimeout(60_000);
const scratch = await mkdtemp(join(tmpdir(), "ws-gc-lock-scope-"));
const ws = join(import.meta.dir, "../src/ws.ts");
const realJj = Bun.which("jj");
const realRip = Bun.which("rip");
afterAll(() => rm(scratch, { recursive: true, force: true }));
let count = 0;

async function fixture(slugs: string[]) {
  const root = join(scratch, String(++count));
  const bin = join(root, "bin");
  const repo = join(root, "repo");
  const lock = `${repo}.ws.lock`;
  await mkdir(bin, { recursive: true });
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    HOME: join(root, "home"),
    XDG_CONFIG_HOME: join(root, "config"),
    XDG_STATE_HOME: join(root, "state"),
    AGX_STATE_DIR: join(root, "state/agx"),
    RIP_GRAVEYARD: join(root, "graveyard"),
    GRAVEYARD: join(root, "graveyard"),
    JJ_USER: "test",
    JJ_EMAIL: "test@example.com",
  };
  const run = async (cmd: string[], cwd = repo) => {
    const child = Bun.spawn(cmd, {
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
      signal: AbortSignal.timeout(45_000),
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { out, err, code };
  };
  const jj = (args: string[], cwd = repo) =>
    run([realJj ?? "jj", ...args], cwd);
  const command = (args: string[]) => run([process.execPath, ws, ...args]);
  const shim = async (name: string, body: string) => {
    const file = join(bin, name);
    await Bun.write(file, `#!/usr/bin/env bun\n${body}\n`);
    await chmod(file, 0o755);
  };
  await mkdir(env.HOME);
  expect((await jj(["git", "init", repo], root)).code).toBe(0);
  await Bun.write(join(repo, "a.txt"), "base\n");
  await Bun.write(join(repo, ".ws.toml"), 'trunk = "main"\n');
  expect((await jj(["commit", "-m", "base"])).code).toBe(0);
  expect((await jj(["bookmark", "create", "main", "-r", "@-"])).code).toBe(0);
  const dir = (slug: string) => join(`${repo}.ws`, `ws_${slug}`);
  await mkdir(`${repo}.ws`);
  for (const slug of slugs)
    expect(
      (
        await jj([
          "workspace",
          "add",
          "--name",
          `ws_${slug}`,
          "-r",
          "main",
          dir(slug),
        ])
      ).code,
    ).toBe(0);
  await shim("stat", 'process.stdout.write("ext4\\n");');
  await shim("agx", 'process.stdout.write("[]");');
  return { root, repo, lock, run, jj, command, shim, dir };
}

async function waitFor(file: string) {
  const deadline = performance.now() + 30_000;
  while (!(await Bun.file(file).exists()) && performance.now() < deadline)
    await Bun.sleep(20);
  expect(await Bun.file(file).exists(), `gate ${file}`).toBe(true);
}

const delegateJj = `const child = Bun.spawn([${JSON.stringify(realJj)}, ...args], {stdout:"inherit",stderr:"inherit"}); process.exitCode = await child.exited;`;

test("WS-GC-LOCK-SCOPE: dry runs neither acquire a held lock nor snapshot dirty files", async () => {
  const f = await fixture(["dirty"]);
  await Bun.write(join(f.dir("dirty"), "pending.txt"), "unsnapshotted\n");
  const op = [
    "--ignore-working-copy",
    "op",
    "log",
    "--no-graph",
    "-n",
    "1",
    "-T",
    "id",
  ];
  const before = await f.jj(op);
  const owner = JSON.stringify({
    pid: process.pid,
    host: hostname(),
    what: "agx ws add fixture-holder",
    since: Temporal.Now.instant().toString(),
  });
  await Bun.write(join(f.lock, "owner.json"), owner);
  await f.shim(
    "jj",
    `
const args = process.argv.slice(2);
if (!args.includes("--ignore-working-copy")) { process.stderr.write("unexpected write"); process.exit(9); }
${delegateJj}`,
  );
  const dry = await f.command(["gc", "--dry-run", "--include-unrecorded"]);
  expect(dry.code, dry.err).toBe(0);
  expect(await Bun.file(join(f.lock, "owner.json")).text()).toBe(owner);
  expect(
    await stat(`${f.lock}.waiters`).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
  expect((await f.jj(op)).out).toBe(before.out);
  expect(await Bun.file(join(f.dir("dirty"), "pending.txt")).text()).toBe(
    "unsnapshotted\n",
  );
});

test("WS-GC-LOCK-SCOPE: add acquires during many slow read-only classifications", async () => {
  const f = await fixture(["a", "b", "c", "d", "e", "f"]);
  const gate = join(f.root, "classifying");
  await f.shim(
    "jj",
    `
const args = process.argv.slice(2);
if (args.includes("status") && args.includes("--ignore-working-copy")) {
  const holder = Bun.file(${JSON.stringify(join(f.lock, "owner.json"))});
  if (await holder.exists() && (await holder.text()).includes('"what":"agx ws gc')) { process.stderr.write("classification holds store lock"); process.exit(9); }
  await Bun.write(${JSON.stringify(gate)}, "started");
  await Bun.sleep(700);
}
${delegateJj}`,
  );
  const gc = f.command(["gc", "--include-unrecorded"]);
  await waitFor(gate);
  const started = performance.now();
  const added = await f.command(["add", "admitted"]);
  expect(added.code, added.err).toBe(0);
  expect(performance.now() - started).toBeLessThan(7_000);
  expect(await Bun.file(join(f.dir("admitted"), "a.txt")).exists()).toBe(true);
  const collected = await gc;
  expect(collected.code, collected.err).toBe(0);
  expect(collected.out).not.toContain("classification holds store lock");
});

test("WS-GC-LOCK-SCOPE: waiting add gets the next turn after one removal; wait names holder and time", async () => {
  const f = await fixture(["a", "b"]);
  const gate = join(f.root, "removing");
  const events = join(f.root, "events.jsonl");
  await Bun.write(events, "");
  await f.shim(
    "jj",
    `
const args = process.argv.slice(2);
if (args.includes("add")) {
  const file = Bun.file(${JSON.stringify(events)});
  await Bun.write(file, await file.text() + JSON.stringify("add acquired") + "\\n");
}
${delegateJj}`,
  );
  await f.shim(
    "rip",
    `
import {readdir} from "node:fs/promises";
const file = Bun.file(${JSON.stringify(events)});
await Bun.write(file, await file.text() + JSON.stringify("removal") + "\\n");
const first = !(await Bun.file(${JSON.stringify(gate)}).exists());
await Bun.write(${JSON.stringify(gate)}, "started");
if (first) {
  const deadline = performance.now() + 15_000;
  while ((await readdir(${JSON.stringify(`${f.lock}.waiters`)}).catch(() => [])).length === 0 && performance.now() < deadline) await Bun.sleep(20);
  await Bun.sleep(6_200);
}
const child = Bun.spawn([${JSON.stringify(realRip)}, ...process.argv.slice(2)], {stdout:"inherit",stderr:"inherit"}); process.exitCode = await child.exited;`,
  );
  const gc = f.command(["gc", "--include-unrecorded"]);
  await waitFor(gate);
  const started = performance.now();
  const added = await f.command(["add", "admitted"]);
  const elapsed = performance.now() - started;
  expect(added.code, added.err).toBe(0);
  expect(elapsed).toBeLessThan(11_000);
  expect(added.err).toMatch(
    /waiting [5-9]\d*s for agx ws gc ws_a \(pid \d+, host .+, since .+\) on /u,
  );
  const collected = await gc;
  expect(collected.code, collected.err).toBe(0);
  const order = (await Bun.file(events).text()).trim().split("\n");
  expect(order.indexOf(JSON.stringify("add acquired"))).toBe(1);
  expect(
    await stat(`${f.lock}.waiters`).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
});

test("WS-GC-LOCK-SCOPE: changed working copy and run verdicts are re-checked while locked", async () => {
  for (const change of ["file", "run"]) {
    const f = await fixture(["changed"]);
    const gate = join(f.root, "rechecked");
    const initial = join(f.root, "initial-classification");
    const row = [
      {
        id: "new-run",
        state: "running",
        workspace: f.dir("changed"),
        cwd: f.dir("changed"),
        continues: null,
      },
    ];
    if (change === "run") {
      await f.shim(
        "agx",
        `
const locked = await Bun.file(${JSON.stringify(join(f.lock, "owner.json"))}).exists();
const previous = Bun.file(${JSON.stringify(initial)});
const recheck = await previous.exists() && locked;
await Bun.write(previous, "first inventory seen");
if (recheck) await Bun.write(${JSON.stringify(gate)}, "under lock");
process.stdout.write(JSON.stringify(recheck ? ${JSON.stringify(row)} : []));`,
      );
    } else {
      await f.shim(
        "jj",
        `
const args = process.argv.slice(2);
if (args.includes("status") && args.includes("--ignore-working-copy")) await Bun.write(${JSON.stringify(initial)}, "first classification seen");
if (args.includes("root") && args.includes("ws_changed") && await Bun.file(${JSON.stringify(initial)}).exists() && await Bun.file(${JSON.stringify(join(f.lock, "owner.json"))}).exists()) {
  await Bun.write(${JSON.stringify(join(f.dir("changed"), "pending.txt"))}, "keep this work\\n");
  await Bun.write(${JSON.stringify(gate)}, "under lock");
}
${delegateJj}`,
      );
    }
    const collected = await f.command(["gc", "--include-unrecorded"]);
    expect(collected.code, collected.err).toBe(0);
    expect(await Bun.file(gate).text()).toBe("under lock");
    expect(collected.out).toContain(
      change === "file" ? "unlanded" : "live or continuing run new-run",
    );
    expect(collected.out).not.toContain("\tcollected\t");
    expect(await Bun.file(join(f.dir("changed"), "a.txt")).exists()).toBe(true);
    expect(
      (await f.jj(["--ignore-working-copy", "workspace", "list"])).out,
    ).toContain("ws_changed");
  }
});

test("WS-GC-LOCK-SCOPE: gc skips a repository locked by add", async () => {
  const f = await fixture(["kept"]);
  await Bun.write(
    join(f.lock, "owner.json"),
    JSON.stringify({
      pid: process.pid,
      host: hostname(),
      what: "agx ws add owner",
      since: Temporal.Now.instant().toString(),
    }),
  );
  const collected = await f.command(["gc", "--include-unrecorded"]);
  expect(collected.code, collected.err).toBe(0);
  expect(collected.out).toContain("agx ws add owner");
  expect(collected.out).toContain("collection skipped");
  expect(await Bun.file(join(f.dir("kept"), "a.txt")).exists()).toBe(true);
  const owner = jsonOf(z.object({ what: z.string() })).safeParse(
    await Bun.file(join(f.lock, "owner.json")).text(),
  );
  expect(owner.success && owner.data.what).toBe("agx ws add owner");
});
