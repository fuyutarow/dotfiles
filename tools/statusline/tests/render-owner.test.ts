import { afterEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { version } from "../package.json";
import { readAgxSnapshotAsync } from "../src/agx-snapshot.ts";
import { cleanRetiredCaches } from "../src/sampler.ts";
import { writeCacheAsync } from "../src/bounded.ts";
import { coreSnapshot } from "./helpers.ts";
import { jsonText } from "../src/zod.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
const plain = (text: string) =>
  text.replaceAll(
    new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu"),
    "",
  );

test("standalone and Claude stdin render owner files without any subprocess, network, or cache writes", async () => {
  const home = await mkdtemp(join(tmpdir(), "render-owner-"));
  roots.push(home);
  const cwd = join(home, "project");
  const outside = join(home, "outside");
  const state = join(home, "state");
  const proc = join(home, "proc");
  await Promise.all(
    [
      join(cwd, ".jj"),
      outside,
      state,
      join(proc, "101"),
      join(home, ".claude/sessions"),
    ].map((path) => mkdir(path, { recursive: true })),
  );
  const transcript = join(
    home,
    ".claude/projects",
    cwd.replaceAll("/", "-"),
    "session.jsonl",
  );
  const fixture = await readFile(
    join(import.meta.dir, "fixtures/cached-context.json"),
    "utf8",
  );
  await mkdir(join(transcript, ".."), { recursive: true });
  const recorded = jsonText.safeParse(fixture);
  expect(recorded.success).toBe(true);
  if (!recorded.success) return;
  await writeFile(transcript, JSON.stringify(recorded.data) + "\n");
  const socket = join(home, "socket");
  await writeFile(socket, "fixture");
  await writeFile(
    join(home, ".claude/sessions/101.json"),
    JSON.stringify({
      sessionId: "session",
      cwd,
      startedAt: Temporal.Now.instant().epochMilliseconds,
      messagingSocketPath: socket,
    }),
  );
  await writeFile(join(proc, "101/cmdline"), "claude\0");
  await symlink(cwd, join(proc, "101/cwd"));
  const at = Temporal.Now.instant().epochMilliseconds;
  const owner = join(home, "owner.json");
  await writeFile(
    owner,
    JSON.stringify({
      schema: 1,
      fields: {
        sessions: {
          at,
          value: [
            {
              vendor: "claude",
              pid: 101,
              cwd,
              session_id: "session",
              transcript_path: transcript,
              started_at: Temporal.Now.instant().toString(),
            },
          ],
        },
        [`repo:${cwd}`]: {
          at,
          value: {
            workspace: "ws_context-fix",
            branch: "alpha",
            add: 3,
            del: 1,
          },
        },
        hostLoad: {
          at,
          value: {
            cpuPct: { value: 99 },
            ram: { value: { pct: 50, frac: "1/2G" } },
          },
        },
        jobScan: { at, value: { jobs: [], orphans: 0 } },
      },
    }),
  );
  const env = {
    ...process.env,
    HOME: home,
    PWD: cwd,
    STATUSLINE_OWNER_STATE: owner,
    STATUSLINE_PROC_ROOT: proc,
    AGX_STATE_DIR: state,
    AGX_NEXT_STATE_DIR: "",
    HERDR_ENV: "0",
  };
  await writeFile(
    join(state, "current-runs.json"),
    JSON.stringify(coreSnapshot("[]", at - 3600000)),
  );
  await writeFile(
    join(state, "workspace-verdicts.json"),
    JSON.stringify({
      complete: true,
      capturedAt: at,
      counts: { total: 7, unlanded: 1, collectable: 2, legacy: 0 },
      repos: {
        [cwd]: {
          capturedAt: at,
          counts: { total: 2, unlanded: 1, collectable: 0, legacy: 0 },
        },
      },
    }),
  );
  await writeFile(
    join(state, "doctor.json"),
    JSON.stringify({ complete: true, capturedAt: at, kinds: {}, lost: 0 }),
  );
  const before = await readdir(home, { recursive: true });
  const invoke = async (selectedCwd: string, input: string) => {
    const child = Bun.spawn(
      [
        process.execPath,
        "--preload",
        join(import.meta.dir, "no-process-preload.ts"),
        join(import.meta.dir, "../src/statusline.ts"),
      ],
      {
        cwd: selectedCwd,
        env: { ...env, PWD: selectedCwd },
        stdin: new Blob([input]),
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      },
    );
    const [output, errors, exit] = await Promise.all([
      child.stdout.text(),
      child.stderr.text(),
      child.exited,
    ]);
    expect(exit, errors).toBe(0);
    expect(errors).toBe("");
    return plain(output);
  };
  const standalone = await invoke(cwd, "");
  const claude = await invoke(
    cwd,
    JSON.stringify({
      cwd,
      session_id: "session",
      context_window: {
        total_input_tokens: 5000000,
        current_usage: {
          input_tokens: 2,
          cache_read_input_tokens: 925000,
          cache_creation_input_tokens: 2400,
        },
        used_percentage: 93,
      },
    }),
  );
  for (const output of [standalone, claude]) {
    expect(output).toContain("Ctx: 927.4k");
    expect(output).toContain("ws: ws_context-fix");
    expect(output).not.toContain("wt");
    expect(output.split("\n")[0]).toEndWith(`v${version}`);
    expect(output).toContain("workers 0 running");
    expect(output).not.toContain("old");
    expect(output).not.toContain("stale");
  }
  expect(claude).toContain("93%");
  const noRepo = await invoke(outside, "");
  expect(noRepo).not.toContain("here");
  expect(noRepo).not.toContain("ws:");
  expect((await readdir(home, { recursive: true })).toSorted()).toEqual(
    before.toSorted(),
  );
});

test("only a newer input mtime marks derived agx and doctor state stale", async () => {
  const state = await mkdtemp(join(tmpdir(), "owner-mtimes-"));
  roots.push(state);
  const env = { HOME: state, AGX_STATE_DIR: state };
  const capturedAt = Temporal.Now.instant().epochMilliseconds - 3600000;
  const runs = join(state, "current-runs.json"),
    records = join(state, "records.jsonl"),
    ws = join(state, "workspace-verdicts.json"),
    doctor = join(state, "doctor.json");
  await writeFile(records, "");
  await writeFile(
    ws,
    JSON.stringify({
      complete: true,
      capturedAt,
      counts: { total: 0, unlanded: 0, collectable: 0, legacy: 0 },
    }),
  );
  await writeFile(runs, JSON.stringify(coreSnapshot("[]", capturedAt)));
  await writeFile(
    doctor,
    JSON.stringify({ complete: true, capturedAt, kinds: {}, lost: 0 }),
  );
  await Promise.all([runs, doctor].map((path) => utimes(path, 2000, 2000)));
  await Promise.all([records, ws].map((path) => utimes(path, 1000, 1000)));
  expect((await readAgxSnapshotAsync(env)).ageSeconds).toBe(0);
  expect((await readAgxSnapshotAsync(env)).findings?.stale).toBe(false);
  await utimes(records, 3000, 3000);
  const stale = await readAgxSnapshotAsync(env);
  expect(stale.ageSeconds).toBeGreaterThanOrEqual(3600);
  expect(stale.findings?.stale).toBe(true);
  await writeFile(runs, "partial fixture");
  expect((await readAgxSnapshotAsync(env)).rows).toEqual(stale.rows);
});

test("failed atomic writes leave no temp files; retired presentation caches are removed by their owner", async () => {
  const root = await mkdtemp(join(tmpdir(), "owner-cleanup-"));
  roots.push(root);
  const target = join(root, "target");
  await mkdir(target);
  await writeCacheAsync(target, { value: 1 }); // rename over a directory must fail.
  expect((await readdir(root)).filter((name) => name.endsWith(".tmp"))).toEqual(
    [],
  );
  await Promise.all(
    ["fields", "renders", "sources"].map((name) => mkdir(join(root, name))),
  );
  const old = join(root, "leaked.tmp");
  await writeFile(old, "old");
  await utimes(old, 1, 1);
  await cleanRetiredCaches(root);
  expect(await readdir(root)).toEqual(["target"]);
});
