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
import { basename, dirname, join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import { packageBinProblems } from "../land.ts";
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
  await mkdir(join(root, "tools", "agx"), { recursive: true });
  await writeFile(
    join(root, "tools", "agx", "package.json"),
    `${JSON.stringify({ name: "agx", version }, null, 2)}\n`,
  );
}
async function writeToolChangelog(root: string, entry: string): Promise<void> {
  await writeFile(
    join(root, "tools", "agx", "CHANGELOG.md"),
    `# Changelog\n\n## ${entry}\n\n- entry\n\n## 1.0.0 — 2026-10-01\n\n- initial\n`,
  );
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

async function fixture() {
  const temp = await mkdtemp(join(tmpdir(), "land-test-"));
  temporary.push(temp);
  const main = join(temp, "main");
  const worker = join(temp, "dotfiles-arm-worker");
  const events = join(temp, "events");
  const env = {
    ...process.env,
    HOME: temp,
    JJ_CONFIG: join(temp, "config.toml"),
    JJ_USER: "Landing Test",
    JJ_EMAIL: "land@example.test",
    JJ_EDITOR: "true",
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: transpilerCache,
    LAND_EVENTS: events,
    AGX_STATE_DIR: join(temp, "agx-state"),
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
  await mkdir(join(main, "tools/agx-run/src/next"), { recursive: true });
  await writeFile(
    join(main, "tools/agx-run/package.json"),
    JSON.stringify({ bin: { "agx-run": "src/next/cli.ts" } }),
  );
  await writeFile(
    join(main, "tools/agx-run/src/next/cli.ts"),
    '#!/usr/bin/env bun\nprocess.stdout.write("[]\\n");\n',
  );
  await chmod(join(main, "tools/agx-run/src/next/cli.ts"), 0o755);
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
if (argv[1] === 'usehooks:consumers') { process.stdout.write('PASS fixture consumer\\n'); process.exit(process.env.LAND_FAIL_CONSUMERS === '1' ? 1 : 0); }
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
const runLog = join(process.env.AGX_STATE_DIR, 'runs.jsonl');
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
  appendFileSync(join(process.env.AGX_STATE_DIR, 'runs.jsonl'), JSON.stringify(record) + '\\n');
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
  test("moved entry uses landed code while the installed bin still points at the old path", async () => {
    const f = await fixture();
    const installed = join(dirname(f.main), "agx-run");
    await mkdir(f.env.AGX_STATE_DIR, { recursive: true });
    await symlink(join(f.main, "tools/agx-run/src/next/cli.ts"), installed);
    await rename(
      join(f.worker, "tools/agx-run/src/next/cli.ts"),
      join(f.worker, "tools/agx-run/src/next/moved.ts"),
    );
    await writeFile(
      join(f.worker, "tools/agx-run/package.json"),
      JSON.stringify({ bin: { "agx-run": "src/next/moved.ts" } }),
    );
    await writeFile(
      join(f.worker, "tools/agx-run/src/next/moved.ts"),
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
    expect(output).toContain("[land] landed: recorded 1 run(s)");
    expect(output).not.toContain("FAIL");
    expect(output).not.toContain("rollback:");
    const lander = join(
      f.env.AGX_STATE_DIR,
      "land",
      basename(landStateDir(await realpath(f.main))),
      "workspace",
    );
    expect((await f.log()).filter((event) => event[0] === "landed-ls")).toEqual(
      [
        [
          "landed-ls",
          join(lander, "tools/agx-run/src/next/moved.ts"),
          "ls",
          "--json",
        ],
      ],
    );
    expect(await pathExists(installed)).toBe(false);
    expect(
      await readFile(join(lander, "tools/agx-run/src/next/moved.ts"), "utf8"),
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
    expect(
      await readFile(join(f.env.AGX_STATE_DIR, "runs.jsonl"), "utf8"),
    ).toContain('"run_id":"moved-run"');
  });

  test("a post-push bookkeeping failure never restores checkout paths", async () => {
    const f = await fixture();
    await writeFile(
      join(f.worker, "tools/agx-run/src/next/cli.ts"),
      "#!/usr/bin/env bun\nprocess.stderr.write('fixture bookkeeping failure'); process.exit(9);\n",
    );
    const result = await f.land();
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain("[land] landed: FAIL");
    expect(result.stdout.toString()).toContain("landed and pushed");
    expect(result.stdout.toString()).not.toContain("rollback:");
    expect(
      await readFile(join(f.main, "tools/agx-run/src/next/cli.ts"), "utf8"),
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

  test("usehooks changes check consumers before commit and refuse hook errors", async () => {
    const f = await fixture();
    await mkdir(join(f.worker, "tools/agx-usehooks/src"), { recursive: true });
    await writeFile(
      join(f.worker, "tools/agx-usehooks/src/index.ts"),
      "export const fixture = true;\n",
    );
    const refused = await f.land([], { LAND_FAIL_CONSUMERS: "1" });
    expect(refused.exitCode).toBe(1);
    const refusedLog = await f.log();
    expect(refusedLog.some((args) => args[1] === "usehooks:consumers")).toBe(
      true,
    );
    expect(refusedLog.some((args) => args[1] === "commit")).toBe(false);
    expect(
      await pathExists(join(f.main, "tools/agx-usehooks/src/index.ts")),
    ).toBe(false);
  });
  test("passing consumer gate precedes land commit", async () => {
    const f = await fixture();
    await mkdir(join(f.worker, "tools/agx-usehooks/src"), { recursive: true });
    await writeFile(
      join(f.worker, "tools/agx-usehooks/src/index.ts"),
      "export const fixture = true;\n",
    );
    const landed = await f.land();
    expect(landed.exitCode).toBe(0);
    const log = await f.log();
    const consumer = log.findIndex((args) => args[1] === "usehooks:consumers");
    expect(consumer).toBeGreaterThanOrEqual(0);
    expect(log.findIndex((args) => args[1] === "commit")).toBeGreaterThan(
      consumer,
    );
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
    await mkdir(join(f.worker, "tools", "agx", ".changes"), {
      recursive: true,
    });
    await writeFile(
      join(f.worker, "tools", "agx", ".changes", "worker-ticket.md"),
      "---\nbump: minor\n---\n\nAdd a worker-ticket feature\n",
    );
    await f.jj(f.worker, ["status"]);
    await mkdir(join(f.main, "tools", "agx", ".changes"), { recursive: true });
    await writeFile(
      join(f.main, "tools", "agx", ".changes", "prior-ticket.md"),
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
        "tools/agx/package.json",
      ]),
    ).toContain('"version": "1.1.0"');
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/agx/CHANGELOG.md",
      ]),
    ).toContain("- Fix a prior-ticket issue");
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/agx/CHANGELOG.md",
      ]),
    ).toContain("- Add a worker-ticket feature");
    expect(result.stdout.toString()).toContain(
      "agx 1.1.0 (1 changeset entries)",
    );
  });

  test("commits release outputs but omits a workspace-added consumed changeset", async () => {
    const f = await fixture();
    await writeToolPackage(f.main, "1.0.0");
    await writeToolChangelog(f.main, "1.0.0 — 2026-10-01");
    await f.jj(f.main, ["commit", "-m", "add agx release fixture"]);
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
    const change = "tools/agx/.changes/workspace-feature.md";
    await mkdir(join(f.worker, "tools", "agx", ".changes"), {
      recursive: true,
    });
    await writeFile(
      join(f.worker, change),
      "---\nbump: minor\n---\n\nAdd a workspace feature\n",
    );
    await writeFile(join(f.worker, "tools", "agx", "src.ts"), "export {}\n");

    const result = await f.land();

    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    const commit = (await f.log()).find((event) => event[1] === "commit");
    expect(commit).toBeDefined();
    const committedPaths = commit?.slice((commit?.lastIndexOf("--") ?? -1) + 1);
    expect(committedPaths).toContain("tools/agx/src.ts");
    expect(committedPaths).toContain("tools/agx/package.json");
    expect(committedPaths).toContain("tools/agx/CHANGELOG.md");
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
        "tools/agx/package.json",
      ]),
    ).toContain('"version": "1.1.0"');
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/agx/CHANGELOG.md",
      ]),
    ).toContain("- Add a workspace feature");
  });

  test("commits deletion of a consumed changeset that existed in the base", async () => {
    const f = await fixture();
    await writeToolPackage(f.main, "1.0.0");
    await writeToolChangelog(f.main, "1.0.0 — 2026-10-01");
    const change = "tools/agx/.changes/base-feature.md";
    await mkdir(join(f.main, "tools", "agx", ".changes"), {
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
    await writeFile(join(f.worker, "tools", "agx", "src.ts"), "export {}\n");

    const result = await f.land();

    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    const commit = (await f.log()).find((event) => event[1] === "commit");
    expect(commit).toBeDefined();
    const committedPaths = commit?.slice((commit?.lastIndexOf("--") ?? -1) + 1);
    expect(committedPaths).toContain("tools/agx/src.ts");
    expect(committedPaths).toContain("tools/agx/package.json");
    expect(committedPaths).toContain("tools/agx/CHANGELOG.md");
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
        "tools/agx/package.json",
      ]),
    ).toContain('"version": "1.0.1"');
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/agx/CHANGELOG.md",
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

  test("land requires an existing accept judgment and records a landed row", async () => {
    const f = await fixture();
    const state = join(f.main, "..", "agx-state");
    await mkdir(state, { recursive: true });
    await appendFile(
      join(state, "runs.jsonl"),
      `${JSON.stringify({ kind: "run", run_id: "run-from-workspace", cwd: f.worker, ticket: { name: "landsplit" } })}\n`,
    );
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    const refused = await f.land([], { LAND_NO_ACCEPT: "1" });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout.toString()).toContain(
      'agx judge run-from-workspace accept --note "<reason>"',
    );
    expect(
      (await f.log()).some(
        (event) => event[0] === "run" && event[1] === "commit",
      ),
    ).toBe(false);
    await appendAcceptance(state, "run-from-workspace");
    const result = await f.land();
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    const lines = (await readFile(join(state, "runs.jsonl"), "utf8"))
      .trim()
      .split("\n");
    const landing = jsonOf(
      z.looseObject({
        kind: z.string(),
        run_id: z.string(),
      }),
    ).safeParse(lines.at(-1) ?? "");
    expect(landing.success ? landing.data : undefined).toMatchObject({
      kind: "landed",
      run_id: "run-from-workspace",
    });
    expect((await f.log()).filter((event) => event[0] === "agx")).toEqual([]);
  });

  test("accept judgment on the latest run in the workspace ticket lineage is sufficient", async () => {
    const f = await fixture();
    const state = join(f.main, "..", "agx-state");
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
    const state = join(f.main, "..", "agx-state");
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

  test("land preflight reads an accepted judgment from agx ls records", async () => {
    const f = await fixture();
    const state = join(f.main, "agx-next-state");
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
    const result = await f.land([], { AGX_NEXT_STATE_DIR: state });
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
    const state = join(f.main, "..", "agx-state");
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
      'ticket landsplit has no current accept judgment; import legacy runs if needed with `agx stats --import-legacy`, inspect `agx ls --json`, then judge run `landsplit-resume` with `agx judge landsplit-resume accept --note "<reason>"`',
    );
    expect(
      (await f.log()).some(
        (event) => event[0] === "run" && event[1] === "commit",
      ),
    ).toBe(false);
  });

  test("land prints the agx judge command with supplied review context", async () => {
    const f = await fixture();
    const state = join(f.main, "..", "agx-state");
    await mkdir(state, { recursive: true });
    await appendFile(
      join(state, "runs.jsonl"),
      `${JSON.stringify({ kind: "run", run_id: "reviewed-run", cwd: f.worker, ticket: { name: "reviewed" } })}\n`,
    );
    await writeFile(join(f.worker, "keep.txt"), "worker version\n");
    const refused = await f.land(["--review", "independent-review"], {
      LAND_NO_ACCEPT: "1",
    });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout.toString()).toContain(
      'agx judge reviewed-run accept --note "independent review independent-review"',
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
    const state = join(f.main, "..", "agx-state");
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
    expect(await readFile(join(state, "runs.jsonl"), "utf8")).toContain(
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

    expect(result.exitCode).toBe(0);
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

  test("LAND-OWN-TREE refuses its dirty tree with exact paths before rebase", async () => {
    const f = await fixture();
    const state = join(
      f.env.AGX_STATE_DIR,
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
    await mkdir(join(f.worker, "tools", "agx", ".changes"), {
      recursive: true,
    });
    await writeFile(
      join(f.worker, "tools", "agx", ".changes", "no-blank.md"),
      "---\nbump: patch\n---\nAccept delimiters without a blank line\n",
    );
    await writeFile(
      join(f.worker, "tools", "agx", ".changes", "no-delimiters.md"),
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
        "tools/agx/package.json",
      ]),
    ).toContain('"version": "1.0.1"');
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/agx/CHANGELOG.md",
      ]),
    ).toContain("- Accept delimiters without a blank line");
    expect(
      await f.jj(f.main, [
        "file",
        "show",
        "-r",
        "alpha",
        "tools/agx/CHANGELOG.md",
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
      await mkdir(f.env.AGX_STATE_DIR, { recursive: true });
      await appendFile(
        join(f.env.AGX_STATE_DIR, "runs.jsonl"),
        `${JSON.stringify({ kind: "run", run_id: "queued-run", cwd: second, ticket: { name: "queued" } })}\n`,
      );
      await appendAcceptance(f.env.AGX_STATE_DIR, "queued-run");
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
      // State belongs to this isolated fixture, rather than the test runner's own AGX state.
      const actualState = join(f.env.AGX_STATE_DIR, "land", basename(state));
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
        f.env.AGX_STATE_DIR,
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
