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
import { coreSnapshot, seedAgxSnapshot } from "./helpers.ts";
import { ownerStatePath } from "../src/owner-state.ts";
import { agxStatusKey } from "../src/agx-snapshot.ts";
import { z } from "../src/zod.ts";
import { decodedJson } from "./decode.ts";
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
    XDG_RUNTIME_DIR: "",
    HERDR_ENV: "0",
  };
  seedAgxSnapshot(
    env,
    {
      ...coreSnapshot("[]", at - 3600000),
      workspaces: {
        total: 7,
        unlanded: 1,
        collectable: 2,
        legacy: 0,
        here: 2,
        capturedAt: at,
      },
      findings: { kinds: {}, lost: 0, capturedAt: at },
    },
    cwd,
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
    expect(output).not.toContain("workers 0 running");
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

test("cache freshness follows CLI state and sampler failures rather than status-file mtimes", async () => {
  const home = await mkdtemp(join(tmpdir(), "owner-cli-state-"));
  roots.push(home);
  const env = { HOME: home };
  const capturedAt = Temporal.Now.instant().epochMilliseconds - 3600000;
  seedAgxSnapshot(env, {
    ...coreSnapshot("[]", capturedAt),
    findings: { kinds: {}, lost: 0, capturedAt, stale: false },
  });
  expect((await readAgxSnapshotAsync(env)).ageSeconds).toBe(0);
  expect((await readAgxSnapshotAsync(env)).findings?.stale).toBe(false);
  const path = ownerStatePath(env);
  const owner = decodedJson(
    z.object({
      schema: z.literal(1),
      fields: z.record(
        z.string(),
        z.object({
          at: z.number(),
          value: z.unknown(),
          error: z.string().optional(),
        }),
      ),
    }),
    await readFile(path, "utf8"),
  );
  const field = owner.fields[agxStatusKey(process.cwd())];
  if (field === undefined) expect.unreachable("missing fixture field");
  field.error = "agx status unavailable";
  await writeFile(path, JSON.stringify(owner));
  const stale = await readAgxSnapshotAsync(env);
  expect(stale.ageSeconds).toBeGreaterThanOrEqual(3600);
  expect(stale.findings?.stale).toBe(true);
  expect(stale.rows).toEqual([]);
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
