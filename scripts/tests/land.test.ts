import { afterEach, describe, expect, test as bunTest } from "bun:test";
import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import { packageBinProblems } from "../land.ts";
import { landStateDir } from "../land-queue.ts";
import { doctorReport } from "../land-doctor.ts";
import { applyToolChangesets } from "../land-changesets.ts";
import { tryAcquire } from "../../tools/shared/src/dir-lock.ts";

const script = join(import.meta.dir, "../land.ts");
const REPO = join(import.meta.dir, "../..");
const temporary: string[] = [];
// These JJ integration fixtures exceed Bun's default 5s under suite load; retain a finite 12s bound.
const LAND_FORMATTER_TEST_TIMEOUT_MS = 12_000;
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
function writeToolPackage(root: string, version: string): void {
  mkdirSync(join(root, "tools", "agx"), { recursive: true });
  writeFileSync(
    join(root, "tools", "agx", "package.json"),
    `${JSON.stringify({ name: "agx", version }, null, 2)}\n`,
  );
}
function writeToolChangelog(root: string, entry: string): void {
  writeFileSync(
    join(root, "tools", "agx", "CHANGELOG.md"),
    `# Changelog\n\n## ${entry}\n\n- entry\n\n## 1.0.0 — 2026-10-01\n\n- initial\n`,
  );
}
function appendAcceptance(state: string, runId: string, accept = true): void {
  appendFileSync(
    join(state, "runs.jsonl"),
    `${JSON.stringify({ kind: "acceptance", run_id: runId, accept })}\n`,
  );
}
afterEach(() => {
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});

test("package bin targets must be executable and start with a shebang", async () => {
  const root = mkdtempSync(join(tmpdir(), "land-bin-test-"));
  temporary.push(root);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ bin: { sample: "src/main.ts" } }),
  );
  const target = join(root, "src/main.ts");
  writeFileSync(target, "#!/usr/bin/env bun\nprocess.exit(0);\n");
  chmodSync(target, 0o755);
  expect(await packageBinProblems(root)).toEqual([]);
  chmodSync(target, 0o644);
  expect(await packageBinProblems(root)).toContain(
    "src/main.ts: target is not executable",
  );
  writeFileSync(target, "process.exit(0);\n");
  chmodSync(target, 0o755);
  expect(await packageBinProblems(root)).toContain(
    "src/main.ts: target has no shebang",
  );
});

test("every repository package bin target is executable and has a shebang", async () => {
  expect(await packageBinProblems(REPO)).toEqual([]);
});

function fixture() {
  const temp = mkdtempSync(join(tmpdir(), "land-test-"));
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
    LAND_EVENTS: events,
    AGX_STATE_DIR: join(temp, "agx-state"),
    LAND_EXPECT_WORKSPACE: worker,
  };
  writeFileSync(
    env.JJ_CONFIG,
    '[user]\nname = "Landing Test"\nemail = "land@example.test"\n',
  );
  function jj(cwd: string, argv: string[]) {
    const result = Bun.spawnSync(
      ["jj", "--no-pager", "--color", "never", ...argv],
      { cwd, env, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
    );
    expect(`${result.exitCode}: ${result.stderr.toString()}`).toStartWith("0:");
    return result.stdout.toString().trim();
  }
  function git(cwd: string, argv: string[]) {
    const result = Bun.spawnSync(["git", ...argv], {
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 30_000,
    });
    expect(`${result.exitCode}: ${result.stderr.toString()}`).toStartWith("0:");
    return result.stdout.toString().trim();
  }
  jj(temp, ["git", "init", "--colocate", main]);
  writeFileSync(join(main, "old name.txt"), "rename content\n");
  writeFileSync(join(main, "delete.txt"), "delete content\n");
  writeFileSync(join(main, "keep.txt"), "keep content\n");
  writeFileSync(join(main, "untouched.ts"), "const untouched = true;\n");
  writeFileSync(join(main, "remove.md"), "# Remove\n");
  jj(main, ["commit", "-m", "base"]);
  jj(main, ["bookmark", "set", "alpha", "-r", "@-"]);
  const origin = join(temp, "origin.git");
  git(temp, ["init", "--bare", origin]);
  jj(main, ["git", "remote", "add", "origin", origin]);
  jj(main, ["git", "push", "--bookmark", "alpha", "--remote", "origin"]);
  jj(main, ["git", "fetch", "--remote", "origin"]);
  writeFileSync(
    join(origin, "hooks", "pre-receive"),
    '#!/bin/sh\n[ "${LAND_FAIL_PUSH:-0}" = 1 ] && exit 1\nexit 0\n',
  );
  chmodSync(join(origin, "hooks", "pre-receive"), 0o755);
  jj(main, [
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
  writeFileSync(
    mise,
    `#!${process.execPath}\nimport { appendFileSync, writeSync } from 'node:fs';
appendFileSync(process.env.LAND_EVENTS, JSON.stringify(process.argv.slice(2)) + '\\n');
const argv = process.argv.slice(2);
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
  writeFileSync(
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
  writeFileSync(
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
  chmodSync(mise, 0o755);
  chmodSync(ssh, 0o755);
  chmodSync(agx, 0o755);
  for (const formatter of ["bunx", "rumdl", "shfmt"]) {
    const path = join(temp, formatter);
    writeFileSync(
      path,
      `#!${process.execPath}\nimport { appendFileSync } from 'node:fs';
appendFileSync(process.env.LAND_EVENTS, JSON.stringify(['format', '${formatter}', ...process.argv.slice(2)]) + '\\n');\n`,
    );
    chmodSync(path, 0o755);
  }
  function command(
    args: string[],
    extraEnv: Record<string, string> = {},
    cwd = main,
  ) {
    return Bun.spawnSync([process.execPath, script, ...args], {
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
  function land(
    args: string[] = [],
    extraEnv: Record<string, string> = {},
    cwd = main,
    workspace = "dotfiles-arm-worker",
  ) {
    return command([workspace, "-m", "Land test", ...args], extraEnv, cwd);
  }
  function log(): string[][] {
    if (!existsSync(events)) return [];
    return readFileSync(events, "utf8")
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
      signal: AbortSignal.timeout(20_000),
    });
  }
  return { main, worker, origin, jj, git, land, command, start, log, env };
}

function digest(root: string): string {
  const hash = new Bun.CryptoHasher("sha256");
  function visit(path: string): void {
    for (const entry of readdirSync(path).toSorted()) {
      const child = join(path, entry);
      hash.update(child.slice(root.length));
      if (statSync(child).isDirectory()) visit(child);
      else hash.update(readFileSync(child));
    }
  }
  visit(root);
  return hash.digest("hex");
}

describe("land workspace", () => {
  test("workspace name and relative path resolve to the same listed workspace", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "workspace change\n");
    const byName = f.land(["--dry-run"]);
    const byPath = f.land(["--dry-run"], {}, f.main, "../dotfiles-arm-worker");
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

  test("unknown workspace is refused with the known workspace names", () => {
    const f = fixture();
    const result = f.land([], {}, f.main, "not-a-workspace");
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

  test("checks package bin targets in the workspace being landed", () => {
    const f = fixture();
    const packageRoot = join(f.main, "tools", "fixture-bin");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(
      join(packageRoot, "package.json"),
      JSON.stringify({ bin: { "fixture-bin": "src/main.ts" } }),
    );
    mkdirSync(join(packageRoot, "src"), { recursive: true });
    writeFileSync(
      join(packageRoot, "src", "main.ts"),
      "#!/usr/bin/env bun\nprocess.exit(0);\n",
    );
    chmodSync(join(packageRoot, "src", "main.ts"), 0o644);
    f.jj(f.main, ["commit", "-m", "add non-executable fixture bin"]);
    f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    f.jj(f.main, ["workspace", "forget", "dotfiles-arm-worker"]);
    rmSync(f.worker, { recursive: true, force: true });
    f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      "dotfiles-arm-worker",
      "-r",
      "alpha",
      f.worker,
    ]);

    chmodSync(join(f.worker, "tools", "fixture-bin", "src", "main.ts"), 0o755);
    const result = f.land();

    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(
      statSync(join(f.main, "tools", "fixture-bin", "src", "main.ts")).mode &
        0o111,
    ).not.toBe(0);
    expect(result.stdout.toString()).not.toContain("[land] NOT LIVE until:");
    expect(result.stdout.toString()).toContain("[land] summary: ok");
  });

  test("usehooks changes check consumers before commit and refuse hook errors", () => {
    const f = fixture();
    mkdirSync(join(f.worker, "tools/agx-usehooks/src"), { recursive: true });
    writeFileSync(
      join(f.worker, "tools/agx-usehooks/src/index.ts"),
      "export const fixture = true;\n",
    );
    const refused = f.land([], { LAND_FAIL_CONSUMERS: "1" });
    expect(refused.exitCode).toBe(1);
    const refusedLog = f.log();
    expect(refusedLog.some((args) => args[1] === "usehooks:consumers")).toBe(
      true,
    );
    expect(refusedLog.some((args) => args[1] === "commit")).toBe(false);
    expect(existsSync(join(f.main, "tools/agx-usehooks/src/index.ts"))).toBe(
      false,
    );
  });
  test("passing consumer gate precedes land commit", () => {
    const f = fixture();
    mkdirSync(join(f.worker, "tools/agx-usehooks/src"), { recursive: true });
    writeFileSync(
      join(f.worker, "tools/agx-usehooks/src/index.ts"),
      "export const fixture = true;\n",
    );
    const landed = f.land();
    expect(landed.exitCode).toBe(0);
    const log = f.log();
    const consumer = log.findIndex((args) => args[1] === "usehooks:consumers");
    expect(consumer).toBeGreaterThanOrEqual(0);
    expect(log.findIndex((args) => args[1] === "commit")).toBeGreaterThan(
      consumer,
    );
  });
  test("lands disjoint changesets after another ticket released the same tool", () => {
    const f = fixture();
    writeToolPackage(f.main, "1.0.0");
    writeToolChangelog(f.main, "1.0.0 — 2026-10-01");
    f.jj(f.main, ["commit", "-m", "add agx package"]);
    f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    f.jj(f.main, ["workspace", "forget", "dotfiles-arm-worker"]);
    rmSync(f.worker, { recursive: true, force: true });
    f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      "dotfiles-arm-worker",
      "-r",
      "alpha",
      f.worker,
    ]);
    mkdirSync(join(f.worker, "tools", "agx", ".changes"), { recursive: true });
    writeFileSync(
      join(f.worker, "tools", "agx", ".changes", "worker-ticket.md"),
      "---\nbump: minor\n---\nAdd a worker-ticket feature\n",
    );
    f.jj(f.worker, ["status"]);
    mkdirSync(join(f.main, "tools", "agx", ".changes"), { recursive: true });
    writeFileSync(
      join(f.main, "tools", "agx", ".changes", "prior-ticket.md"),
      "---\nbump: patch\n---\nFix a prior-ticket issue\n",
    );
    applyToolChangesets(f.main, "2026-10-10");
    f.jj(f.main, ["commit", "-m", "land prior ticket release"]);
    f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    const result = f.land();
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(
      readFileSync(join(f.main, "tools", "agx", "package.json"), "utf8"),
    ).toContain('"version": "1.1.0"');
    expect(
      readFileSync(join(f.main, "tools", "agx", "CHANGELOG.md"), "utf8"),
    ).toContain("- Fix a prior-ticket issue");
    expect(
      readFileSync(join(f.main, "tools", "agx", "CHANGELOG.md"), "utf8"),
    ).toContain("- Add a worker-ticket feature");
    expect(result.stdout.toString()).toContain(
      "agx 1.1.0 (1 changeset entries)",
    );
  });

  test("accepts the workspace directory basename when its jj name differs", () => {
    const f = fixture();
    f.jj(f.main, ["workspace", "forget", "dotfiles-arm-worker"]);
    rmSync(f.worker, { recursive: true, force: true });
    const aliasPath = join(dirname(f.worker), "dotfiles-arm-bunexec-1010");
    f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      "bunexec-1010",
      "-r",
      "alpha",
      aliasPath,
    ]);
    writeFileSync(join(aliasPath, "keep.txt"), "worker version\n");
    const result = f.land([], {}, f.main, basename(aliasPath));
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(result.stdout.toString()).toContain(
      "[land] workspace: removed bunexec-1010",
    );
    expect(existsSync(aliasPath)).toBe(false);
  });

  test("land requires an existing accept judgment and records a landed row", () => {
    const f = fixture();
    const state = join(f.main, "..", "agx-state");
    mkdirSync(state, { recursive: true });
    appendFileSync(
      join(state, "runs.jsonl"),
      `${JSON.stringify({ kind: "run", run_id: "run-from-workspace", cwd: f.worker, ticket: { name: "landsplit" } })}\n`,
    );
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const refused = f.land([], { LAND_NO_ACCEPT: "1" });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout.toString()).toContain(
      'agx judge run-from-workspace accept --note "<reason>"',
    );
    expect(
      f.log().some((event) => event[0] === "run" && event[1] === "commit"),
    ).toBe(false);
    appendAcceptance(state, "run-from-workspace");
    const result = f.land();
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    const lines = readFileSync(join(state, "runs.jsonl"), "utf8")
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
    expect(f.log().filter((event) => event[0] === "agx")).toEqual([]);
  });

  test("accept judgment on the latest run in the workspace ticket lineage is sufficient", () => {
    const f = fixture();
    const state = join(f.main, "..", "agx-state");
    mkdirSync(state, { recursive: true });
    appendFileSync(
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
    writeFileSync(join(f.worker, "keep.txt"), "workspace lineage change\n");
    const result = f.land([], {
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
    expect(f.log().filter((event) => event[0] === "agx")).toEqual([]);
    expect(result.stdout.toString()).toContain(
      "judgment: ok 1 accepted ticket lineage(s)",
    );
  });

  test("an unreported stopped predecessor does not block an accepted latest run", () => {
    const f = fixture();
    const state = join(f.main, "..", "agx-state");
    mkdirSync(state, { recursive: true });
    appendFileSync(
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
    writeFileSync(
      join(state, "lifecycle.jsonl"),
      `${JSON.stringify({
        type: "judged",
        run_id: "landsplit-amended",
        decision: "accept",
        at: "2026-10-13T08:25:10.000Z",
      })}\n`,
    );
    writeFileSync(join(f.worker, "keep.txt"), "accepted amended run\n");
    const result = f.land();
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(f.log().filter((event) => event[0] === "agx")).toEqual([]);
    expect(result.stdout.toString()).toContain(
      "judgment: ok 1 accepted ticket lineage(s)",
    );
  });

  test("land preflight reads an accepted judgment from agx ls records", () => {
    const f = fixture();
    const state = join(f.main, "agx-next-state");
    mkdirSync(state, { recursive: true });
    writeFileSync(
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
    writeFileSync(join(f.worker, "keep.txt"), "accepted next run\n");
    const result = f.land([], { AGX_NEXT_STATE_DIR: state });
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(0);
    expect(result.stdout.toString()).toContain(
      "judgment: ok 1 accepted ticket lineage(s)",
    );
  });

  test("a later reject in the same workspace ticket lineage overrides an earlier accept", () => {
    const f = fixture();
    const state = join(f.main, "..", "agx-state");
    mkdirSync(state, { recursive: true });
    appendFileSync(
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
    writeFileSync(join(f.worker, "keep.txt"), "workspace lineage change\n");
    const result = f.land([], {
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
      f.log().some((event) => event[0] === "run" && event[1] === "commit"),
    ).toBe(false);
  });

  test("land prints the agx judge command with supplied review context", () => {
    const f = fixture();
    const state = join(f.main, "..", "agx-state");
    mkdirSync(state, { recursive: true });
    appendFileSync(
      join(state, "runs.jsonl"),
      `${JSON.stringify({ kind: "run", run_id: "reviewed-run", cwd: f.worker, ticket: { name: "reviewed" } })}\n`,
    );
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const refused = f.land(["--review", "independent-review"], {
      LAND_NO_ACCEPT: "1",
    });
    expect(refused.exitCode).toBe(1);
    expect(refused.stdout.toString()).toContain(
      'agx judge reviewed-run accept --note "independent review independent-review"',
    );
    expect(readFileSync(join(state, "runs.jsonl"), "utf8")).not.toContain(
      '"kind":"acceptance","run_id":"reviewed-run"',
    );
  });

  test("dry-run preserves tracked relative symlinks instead of inventing overlap", () => {
    const f = fixture();
    symlinkSync("keep.txt", join(f.main, "relative-link"));
    f.jj(f.main, ["commit", "-m", "Fixture relative link"]);
    f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    f.jj(f.worker, ["rebase", "-r", "@", "-o", "alpha"]);
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land(["--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).not.toContain(
      "dirty main checkout overlaps",
    );
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "keep content\n",
    );
  });

  test("land succeeds without deploying and records no acceptance judgment", () => {
    const f = fixture();
    const state = join(f.main, "..", "agx-state");
    mkdirSync(state, { recursive: true });
    appendFileSync(
      join(state, "runs.jsonl"),
      `${JSON.stringify({ kind: "run", run_id: "deploy-failure-run", cwd: f.worker, ticket: { name: "deploy" } })}\n`,
    );
    appendAcceptance(state, "deploy-failure-run");
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land([], {
      LAND_UNREACHABLE_SSH: "sol",
      LAND_ASSERT_DEPLOY_PRECONDITION: "1",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).not.toContain("[land] deploy:");
    expect(existsSync(f.worker)).toBe(false);
    expect(f.log().filter((event) => event[0] === "ssh")).toEqual([]);
    expect(readFileSync(join(state, "runs.jsonl"), "utf8")).toContain(
      '"kind":"landed","run_id":"deploy-failure-run"',
    );
    expect(
      readFileSync(join(state, "runs.jsonl"), "utf8").match(
        /"kind":"acceptance","run_id":"deploy-failure-run"/gu,
      ),
    ).toHaveLength(1);
  });

  test("invocation in a worker checkout discovers the main checkout", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land([], {}, f.worker);
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "worker version\n",
    );
    expect(existsSync(f.worker)).toBe(false);
  });

  test(
    "formatters get only existing changed paths and run before commit",
    () => {
      const f = fixture();
      writeFileSync(join(f.worker, "added.ts"), "const added=1;\n");
      writeFileSync(join(f.worker, "added.md"), "# Added\n");
      writeFileSync(join(f.worker, "added.sh"), "echo added\n");
      writeFileSync(join(f.worker, "added.zsh"), 'print -r -- "${(q)HOME}"\n');
      rmSync(join(f.worker, "remove.md"));
      const result = f.land();
      expect(result.exitCode).toBe(0);
      expect(f.log().slice(0, 3)).toEqual([
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
      expect(f.log()[3]?.slice(0, 2)).toEqual(["run", "commit"]);
      expect(
        f
          .log()
          .filter((event) => event[0] === "format")
          .flat(),
      ).not.toContain("./added.zsh");
    },
    LAND_FORMATTER_TEST_TIMEOUT_MS,
  );

  test(
    "rename reports and commits both paths as exact argv without deployment",
    () => {
      const f = fixture();
      renameSync(
        join(f.worker, "old name.txt"),
        join(f.worker, "new name.txt"),
      );
      writeFileSync(join(f.main, "keep.txt"), "unrelated dirty main\n");
      const result = f.land();
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toContain(
        '[land] paths: ok ["new name.txt","old name.txt"]',
      );
      expect(existsSync(join(f.main, "old name.txt"))).toBe(false);
      expect(readFileSync(join(f.main, "new name.txt"), "utf8")).toBe(
        "rename content\n",
      );
      expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
        "unrelated dirty main\n",
      );
      expect(f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"])).toBe(
        "keep content",
      );
      expect(f.log()[0]).toEqual([
        "run",
        "commit",
        "--",
        "-m",
        "Land test",
        "--",
        "new name.txt",
        "old name.txt",
      ]);
      expect(f.log().filter((event) => event[0] === "ssh")).toEqual([]);
      expect(result.stdout.toString()).not.toContain("hosts=");
      expect(result.stdout.toString()).toMatch(/summary: ok commit=[0-9a-f]+/u);
    },
    LAND_FORMATTER_TEST_TIMEOUT_MS,
  );

  test("a deletion is landed and committed", () => {
    const f = fixture();
    rmSync(join(f.worker, "delete.txt"));
    const result = f.land();
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(f.main, "delete.txt"))).toBe(false);
    expect(f.jj(f.main, ["file", "list", "-r", "alpha"])).not.toContain(
      "delete.txt",
    );
  });

  test("dirty main overlap is refused with its path before rebase or restore", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    writeFileSync(join(f.main, "keep.txt"), "main version\n");
    const result = f.land();
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain(
      '[land] preflight: FAIL dirty main checkout overlaps: ["keep.txt"]',
    );
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "main version\n",
    );
    expect(f.log()).toEqual([]);
  });

  test("commit refusal preserves hook output and stops before deploy", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land([], {
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
    expect(f.log()).toHaveLength(1);
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "keep content\n",
    );
    expect(f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"])).toBe(
      "keep content",
    );
  });

  test("a failed push retains the successful commit verdict and does not deploy", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land([], { LAND_FAIL_PUSH: "1" });
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain("[land] commit: ok");
    expect(result.stdout.toString()).toContain("[land] push: FAIL");
    expect(result.stdout.toString()).not.toContain("landed and pushed");
    expect(f.log().filter((event) => event[0] === "ssh")).toEqual([]);
  });

  test("fetches and rebases onto an origin advance made after the land commit", () => {
    const f = fixture();
    const competitor = join(dirname(f.main), "competitor");
    f.jj(dirname(f.main), ["git", "clone", "--colocate", f.origin, competitor]);
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land([], {
      LAND_ADVANCE_ORIGIN: "1",
      LAND_COMPETITOR: competitor,
      LAND_ADVANCE_PATH: "origin-advanced.txt",
    });
    expect(
      result.exitCode,
      result.stderr.toString() + result.stdout.toString(),
    ).toBe(0);
    const local = f.jj(f.main, [
      "log",
      "--no-graph",
      "-r",
      "alpha",
      "-T",
      "commit_id",
    ]);
    const remote = f.jj(f.main, [
      "log",
      "--no-graph",
      "-r",
      "alpha@origin",
      "-T",
      "commit_id",
    ]);
    expect(local).toBe(remote);
    expect(
      f.jj(f.main, ["file", "show", "-r", "alpha", "origin-advanced.txt"]),
    ).toBe("origin advanced");
    expect(f.jj(f.main, ["file", "show", "-r", "alpha", "keep.txt"])).toBe(
      "worker version",
    );
    expect(result.stdout.toString()).toContain("[land] push: ok");
  });

  test("a push rebase conflict names files and restores both workspaces", () => {
    const f = fixture();
    const competitor = join(dirname(f.main), "competitor");
    f.jj(dirname(f.main), ["git", "clone", "--colocate", f.origin, competitor]);
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    const result = f.land([], {
      LAND_ADVANCE_ORIGIN: "1",
      LAND_COMPETITOR: competitor,
      LAND_ADVANCE_PATH: "keep.txt",
      LAND_ADVANCE_CONTENT: "origin version\n",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain('conflicted on ["keep.txt"]');
    expect(result.stdout.toString()).toContain("workspace restored");
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "worker version\n",
    );
    expect(readFileSync(join(f.worker, "keep.txt"), "utf8")).toBe(
      "worker version\n",
    );
    expect(
      f.jj(f.main, ["log", "--no-graph", "-r", "alpha", "-T", "conflict"]),
    ).toBe("false");
    expect(f.log().filter((event) => event[0] === "ssh")).toEqual([]);
  });

  test("dry-run includes unsnapshotted changes and changes neither files nor metadata", () => {
    const f = fixture();
    writeFileSync(
      join(f.main, ".jj", "repo", "store", "git_target"),
      join(f.main, ".git"),
    );
    renameSync(join(f.worker, "old name.txt"), join(f.worker, "new name.txt"));
    rmSync(join(f.worker, "delete.txt"));
    writeFileSync(join(f.main, "keep.txt"), "unrelated dirty main\n");
    const before = [digest(f.main), digest(f.worker)];
    const result = f.land(["--dry-run"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(
      '[land] paths: ok ["delete.txt","new name.txt","old name.txt"]',
    );
    expect([digest(f.main), digest(f.worker)]).toEqual(before);
    expect(f.log()).toEqual([]);
  });

  test("rebase conflict refuses before restore and deploy", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    f.jj(f.worker, ["status"]);
    writeFileSync(join(f.main, "keep.txt"), "alpha version\n");
    f.jj(f.main, ["commit", "-m", "advance alpha"]);
    f.jj(f.main, ["bookmark", "set", "alpha", "-r", "@-"]);
    const result = f.land();
    expect(result.exitCode).toBe(1);
    expect(result.stdout.toString()).toContain(
      "[land] rebase: FAIL rebase introduced conflicts",
    );
    expect(f.log()).toEqual([]);
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "alpha version\n",
    );
  });

  test("queued landing records only land outcomes and never deploys", () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    expect(
      f.command(["--enqueue", f.worker, "-m", "Queue without deploy"]).exitCode,
    ).toBe(0);
    const result = f.command(["--run-queue"], { LAND_FAIL_SSH: "sol" });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain("OK " + f.worker);
    expect(f.log().filter((event) => event[0] === "ssh")).toEqual([]);
    const status = f.command(["--queue-status"]).stdout.toString();
    expect(status).toContain('"commit": "ok"');
    expect(status).toContain('"push": "ok"');
    expect(status).not.toContain('"hosts"');
  });

  test("the queue lands two items serially, records a failure, and continues", () => {
    const f = fixture();
    const second = join(dirname(f.worker), "second-worker");
    f.jj(f.main, [
      "workspace",
      "add",
      "--name",
      "second",
      "-r",
      "alpha",
      second,
    ]);
    writeFileSync(join(f.worker, "keep.txt"), "failed worker\n");
    writeFileSync(join(second, "delete.txt"), "successful worker\n");
    mkdirSync(f.env.AGX_STATE_DIR, { recursive: true });
    appendFileSync(
      join(f.env.AGX_STATE_DIR, "runs.jsonl"),
      `${JSON.stringify({ kind: "run", run_id: "queued-run", cwd: second, ticket: { name: "queued" } })}\n`,
    );
    appendAcceptance(f.env.AGX_STATE_DIR, "queued-run");
    expect(
      f.command(["--enqueue", f.worker, "-m", "Fail queued"]).exitCode,
    ).toBe(0);
    expect(
      f.command([
        "--enqueue",
        "second",
        "-m",
        "Good queued",
        "--review",
        "queued-review",
      ]).exitCode,
    ).toBe(0);
    const result = f.command(["--run-queue"]);
    expect(
      result.exitCode,
      result.stdout.toString() + result.stderr.toString(),
    ).toBe(1);
    expect(result.stdout.toString()).toContain("FAIL " + f.worker);
    expect(result.stdout.toString()).toContain("OK second");
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "keep content\n",
    );
    expect(readFileSync(join(f.main, "delete.txt"), "utf8")).toBe(
      "successful worker\n",
    );
    expect(existsSync(second)).toBe(false);
    expect(f.log().filter((event) => event[0] === "agx")).toEqual([]);
    const state = landStateDir(realpathSync(f.main));
    // State belongs to this isolated fixture, rather than the test runner's own AGX state.
    const actualState = join(f.env.AGX_STATE_DIR, "land", basename(state));
    const journal = readFileSync(join(actualState, "queue.jsonl"), "utf8");
    expect(journal).toContain('"status":"FAIL"');
    expect(journal).toContain('"status":"OK"');
    expect(existsSync(join(actualState, "runner.lock"))).toBe(false);
    expect(existsSync(join(actualState, "land.lock"))).toBe(false);
    const status = jsonOf(
      z.looseObject({
        pending: z.number(),
        running: z.number(),
        OK: z.number(),
        FAIL: z.number(),
      }),
    ).safeParse(f.command(["--queue-status"]).stdout.toString());
    expect(status.success ? status.data : undefined).toMatchObject({
      pending: 0,
      running: 0,
      OK: 1,
      FAIL: 1,
    });
    expect(f.command(["--run-queue"]).exitCode).toBe(0);
  }, 25_000);

  test("a duplicate runner is idempotent and queued work waits for the land lock", async () => {
    const f = fixture();
    writeFileSync(join(f.worker, "keep.txt"), "worker version\n");
    expect(
      f.command(["--enqueue", f.worker, "-m", "Queued once"]).exitCode,
    ).toBe(0);
    const state = join(
      f.env.AGX_STATE_DIR,
      "land",
      basename(landStateDir(realpathSync(f.main))),
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
    const duplicate = f.command(["--run-queue"]);
    expect(duplicate.exitCode).toBe(0);
    expect(duplicate.stdout.toString()).toContain("runner already active");
    expect(f.log()).toEqual([]);
    expect(readFileSync(join(state, "queue.jsonl"), "utf8")).not.toContain(
      '"kind":"start"',
    );
    held.release();
    const [code, out, err] = await Promise.all([child.exited, rest, stderr]);
    expect(code, out + err).toBe(0);
    expect(f.log().filter((event) => event[1] === "commit")).toHaveLength(1);
    expect(existsSync(join(state, "runner.lock"))).toBe(false);
  }, 25_000);

  test("queued work waits for a clean main without consuming the head", async () => {
    const f = fixture();
    writeFileSync(join(f.worker, "delete.txt"), "queued change\n");
    writeFileSync(join(f.main, "keep.txt"), "owner's uncommitted work\n");
    expect(
      f.command(["--enqueue", f.worker, "-m", "After main is clean"]).exitCode,
    ).toBe(0);
    const child = f.start(["--run-queue"]);
    const stderr = new Response(child.stderr).text();
    const reader = child.stdout.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain(
      "waiting for a clean main checkout",
    );
    const rest = drain(reader).finally(() => {
      reader.releaseLock();
    });
    expect(f.log()).toEqual([]);
    expect(readFileSync(join(f.main, "keep.txt"), "utf8")).toBe(
      "owner's uncommitted work\n",
    );
    const status = jsonOf(
      z.looseObject({ pending: z.number(), running: z.number() }),
    ).safeParse(f.command(["--queue-status"]).stdout.toString());
    expect(status.success ? status.data : undefined).toMatchObject({
      pending: 1,
      running: 0,
    });
    f.jj(f.main, ["restore", "--from", "@-", "--", "keep.txt"]);
    const [code, out, err] = await Promise.all([child.exited, rest, stderr]);
    expect(code, out + err).toBe(0);
    expect(readFileSync(join(f.main, "delete.txt"), "utf8")).toBe(
      "queued change\n",
    );
  }, 25_000);
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
