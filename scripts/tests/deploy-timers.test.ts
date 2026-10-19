import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import {
  captureDeclaredTimers,
  deployDeclaredTimers,
  link,
  type Ctx,
} from "../link-dots.ts";

const root = join(import.meta.dir, "../..");
const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(
    scratch.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function fixture(os: Ctx["os"] = "linux") {
  const home = await mkdtemp(join(tmpdir(), "deploy-timers-"));
  scratch.push(home);
  const ctx: Ctx = { home, dotfiles: root, os, mode: "safe", drift: [] };
  const statePath = join(home, "state.json");
  const callsPath = join(home, "calls.jsonl");
  const binary = join(home, "systemctl");
  const timers = await captureDeclaredTimers(ctx);
  const state: Record<string, { enabled: boolean; active: boolean }> = {};
  for (const { unit } of timers)
    state[unit] = { enabled: false, active: false };
  await Bun.write(statePath, JSON.stringify(state));
  await Bun.write(
    binary,
    `#!${process.execPath}
import { appendFile } from "node:fs/promises";
const args = process.argv.slice(2);
await appendFile(${JSON.stringify(callsPath)}, JSON.stringify(args) + "\\n");
const [verb, unit] = args;
if (verb === process.env.FAIL_TIMER_VERB) { console.log("fixture failure"); process.exit(9); }
const path = ${JSON.stringify(statePath)};
const state = await Bun.file(path).json();
if (verb === "is-active") { console.log(state[unit].active ? "active" : "inactive"); process.exit(state[unit].active ? 0 : 3); }
if (verb === "enable") state[unit].enabled = true;
if (verb === "start") { if (!state[unit].enabled) process.exit(8); state[unit].active = true; }
await Bun.write(path, JSON.stringify(state));
`,
  );
  await chmod(binary, 0o755);
  const reports: string[] = [];
  const probe = async (args: string[]) => {
    const child = Bun.spawn([binary, ...args], {
      env: { ...process.env, FAIL_TIMER_VERB: failure },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    });
    const [out, err, code] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    return { code, out: out + err };
  };
  let failure = "";
  const deploy = (snapshot = timers, available = true) =>
    deployDeclaredTimers(ctx, snapshot, probe, available, (line) => {
      reports.push(line);
    });
  const linkTimers = () => {
    for (const timer of timers) link(ctx, timer.source, timer.path);
  };
  return {
    ctx,
    timers,
    state,
    statePath,
    reports,
    deploy,
    probe,
    linkTimers,
    fail: (verb: string) => {
      failure = verb;
    },
    calls: async () =>
      (await Bun.file(callsPath).text())
        .trim()
        .split("\n")
        .map((line) => {
          const parsed = jsonOf(z.array(z.string())).safeParse(line);
          expect(parsed.success).toBe(true);
          return parsed.success ? parsed.data : [];
        }),
  };
}

test.each(["linux", "wsl"] as const)(
  "first deploy starts each declared timer once on %s; later deploy preserves stops",
  async (os) => {
    const f = await fixture(os);
    f.linkTimers();
    expect(
      f.timers.some((timer) => timer.unit === "herdr-projector.timer"),
    ).toBe(true);
    expect(
      f.timers.some((timer) => timer.unit === "prompt-archive.timer"),
    ).toBe(true);
    expect(f.timers.every((timer) => !timer.installed)).toBe(true);
    expect(await f.deploy()).toBeUndefined();
    const first = await f.calls();
    expect(
      first.filter((args) => args[0] === "start").map((args) => args[1]),
    ).toEqual(f.timers.map((timer) => timer.unit));
    for (const timer of f.timers)
      expect(f.reports).toContain(
        `started: ${timer.unit} (first installation)`,
      );
    const current = jsonOf(
      z.record(
        z.string(),
        z.object({ enabled: z.boolean(), active: z.boolean() }),
      ),
    ).safeParse(await Bun.file(f.statePath).text());
    expect(current.success).toBe(true);
    expect(current.success ? current.data : undefined).toEqual(
      Object.fromEntries(
        f.timers.map((timer) => [timer.unit, { enabled: true, active: true }]),
      ),
    );

    const installed = await captureDeclaredTimers(f.ctx);
    f.reports.length = 0;
    // Active timers are not restarted on repeated deploy.
    expect(await f.deploy(installed)).toBeUndefined();
    expect(f.reports).toEqual([]);
    for (const state of Object.values(f.state)) {
      state.enabled = true;
      state.active = false;
    }
    await Bun.write(f.statePath, JSON.stringify(f.state));
    expect(await f.deploy(installed)).toBeUndefined();
    expect(
      (await f.calls()).filter((args) => args[0] === "start"),
    ).toHaveLength(f.timers.length);
    expect(f.reports).toEqual(
      f.timers.map(
        (timer) =>
          `left inactive: ${timer.unit} (already installed before deploy; user stop preserved)`,
      ),
    );
    expect(
      (await f.calls())
        .flat()
        .some((arg) => /ccc-daemon|restart|stop/u.test(arg)),
    ).toBe(false);
  },
);

test("an existing disabled timer and a changed or dangling link never become first installations", async () => {
  const f = await fixture();
  f.linkTimers();
  const firstTimer = f.timers[0];
  expect(firstTimer).toBeDefined();
  if (firstTimer === undefined) return;
  await rm(firstTimer.path);
  await symlink(join(f.ctx.home, "missing.timer"), firstTimer.path);
  const installed = await captureDeclaredTimers(f.ctx);
  expect(installed.every((timer) => timer.installed)).toBe(true);
  // Repair the link, retaining the pre-link snapshot.
  link(f.ctx, firstTimer.source, firstTimer.path);
  expect(await f.deploy(installed)).toBeUndefined();
  expect((await f.calls()).some((args) => args[0] === "start")).toBe(false);
  expect(f.reports).toHaveLength(f.timers.length);
});

test.each(["daemon-reload", "enable", "is-active", "start"])(
  "systemctl %s failure is reported and never claims a start",
  async (verb) => {
    const f = await fixture();
    f.linkTimers();
    f.fail(verb);
    const error = await f.deploy();
    expect(error?.message).toContain(verb);
    expect(error?.message).toContain("exit 9");
    expect(f.reports).toEqual([]);
  },
);

test("foreign units are refused and skip paths never contact systemd", async () => {
  const f = await fixture();
  expect((await f.deploy())?.message).toContain("not the declared link");
  expect((await f.calls()).some((args) => args[0] === "start")).toBe(false);
  const before = await f.calls();
  for (const ctx of [
    { ...f.ctx, mode: "check" as const },
    { ...f.ctx, os: "mac" as const },
  ]) {
    expect(await captureDeclaredTimers(ctx)).toEqual([]);
    expect(
      await deployDeclaredTimers(ctx, f.timers, f.probe, true),
    ).toBeUndefined();
  }
  expect(await f.deploy(f.timers, false)).toBeUndefined();
  expect(await f.calls()).toEqual(before);
});
