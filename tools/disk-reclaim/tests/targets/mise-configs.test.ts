import { afterAll, expect, test } from "bun:test";
import {
  lstatSync,
  mkdirSync,
  existsSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { ReceiptAction } from "../../src/model.ts";
import type { Context } from "../../src/targets/index.ts";
import { createMiseConfigsTarget } from "../../src/targets/mise-configs.ts";

const roots: string[] = [];
const fixture = () => {
  const root = tempRoot("reclaim-mise-configs-");
  roots.push(root);
  return root;
};
afterAll(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const makeRecord = (
  state: string,
  kind: string,
  name: string,
  target: string,
) => {
  const dir = join(state, kind);
  mkdirSync(dir, { recursive: true });
  const record = join(dir, name);
  if (process.platform === "win32") writeFileSync(record, target);
  else symlinkSync(target, record, kind === "tracked-configs" ? "file" : "dir");
  return record;
};
const context = (log: (message: string) => void) =>
  ({
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
    log,
  }) satisfies Context;

const fakePrune = (state: string): void => {
  for (const directory of [
    "tracked-configs",
    "trusted-configs",
    "ignored-configs",
  ])
    for (const name of readdirSync(join(state, directory)))
      removeWhenDead(join(state, directory, name));
};

const removeWhenDead = (record: string): void => {
  const target =
    process.platform === "win32"
      ? readFileSync(record, "utf8").trim()
      : readlinkSync(record);
  if (!existsSync(target)) rmSync(record);
};

test("reports dead records, prunes once with --configs, and records receipt counts", async () => {
  const root = fixture();
  const state = join(root, "state/mise");
  const previousStateDir = process.env.MISE_STATE_DIR;
  process.env.MISE_STATE_DIR = state;
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    if (previousStateDir === undefined) delete process.env.MISE_STATE_DIR;
    else process.env.MISE_STATE_DIR = previousStateDir;
  });
  const liveConfig = join(root, "live/mise.toml");
  const liveRoot = join(root, "live/project");
  mkdirSync(join(root, "live"), { recursive: true });
  mkdirSync(liveRoot);
  writeFileSync(liveConfig, "[tools]\n");
  const deadConfig = makeRecord(
    state,
    "tracked-configs",
    "dead",
    join(root, "gone/mise.toml"),
  );
  const liveTracked = makeRecord(state, "tracked-configs", "live", liveConfig);
  const deadTrusted = makeRecord(
    state,
    "trusted-configs",
    "dead",
    join(root, "gone/project"),
  );
  const liveTrusted = makeRecord(state, "trusted-configs", "live", liveRoot);
  const deadIgnored = makeRecord(
    state,
    "ignored-configs",
    "dead",
    join(root, "gone/ignored"),
  );
  const liveIgnored = makeRecord(state, "ignored-configs", "live", liveRoot);
  const calls: string[][] = [];
  const target = createMiseConfigsTarget({
    misePath: () => "/fake/mise",
    run: (argv) => {
      calls.push(argv);
      fakePrune(state);
      return Promise.resolve({ code: 0, out: "", err: "" });
    },
  });
  const logs: string[] = [];
  const ctx = context((message) => {
    logs.push(message);
  });
  const candidate = (await target.plan(ctx))[0];
  expect(candidate?.reason).toContain("3 dead");
  expect(logs).toContain("mise-configs: found 3 dead config records");
  expect(candidate).toBeDefined();
  if (candidate === undefined) return;

  const result = await target.act(candidate, ctx);
  expect(calls).toEqual([["/fake/mise", "prune", "--configs"]]);
  expect(result).toMatchObject({
    ok: true,
    mise_configs_before: 3,
    mise_configs_after: 0,
  });
  expect(
    lstatSync(liveTracked).isSymbolicLink() || process.platform === "win32",
  ).toBe(true);
  expect(
    lstatSync(liveTrusted).isSymbolicLink() || process.platform === "win32",
  ).toBe(true);
  expect(
    lstatSync(liveIgnored).isSymbolicLink() || process.platform === "win32",
  ).toBe(true);
  expect(() => lstatSync(deadConfig)).toThrow();
  expect(() => lstatSync(deadTrusted)).toThrow();
  expect(() => lstatSync(deadIgnored)).toThrow();
  const receiptAction = ReceiptAction.safeParse({
    id: candidate.id,
    path: null,
    kind: "command",
    verdict_at_act: "RECLAIM",
    bytes_planned: null,
    bytes_freed: null,
    ok: true,
    error: null,
    mise_configs_before: result.mise_configs_before,
    mise_configs_after: result.mise_configs_after,
    recovery: null,
  });
  expect(receiptAction.success).toBe(true);
  if (receiptAction.success)
    expect(receiptAction.data).toMatchObject({
      mise_configs_before: 3,
      mise_configs_after: 0,
    });
});

test("does not act when only live records remain", async () => {
  const root = fixture();
  const state = join(root, "state/mise");
  const config = join(root, "live/mise.toml");
  mkdirSync(join(root, "live"), { recursive: true });
  writeFileSync(config, "[tools]\n");
  const record = makeRecord(state, "tracked-configs", "live", config);
  const calls: string[][] = [];
  const logs: string[] = [];
  const target = createMiseConfigsTarget({
    stateDir: () => state,
    misePath: () => "/fake/mise",
    run: (argv) => {
      calls.push(argv);
      return Promise.resolve({ code: 0, out: "", err: "" });
    },
  });
  expect(
    await target.plan(
      context((message) => {
        logs.push(message);
      }),
    ),
  ).toEqual([]);
  expect(logs).toContain("mise-configs: found 0 dead config records");
  expect(calls).toEqual([]);
  expect(
    lstatSync(record).isSymbolicLink() || process.platform === "win32",
  ).toBe(true);
});

test("missing mise is skipped without failing or invoking prune", () => {
  const state = join(fixture(), "state/mise");
  const calls: string[][] = [];
  const target = createMiseConfigsTarget({
    stateDir: () => state,
    misePath: () => null,
    run: (argv) => {
      calls.push(argv);
      return Promise.resolve({ code: 0, out: "", err: "" });
    },
  });
  expect(target.available()).toEqual({
    available: false,
    skip_reason: "mise binary is unavailable",
  });
  expect(calls).toEqual([]);
});

test("never exposes a prune command that can remove tool versions", async () => {
  const root = fixture();
  const state = join(root, "state/mise");
  makeRecord(state, "tracked-configs", "dead", join(root, "gone/mise.toml"));
  const target = createMiseConfigsTarget({
    stateDir: () => state,
    misePath: () => "mise",
    run: () => Promise.resolve({ code: 0, out: "", err: "" }),
  });
  expect((await target.plan(context(() => {})))[0]?.action.argv).toEqual([
    "mise",
    "prune",
    "--configs",
  ]);
});
