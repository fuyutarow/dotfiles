import { afterEach, expect, test } from "bun:test";
import {
  existsSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { fromThrowable, jsonOf, z } from "../../shared/src/zod.ts";
import {
  AGENT_ROUTER_WORKER_ENV,
  AGENT_ROUTER_WORKER_VALUE,
} from "../../shared/src/worker-env.ts";
import { Plan, ReceiptV1 } from "../src/model.ts";
import { readReceipts, stateDir, writeReceipt } from "../src/receipt.ts";
import { loadConfig } from "../src/engine.ts";
import { cliEnv } from "./fixtures/cli-env.ts";
import { tempRoot } from "./fixtures/temp.ts";
import { realTmpdir } from "./fixtures/temp.ts";

const script = resolve(import.meta.dir, "../src/reclaim.ts");
const dirs: string[] = [];
function fixture() {
  const dir = tempRoot("reclaim-cli-");
  dirs.push(dir);
  return dir;
}
function invoke(
  args: string[],
  state = fixture(),
  env: Record<string, string> = {},
) {
  const r = Bun.spawnSync([process.execPath, script, ...args], {
    cwd: realTmpdir,
    env: (() => {
      const isolated: Record<string, string> = {
        ...cliEnv(fixture()),
        RECLAIM_STATE_DIR: state,
      };
      delete isolated[AGENT_ROUTER_WORKER_ENV];
      return { ...isolated, ...env };
    })(),
    timeout: 10_000,
  });
  return {
    exit: r.exitCode,
    stdout: r.stdout.toString(),
    stderr: r.stderr.toString(),
  };
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
test("default plan and explicit plan emit one valid JSON document from any cwd", () => {
  for (const args of [["--json"], ["plan", "--all", "--json"]]) {
    const r = invoke(args);
    expect(r.exit).toBe(0);
    expect(jsonOf(Plan).safeParse(r.stdout).success).toBe(true);
    expect(r.stdout.trim().split("\n")).toHaveLength(1);
  }
});
test("--no-progress suppresses plan progress on stderr", () => {
  const r = invoke(["plan", "--all", "--json", "--no-progress"]);
  expect(r.exit).toBe(0);
  expect(r.stderr).not.toContain("[reclaim]");
});
test("registry exposes every production target with its contract tier", () => {
  const r = invoke(["targets", "--json"]);
  expect(r.exit).toBe(0);
  const parsed = jsonOf(
    z.array(z.object({ name: z.string(), tier: z.string() })),
  ).safeParse(r.stdout);
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  const rows = parsed.data;
  expect(rows.map(({ name, tier }) => [name, tier])).toEqual([
    ["clean", "blind"],
    ["builds", "blind"],
    ["rust", "blind"],
    ["toolchains", "blind"],
    ["workspaces", "blind"],
    ["scratch", "blind"],
    ["system", "sudo"],
    ["judgment", "owner"],
    ["purge", "irreversible"],
    ["host", "owner"],
    ["vhdx", "plan-only"],
    ["audit", "plan-only"],
  ]);
});
test("every registered target survives plan and run smoke checks in a fixture HOME", () => {
  const names = [
    "clean",
    "builds",
    "rust",
    "toolchains",
    "workspaces",
    "scratch",
    "system",
    "judgment",
    "purge",
    "host",
    "vhdx",
    "audit",
  ];
  for (const name of names) {
    const planned = invoke(["plan", name, "--json"]);
    expect(planned.exit, `${name} plan: ${planned.stderr}`).toBe(0);
    expect(jsonOf(Plan).safeParse(planned.stdout).success).toBe(true);
    const ran = invoke(["run", name, "--yes", "--json"]);
    expect(ran.stderr, `${name} run: ${ran.stderr}`).not.toContain(
      "finally is not a function",
    );
    if (name === "vhdx" || name === "audit") {
      expect(ran.exit, `${name} run: ${ran.stderr}`).toBe(2);
      expect(ran.stderr).toContain("plan-only");
    } else {
      expect(ran.exit, `${name} run: ${ran.stderr}`).not.toBe(2);
    }
  }
});
test("usage failures exit 2, help exits 0", () => {
  for (const args of [
    ["run"],
    ["run", "--tier", "blind"],
    ["plan", "missing"],
    ["--tier", "bad"],
    ["--unknown"],
    ["targets", "--yes"],
    ["plan", "--continue-on-error"],
    ["receipts", "--path", "/tmp"],
    ["--__proto__"],
    ["wrap", "x", "--"],
    ["headroom", "extra"],
    ["receipts", "--last", "-1"],
  ])
    expect(invoke(args).exit).toBe(2);
  expect(invoke(["--help"]).exit).toBe(0);
  expect(
    invoke(["run", "--tier", "blind", "--yes", "--stop-on-error", "--json"])
      .exit,
  ).toBe(0);
});
test("wrap preserves stdout, stderr, child status, output log, and v1 fields", () => {
  const state = fixture();
  const r = invoke(
    ["wrap", "probe", "--", "sh", "-c", "echo freed; echo detail >&2; exit 3"],
    state,
  );
  expect(r.exit).toBe(3);
  expect(r.stdout).toContain("freed");
  expect(r.stderr).toContain("detail");
  expect(r.stderr).toContain("disk-reclaim: probe exit 3 · free");
  const parsed = jsonOf(ReceiptV1).safeParse(
    readFileSync(join(state, "log.jsonl"), "utf8").trim(),
  );
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data.command).toEqual([
      "sh",
      "-c",
      "echo freed; echo detail >&2; exit 3",
    ]);
    expect(readFileSync(parsed.data.output!, "utf8")).toContain("freed");
    expect(readFileSync(parsed.data.output!, "utf8")).toContain("detail");
  }
  expect(existsSync(join(state, "lock"))).toBe(false);
  expect(readReceipts(1, state).errors).toEqual([]);
});
test("wrap refuses non-TTY interactive before running", () => {
  const state = fixture();
  expect(
    invoke(["wrap", "pick", "--interactive", "--", "true"], state).exit,
  ).toBe(2);
  expect(existsSync(join(state, "log.jsonl"))).toBe(false);
});
test("wrap takes over a dead holder", () => {
  const state = fixture();
  mkdirSync(join(state, "lock"));
  writeFileSync(
    join(state, "lock/owner.json"),
    JSON.stringify({
      pid: 4_194_999,
      host: hostname(),
      what: "dead",
      since: "old",
    }),
  );
  expect(invoke(["wrap", "t", "--", "true"], state).exit).toBe(0);
  expect(readReceipts(1, state).receipts).toHaveLength(1);
});
test("wrap busy lock returns 3 naming the holder without command execution", () => {
  const state = fixture();
  mkdirSync(join(state, "lock"));
  writeFileSync(
    join(state, "lock/owner.json"),
    JSON.stringify({
      pid: process.pid,
      host: hostname(),
      what: "other",
      since: "now",
    }),
  );
  const r = invoke(["wrap", "t", "--", "sh", "-c", "echo RAN"], state, {
    RECLAIM_LOCK_WAIT_S: "0.01",
  });
  expect(r.exit).toBe(3);
  expect(r.stderr).toContain("held by other");
  expect(r.stdout).not.toContain("RAN");
  expect(existsSync(join(state, "log.jsonl"))).toBe(false);
});
test("receipts accepts v1; refuses future schema; last zero is empty", () => {
  const state = fixture();
  invoke(["wrap", "t", "--", "true"], state);
  const first = readReceipts(1, state).receipts[0]!;
  const legacy = ReceiptV1.safeParse(first);
  expect(legacy.success).toBe(true);
  if (legacy.success) writeReceipt(legacy.data, state);
  expect(readReceipts(1, state).receipts[0]).not.toHaveProperty("schema");
  expect(invoke(["receipts", "--last", "1", "--json"], state).exit).toBe(0);
  expect(readReceipts(0, state).receipts).toEqual([]);
  writeFileSync(
    join(state, "log.jsonl"),
    JSON.stringify({ ...first, schema: 99 }),
  );
  expect(readReceipts(10, state).errors).toHaveLength(1);
});
test("state directory precedence and config declarations", () => {
  expect(
    stateDir({ RECLAIM_STATE_DIR: "/tmp/state", XDG_STATE_HOME: "/tmp/xdg" }),
  ).toBe("/tmp/state");
  expect(stateDir({ RECLAIM_STATE_DIR: "", XDG_STATE_HOME: "/tmp/xdg" })).toBe(
    "/tmp/xdg/reclaim",
  );
  const config = loadConfig().config;
  expect(config?.session_grace_hours).toBe(24);
  expect(config?.ignore_unreadable_procs).toEqual(["sshd"]);
  expect(config?.scratch_roots[0]).toMatch(/^\/tmp\/claude-\d+$/u);
});
test("minimal reclaim config defaults unreadable process exceptions to sshd", () => {
  const path = join(fixture(), "minimal.toml");
  writeFileSync(
    path,
    `repo_roots = []\nrepos = []\nscratch_roots = []\nregenerable_ignored = []\nsession_grace_hours = 24\n`,
  );
  expect(loadConfig(path).config?.ignore_unreadable_procs).toEqual(["sshd"]);
});
test("delete prints a plan without --yes and leaves its candidate intact", () => {
  const root = fixture();
  const candidate = join(root, "candidate");
  mkdirSync(candidate);
  writeFileSync(join(candidate, "data"), "approved later");
  const result = invoke(["delete", candidate, "--json"], join(root, "state"));
  expect(result.exit).toBe(0);
  expect(existsSync(candidate)).toBe(true);
  const parsed = jsonOf(z.object({ rows: z.array(z.unknown()) })).safeParse(
    result.stdout,
  );
  expect(parsed.success).toBe(true);
});
test("worker mutating commands refuse non-tmp HOME and state before touching anything", () => {
  const root = fixture();
  const candidate = join(root, "candidate");
  mkdirSync(candidate);
  writeFileSync(join(candidate, "data"), "fixture");
  const realHome = process.env.HOME ?? root;
  const testConfig = cliEnv(root);
  const workerEnv = {
    ...testConfig,
    [AGENT_ROUTER_WORKER_ENV]: AGENT_ROUTER_WORKER_VALUE,
    HOME: realHome,
    RECLAIM_STATE_DIR: join(
      realHome,
      ".local/state/disk-reclaim-worker-guard-test",
    ),
  };

  for (const args of [
    ["run", "purge", "--yes"],
    ["delete", candidate, "--yes"],
  ]) {
    const result = invoke(args, join(root, "state"), workerEnv);
    expect(result.exit).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("agent-dispatch worker guard");
    expect(result.stderr).toContain("owner's own shell");
    expect(result.stderr).toContain("set HOME to a tmp dir for tests");
  }
  expect(existsSync(candidate)).toBe(true);
  expect(existsSync(join(root, "state", "lock"))).toBe(false);
});
test("worker with tmp HOME reaches run and delete actions", () => {
  const root = fixture();
  const worker = {
    ...cliEnv(root),
    [AGENT_ROUTER_WORKER_ENV]: AGENT_ROUTER_WORKER_VALUE,
  };
  const run = invoke(["run", "rust", "--yes"], join(root, "state"), worker);
  expect(run.exit).toBe(0);

  const candidate = join(root, "candidate");
  mkdirSync(candidate);
  writeFileSync(join(candidate, "data"), "fixture");
  const deleted = invoke(
    ["delete", candidate, "--yes"],
    join(root, "state"),
    worker,
  );
  expect(deleted.exit).toBe(0);
  expect(deleted.stdout).toContain(candidate);
  expect(deleted.stderr).not.toContain("agent-dispatch worker guard");
  expect(deleted.stdout).not.toContain("process usage is unknown");
  expect(existsSync(candidate)).toBe(false);
});
test("unreadable same-uid process blocks approved delete", () => {
  const root = fixture();
  const env = cliEnv(root);
  const candidate = join(root, "candidate");
  const pidDir = join(root, "proc", "424242");
  mkdirSync(candidate);
  writeFileSync(join(candidate, "data"), "fixture");
  mkdirSync(pidDir);
  chmodSync(pidDir, 0);
  const deleted = invoke(
    ["delete", candidate, "--yes"],
    join(root, "state"),
    env,
  );
  chmodSync(pidDir, 0o700);
  expect(deleted.exit).toBe(2);
  expect(deleted.stdout).toContain(candidate);
  expect(deleted.stdout).toContain("process usage is unknown");
  expect(existsSync(candidate)).toBe(true);
});
test("worker read-only commands stay isolated under a tmp HOME", () => {
  const root = fixture();
  const workerEnv = {
    ...cliEnv(root),
    [AGENT_ROUTER_WORKER_ENV]: AGENT_ROUTER_WORKER_VALUE,
    HOME: root,
    RECLAIM_STATE_DIR: join(root, "readonly-state"),
  };
  for (const args of [
    ["plan", "--json"],
    ["targets", "--json"],
    ["receipts", "--json"],
  ]) {
    expect(invoke(args, join(root, "state"), workerEnv).exit).toBe(0);
  }
});
test("malformed config fails closed", () => {
  const path = join(fixture(), "bad.toml");
  writeFileSync(path, "session_grace_hours = 'bad'");
  expect(loadConfig(path).config).toBeNull();
  expect(fromThrowable(() => loadConfig(path))().isOk()).toBe(true);
});

test("wrap spawn failure still records a failed v1-compatible receipt", () => {
  const state = fixture();
  const result = invoke(
    ["wrap", "missing", "--", "/no/such/reclaim-command"],
    state,
  );
  expect(result.exit).toBe(1);
  expect(readReceipts(1, state).receipts[0]?.exit).toBe(1);
  expect(existsSync(join(state, "lock"))).toBe(false);
});
