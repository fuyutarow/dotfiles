import { access as accessPath } from "node:fs/promises";

import {
  afterAll,
  afterEach,
  describe,
  expect,
  test as bunTest,
} from "bun:test";
import {
  appendFile,
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { basename, delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import {
  packageBinProblems,
  removedCommandCallers,
  runLandConsumerGates,
  workspacePreflightVerdicts,
} from "../land.ts";
import { landStateDir } from "../land-queue.ts";
import { doctorReport } from "../land-doctor.ts";
import { applyToolChangesets } from "../land-changesets.ts";
import { tryAcquire } from "../../tools/shared/src/dir-lock.ts";

const pathExists = (path: Parameters<typeof accessPath>[0]) =>
  accessPath(path).then(
    () => true,
    () => false,
  );

const script = join(import.meta.dir, "../land.ts");
const REPO = join(import.meta.dir, "../..");
const temporary: string[] = [];
// Keep subprocess compilation cached across fixtures without depending on a writable HOME.
const transpilerCache = await mkdtemp(join(tmpdir(), "land-transpiler-cache-"));
afterAll(async () => {
  await rm(transpilerCache, { recursive: true, force: true });
});
// These JJ integration fixtures spawn multiple repositories and commands under suite load.
// Match the landing subprocess's finite 60s bound instead of killing it after 12s.
const LAND_FORMATTER_TEST_TIMEOUT_MS = 60_000;
// All cases construct real JJ repositories and spawn the landing command; keep their
// suite-load allowance consistent rather than letting a different case hit 5s each run.
function test(
  name: string,
  body: () => void | Promise<void>,
  timeout = LAND_FORMATTER_TEST_TIMEOUT_MS,
): void {
  bunTest(name, body, timeout);
}
const eventsSchema = jsonOf(z.array(z.string()));
async function drain(reader: {
  read(): Promise<{ done: boolean; value?: Uint8Array | undefined }>;
}): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) return text + decoder.decode();
    text += decoder.decode(chunk.value, { stream: true });
  }
}
async function writeToolPackage(root: string, version: string): Promise<void> {
  await mkdir(join(root, "tools", "release-fixture"), { recursive: true });
  await writeFile(
    join(root, "tools", "release-fixture", "package.json"),
    `${JSON.stringify({ name: "release-fixture", version }, null, 2)}\n`,
  );
}
async function writeToolChangelog(root: string, entry: string): Promise<void> {
  await writeFile(
    join(root, "tools", "release-fixture", "CHANGELOG.md"),
    `# Changelog\n\n## ${entry}\n\n- entry\n\n## 1.0.0 — 2026-10-01\n\n- initial\n`,
  );
}
async function writeAgxLsFixture(
  root: string,
  source: string,
): Promise<string> {
  const bin = join(root, "bin");
  await mkdir(bin, { recursive: true });
  const cli = join(bin, "agx-worker");
  await writeFile(cli, `#!${process.execPath}\n${source}\n`);
  await chmod(cli, 0o755);
  return bin;
}
function pathWithFixture(bin: string): string {
  return `${bin}${delimiter}${process.env.PATH ?? ""}`;
}
async function withProcessEnv<T>(
  values: Record<string, string>,
  run: () => Promise<T>,
): Promise<T> {
  const previous = new Map(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, values);
  return Promise.try(run).finally(() => {
    previous.forEach((value, key) => {
      restoreProcessEnv(key, value);
    });
  });
}
function restoreProcessEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
    return;
  }
  process.env[key] = value;
}
async function appendAcceptance(
  state: string,
  runId: string,
  accept = true,
): Promise<void> {
  await appendFile(
    join(state, "runs.jsonl"),
    `${JSON.stringify({ kind: "acceptance", run_id: runId, accept })}\n`,
  );
}
// Integration fixtures feed the released selector's current records contract.
async function appendListingRun(
  state: string,
  workspace: string,
  id: string,
  ticket: string,
  at: string,
  decision?: "accept" | "reject",
): Promise<void> {
  await mkdir(state, { recursive: true });
  const records = [
    {
      kind: "started",
      id,
      at,
      ticket,
      writes: ["keep.txt"],
      cwd: workspace,
      workspace,
      row: "fixture",
      dispatcher_session: null,
      vendor_session: null,
      continues: null,
      pid: 0,
    },
    { kind: "ended", id, at, exit: 0, report_path: null, vendor_session: null },
    ...(decision === undefined
      ? []
      : [{ kind: "judged", id, at, decision, note: "fixture judgment" }]),
  ];
  await appendFile(
    join(state, "records.jsonl"),
    records.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
}
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});

test("package bin targets must be executable and start with a shebang", async () => {
  const root = await mkdtemp(join(tmpdir(), "land-bin-test-"));
  temporary.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ bin: { sample: "src/main.ts" } }),
  );
  const target = join(root, "src/main.ts");
  await writeFile(target, "#!/usr/bin/env bun\nprocess.exit(0);\n");
  await chmod(target, 0o755);
  expect(await packageBinProblems(root)).toEqual([]);
  await chmod(target, 0o644);
  expect(await packageBinProblems(root)).toContain(
    "src/main.ts: target is not executable",
  );
  await writeFile(target, "process.exit(0);\n");
  await chmod(target, 0o755);
  expect(await packageBinProblems(root)).toContain(
    "src/main.ts: target has no shebang",
  );
});

test("every repository package bin target is executable and has a shebang", async () => {
  expect(await packageBinProblems(REPO)).toEqual([]);
});

test("workspace listing reports its command and timeout duration", async () => {
  const root = await mkdtemp(join(tmpdir(), "land-agx-ls-timeout-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  const state = join(root, "agx-state");
  await mkdir(workspace);
  const bin = await writeAgxLsFixture(
    root,
    "await Bun.sleep(2_000); process.stdout.write('[]\\n');",
  );

  await withProcessEnv(
    {
      AGX_STATE_DIR: state,
      LAND_AGX_LS_TIMEOUT_MS: "50",
      PATH: pathWithFixture(bin),
    },
    async () => {
      const result = await workspacePreflightVerdicts(workspace, root);
      expect(result.isErr()).toBe(true);
      if (result.isErr())
        expect(result.error.message).toBe(
          "agx worker ls --json timed out after 50 ms",
        );
    },
  );
});

test("workspace listing reports nonzero exit code and stderr", async () => {
  const root = await mkdtemp(join(tmpdir(), "land-agx-ls-failure-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  const state = join(root, "agx-state");
  await mkdir(workspace);
  const bin = await writeAgxLsFixture(
    root,
    "process.stderr.write('fixture failure'); process.exit(7);",
  );

  await withProcessEnv(
    { AGX_STATE_DIR: state, PATH: pathWithFixture(bin) },
    async () => {
      const result = await workspacePreflightVerdicts(workspace, root);
      expect(result.isErr()).toBe(true);
      if (result.isErr())
        expect(result.error.message).toBe(
          "agx worker ls --json failed with exit code 7: fixture failure",
        );
    },
  );
});

test("workspace listing names the install remedy when agx-worker is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "land-agx-ls-missing-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  const state = join(root, "agx-state");
  const bin = join(root, "empty-bin");
  await mkdir(workspace);
  await mkdir(bin);

  await withProcessEnv({ AGX_STATE_DIR: state, PATH: bin }, async () => {
    const result = await workspacePreflightVerdicts(workspace, root);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("agx-worker");
      expect(result.error.message).toContain("mise install");
      expect(result.error.message).toContain("mise run deps");
    }
  });
});

test("workspace preflight invokes the available listing query and filters its rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "land-agx-ls-success-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  const state = join(root, "agx-state");
  const argsPath = join(root, "agx-args.json");
  await mkdir(workspace);
  const bin = await writeAgxLsFixture(
    root,
    `await Bun.write(process.env.LAND_AGX_LS_ARGS, JSON.stringify(process.argv.slice(2))); process.stdout.write(JSON.stringify([{id:'fixture-run',ticket:'fixture-ticket',workspace:${JSON.stringify(workspace)},started_at:'2026-10-24T00:00:00Z',judgment:{decision:'accept'}}]));`,
  );

  await withProcessEnv(
    {
      AGX_STATE_DIR: state,
      LAND_AGX_LS_ARGS: argsPath,
      PATH: pathWithFixture(bin),
    },
    async () => {
      const result = await workspacePreflightVerdicts(workspace, root);
      expect(result.isOk()).toBe(true);
      if (result.isOk())
        expect(result.value).toEqual([
          { ticket: "fixture-ticket", run_id: "fixture-run", accept: true },
        ]);
      const args = jsonOf(z.array(z.string())).safeParse(
        await readFile(argsPath, "utf8"),
      );
      expect(args.success).toBe(true);
      if (args.success)
        expect(args.data).toEqual([
          "ls",
          "--json",
          "--workspace",
          await realpath(workspace),
          "--all",
        ]);
    },
  );
});

test("workspace preflight selects the newest run and its judgment from recorded newest-first rows", async () => {
  const root = await mkdtemp(join(tmpdir(), "land-newest-run-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const listing = await readFile(
    join(import.meta.dir, "fixtures/land-workspace-runs-newest-first.json"),
    "utf8",
  );
  const alias = join(root, "workspace-alias");
  await symlink(workspace, alias);
  const argsPath = join(root, "args.json");
  const bin = await writeAgxLsFixture(
    root,
    `const args = process.argv.slice(2);
await Bun.write(process.env.LAND_AGX_LS_ARGS, JSON.stringify(args));
const rows = JSON.parse(${JSON.stringify(listing)}.replaceAll('__WORKSPACE__', process.env.LAND_TEST_WORKSPACE));
rows[0].judgment = JSON.parse(process.env.LAND_TEST_NEW_JUDGMENT);
rows[1].judgment = JSON.parse(process.env.LAND_TEST_OLD_JUDGMENT);
if (process.env.LAND_TEST_REVERSE === '1') rows.reverse();
// Thirty newer runs from other workspaces hide the target in an unscoped default listing.
const decoys = Array.from({length: 30}, (_, i) => ({...rows[0], id: 'decoy-' + i, started_at: '2026-10-24T03:00:00Z', workspace: process.env.LAND_TEST_WORKSPACE + '-other'}));
let selected = [...decoys, ...rows];
if (args.includes('--workspace')) selected = selected.filter(row => row.workspace === args[args.indexOf('--workspace') + 1]);
if (!args.includes('--all')) selected = selected.slice(0, 30);
process.stdout.write(JSON.stringify(selected));`,
  );
  for (const reverse of ["0", "1"]) {
    for (const [newer, older] of [
      [{ decision: "accept" }, { decision: "reject" }],
      [{ decision: "accept" }, null],
      [{ decision: "reject" }, { decision: "accept" }],
      [null, { decision: "accept" }],
    ]) {
      await withProcessEnv(
        {
          PATH: pathWithFixture(bin),
          LAND_TEST_WORKSPACE: workspace,
          LAND_AGX_LS_ARGS: argsPath,
          LAND_TEST_NEW_JUDGMENT: JSON.stringify(newer),
          LAND_TEST_OLD_JUDGMENT: JSON.stringify(older),
          LAND_TEST_REVERSE: reverse,
        },
        async () => {
          const result = await workspacePreflightVerdicts(alias, root);
          expect(result.isOk()).toBe(true);
          if (result.isOk())
            expect(result.value).toEqual([
              {
                ticket: "repeat-ticket",
                run_id: "newer-run",
                accept: newer?.decision === "accept",
              },
            ]);
          const args = jsonOf(z.array(z.string())).safeParse(
            await readFile(argsPath, "utf8"),
          );
          expect(args.success).toBe(true);
          if (args.success)
            expect(args.data).toEqual([
              "ls",
              "--json",
              "--workspace",
              await realpath(workspace),
              "--all",
            ]);
        },
      );
    }
  }
});

test("removed command preflight lists fixture callers and honors callers-cleared", async () => {
  const root = await mkdtemp(join(tmpdir(), "land-removal-guard-"));
  temporary.push(root);
  const home = join(root, "home");
  const workspace = join(home, "Workspace");
  const repo = join(workspace, "caller-fixture");
  await mkdir(join(repo, ".git"), { recursive: true });
  await mkdir(join(repo, "src"), { recursive: true });
  await writeFile(
    join(repo, "src", "use-command.sh"),
    "#!/bin/sh\nfixture-cli --help\nagx jev\n",
  );

  const result = await removedCommandCallers(
    ["fixture-cli", "jev"],
    "Remove old commands",
    home,
    workspace,
  );
  expect(result.isOk()).toBe(true);
  if (result.isErr()) return;
  expect(result.value).toEqual([
    `${repo}/src/use-command.sh:2 (fixture-cli)`,
    `${repo}/src/use-command.sh:3 (jev)`,
  ]);

  const cleared = await removedCommandCallers(
    ["fixture-cli", "jev"],
    "Remove old commands\n\ncallers-cleared: fixture-cli\ncallers-cleared: jev",
    home,
    workspace,
  );
  expect(cleared.isOk()).toBe(true);
  if (cleared.isOk()) expect(cleared.value).toEqual([]);
});

test("restored candidate reloads its inline registry schema after the same path was imported", async () => {
  const root = await mkdtemp(join(tmpdir(), "land-schema-cache-"));
  temporary.push(root);
  await mkdir(join(root, "scripts"));
  await mkdir(join(root, "presets"));
  await symlink(join(REPO, "agents"), join(root, "agents"));
  const gate = join(root, "scripts/consumer-gate.ts");
  await writeFile(
    gate,
    `export async function runConsumerGates() {
    return {ok:false,checked:0,lines:['FAIL stale schema: unrecognized_keys preset_dirs notify']};
  }`,
  );
  await import(pathToFileURL(gate).href);
  await writeFile(
    gate,
    await Bun.file(join(REPO, "scripts/consumer-gate.ts")).text(),
  );
  await writeFile(
    join(root, "presets/consumers.toml"),
    `[[consumers]]
name = "schema-fixture"
root = "/unused"
setup = ["true"]
surfaces = ["presets/typescript"]
preset_dirs = { typescript = "tools" }
notify = [{ paths = ["tools/agent-resource-run/**"], contact = "example-research-agt_f24v", check = "RUSTC_WRAPPER= mise run hook:pre-commit" }]
command = ["true"]
timeout_ms = 1000
`,
  );
  const result = await runLandConsumerGates(root, [
    "tools/agent-resource-run/src/main.ts",
  ]);
  expect(result.isOk()).toBe(true);
  if (result.isErr()) return;
  expect(result.value.ok, result.value.lines.join("\n")).toBe(true);
  expect(result.value.lines.join("\n")).toContain(
    "NOTICE schema-fixture: contact example-research-agt_f24v",
  );
  expect(result.value.lines.join("\n")).not.toContain("stale schema");
  // A second restore at the same path must also invalidate the first candidate.
  await writeFile(
    gate,
    `export async function runConsumerGates() {
    return {ok:false,checked:0,lines:['FAIL second candidate']};
  }`,
  );
  const second = await runLandConsumerGates(root, ["presets/consumers.toml"]);
  expect(second.isOk()).toBe(true);
  if (second.isErr()) return;
  expect(second.value.lines).toEqual(["FAIL second candidate"]);
});

async function fixture() {
  const temp = await mkdtemp(join(tmpdir(), "land-test-"));
  temporary.push(temp);
  const main = join(temp, "main");
  const worker = join(temp, "dotfiles-arm-worker");
  const events = join(temp, "events");
  const env = {
    // Each fixture owns its dispatch configuration, including state isolation.
    ...Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("AGX_")),
    ),
    HOME: temp,
    JJ_CONFIG: join(temp, "config.toml"),
    JJ_USER: "Landing Test",
    JJ_EMAIL: "land@example.test",
    JJ_EDITOR: "true",
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: transpilerCache,
    LAND_EVENTS: events,
    AGX_STATE_DIR: join(temp, "agx-state"),
    XDG_STATE_HOME: join(temp, "state"),
    XDG_DATA_HOME: join(temp, "data"),
    GRAVEYARD: join(temp, "data", "graveyard"),
    RIP_GRAVEYARD: join(temp, "data", "graveyard"),
    LAND_EXPECT_WORKSPACE: worker,
  };
  await writeFile(
    env.JJ_CONFIG,
    '[user]\nname = "Landing Test"\nemail = "land@example.test"\n',
  );
  async function jj(cwd: string, argv: string[]) {
    // Revision assertions must not update a session's untouched (possibly stale) checkout.
    const readOnly = argv[0] === "log" || argv[0] === "file";
    const result = await runProcess(
      [
        "jj",
        "--no-pager",
        "--color",
        "never",
        ...(readOnly ? ["--ignore-working-copy"] : []),
        ...argv,
      ],
      { cwd, env, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
    );
    expect(`${result.exitCode}: ${result.stderr.toString()}`).toStartWith("0:");
    return result.stdout.toString().trim();
  }
  async function git(cwd: string, argv: string[]) {
    const result = await runProcess(["git", ...argv], {
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    expect(`${result.exitCode}: ${result.stderr.toString()}`).toStartWith("0:");
    return result.stdout.toString().trim();
  }
  await jj(temp, ["git", "init", "--colocate", main]);
  await mkdir(join(main, "presets"), { recursive: true });
  await writeFile(join(main, "presets/consumers.toml"), "consumers = []\n");
  await writeFile(join(main, "old name.txt"), "rename content\n");
  await writeFile(join(main, "delete.txt"), "delete content\n");
  await writeFile(join(main, "keep.txt"), "keep content\n");
  await writeFile(join(main, "untouched.ts"), "const untouched = true;\n");
  await writeFile(join(main, "remove.md"), "# Remove\n");
  await mkdir(join(main, "tools/fixture-worker/src/next"), { recursive: true });
  await writeFile(
    join(main, "tools/fixture-worker/package.json"),
    JSON.stringify({ bin: { "agx-worker": "src/next/cli.ts" } }),
  );
  await writeFile(
    join(main, "tools/fixture-worker/src/next/cli.ts"),
    '#!/usr/bin/env bun\nprocess.stdout.write("[]\\n");\n',
  );
  await chmod(join(main, "tools/fixture-worker/src/next/cli.ts"), 0o755);
  await jj(main, ["commit", "-m", "base"]);
  await jj(main, ["bookmark", "set", "alpha", "-r", "@-"]);
  const origin = join(temp, "origin.git");
  await git(temp, ["init", "--bare", origin]);
  await jj(main, ["git", "remote", "add", "origin", origin]);
  await jj(main, ["git", "push", "--bookmark", "alpha", "--remote", "origin"]);
  await jj(main, ["git", "fetch", "--remote", "origin"]);
  await writeFile(
    join(origin, "hooks", "pre-receive"),
    '#!/bin/sh\n[ "${LAND_FAIL_PUSH:-0}" = 1 ] && exit 1\nexit 0\n',
  );
  await chmod(join(origin, "hooks", "pre-receive"), 0o755);
  await jj(main, [
    "workspace",
    "add",
    "--name",
    "dotfiles-arm-worker",
    "-r",
    "alpha",
    worker,
  ]);
  const mise = join(temp, "mise-stub");
  const ssh = join(temp, "ssh-stub");
  const agx = join(temp, "agx-stub");
  await writeFile(
    mise,
    `#!${process.execPath}\nimport { appendFileSync, writeSync } from 'node:fs';
appendFileSync(process.env.LAND_EVENTS, JSON.stringify(process.argv.slice(2)) + '\\n');
const argv = process.argv.slice(2);
if (argv[1] === 'commit' && process.env.LAND_CHECK_IGNORE === '1') {
 const fs = await import('node:fs');
 const path = await import('node:path');
 appendFileSync(process.env.LAND_EVENTS, JSON.stringify(['commit-cwd', process.cwd()]) + '\\n');
 if (fs.existsSync(path.join(process.cwd(), 'git/ignore')) && fs.readFileSync(path.join(process.cwd(), 'git/ignore'), 'utf8').includes('INVALID-LINT')) { process.stderr.write('lint:ignore refused\\n'); process.exit(9); }
}
if (argv[1] === 'deps' || argv[1] === 'hook:post-merge') process.exit(0);
if (argv[1] === 'doctor') { process.stdout.write('PASS fixture healthy\\nRESULT: PASS · FAIL 0 · WARN 0 · PASS 1 · SKIP 0\\n'); process.exit(0); }
if (argv[0] === 'show') { process.stdout.write(JSON.stringify({ judgment: process.env.LAND_NO_ACCEPT === '1' ? null : { kind: 'acceptance', accept: true } })); process.exit(0); }
if (process.env.LAND_FAIL_COMMIT === '1' || argv[argv.indexOf('-m') + 1] === 'Fail queued') { if (process.env.LAND_NOISY_COMMIT === '1') writeSync(1, 'FAIL settings.json:4 → missing target retired.ts\\n' + 'fixture output\\n'.repeat(12000)); process.stderr.write('hook:pre-commit refused: fixture refusal\\n'); process.exit(9); }
const paths = argv.slice(argv.lastIndexOf('--') + 1).map(p => 'root:' + JSON.stringify(p));
for (const args of [['commit', '-m', argv[argv.indexOf('-m') + 1], '--', ...paths], ['bookmark', 'set', 'alpha', '-r', '@-']]) {
 const r = Bun.spawnSync(['jj', ...args], { stdout: 'pipe', stderr: 'pipe', timeout: 30000 });
 if (r.exitCode !== 0) { process.stderr.write(r.stderr); process.exit(r.exitCode); }
}
if (process.env.LAND_ADVANCE_ORIGIN === '1') {
 const competitor = process.env.LAND_COMPETITOR;
 const path = process.env.LAND_ADVANCE_PATH ?? 'origin-advanced.txt';
 const fs = await import('node:fs'); const pathModule = await import('node:path');
 fs.mkdirSync(pathModule.dirname(pathModule.join(competitor, path)), { recursive: true });
 fs.writeFileSync(pathModule.join(competitor, path), process.env.LAND_ADVANCE_CONTENT ?? 'origin advanced\\n');
 for (const args of [['bookmark', 'track', 'alpha@origin'], ['status'], ['commit', '-m', 'Advance origin'], ['bookmark', 'set', 'alpha', '-r', '@-', '--allow-backwards'], ['git', 'push', '--bookmark', 'alpha', '--remote', 'origin']]) {
  const r = Bun.spawnSync(['jj', ...args], { cwd: competitor, stdout: 'pipe', stderr: 'pipe', timeout: 30000 });
  if (r.exitCode !== 0) { process.stderr.write(r.stderr); process.exit(r.exitCode); }
 }
}\n`,
  );
  await writeFile(
    ssh,
    `#!${process.execPath}\nimport { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
appendFileSync(process.env.LAND_EVENTS, JSON.stringify(['ssh', ...args]) + '\\n');
const runLog = join(process.env.AGX_STATE_DIR, 'legacy-v1', 'runs.jsonl');
const accepted = existsSync(runLog) && readFileSync(runLog, 'utf8').includes('"accept":true');
if (process.env.LAND_ASSERT_DEPLOY_PRECONDITION === '1') appendFileSync(process.env.LAND_EVENTS, JSON.stringify(['deploy-state', String(existsSync(process.env.LAND_EXPECT_WORKSPACE)), String(accepted)]) + '\\n');
const host = args[2] ?? 'unknown';
if (process.env.LAND_BLOCKED_SSH === host) { process.stderr.write('FATAL: uncommitted render inputs\\nDOTFILES_RENDER_REFUSAL_V1={"reason":"foreign-wip","paths":["agents/hooks/storage-headroom.toml"]}\\n'); process.exit(2); }
const command = args.at(-1) ?? '';
const begin = command.match(/__LAND_SMOKE_BEGIN_[0-9]+__/u)?.[0];
const end = command.match(/__LAND_SMOKE_END_[0-9]+__/u)?.[0];
if (begin !== undefined && end !== undefined && command.includes('mise run doctor')) {
  const fails = process.env.LAND_DOCTOR_FAIL === host ? 5 : 0;
  const lines = Array.from({length: fails}, (_, i) => 'FAIL fixture-' + i + ' drift').join('\\n');
  process.stdout.write('\\n' + begin + '_DOCTOR\\nPASS fixture healthy\\n' + lines + '\\nRESULT: ' + (fails ? 'FAIL' : 'PASS') + ' · FAIL ' + fails + ' · WARN 0 · PASS 1 · SKIP 0\\n__LAND_DOCTOR_EXIT_' + (fails ? 1 : 0) + '__\\n' + end + '_DOCTOR\\n');
}
if (begin !== undefined && end !== undefined) process.stdout.write('\\n' + begin + '\\n  smoke output for ' + host + '  \\n' + end + '\\n');
if (process.env.LAND_UNRESOLVABLE_SSH === host) { process.stderr.write('ssh: Could not resolve hostname ' + host + ': Name or service not known\\n'); process.exit(255); }
if (process.env.LAND_UNREACHABLE_SSH === host) { process.stderr.write('ssh: connect to host ' + host + ' failed\\n'); process.exit(255); }
process.exit(process.env.LAND_FAIL_SSH === host ? 7 : 0);\n`,
  );
  await writeFile(
    agx,
    `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';
import { join } from 'node:path';
const args = process.argv.slice(2);
appendFileSync(process.env.LAND_EVENTS, JSON.stringify(['agx', ...args]) + '\\n');
if (args[0] === 'show') {
  const judgments = JSON.parse(process.env.LAND_JUDGMENTS ?? '{}');
  const judgment = process.env.LAND_NO_ACCEPT === '1' ? null : judgments[args[1]] ?? { kind: 'acceptance', accept: true, at: '2026-10-13T00:00:00.000Z' };
  process.stdout.write(JSON.stringify({ judgment })); process.exit(0);
}
if (args[0] === 'ledger' && args[1] === 'note' && args[3] === '--accept') {
  const review = args.indexOf('--review');
  const noReview = args.indexOf('--no-review');
  const record = { kind: 'acceptance', run_id: args[2], accept: true,
    ...(review < 0 ? {} : { review: args[review + 1] }),
    ...(noReview < 0 ? {} : { no_review: args[noReview + 1] }) };
  appendFileSync(join(process.env.AGX_STATE_DIR, 'legacy-v1', 'runs.jsonl'), JSON.stringify(record) + '\\n');
}\n`,
  );
  await chmod(mise, 0o755);
  await chmod(ssh, 0o755);
  await chmod(agx, 0o755);
  for (const formatter of ["bunx", "rumdl", "shfmt"]) {
    const path = join(temp, formatter);
    await writeFile(
      path,
      `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';
appendFileSync(process.env.LAND_EVENTS, JSON.stringify(['format', '${formatter}', ...process.argv.slice(2)]) + '\\n');\n`,
    );
    await chmod(path, 0o755);
  }
  async function command(
    args: string[],
    extraEnv: Record<string, string> = {},
    cwd = main,
  ) {
    return runProcess([process.execPath, script, ...args], {
      cwd,
      env: {
        ...env,
        PATH: `${temp}:${process.env.PATH ?? ""}`,
        LAND_MISE: mise,
        LAND_AGX: agx,
        LAND_SSH: ssh,
        ...extraEnv,
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    });
  }
  async function land(
    args: string[] = [],
    extraEnv: Record<string, string> = {},
    cwd = main,
    workspace = "dotfiles-arm-worker",
  ) {
    return command([workspace, "-m", "Land test", ...args], extraEnv, cwd);
  }
  async function log(): Promise<string[][]> {
    if (!(await pathExists(events))) return [];
    return (await readFile(events, "utf8"))
      .trim()
      .split("\n")
      .map((line) => {
        const result = eventsSchema.safeParse(line);
        expect(result.success).toBe(true);
        return result.success ? result.data : [];
      });
  }
  function start(args: string[]) {
    return Bun.spawn([process.execPath, script, ...args], {
      cwd: main,
      env: {
        ...env,
        PATH: `${temp}:${process.env.PATH ?? ""}`,
        LAND_MISE: mise,
        LAND_AGX: agx,
        LAND_SSH: ssh,
      },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal: AbortSignal.timeout(LAND_FORMATTER_TEST_TIMEOUT_MS),
    });
  }
  return { main, worker, origin, jj, git, land, command, start, log, env };
}

async function digest(root: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256");
  async function visit(path: string): Promise<void> {
    for (const entry of (await readdir(path)).toSorted()) {
      const child = join(path, entry);
      hash.update(child.slice(root.length));
      if ((await stat(child)).isDirectory()) await visit(child);
      else hash.update(await readFile(child));
    }
  }
  await visit(root);
  return hash.digest("hex");
}

describe("land workspace", () => {
  test("queue state belongs to dotfiles and never creates agx state", async () => {
    const f = await fixture();
    expect(
      (await f.command(["--enqueue", f.worker, "-m", "State boundary"]))
        .exitCode,
    ).toBe(0);
    const result = await f.command(["--queue-status"]);
    expect(result.exitCode).toBe(0);
    const state = join(
      f.env.XDG_STATE_HOME,
      "dotfiles",
      "land",
      basename(landStateDir(await realpath(f.main))),
    );
    expect(result.stdout.toString()).toContain(state);
    expect(await pathExists(join(state, "queue.jsonl"))).toBe(true);
    expect(await pathExists(f.env.AGX_STATE_DIR)).toBe(false);
  });

  test("all land modes refuse a nonempty legacy queue without touching either state", async () => {
    const f = await fixture();
    const old = join(f.env.AGX_STATE_DIR, "land");
    await mkdir(old, { recursive: true });
    await writeFile(
      join(old, "queue.jsonl"),
      "legacy queue must not be read\n",
    );
    const before = await digest(f.env.AGX_STATE_DIR);
    for (const args of [
      ["--enqueue", f.worker, "-m", "Migration"],
      ["--queue-status"],
      ["--run-queue"],
      [f.worker, "-m", "Migration"],
    ]) {
      const result = await f.command(args);
      expect(
        result.exitCode,
        result.stdout.toString() + result.stderr.toString(),
      ).toBe(2);
      const output = result.stdout.toString() + result.stderr.toString();
      expect(output.trim().split("\n")).toHaveLength(1);
      expect(output).toContain(
        `mv -- '${old}' '${join(f.env.XDG_STATE_HOME, "dotfiles", "land")}'`,
      );
      expect(await digest(f.env.AGX_STATE_DIR)).toBe(before);
      expect(await pathExists(join(f.env.XDG_STATE_HOME, "dotfiles"))).toBe(
        false,
      );
    }
  });

  test("empty legacy queue does not block dotfiles state", async () => {
    const f = await fixture();
    const old = join(f.env.AGX_STATE_DIR, "land");
    await mkdir(old, { recursive: true });
    expect((await f.command(["--queue-status"])).exitCode).toBe(0);
    expect(await readdir(old)).toEqual([]);
  });

  test("land state falls back to HOME when XDG_STATE_HOME is empty", async () => {
    const f = await fixture();
    const result = await f.command(["--queue-status"], {
      XDG_STATE_HOME: "",
      AGX_STATE_DIR: "",
    });
    expect(result.exitCode).toBe(0);
    const state = join(
      f.env.HOME,
      ".local",
      "state",
      "dotfiles",
      "land",
      basename(landStateDir(await realpath(f.main))),
    );
    expect(result.stdout.toString()).toContain(state);
    expect(await pathExists(state)).toBe(true);
    expect(await pathExists(join(f.env.HOME, ".local", "state", "agx"))).toBe(
      false,
    );
  });

  test("default legacy agx queue is refused without AGX_STATE_DIR", async () => {
    const f = await fixture();
    const old = join(f.env.XDG_STATE_HOME, "agx", "land");
    await mkdir(join(old, "old-repo"), { recursive: true });
    const result = await f.command(["--queue-status"], { AGX_STATE_DIR: "" });
    expect(result.exitCode).toBe(2);
    expect(result.stdout.toString()).toContain(`mv -- '${old}'`);
    expect(await pathExists(join(f.env.XDG_STATE_HOME, "dotfiles"))).toBe(
      false,
    );
    expect(await readdir(old)).toEqual(["old-repo"]);
  });

  test("moved entry lands without invoking post-push agx bookkeeping", async () => {
    const f = await fixture();
    const installed = join(dirname(f.main), "agx-worker");
    await mkdir(f.env.AGX_STATE_DIR, { recursive: true });
    await symlink(
      join(f.main, "tools/fixture-worker/src/next/cli.ts"),
      installed,
    );
    await rename(
      join(f.worker, "tools/fixture-worker/src/next/cli.ts"),
      join(f.worker, "tools/fixture-worker/src/next/moved.ts"),
    );
    await writeFile(
      join(f.worker, "tools/fixture-worker/package.json"),
      JSON.stringify({ bin: { "agx-worker": "src/next/moved.ts" } }),
    );
    await writeFile(
      join(f.worker, "tools/fixture-worker/src/next/moved.ts"),
      `#!/usr/bin/env bun
import { appendFile } from 'node:fs/promises';
await appendFile(process.env.LAND_EVENTS, JSON.stringify(['landed-ls', import.meta.path, ...process.argv.slice(2)]) + '\\n');
process.stdout.write(JSON.stringify([{ id: 'moved-run', ticket: 'moved-entry', workspace: process.env.LAND_EXPECT_WORKSPACE, judgment: { decision: 'accept' } }]));
`,
    );
    const result = await f.land();
    const output = result.stdout.toString();
    expect(result.exitCode, output + result.stderr.toString()).toBe(0);
    expect(output).toContain("[land] summary: NOT LIVE");
    expect(output).toContain("NOT LIVE until: mise run deploy");
    expect(output).not.toContain("[land] landed:");
    expect(output).not.toContain("FAIL");
    expect(output).not.toContain("rollback:");
    const lander = join(
      f.env.XDG_STATE_HOME,
      "dotfiles",
      "land",
      basename(landStateDir(await realpath(f.main))),
      "workspace",
    );
    expect((await f.log()).filter((event) => event[0] === "landed-ls")).toEqual(
      [],
    );
    expect(await pathExists(installed)).toBe(false);
    expect(
      await readFile(
        join(lander, "tools/fixture-worker/src/next/moved.ts"),
        "utf8",
      ),
    ).toContain("landed-ls");
    expect(
      await f.jj(f.main, [
        "log",
        "--no-graph",
        "-r",
        "alpha",
        "-T",
        "commit_id",
      ]),
    ).toBe(
      await f.git(f.main, [
        "--git-dir",
        f.origin,
        "rev-parse",
        "refs/heads/alpha",
      ]),
    );
    expect(await readdir(f.env.AGX_STATE_DIR)).toEqual([]);
  });

  test("landing does not invoke a failing post-push agx entry", async () => {
    const f = await fixture();
    await writeFile(
      join(f.worker, "tools/fixture-worker/src/next/cli.ts"),
      "#!/usr/bin/env bun\nprocess.stderr.write('fixture bookkeeping failure'); process.exit(9);\n",
    );
    const result = await f.land();
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).not.toContain("[land] landed:");
    expect(result.stdout.toString()).toContain("landed and pushed");
    expect(result.stdout.toString()).not.toContain("rollback:");
    expect(
      await readFile(
        join(f.main, "tools/fixture-worker/src/next/cli.ts"),
        "utf8",
      ),
    ).toContain("fixture bookkeeping failure");
  });

  test("workspace name and relative path resolve to the same listed workspace", async () => {
    const f = await fixture();
    await writeFile(join(f.worker, "keep.txt"), "workspace change\n");
    const byName = await f.land(["--dry-run"]);
    const byPath = await f.land(
      ["--dry-run"],
      {},
      f.main,
      "../dotfiles-arm-worker",
    );
    for (const result of [byName, byPath]) {
      expect(
        result.exitCode,
        result.stdout.toString() + result.stderr.toString(),
      ).toBe(0);
      expect(result.stdout.toString()).toContain(
        "[land] workspace: ok dotfiles-arm-worker",
      );
    }
  });

  test("land refuses a two-commit workspace stack before rebase without changing it", async () => {
    const f = await fixture();
    await writeFile(join(f.worker, "lower.txt"), "lower commit\n");
    await f.jj(f.worker, ["commit", "-m", "lower stack commit"]);
    await writeFile(join(f.worker, "upper.txt"), "upper commit\n");
    await f.jj(f.worker, ["status"]);

    const alphaBefore = await f.jj(f.main, [
      "log",
      "--no-graph",
      "-r",
      "alpha",
      "-T",
      "commit_id",
    ]);
    const stackBefore = await f.jj(f.worker, [
      "log",
      "--no-graph",
      "-r",
      "alpha..@",
      "-T",
      'commit_id ++ "\\n"',
    ]);
    const result = await f.land();
    const output = result.stdout.toString() + result.stderr.toString();

    expect(result.exitCode, output).toBe(1);
    expect(output).toContain(
      "workspace has 2 commits above alpha; squash them into one (jj squash) and retry",
    );
    expect(output).not.toContain("[land] rebase:");
    expect(
      await f.jj(f.main, [
        "log",
        "--no-graph",
        "-r",
        "alpha",
        "-T",
        "commit_id",
      ]),
    ).toBe(alphaBefore);
    expect(
      await f.jj(f.worker, [
        "log",
        "--no-graph",
        "-r",
        "alpha..@",
        "-T",
        'commit_id ++ "\\n"',
      ]),
    ).toBe(stackBefore);
    expect(await readFile(join(f.worker, "lower.txt"), "utf8")).toBe(
      "lower commit\n",
    );
    expect(await readFile(join(f.worker, "upper.txt"), "utf8")).toBe(
      "upper commit\n",
    );
  });

  test("unknown workspace is refused with the known workspace names", async () => {
    const f = await fixture();
    const result = await f.land([], {}, f.main, "not-a-workspace");
    expect(result.exitCode).toBe(1);
    const refusals = result.stdout
      .toString()
      .split("\n")
      .filter((line) => line.includes("unknown workspace"));
    expect(refusals).toEqual([
      '[land] preflight: FAIL unknown workspace "not-a-workspace"; known workspaces: default, dotfiles-arm-worker',
    ]);
    expect(result.stdout.toString()).not.toContain("workspace_root");
  });

  test("checks package bin targets in the workspace being landed", async () => {
    const f = await fixture();
    const packageRoot = join(f.main, "tools", "fixture-bin");
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify({ bin: { "fixture-bin": "src/main.ts" } }),
    );
    await mkdir(join(packageRoot, "src"), { recursive: true });
    await writeFile(
      join(packageRoot, "src", "main.ts"),
      "#!/usr/bin/env bun\nprocess.exit(0);\n",
    );
    await chmod(join(packageRoot, "src", "main.ts"), 0o644);
    await f.jj(f.main, ["commit", "-m", "add non-executable fixture bin"]);
    await f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    await f.jj(f.main, ["workspace", "forget", "dotfiles-arm-worker"]);
    await rm(f.worker, { recursive: true, force: true });
    await f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      "dotfiles-arm-worker",
      "-r",
      "alpha",
      f.worker,
    ]);

    await chmod(
      join(f.worker, "tools", "fixture-bin", "src", "main.ts"),
      0o755,
    );
    const result = await f.land();

    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(
      await f.jj(f.main, [
        "file",
        "list",
        "-r",
        "alpha",
        "-T",
        'if(executable, path ++ "\\n")',
      ]),
    ).toContain("tools/fixture-bin/src/main.ts");
    expect(result.stdout.toString()).not.toContain("[land] NOT LIVE until:");
    expect(result.stdout.toString()).toContain("[land] summary: LIVE");
  });

  test("candidate gate code and its registry key land together", async () => {
    const f = await fixture();
    await mkdir(join(f.main, "scripts"), { recursive: true });
    await writeFile(
      join(f.main, "scripts/consumer-gate.ts"),
      `export async function runConsumerGates(root: string) {
  const registry = Bun.TOML.parse(await Bun.file(root + '/presets/consumers.toml').text());
  const unknown = Object.keys(registry).filter((key) => key !== 'consumers');
  return { ok: unknown.length === 0, checked: 1, lines: unknown.map((key) => 'FAIL consumer registry presets/consumers.toml: Unrecognized key: ' + key) };
}\n`,
    );
    await f.jj(f.main, ["commit", "-m", "add base consumer gate"]);
    await f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    await f.jj(f.worker, ["rebase", "-r", "@", "-o", "alpha"]);
    await mkdir(join(f.worker, "scripts"), { recursive: true });
    await writeFile(
      join(f.worker, "presets/consumers.toml"),
      'consumers = []\n"trunk/setup" = true\n',
    );
    await writeFile(
      join(f.worker, "scripts/consumer-gate.ts"),
      `export async function runConsumerGates(root: string) {
  const registry = Bun.TOML.parse(await Bun.file(root + '/presets/consumers.toml').text());
  const accepted = registry['trunk/setup'] === true;
  return { ok: accepted, checked: 1, lines: [accepted ? 'PASS consumer registry trunk/setup' : 'FAIL consumer registry trunk/setup'] };
}\n`,
    );

    const result = await f.land();

    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(result.stdout.toString()).toContain(
      "[land] consumers: PASS consumer registry trunk/setup",
    );
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "presets/consumers.toml",
      ]),
    ).toContain('"trunk/setup" = true');
  });
  test("queued land isolates node_modules linked to the live dotfiles mount", async () => {
    if (process.platform !== "linux" || Bun.which("bwrap") === null) return;
    const f = await fixture();
    const consumer = join(dirname(f.main), "consumer-gate-source");
    const dotfiles = join(dirname(f.main), "dotfiles");
    await mkdir(join(consumer, "node_modules"), { recursive: true });
    await writeFile(
      join(consumer, "mise.toml"),
      '[tasks.setup]\nrun = "printf setup-ok"\n',
    );
    await f.jj(consumer, ["git", "init", "--colocate"]);
    await f.jj(consumer, ["commit", "-m", "consumer trunk"]);
    await f.jj(consumer, ["bookmark", "set", "alpha", "-r", "@-"]);
    await mkdir(join(dotfiles, "node_modules"), { recursive: true });
    await symlink(
      join(dotfiles, "node_modules"),
      join(f.worker, "node_modules"),
    );
    const mise = Bun.which("mise");
    expect(mise).not.toBeNull();
    if (mise === null) return;
    await mkdir(join(f.worker, "scripts"), { recursive: true });
    await writeFile(
      join(f.worker, "scripts/consumer-gate.ts"),
      `export { runConsumerGates } from ${JSON.stringify(join(REPO, "scripts/consumer-gate.ts"))};\n`,
    );
    await writeFile(
      join(f.worker, "presets/consumers.toml"),
      `[[consumers]]\nname = "land-path-consumer"\nroot = ${JSON.stringify(consumer)}\ntrunk = "alpha"\nsetup = [${JSON.stringify(mise)}, "run", "setup"]\nsurfaces = ["package-bins"]\ncommand = ["true"]\ntimeout_ms = 30000\n`,
    );
    await mkdir(join(f.worker, "tools/fixture"), { recursive: true });
    await writeFile(join(f.worker, "tools/fixture/main.ts"), "export {};\n");

    const enqueued = await f.command([
      "--enqueue",
      f.worker,
      "-m",
      "Queue node_modules symlink regression",
    ]);
    expect(enqueued.exitCode, enqueued.stdout.toString()).toBe(0);
    const result = await f.command(["--run-queue"]);

    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(result.stdout.toString()).toContain(
      "[land] consumers: PASS land-path-consumer: true exit 0",
    );
    expect(result.stdout.toString()).toContain("setup-ok");
  });
  test("registry-only candidate is refused and names its unrecognized key", async () => {
    const f = await fixture();
    await mkdir(join(f.main, "scripts"), { recursive: true });
    await writeFile(
      join(f.main, "scripts/consumer-gate.ts"),
      `export async function runConsumerGates(root: string) {
  const registry = Bun.TOML.parse(await Bun.file(root + '/presets/consumers.toml').text());
  const unknown = Object.keys(registry).filter((key) => key !== 'consumers');
  return { ok: unknown.length === 0, checked: 1, lines: unknown.map((key) => 'FAIL consumer registry presets/consumers.toml: Unrecognized key: ' + key) };
}\n`,
    );
    await f.jj(f.main, ["commit", "-m", "add base consumer gate"]);
    await f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    await f.jj(f.worker, ["rebase", "-r", "@", "-o", "alpha"]);
    await mkdir(join(f.worker, "scripts"), { recursive: true });
    await writeFile(
      join(f.worker, "presets/consumers.toml"),
      'consumers = []\n"trunk/setup" = true\n',
    );

    const result = await f.land();

    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain("Unrecognized key: trunk/setup");
    expect((await f.log()).some((args) => args[1] === "commit")).toBe(false);
  });
  test("lands disjoint changesets after another ticket released the same tool", async () => {
    const f = await fixture();
    await writeToolPackage(f.main, "1.0.0");
    await writeToolChangelog(f.main, "1.0.0 — 2026-10-01");
    await f.jj(f.main, ["commit", "-m", "add agx package"]);
    await f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    await f.jj(f.main, ["workspace", "forget", "dotfiles-arm-worker"]);
    await rm(f.worker, { recursive: true, force: true });
    await f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      "dotfiles-arm-worker",
      "-r",
      "alpha",
      f.worker,
    ]);
    await mkdir(join(f.worker, "tools", "release-fixture", ".changes"), {
      recursive: true,
    });
    await writeFile(
      join(
        f.worker,
        "tools",
        "release-fixture",
        ".changes",
        "worker-ticket.md",
      ),
      "---\nbump: minor\n---\n\nAdd a worker-ticket feature\n",
    );
    await f.jj(f.worker, ["status"]);
    await mkdir(join(f.main, "tools", "release-fixture", ".changes"), {
      recursive: true,
    });
    await writeFile(
      join(f.main, "tools", "release-fixture", ".changes", "prior-ticket.md"),
      "---\nbump: patch\n---\n\nFix a prior-ticket issue\n",
    );
    await applyToolChangesets(f.main, "2026-10-10");
    await f.jj(f.main, ["commit", "-m", "land prior ticket release"]);
    await f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    const result = await f.land();
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/release-fixture/package.json",
      ]),
    ).toContain('"version": "1.1.0"');
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/release-fixture/CHANGELOG.md",
      ]),
    ).toContain("- Fix a prior-ticket issue");
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/release-fixture/CHANGELOG.md",
      ]),
    ).toContain("- Add a worker-ticket feature");
    expect(result.stdout.toString()).toContain(
      "release-fixture 1.1.0 (1 changeset entries)",
    );
  });

  test("commits release outputs but omits a workspace-added consumed changeset", async () => {
    const f = await fixture();
    await writeToolPackage(f.main, "1.0.0");
    await writeToolChangelog(f.main, "1.0.0 — 2026-10-01");
    await f.jj(f.main, ["commit", "-m", "add generic release fixture"]);
    await f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    await f.jj(f.main, ["workspace", "forget", "dotfiles-arm-worker"]);
    await rm(f.worker, { recursive: true, force: true });
    await f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      "dotfiles-arm-worker",
      "-r",
      "alpha",
      f.worker,
    ]);
    const change = "tools/release-fixture/.changes/workspace-feature.md";
    await mkdir(join(f.worker, "tools", "release-fixture", ".changes"), {
      recursive: true,
    });
    await writeFile(
      join(f.worker, change),
      "---\nbump: minor\n---\n\nAdd a workspace feature\n",
    );
    await writeFile(
      join(f.worker, "tools", "release-fixture", "src.ts"),
      "export {}\n",
    );

    const result = await f.land();

    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    const commit = (await f.log()).find((event) => event[1] === "commit");
    expect(commit).toBeDefined();
    const committedPaths = commit?.slice((commit?.lastIndexOf("--") ?? -1) + 1);
    expect(committedPaths).toContain("tools/release-fixture/src.ts");
    expect(committedPaths).toContain("tools/release-fixture/package.json");
    expect(committedPaths).toContain("tools/release-fixture/CHANGELOG.md");
    expect(committedPaths).not.toContain(change);
    expect(await f.jj(f.main, ["file", "list", "-r", "alpha"])).not.toContain(
      change,
    );
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/release-fixture/package.json",
      ]),
    ).toContain('"version": "1.1.0"');
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/release-fixture/CHANGELOG.md",
      ]),
    ).toContain("- Add a workspace feature");
  });

  test("commits deletion of a consumed changeset that existed in the base", async () => {
    const f = await fixture();
    await writeToolPackage(f.main, "1.0.0");
    await writeToolChangelog(f.main, "1.0.0 — 2026-10-01");
    const change = "tools/release-fixture/.changes/base-feature.md";
    await mkdir(join(f.main, "tools", "release-fixture", ".changes"), {
      recursive: true,
    });
    await writeFile(
      join(f.main, change),
      "---\nbump: patch\n---\n\nAdd a base feature\n",
    );
    await f.jj(f.main, ["commit", "-m", "add base changeset fixture"]);
    await f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    await f.jj(f.main, ["workspace", "forget", "dotfiles-arm-worker"]);
    await rm(f.worker, { recursive: true, force: true });
    await f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      "dotfiles-arm-worker",
      "-r",
      "alpha",
      f.worker,
    ]);
    await writeFile(
      join(f.worker, "tools", "release-fixture", "src.ts"),
      "export {}\n",
    );

    const result = await f.land();

    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    const commit = (await f.log()).find((event) => event[1] === "commit");
    expect(commit).toBeDefined();
    const committedPaths = commit?.slice((commit?.lastIndexOf("--") ?? -1) + 1);
    expect(committedPaths).toContain("tools/release-fixture/src.ts");
    expect(committedPaths).toContain("tools/release-fixture/package.json");
    expect(committedPaths).toContain("tools/release-fixture/CHANGELOG.md");
    expect(committedPaths).toContain(change);
    expect(await f.jj(f.main, ["file", "list", "-r", "alpha"])).not.toContain(
      change,
    );
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/release-fixture/package.json",
      ]),
    ).toContain('"version": "1.0.1"');
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/release-fixture/CHANGELOG.md",
      ]),
    ).toContain("- Add a base feature");
  });

  test("accepts the workspace directory basename when its jj name differs", async () => {
    const f = await fixture();
    await f.jj(f.main, ["workspace", "forget", "dotfiles-arm-worker"]);
    await rm(f.worker, { recursive: true, force: true });
    const aliasPath = join(dirname(f.worker), "dotfiles-arm-bunexec-1010");
    await f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      "bunexec-1010",
      "-r",
      "alpha",
      aliasPath,
    ]);
    await writeFile(join(aliasPath, "keep.txt"), "worker version\n");
    const result = await f.land([], {}, f.main, basename(aliasPath));
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(result.stdout.toString()).toContain(
      "[land] workspace: removed bunexec-1010",
    );
    expect(await pathExists(aliasPath)).toBe(false);
  });

  test("land requires an existing accept judgment and leaves agx state unchanged", async () => {
    const f = await fixture();
    const state = join(f.main, "..", "agx-state", "legacy-v1");
    await mkdir(state, { recursive: true });
    await appendFile(
      join(state, "runs.jsonl"),
      `${JSON.stringify({ kind: "run", run_id: "run-from-workspace", cwd: f.worker, ticket: { name: "landsplit" } })}\n`,
    );
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    await appendListingRun(
      f.env.AGX_STATE_DIR,
      f.worker,
      "run-from-workspace",
      "landsplit",
      "2026-10-24T00:00:00Z",
    );
    const refused = await f.land([], { LAND_NO_ACCEPT: "1" });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout.toString()).toContain(
      'agx worker judge run-from-workspace accept --note "<reason>"',
    );
    expect(
      (await f.log()).some(
        (event) => event[0] === "run" && event[1] === "commit",
      ),
    ).toBe(false);
    await appendAcceptance(state, "run-from-workspace");
    await appendFile(
      join(f.env.AGX_STATE_DIR, "records.jsonl"),
      JSON.stringify({
        kind: "judged",
        id: "run-from-workspace",
        at: "2026-10-24T00:01:00Z",
        decision: "accept",
        note: "fixture judgment",
      }) + "\n",
    );
    // A root-level ledger is not part of the read-only legacy ledger.
    await writeFile(
      join(f.env.AGX_STATE_DIR, "runs.jsonl"),
      JSON.stringify({
        kind: "run",
        run_id: "root-decoy",
        cwd: f.worker,
        ticket: { name: "root-decoy" },
      }) + "\n",
    );
    const before = await digest(state);
    const result = await f.land();
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(await digest(state)).toBe(before);
    expect((await f.log()).filter((event) => event[0] === "agx")).toEqual([]);
  });

  test("accept judgment in the listing covers the latest workspace ticket lineage", async () => {
    const f = await fixture();
    const state = join(f.main, "..", "agx-state", "legacy-v1");
    await mkdir(state, { recursive: true });
    await appendFile(
      join(state, "runs-2026-10-13.jsonl"),
      [
        {
          kind: "run",
          run_id: "landsplit-first",
          cwd: f.worker,
          ticket: { name: "landsplit" },
        },
        {
          kind: "run",
          run_id: "landsplit-resume",
          cwd: f.worker,
          ticket: { name: "landsplit" },
        },
        {
          kind: "acceptance",
          run_id: "landsplit-resume",
          accept: true,
          at: "2026-10-13T08:25:10.000Z",
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
    await writeFile(join(f.worker, "keep.txt"), "workspace lineage change\n");
    await appendListingRun(
      f.env.AGX_STATE_DIR,
      f.worker,
      "landsplit-first",
      "landsplit",
      "2026-10-24T00:00:00Z",
    );
    await appendListingRun(
      f.env.AGX_STATE_DIR,
      f.worker,
      "landsplit-resume",
      "landsplit",
      "2026-10-24T00:01:00Z",
      "accept",
    );
    const result = await f.land([], {
      LAND_JUDGMENTS: JSON.stringify({
        "landsplit-resume": {
          kind: "acceptance",
          accept: true,
          at: "2026-10-13T08:25:10.000Z",
        },
      }),
    });
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect((await f.log()).filter((event) => event[0] === "agx")).toEqual([]);
    expect(result.stdout.toString()).toContain(
      "judgment: ok 1 accepted ticket lineage(s)",
    );
  });

  test("an unreported stopped predecessor does not block an accepted latest run", async () => {
    const f = await fixture();
    const state = join(f.main, "..", "agx-state", "legacy-v1");
    await mkdir(state, { recursive: true });
    await appendFile(
      join(state, "runs.jsonl"),
      [
        {
          kind: "run",
          run_id: "landsplit-stopped",
          workspace: f.worker,
          ticket: { name: "landsplit" },
          outcome: "stopped",
        },
        {
          kind: "run",
          run_id: "landsplit-amended",
          cwd: f.worker,
          ticket: { name: "landsplit" },
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
    await writeFile(
      join(state, "lifecycle.jsonl"),
      `${JSON.stringify({
        type: "judged",
        run_id: "landsplit-amended",
        decision: "accept",
        at: "2026-10-13T08:25:10.000Z",
      })}\n`,
    );
    await writeFile(join(f.worker, "keep.txt"), "accepted amended run\n");
    await appendListingRun(
      f.env.AGX_STATE_DIR,
      f.worker,
      "landsplit-stopped",
      "landsplit",
      "2026-10-24T00:00:00Z",
    );
    await appendListingRun(
      f.env.AGX_STATE_DIR,
      f.worker,
      "landsplit-amended",
      "landsplit",
      "2026-10-24T00:01:00Z",
      "accept",
    );
    const result = await f.land();
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect((await f.log()).filter((event) => event[0] === "agx")).toEqual([]);
    expect(result.stdout.toString()).toContain(
      "judgment: ok 1 accepted ticket lineage(s)",
    );
  });

  test("land preflight reads an accepted judgment from agx worker ls records", async () => {
    const f = await fixture();
    const state = join(f.main, "agx-current-state");
    await mkdir(state, { recursive: true });
    await writeFile(
      join(state, "records.jsonl"),
      [
        {
          kind: "started",
          id: "next-land-run",
          at: "2026-10-14T00:00:00Z",
          ticket: "landsplit",
          writes: ["keep.txt"],
          cwd: f.worker,
          workspace: f.worker,
          row: "luna-high",
          dispatcher_session: null,
          vendor_session: null,
          continues: null,
          pid: 0,
        },
        {
          kind: "ended",
          id: "next-land-run",
          at: "2026-10-14T00:01:00Z",
          exit: 0,
          report_path: null,
          vendor_session: null,
        },
        {
          kind: "judged",
          id: "next-land-run",
          at: "2026-10-14T00:02:00Z",
          decision: "accept",
          note: "accepted fixture",
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
    await writeFile(join(f.worker, "keep.txt"), "accepted next run\n");
    const result = await f.land([], { AGX_STATE_DIR: state });
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(result.stdout.toString()).toContain(
      "judgment: ok 1 accepted ticket lineage(s)",
    );
  });

  test("a later reject in the same workspace ticket lineage overrides an earlier accept", async () => {
    const f = await fixture();
    const state = join(f.main, "..", "agx-state", "legacy-v1");
    await mkdir(state, { recursive: true });
    await appendFile(
      join(state, "runs.jsonl"),
      [
        {
          kind: "run",
          run_id: "landsplit-first",
          cwd: f.worker,
          ticket: { name: "landsplit" },
        },
        {
          kind: "run",
          run_id: "landsplit-resume",
          cwd: f.worker,
          ticket: { name: "landsplit" },
        },
      ]
        .map((row) => JSON.stringify(row))
        .join("\n") + "\n",
    );
    await writeFile(join(f.worker, "keep.txt"), "workspace lineage change\n");
    await appendListingRun(
      f.env.AGX_STATE_DIR,
      f.worker,
      "landsplit-first",
      "landsplit",
      "2026-10-24T00:00:00Z",
      "accept",
    );
    await appendListingRun(
      f.env.AGX_STATE_DIR,
      f.worker,
      "landsplit-resume",
      "landsplit",
      "2026-10-24T00:01:00Z",
      "reject",
    );
    const result = await f.land([], {
      LAND_JUDGMENTS: JSON.stringify({
        "landsplit-first": {
          kind: "acceptance",
          accept: true,
          at: "2026-10-13T08:24:00.000Z",
        },
        "landsplit-resume": {
          kind: "acceptance",
          accept: false,
          at: "2026-10-13T08:25:10.000Z",
        },
      }),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain(
      'ticket landsplit has no current accept judgment; import legacy runs if needed with `agx worker stats --import-legacy`, inspect `agx worker ls --json`, then judge run `landsplit-resume` with `agx worker judge landsplit-resume accept --note "<reason>"`',
    );
    expect(
      (await f.log()).some(
        (event) => event[0] === "run" && event[1] === "commit",
      ),
    ).toBe(false);
  });

  test("land prints the agx worker judge command with supplied review context", async () => {
    const f = await fixture();
    const state = join(f.main, "..", "agx-state", "legacy-v1");
    await mkdir(state, { recursive: true });
    await appendFile(
      join(state, "runs.jsonl"),
      `${JSON.stringify({ kind: "run", run_id: "reviewed-run", cwd: f.worker, ticket: { name: "reviewed" } })}\n`,
    );
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    await appendListingRun(
      f.env.AGX_STATE_DIR,
      f.worker,
      "reviewed-run",
      "reviewed",
      "2026-10-24T00:00:00Z",
    );
    const refused = await f.land(["--review", "independent-review"], {
      LAND_NO_ACCEPT: "1",
    });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout.toString()).toContain(
      'agx worker judge reviewed-run accept --note "independent review independent-review"',
    );
    expect(await readFile(join(state, "runs.jsonl"), "utf8")).not.toContain(
      '"kind":"acceptance","run_id":"reviewed-run"',
    );
  });

  test("dry-run preserves tracked relative symlinks instead of inventing overlap", async () => {
    const f = await fixture();
    await symlink("keep.txt", join(f.main, "relative-link"));
    await f.jj(f.main, ["commit", "-m", "Fixture relative link"]);
    await f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    await f.jj(f.worker, ["rebase", "-r", "@", "-o", "alpha"]);
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    const result = await f.land(["--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).not.toContain(
      "dirty main checkout overlaps",
    );
    expect(await readFile(join(f.main, "keep.txt"), "utf8")).toBe(
      "keep content\n",
    );
  });

  test("land succeeds without deploying and records no acceptance judgment", async () => {
    const f = await fixture();
    const state = join(f.main, "..", "agx-state", "legacy-v1");
    await mkdir(state, { recursive: true });
    await appendFile(
      join(state, "runs.jsonl"),
      `${JSON.stringify({ kind: "run", run_id: "deploy-failure-run", cwd: f.worker, ticket: { name: "deploy" } })}\n`,
    );
    await appendAcceptance(state, "deploy-failure-run");
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    const result = await f.land([], {
      LAND_UNREACHABLE_SSH: "sol",
      LAND_ASSERT_DEPLOY_PRECONDITION: "1",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).not.toContain("[land] deploy:");
    expect(await pathExists(f.worker)).toBe(false);
    expect((await f.log()).filter((event) => event[0] === "ssh")).toEqual([]);
    expect(await readFile(join(state, "runs.jsonl"), "utf8")).not.toContain(
      '"kind":"landed","run_id":"deploy-failure-run"',
    );
    expect(
      (await readFile(join(state, "runs.jsonl"), "utf8")).match(
        /"kind":"acceptance","run_id":"deploy-failure-run"/gu,
      ),
    ).toHaveLength(1);
  });

  test("invocation in a worker checkout discovers the main checkout", async () => {
    const f = await fixture();
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    const result = await f.land([], {}, f.worker);
    expect(result.exitCode).toBe(0);
    expect(
      await f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"]),
    ).toBe("worker version");
    expect(await readFile(join(f.main, "keep.txt"), "utf8")).toBe(
      "worker version\n",
    );
    expect(await pathExists(f.worker)).toBe(false);
  });

  test(
    "formatters get only existing changed paths and run before commit",
    async () => {
      const f = await fixture();
      await writeFile(join(f.worker, "added.ts"), "const added=1;\n");
      await writeFile(join(f.worker, "added.md"), "# Added\n");
      await writeFile(join(f.worker, "added.sh"), "echo added\n");
      await writeFile(
        join(f.worker, "added.zsh"),
        'print -r -- "${(q)HOME}"\n',
      );
      await rm(join(f.worker, "remove.md"));
      const result = await f.land();
      expect(result.exitCode).toBe(0);
      expect((await f.log()).slice(0, 3)).toEqual([
        ["format", "bunx", "--bun", "oxfmt", "./added.ts"],
        ["format", "rumdl", "fmt", "./added.md"],
        [
          "format",
          "shfmt",
          "-w",
          "-ln",
          "bash",
          "-i",
          "2",
          "-ci",
          "-sr",
          "-bn",
          "-s",
          "./added.sh",
        ],
      ]);
      expect((await f.log())[3]?.slice(0, 2)).toEqual(["run", "commit"]);
      expect(
        (await f.log()).filter((event) => event[0] === "format").flat(),
      ).not.toContain("./added.zsh");
    },
    LAND_FORMATTER_TEST_TIMEOUT_MS,
  );

  test(
    "rename reports and commits both paths as exact argv without deployment",
    async () => {
      const f = await fixture();
      await rename(
        join(f.worker, "old name.txt"),
        join(f.worker, "new name.txt"),
      );
      await writeFile(join(f.main, "keep.txt"), "unrelated dirty main\n");
      const result = await f.land();
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain(
        '[land] paths: ok ["new name.txt","old name.txt"]',
      );
      expect(await f.jj(f.main, ["file", "list", "-r", "alpha"])).not.toContain(
        "old name.txt",
      );
      expect(
        await f.jj(f.main, ["file", "show", "-r", "alpha", "new name.txt"]),
      ).toBe("rename content");
      expect(await readFile(join(f.main, "keep.txt"), "utf8")).toBe(
        "unrelated dirty main\n",
      );
      expect(
        await f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"]),
      ).toBe("keep content");
      expect((await f.log())[0]).toEqual([
        "run",
        "commit",
        "--",
        "-m",
        "Land test",
        "--",
        "new name.txt",
        "old name.txt",
      ]);
      expect((await f.log()).filter((event) => event[0] === "ssh")).toEqual([]);
      expect(result.stdout.toString()).not.toContain("hosts=");
      expect(result.stdout.toString()).toMatch(
        /summary: LIVE commit=[0-9a-f]+/u,
      );
    },
    LAND_FORMATTER_TEST_TIMEOUT_MS,
  );

  test("a deletion is landed and committed", async () => {
    const f = await fixture();
    await rm(join(f.worker, "delete.txt"));
    const result = await f.land();
    expect(result.exitCode).toBe(0);
    expect(await pathExists(join(f.main, "delete.txt"))).toBe(false);
    expect(await f.jj(f.main, ["file", "list", "-r", "alpha"])).not.toContain(
      "delete.txt",
    );
    expect(
      await f.jj(f.main, ["log", "--no-graph", "-r", "@-", "-T", "commit_id"]),
    ).toBe(
      await f.jj(f.main, [
        "log",
        "--no-graph",
        "-r",
        "alpha",
        "-T",
        "commit_id",
      ]),
    );
  });

  test("LAND-OWN-TREE ignores main lint failures, commits only the worker and pushes alpha", async () => {
    const f = await fixture();
    await mkdir(join(f.main, "git"));
    await writeFile(join(f.main, "git/ignore"), "*.fixture-cache\n");
    await f.jj(f.main, ["commit", "-m", "Tracked ignore fixture"]);
    await f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    await f.jj(f.worker, ["rebase", "-r", "@", "-o", "alpha"]);
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    await writeFile(join(f.main, "git/ignore"), "INVALID-LINT\n");
    const before = await readFile(join(f.main, "git/ignore"));
    const alpha = await f.jj(f.main, [
      "log",
      "-r",
      "alpha",
      "--no-graph",
      "-T",
      "commit_id",
    ]);
    const result = await f.land([], { LAND_CHECK_IGNORE: "1" }, f.worker);
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(await readFile(join(f.main, "git/ignore"))).toEqual(before);
    expect(
      await f.jj(f.main, ["file", "show", "-r", "alpha", "git/ignore"]),
    ).toBe("*.fixture-cache");
    expect(
      await f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"]),
    ).toBe("worker version");
    const landed = await f.jj(f.main, [
      "log",
      "-r",
      "alpha",
      "--no-graph",
      "-T",
      "commit_id",
    ]);
    expect(landed).not.toBe(alpha);
    expect(
      await f.jj(f.main, [
        "log",
        "-r",
        "alpha@origin",
        "--no-graph",
        "-T",
        "commit_id",
      ]),
    ).toBe(landed);
    expect(
      await f.git(dirname(f.main), [
        "--git-dir",
        f.origin,
        "rev-parse",
        "refs/heads/alpha",
      ]),
    ).toBe(landed);
    expect(
      (await f.log()).find((event) => event[0] === "commit-cwd")?.[1],
    ).not.toBe(f.main);
  });

  test("land rebases main onto alpha, keeps its uncommitted edit, and runs post-merge once", async () => {
    const f = await fixture();
    await writeFile(join(f.worker, "landed.txt"), "worker version\n");
    await writeFile(join(f.main, "keep.txt"), "uncommitted main edit\n");
    const result = await f.land();
    expect(result.exitCode).toBe(0);
    expect(
      await f.jj(f.main, ["file", "show", "-r", "alpha", "landed.txt"]),
    ).toBe("worker version");
    expect(await readFile(join(f.main, "keep.txt"), "utf8")).toBe(
      "uncommitted main edit\n",
    );
    expect(
      await f.jj(f.main, ["log", "--no-graph", "-r", "@-", "-T", "commit_id"]),
    ).toBe(
      await f.jj(f.main, [
        "log",
        "--no-graph",
        "-r",
        "alpha",
        "-T",
        "commit_id",
      ]),
    );
    expect(
      (await f.log()).filter((event) => event[1] === "hook:post-merge"),
    ).toHaveLength(1);
    expect(result.stdout.toString()).toContain("[land] summary: LIVE");
  });

  test("main rebase conflict reports NOT LIVE with paths while alpha stays landed", async () => {
    const f = await fixture();
    const alphaBefore = await f.jj(f.main, [
      "log",
      "--no-graph",
      "-r",
      "alpha",
      "-T",
      "commit_id",
    ]);
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    await writeFile(join(f.main, "keep.txt"), "uncommitted main version\n");
    const result = await f.land();

    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(result.stdout.toString()).toContain(
      '[land] main checkout: NOT LIVE rebase conflicted on ["keep.txt"]',
    );
    expect(result.stdout.toString()).toContain("[land] summary: NOT LIVE");
    expect(
      await f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"]),
    ).toBe("worker version");
    expect(
      await f.jj(f.main, [
        "log",
        "--no-graph",
        "-r",
        "alpha",
        "-T",
        "commit_id",
      ]),
    ).not.toBe(alphaBefore);
    expect(
      (await f.log()).filter((event) => event[1] === "hook:post-merge"),
    ).toHaveLength(0);
  });

  test("LAND-OWN-TREE recreates a forgotten lander and lands the worker change", async () => {
    const f = await fixture();
    const state = join(
      f.env.XDG_STATE_HOME,
      "dotfiles",
      "land",
      basename(landStateDir(await realpath(f.main))),
    );
    const lander = join(state, "workspace");
    const name = `land-owned-${basename(state)}`;
    await mkdir(state, { recursive: true });
    await f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      name,
      "-r",
      "alpha",
      lander,
    ]);
    await f.jj(f.main, ["workspace", "forget", name]);
    expect(await pathExists(lander)).toBe(true);
    await mkdir(f.env.GRAVEYARD, { recursive: true });
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");

    const result = await f.land();

    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(result.stdout.toString()).toContain("[land] summary: LIVE");
    expect(
      await f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"]),
    ).toBe("worker version");
    expect(
      (await f.jj(f.main, ["workspace", "list"]))
        .split("\n")
        .some((line) => line.trimStart().startsWith(`${name}:`)),
    ).toBe(true);
    expect((await readdir(f.env.GRAVEYARD)).length).toBeGreaterThan(0);
  });

  test("LAND-OWN-TREE refuses its dirty tree with exact paths before rebase", async () => {
    const f = await fixture();
    const state = join(
      f.env.XDG_STATE_HOME,
      "dotfiles",
      "land",
      basename(landStateDir(await realpath(f.main))),
    );
    const lander = join(state, "workspace");
    await mkdir(state, { recursive: true });
    await f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      `land-owned-${basename(state)}`,
      "-r",
      "alpha",
      lander,
    ]);
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    await f.jj(f.worker, ["status"]);
    const workerBefore = await f.jj(f.worker, [
      "log",
      "--no-graph",
      "-r",
      "@",
      "-T",
      "commit_id",
    ]);
    const alphaBefore = await f.jj(f.worker, [
      "log",
      "--no-graph",
      "-r",
      "alpha",
      "-T",
      "commit_id",
    ]);
    await writeFile(join(lander, "keep.txt"), "foreign land-tree edit\n");
    const oddPath = "foreign\nname.txt";
    await writeFile(join(lander, oddPath), "foreign new file\n");
    await rm(join(lander, "delete.txt"));
    const result = await f.land();
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain(
      `dirty land tree: ${JSON.stringify(["delete.txt", oddPath, "keep.txt"])}`,
    );
    expect(result.stdout.toString()).not.toContain("[land] rebase:");
    expect(await f.log()).toEqual([]);
    expect(
      await f.jj(f.worker, ["log", "--no-graph", "-r", "@", "-T", "commit_id"]),
    ).toBe(workerBefore);
    expect(
      await f.jj(f.worker, [
        "log",
        "--no-graph",
        "-r",
        "alpha",
        "-T",
        "commit_id",
      ]),
    ).toBe(alphaBefore);
    expect(await readFile(join(lander, "keep.txt"), "utf8")).toBe(
      "foreign land-tree edit\n",
    );
    expect(await readFile(join(lander, oddPath), "utf8")).toBe(
      "foreign new file\n",
    );
    expect(await pathExists(join(lander, "delete.txt"))).toBe(false);
    expect(await pathExists(join(state, "land.lock"))).toBe(false);
  });

  test("LAND-OWN-TREE lands repeatedly when the gate installs dependencies", async () => {
    const f = await fixture();
    // The gate's dependency output is ignored by the repo's rules; the symlink land installs
    // is not matched by the directory-only `node_modules/` rule and must not count as dirt.
    await writeFile(join(f.main, ".gitignore"), "node_modules/\n");
    await writeFile(join(f.main, "package.json"), "{}\n");
    await f.jj(f.main, ["commit", "-m", "manifest"]);
    await f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    await f.jj(f.main, [
      "git",
      "push",
      "--bookmark",
      "alpha",
      "--remote",
      "origin",
    ]);
    // prepareLander links the running tool's installed packages, so they must exist.
    expect(await pathExists(join(import.meta.dir, "../../node_modules"))).toBe(
      true,
    );
    for (const name of ["second", "third"]) {
      const worker = join(dirname(f.worker), `dotfiles-arm-${name}`);
      await f.jj(f.main, [
        "workspace",
        "add",
        "--name",
        `dotfiles-arm-${name}`,
        "-r",
        "alpha",
        worker,
      ]);
      await writeFile(join(worker, "keep.txt"), `${name} version\n`);
      const result = await f.land(
        [],
        { LAND_EXPECT_WORKSPACE: worker },
        f.main,
        `dotfiles-arm-${name}`,
      );
      expect(result.stdout.toString()).not.toContain("dirty land tree");
      expect(result.exitCode).toBe(0);
      expect(
        await f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"]),
      ).toBe(`${name} version`);
    }
  });

  test("commit refusal preserves hook output and stops before deploy", async () => {
    const f = await fixture();
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    const result = await f.land([], {
      LAND_FAIL_COMMIT: "1",
      LAND_NOISY_COMMIT: "1",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain("[land] commit: FAIL");
    expect(result.stderr.toString()).toContain(
      "hook:pre-commit refused: fixture refusal",
    );
    expect(result.stderr.toString()).toContain(
      "FAIL settings.json:4 → missing target retired.ts",
    );
    expect(await f.log()).toHaveLength(1);
    expect(await readFile(join(f.main, "keep.txt"), "utf8")).toBe(
      "keep content\n",
    );
    expect(
      await f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"]),
    ).toBe("keep content");
  });

  test("land accepts delimiter and blank-line layout variants", async () => {
    const f = await fixture();
    await writeToolPackage(f.worker, "1.0.0");
    await writeToolChangelog(f.worker, "1.0.0 — 2026-10-01");
    await mkdir(join(f.worker, "tools", "release-fixture", ".changes"), {
      recursive: true,
    });
    await writeFile(
      join(f.worker, "tools", "release-fixture", ".changes", "no-blank.md"),
      "---\nbump: patch\n---\nAccept delimiters without a blank line\n",
    );
    await writeFile(
      join(
        f.worker,
        "tools",
        "release-fixture",
        ".changes",
        "no-delimiters.md",
      ),
      "bump: patch\n\nAccept a delimiter-less changeset\n",
    );
    const result = await f.land();

    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/release-fixture/package.json",
      ]),
    ).toContain('"version": "1.0.1"');
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/release-fixture/CHANGELOG.md",
      ]),
    ).toContain("- Accept delimiters without a blank line");
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/release-fixture/CHANGELOG.md",
      ]),
    ).toContain("- Accept a delimiter-less changeset");
  });

  test("a failed push retains the successful commit verdict and does not deploy", async () => {
    const f = await fixture();
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    const result = await f.land([], { LAND_FAIL_PUSH: "1" });
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain("[land] commit: ok");
    expect(result.stdout.toString()).toContain("[land] push: FAIL");
    expect(result.stdout.toString()).not.toContain("landed and pushed");
    expect((await f.log()).filter((event) => event[0] === "ssh")).toEqual([]);
  });

  test("fetches and rebases onto an origin advance made after the land commit", async () => {
    const f = await fixture();
    const competitor = join(dirname(f.main), "competitor");
    await f.jj(dirname(f.main), [
      "git",
      "clone",
      "--colocate",
      f.origin,
      competitor,
    ]);
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    const result = await f.land([], {
      LAND_ADVANCE_ORIGIN: "1",
      LAND_COMPETITOR: competitor,
      LAND_ADVANCE_PATH: "origin-advanced.txt",
    });
    expect(
      result.exitCode,
      result.stderr.toString() + result.stdout.toString(),
    ).toBe(0);
    const local = await f.jj(f.main, [
      "log",
      "--no-graph",
      "-r",
      "alpha",
      "-T",
      "commit_id",
    ]);
    const remote = await f.jj(f.main, [
      "log",
      "--no-graph",
      "-r",
      "alpha@origin",
      "-T",
      "commit_id",
    ]);
    expect(local).toBe(remote);
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "origin-advanced.txt",
      ]),
    ).toBe("origin advanced");
    expect(
      await f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"]),
    ).toBe("worker version");
    expect(result.stdout.toString()).toContain("[land] push: ok");
  });

  test("a push rebase conflict names files and restores both workspaces", async () => {
    const f = await fixture();
    const competitor = join(dirname(f.main), "competitor");
    await f.jj(dirname(f.main), [
      "git",
      "clone",
      "--colocate",
      f.origin,
      competitor,
    ]);
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    const result = await f.land([], {
      LAND_ADVANCE_ORIGIN: "1",
      LAND_COMPETITOR: competitor,
      LAND_ADVANCE_PATH: "keep.txt",
      LAND_ADVANCE_CONTENT: "origin version\n",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain('conflicted on ["keep.txt"]');
    expect(result.stdout.toString()).toContain("workspace restored");
    expect(await readFile(join(f.main, "keep.txt"), "utf8")).toBe(
      "keep content\n",
    );
    expect(await readFile(join(f.worker, "keep.txt"), "utf8")).toBe(
      "worker version\n",
    );
    expect(
      await f.jj(f.main, [
        "log",
        "--no-graph",
        "-r",
        "alpha",
        "-T",
        "conflict",
      ]),
    ).toBe("false");
    expect((await f.log()).filter((event) => event[0] === "ssh")).toEqual([]);
  });

  test("dry-run includes unsnapshotted changes and changes neither files nor metadata", async () => {
    const f = await fixture();
    await writeFile(
      join(f.main, ".jj", "repo", "store", "git_target"),
      join(f.main, ".git"),
    );
    await rename(
      join(f.worker, "old name.txt"),
      join(f.worker, "new name.txt"),
    );
    await rm(join(f.worker, "delete.txt"));
    await writeFile(join(f.main, "keep.txt"), "unrelated dirty main\n");
    const before = [await digest(f.main), await digest(f.worker)];
    const result = await f.land(["--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(
      '[land] paths: ok ["delete.txt","new name.txt","old name.txt"]',
    );
    expect([await digest(f.main), await digest(f.worker)]).toEqual(before);
    expect(await f.log()).toEqual([]);
  });

  test("rebase conflict refuses before restore and deploy", async () => {
    const f = await fixture();
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    await f.jj(f.worker, ["status"]);
    await writeFile(join(f.main, "keep.txt"), "alpha version\n");
    await f.jj(f.main, ["commit", "-m", "advance alpha"]);
    await f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    const result = await f.land();
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain(
      "[land] rebase: FAIL rebase introduced conflicts",
    );
    expect(await f.log()).toEqual([]);
    expect(await readFile(join(f.main, "keep.txt"), "utf8")).toBe(
      "alpha version\n",
    );
  });

  test("queued landing records only land outcomes and never deploys", async () => {
    const f = await fixture();
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    expect(
      (await f.command(["--enqueue", f.worker, "-m", "Queue without deploy"]))
        .exitCode,
    ).toBe(0);
    const result = await f.command(["--run-queue"], { LAND_FAIL_SSH: "sol" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("OK " + f.worker);
    expect((await f.log()).filter((event) => event[0] === "ssh")).toEqual([]);
    const status = (await f.command(["--queue-status"])).stdout.toString();
    expect(status).toContain('"commit": "ok"');
    expect(status).toContain('"push": "ok"');
    expect(status).not.toContain('"hosts"');
  });

  test(
    "the queue lands two items serially, records a failure, and continues",
    async () => {
      const f = await fixture();
      const second = join(dirname(f.worker), "second-worker");
      await f.jj(f.main, [
        "workspace",
        "add",
        "--name",
        "second",
        "-r",
        "alpha",
        second,
      ]);
      await writeFile(join(f.worker, "keep.txt"), "failed worker\n");
      await writeFile(join(second, "delete.txt"), "successful worker\n");
      await mkdir(join(f.env.AGX_STATE_DIR, "legacy-v1"), { recursive: true });
      await appendFile(
        join(f.env.AGX_STATE_DIR, "legacy-v1", "runs.jsonl"),
        `${JSON.stringify({ kind: "run", run_id: "queued-run", cwd: second, ticket: { name: "queued" } })}\n`,
      );
      await appendAcceptance(
        join(f.env.AGX_STATE_DIR, "legacy-v1"),
        "queued-run",
      );
      expect(
        (await f.command(["--enqueue", f.worker, "-m", "Fail queued"]))
          .exitCode,
      ).toBe(0);
      expect(
        (
          await f.command([
            "--enqueue",
            "second",
            "-m",
            "Good queued",
            "--review",
            "queued-review",
          ])
        ).exitCode,
      ).toBe(0);
      const result = await f.command(["--run-queue"]);
      expect(
        result.exitCode,
        result.stdout.toString() + result.stderr.toString(),
      ).toBe(1);
      expect(result.stdout.toString()).toContain("FAIL " + f.worker);
      expect(result.stdout.toString()).toContain("OK second");
      expect(await readFile(join(f.main, "keep.txt"), "utf8")).toBe(
        "keep content\n",
      );
      expect(
        await f.jj(f.main, ["file", "show", "-r", "alpha", "delete.txt"]),
      ).toBe("successful worker");
      expect(await pathExists(second)).toBe(false);
      expect((await f.log()).filter((event) => event[0] === "agx")).toEqual([]);
      const state = landStateDir(await realpath(f.main));
      // State belongs to this isolated fixture, rather than the test runner's state.
      const actualState = join(
        f.env.XDG_STATE_HOME,
        "dotfiles",
        "land",
        basename(state),
      );
      const journal = await readFile(join(actualState, "queue.jsonl"), "utf8");
      expect(journal).toContain('"status":"FAIL"');
      expect(journal).toContain('"status":"OK"');
      expect(await pathExists(join(actualState, "runner.lock"))).toBe(false);
      expect(await pathExists(join(actualState, "land.lock"))).toBe(false);
      const status = jsonOf(
        z.looseObject({
          pending: z.number(),
          running: z.number(),
          OK: z.number(),
          FAIL: z.number(),
        }),
      ).safeParse((await f.command(["--queue-status"])).stdout.toString());
      expect(status.success ? status.data : undefined).toMatchObject({
        pending: 0,
        running: 0,
        OK: 1,
        FAIL: 1,
      });
      expect((await f.command(["--run-queue"])).exitCode).toBe(0);
    },
    LAND_FORMATTER_TEST_TIMEOUT_MS,
  );

  test(
    "a duplicate runner is idempotent and queued work waits for the land lock",
    async () => {
      const f = await fixture();
      await writeFile(join(f.worker, "keep.txt"), "worker version\n");
      expect(
        (await f.command(["--enqueue", f.worker, "-m", "Queued once"]))
          .exitCode,
      ).toBe(0);
      const state = join(
        f.env.XDG_STATE_HOME,
        "dotfiles",
        "land",
        basename(landStateDir(await realpath(f.main))),
      );
      const held = tryAcquire(join(state, "land.lock"), {
        pid: process.pid,
        host: hostname(),
        what: "fixture held land",
        since: Temporal.Now.instant().toString(),
      });
      expect(held.ok).toBe(true);
      if (!held.ok) return;
      using _held = { [Symbol.dispose]: held.release };
      const child = f.start(["--run-queue"]);
      const stderr = new Response(child.stderr).text();
      const reader = child.stdout.getReader();
      const first = await reader.read();
      expect(new TextDecoder().decode(first.value)).toContain(
        "waiting for land lock",
      );
      const rest = drain(reader).finally(() => {
        reader.releaseLock();
      });
      const duplicate = await f.command(["--run-queue"]);
      expect(duplicate.exitCode).toBe(0);
      expect(duplicate.stdout.toString()).toContain("runner already active");
      expect(await f.log()).toEqual([]);
      expect(await readFile(join(state, "queue.jsonl"), "utf8")).not.toContain(
        '"kind":"start"',
      );
      held.release();
      const [code, out, err] = await Promise.all([child.exited, rest, stderr]);
      expect(code, out + err).toBe(0);
      expect(
        (await f.log()).filter((event) => event[1] === "commit"),
      ).toHaveLength(1);
      expect(await pathExists(join(state, "runner.lock"))).toBe(false);
    },
    LAND_FORMATTER_TEST_TIMEOUT_MS,
  );

  test("queued work lands without waiting for a dirty main checkout", async () => {
    const f = await fixture();
    await writeFile(join(f.worker, "delete.txt"), "queued change\n");
    await writeFile(join(f.main, "keep.txt"), "owner uncommitted work\n");
    expect(
      (
        await f.command([
          "--enqueue",
          f.worker,
          "-m",
          "Dirty main is independent",
        ])
      ).exitCode,
    ).toBe(0);
    const result = await f.command(["--run-queue"]);
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(result.stdout.toString()).not.toContain("waiting for a clean main");
    expect(await readFile(join(f.main, "keep.txt"), "utf8")).toBe(
      "owner uncommitted work\n",
    );
    expect(
      await f.jj(f.main, ["file", "show", "-r", "alpha", "delete.txt"]),
    ).toBe("queued change");
    expect(
      await f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"]),
    ).toBe("keep content");
  });
});

test("a missing or timed-out doctor cannot report healthy counts", () => {
  expect(doctorReport(undefined)).toMatchObject({
    pass: 0,
    fail: 1,
    status: "ok (doctor FAIL 1)",
  });
  expect(doctorReport("__LAND_DOCTOR_EXIT_124__").lines).toContain(
    "FAIL doctor: timeout after 90s",
  );
  expect(
    doctorReport(
      "[doctor] FAIL fixture drift\n[doctor] RESULT: FAIL · FAIL 1 · WARN 0 · PASS 2 · SKIP 0\n__LAND_DOCTOR_EXIT_1__",
    ),
  ).toMatchObject({
    pass: 2,
    fail: 1,
    lines: ["FAIL fixture drift"],
  });
});

// Drain both pipes while waiting for the bounded subprocess.
async function runProcess(
  argv: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    stdin?: "ignore";
    stdout?: "pipe";
    stderr?: "pipe";
  } = {},
) {
  const child = Bun.spawn(argv, {
    ...options,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeout ?? 120_000,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).arrayBuffer(),
    child.exited,
  ]);
  return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode };
}

test("shared preset refuses a red consumer before commit; compliant consumer lands the same candidate", async () => {
  const f = await fixture();
  const consumer = join(f.env.HOME, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "code"), "legacy");
  await writeFile(
    join(consumer, "gate.ts"),
    `const rule = await Bun.file('rule').text(); const code = await Bun.file('code').text(); await Bun.write('gate-ran', 'scratch'); if (rule === 'strict' && code === 'legacy') { process.stderr.write('lint:fixture: consumer code is incompatible\\n'); process.exit(7); }`,
  );
  await f.jj(consumer, ["git", "init", "--colocate"]);
  await f.jj(consumer, ["commit", "-m", "consumer fixture"]);
  await f.jj(consumer, ["bookmark", "create", "alpha", "-r", "@-"]);
  await mkdir(join(f.worker, "presets/demo"), { recursive: true });
  await mkdir(join(f.worker, "presets/src"), { recursive: true });
  await writeFile(join(f.worker, "presets/demo/rule"), "strict");
  await writeFile(
    join(f.worker, "presets/demo/preset.toml"),
    'files = [{source = "rule", destination = "rule"}]',
  );
  await writeFile(
    join(f.worker, "presets/src/cli.ts"),
    `await Bun.write(Bun.argv.at(-1) + '/rule', 'strict');`,
  );
  await writeFile(
    join(f.worker, "presets/consumers.toml"),
    `[[consumers]]\nname = "fixture-consumer"\nroot = ${JSON.stringify(consumer)}\ntrunk = "alpha"\nsetup = ["true"]\nsurfaces = ["presets/demo"]\ncommand = [${JSON.stringify(process.execPath)}, "gate.ts"]\ntimeout_ms = 10000\n`,
  );
  const refused = await f.land();
  expect(refused.exitCode).toBe(1);
  expect(refused.stdout.toString()).toContain("FAIL fixture-consumer");
  expect(refused.stdout.toString()).toContain(
    "lint:fixture: consumer code is incompatible",
  );
  expect((await f.log()).some((args) => args[1] === "commit")).toBe(false);
  expect(await Bun.file(join(consumer, "gate-ran")).exists()).toBe(false);
  expect(await Bun.file(join(f.main, "presets/demo/rule")).exists()).toBe(
    false,
  );
  const before = await f.jj(f.main, [
    "log",
    "-r",
    "alpha",
    "--no-graph",
    "-T",
    "commit_id",
  ]);
  await writeFile(join(consumer, "code"), "compliant");
  await f.jj(consumer, ["commit", "-m", "compliant consumer fixture"]);
  await f.jj(consumer, ["bookmark", "set", "alpha", "-r", "@-"]);
  const landed = await f.land();
  expect(landed.exitCode).toBe(0);
  expect(landed.stdout.toString()).toContain("PASS fixture-consumer");
  expect(
    await f.jj(f.main, ["log", "-r", "alpha", "--no-graph", "-T", "commit_id"]),
  ).not.toBe(before);
  expect(await Bun.file(join(consumer, "gate-ran")).exists()).toBe(false);
});

test("land skips general consumer checks for changes outside shared surfaces", async () => {
  const f = await fixture();
  await writeFile(join(f.worker, "keep.txt"), "unrelated edit\n");
  const landed = await f.land();
  expect(landed.exitCode).toBe(0);
  expect(landed.stdout.toString()).toContain(
    "SKIP consumer gates: no shared surface changed",
  );
});

test("workspace preflight trusts listing judgments despite conflicting private legacy files", async () => {
  const root = await mkdtemp(join(tmpdir(), "land-c2-only-"));
  temporary.push(root);
  const workspace = join(root, "workspace");
  const state = join(root, "state");
  await mkdir(workspace);
  await mkdir(join(state, "legacy-v1"), { recursive: true });
  await writeFile(
    join(state, "legacy-v1", "runs.jsonl"),
    JSON.stringify({
      kind: "run",
      run_id: "private-decoy",
      cwd: workspace,
      ticket: { name: "must-not-appear" },
    }) + "\n",
  );
  await writeFile(
    join(state, "legacy-v1", "lifecycle.jsonl"),
    "invalid private state\n",
  );
  const bin = await writeAgxLsFixture(
    root,
    `process.stdout.write(JSON.stringify([{id: "public-run", ticket: "public-ticket", workspace: ${JSON.stringify(workspace)}, started_at: "2026-10-24T00:00:00Z", judgment: {decision: "reject"}, progress: null}]));`,
  );
  await withProcessEnv(
    { AGX_STATE_DIR: state, PATH: pathWithFixture(bin) },
    async () => {
      const result = await workspacePreflightVerdicts(workspace, root);
      expect(result.isOk()).toBe(true);
      if (result.isOk())
        expect(result.value).toEqual([
          { ticket: "public-ticket", run_id: "public-run", accept: false },
        ]);
    },
  );
});
