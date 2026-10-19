import { afterEach, expect, test } from "bun:test";
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import {
  captureDeclaredTriggers,
  deployDeclaredTriggers,
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
  const home = await mkdtemp(join(tmpdir(), "deploy-triggers-"));
  scratch.push(home);
  const ctx: Ctx = { home, dotfiles: root, os, mode: "safe", drift: [] };
  const statePath = join(home, "state.json");
  const callsPath = join(home, "calls.jsonl");
  const binary = join(home, "systemctl");
  const triggers = await captureDeclaredTriggers(ctx);
  const state: Record<string, { enabled: boolean; active: boolean }> = {};
  for (const { unit } of triggers)
    state[unit] = { enabled: false, active: false };
  await Bun.write(statePath, JSON.stringify(state));
  await Bun.write(
    binary,
    `#!${process.execPath}
import { appendFile } from "node:fs/promises";
const args = process.argv.slice(2);
await appendFile(${JSON.stringify(callsPath)}, JSON.stringify(args) + "\\n");
const [verb, unit] = args;
if (verb === process.env.FAIL_UNIT_VERB) { console.log("fixture failure"); process.exit(9); }
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
      env: { ...process.env, FAIL_UNIT_VERB: failure },
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
  const deploy = (snapshot = triggers, available = true) =>
    deployDeclaredTriggers(ctx, snapshot, probe, available, (line) => {
      reports.push(line);
    });
  const linkTriggers = () => {
    for (const trigger of triggers) link(ctx, trigger.source, trigger.path);
  };
  return {
    ctx,
    triggers,
    state,
    statePath,
    reports,
    deploy,
    probe,
    linkTriggers,
    record: async () => {
      const path = join(
        ctx.stateHome ?? join(home, ".local/state"),
        "dotfiles/deploy-started-triggers.json",
      );
      const parsed = jsonOf(z.array(z.string())).safeParse(
        await Bun.file(path).text(),
      );
      expect(parsed.success).toBe(true);
      return parsed.success ? parsed.data : [];
    },
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
  "first deploy starts each declared timer and path once on %s; later deploy preserves stops",
  async (os) => {
    const f = await fixture(os);
    f.linkTriggers();
    expect(
      f.triggers.some((trigger) => trigger.unit === "herdr-projector.timer"),
    ).toBe(true);
    expect(
      f.triggers.some((trigger) => trigger.unit === "prompt-archive.timer"),
    ).toBe(true);
    expect(
      f.triggers.some((trigger) => trigger.unit === "agx-doctor.path"),
    ).toBe(true);
    expect(
      f.triggers.every((trigger) => /\.(timer|path)$/u.test(trigger.unit)),
    ).toBe(true);
    expect(await f.deploy()).toBeUndefined();
    const first = await f.calls();
    expect(
      first.filter((args) => args[0] === "start").map((args) => args[1]),
    ).toEqual(f.triggers.map((trigger) => trigger.unit));
    for (const trigger of f.triggers)
      expect(f.reports).toContain(
        `started: ${trigger.unit} (first deploy start)`,
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
        f.triggers.map((trigger) => [
          trigger.unit,
          { enabled: true, active: true },
        ]),
      ),
    );

    const installed = await captureDeclaredTriggers(f.ctx);
    f.reports.length = 0;
    // Active triggers are not restarted on repeated deploy.
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
    ).toHaveLength(f.triggers.length);
    expect(f.reports).toEqual(
      f.triggers.map(
        (trigger) =>
          `left inactive: ${trigger.unit} (previously started; user stop preserved)`,
      ),
    );
    expect(
      (await f.calls())
        .flat()
        .some((arg) => /ccc-daemon|restart|stop/u.test(arg)),
    ).toBe(false);
  },
);

test.each([".timer", ".path"])(
  "a never-started %s linked by an earlier hook is started despite a repaired dangling link",
  async (suffix) => {
    const f = await fixture();
    f.linkTriggers();
    const firstUnit = f.triggers.find((trigger) =>
      trigger.unit.endsWith(suffix),
    );
    expect(firstUnit).toBeDefined();
    if (firstUnit === undefined) return;
    await rm(firstUnit.path);
    await symlink(join(f.ctx.home, `missing${suffix}`), firstUnit.path);
    const installed = await captureDeclaredTriggers(f.ctx);
    // Repair the link, retaining the pre-link snapshot.
    link(f.ctx, firstUnit.source, firstUnit.path);
    expect(await f.deploy(installed)).toBeUndefined();
    expect(
      (await f.calls())
        .filter((args) => args[0] === "start")
        .map((args) => args[1]),
    ).toEqual(f.triggers.map((trigger) => trigger.unit));
    expect(f.reports).toHaveLength(f.triggers.length);
  },
);

test("active units seed the record and their later stops are preserved", async () => {
  const f = await fixture();
  f.linkTriggers();
  for (const state of Object.values(f.state)) state.active = true;
  await Bun.write(f.statePath, JSON.stringify(f.state));
  expect(await f.deploy()).toBeUndefined();
  expect(await f.record()).toEqual(
    f.triggers.map((trigger) => trigger.unit).toSorted(),
  );
  for (const state of Object.values(f.state)) state.active = false;
  await Bun.write(f.statePath, JSON.stringify(f.state));
  expect(await f.deploy()).toBeUndefined();
  expect((await f.calls()).some((args) => args[0] === "start")).toBe(false);
  expect(f.reports).toHaveLength(f.triggers.length);
});

test.each(["herdr-projector.timer", "herdr-projector.path"])(
  "a linked but unrecorded %s starts while recorded user stops stay inactive",
  async (unit) => {
    const f = await fixture();
    f.linkTriggers();
    const previouslyStarted = f.triggers.filter(
      (trigger) => trigger.unit !== unit,
    );
    expect(await f.deploy(previouslyStarted)).toBeUndefined();
    for (const state of Object.values(f.state)) state.active = false;
    await Bun.write(f.statePath, JSON.stringify(f.state));
    const before = (await f.calls()).length;
    f.reports.length = 0;
    expect(
      await f.deploy(await captureDeclaredTriggers(f.ctx)),
    ).toBeUndefined();
    expect(
      (await f.calls()).slice(before).filter((args) => args[0] === "start"),
    ).toEqual([["start", unit]]);
    expect(f.reports).toContain(`started: ${unit} (first deploy start)`);
    for (const trigger of previouslyStarted)
      expect(f.reports).toContain(
        `left inactive: ${trigger.unit} (previously started; user stop preserved)`,
      );
  },
);

test("the record uses the selected XDG state home and survives link replacement", async () => {
  const f = await fixture();
  f.ctx.stateHome = join(f.ctx.home, "custom-state");
  f.linkTriggers();
  expect(await f.deploy()).toBeUndefined();
  expect(await f.record()).toEqual(
    f.triggers.map((trigger) => trigger.unit).toSorted(),
  );
  for (const trigger of f.triggers) await rm(trigger.path);
  const snapshot = await captureDeclaredTriggers(f.ctx);
  f.linkTriggers();
  await Bun.write(f.statePath, JSON.stringify(f.state));
  expect(await f.deploy(snapshot)).toBeUndefined();
  expect((await f.calls()).filter((args) => args[0] === "start")).toHaveLength(
    f.triggers.length,
  );
});

test("a failed start is not recorded and is retried on the next deploy", async () => {
  const f = await fixture();
  f.linkTriggers();
  f.fail("start");
  expect((await f.deploy())?.message).toContain("start");
  expect(await f.record()).toEqual([]);
  f.fail("");
  expect(await f.deploy()).toBeUndefined();
  expect(f.reports).toHaveLength(f.triggers.length);
});

test("an invalid record fails closed before contacting systemd", async () => {
  const f = await fixture();
  f.linkTriggers();
  await Bun.write(
    join(f.ctx.home, ".local/state/dotfiles/deploy-started-triggers.json"),
    "broken",
  );
  expect((await f.deploy())?.message).toContain("invalid deploy start record");
  expect(await Bun.file(join(f.ctx.home, "calls.jsonl")).exists()).toBe(false);
});

test.each(["daemon-reload", "enable", "is-active", "start"])(
  "systemctl %s failure is reported and never claims a start",
  async (verb) => {
    const f = await fixture();
    f.linkTriggers();
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
    expect(await captureDeclaredTriggers(ctx)).toEqual([]);
    expect(
      await deployDeclaredTriggers(ctx, f.triggers, f.probe, true),
    ).toBeUndefined();
  }
  expect(await f.deploy(f.triggers, false)).toBeUndefined();
  expect(await f.calls()).toEqual(before);
});
