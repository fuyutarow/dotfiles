import { afterEach, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readFleetUpdateSession,
  updateFleetSession,
} from "../src/fleet-update-store.ts";
import { jsonOf, z } from "../src/zod.ts";

const roots: string[] = [];
const CHILD = join(import.meta.dir, "fixtures/fleet-update-store-child.ts");
const sessionId = "session-123";
const observedAt = "2026-10-21T09:00:00.000Z";
const laterAt = "2026-10-21T10:00:00.000Z";

const ChildResultSchema = z.union([
  z.object({
    ok: z.literal(false),
    error: z.object({ code: z.string() }),
  }),
  z.object({
    ok: z.literal(true),
    committed: z.literal(true),
    cleanupWarning: z.literal("LOCK_RELEASE_FAILED").optional(),
  }),
]);

function patch(
  owner: string,
  fields: Record<string, unknown>,
  target?: { session_id: string; vendor: string },
) {
  return {
    kind: "patch",
    target: target ?? { session_id: sessionId, vendor: "codex" },
    owner,
    patch: fields,
  };
}

function session(overrides: Record<string, unknown> = {}) {
  const unknown = {
    value: { na: true, why: "not observed" },
    observedAt: null,
  };
  return {
    schema: 2,
    session_id: sessionId,
    vendor: "codex",
    revision: 4,
    fields: {
      name: unknown,
      model: { value: "GPT-6", observedAt },
      effort: unknown,
      ctx: { value: { tokens: 1200, pct: 24 }, observedAt },
      rate: unknown,
      cwd: unknown,
      pane_id: unknown,
    },
    updated_at: observedAt,
    ...overrides,
  };
}

function legacySession() {
  return {
    schema: 1,
    session_id: sessionId,
    vendor: "codex",
    name: "project-agt_abc123",
    model: "GPT-6",
    effort: "high",
    ctx: { tokens: 1200, pct: 24 },
    rate: { five_h_pct: 18, seven_d_pct: 42, resets: "tomorrow" },
    cwd: "/work/project",
    pane_id: null,
    updated_at: observedAt,
  };
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "fleet-update-store-"));
  roots.push(root);
  return { root, env: { XDG_RUNTIME_DIR: root } };
}

function paths(root: string) {
  const sessionDir = join(root, "fleet", "sessions");
  const lockDir = join(root, "fleet", "locks");
  return {
    session: join(sessionDir, `${sessionId}.json`),
    sessionDir,
    lock: join(lockDir, `${sessionId}.lock`),
    lockDir,
  };
}

async function seed(root: string, record: unknown) {
  const { session: path, sessionDir } = paths(root);
  await mkdir(sessionDir, { recursive: true });
  await writeFile(path, `${JSON.stringify(record)}\n`);
  return path;
}

async function snapshot(path: string) {
  return { bytes: await readFile(path, "utf8"), inode: (await stat(path)).ino };
}

async function expectUnchanged(
  path: string,
  before: Awaited<ReturnType<typeof snapshot>>,
) {
  expect(await snapshot(path)).toEqual(before);
}

async function runChild(
  request: unknown,
  root: string,
  fault?: "rename" | "rmdir" | "write",
) {
  const child = Bun.spawn(
    [process.execPath, CHILD, JSON.stringify({ request, fault })],
    {
      cwd: root,
      env: { ...process.env, XDG_RUNTIME_DIR: root },
      stdout: "pipe",
    },
  );
  const output = await new Response(child.stdout).text();
  expect(await child.exited).toBe(0);
  const parsed = jsonOf(ChildResultSchema).safeParse(output);
  expect(parsed.success).toBe(true);
  return parsed.success ? parsed.data : undefined;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("uses an explicitly owned temporary XDG root", async () => {
  const { root, env } = await fixture();
  expect(env.XDG_RUNTIME_DIR).toBe(root);
});

test("relative XDG_RUNTIME_DIR refuses without creating a CWD-relative record", async () => {
  const { root } = await fixture();
  const child = Bun.spawn(
    [
      process.execPath,
      CHILD,
      JSON.stringify({
        request: patch("codex-rollout", {
          model: { value: "GPT-6.1", observedAt: laterAt },
        }),
      }),
    ],
    {
      cwd: root,
      env: { ...process.env, XDG_RUNTIME_DIR: "relative-runtime" },
      stdout: "pipe",
    },
  );
  const output = await new Response(child.stdout).text();
  expect(await child.exited).toBe(0);
  expect(
    jsonOf(
      z.strictObject({
        ok: z.literal(false),
        error: z.strictObject({ code: z.literal("READ_FAILED") }),
      }),
    ).safeParse(output).success,
  ).toBe(true);
  expect(existsSync(join(root, "relative-runtime"))).toBe(false);
});

test("two real Bun child updates preserve independent owner fields", async () => {
  const { root, env } = await fixture();
  const [model, context] = await Promise.all([
    runChild(
      patch("codex-rollout", {
        model: { value: "GPT-6.1", observedAt: laterAt },
      }),
      root,
    ),
    runChild(
      patch("codex-provider-status", {
        ctx: { value: { tokens: 1400, pct: 28 }, observedAt: laterAt },
      }),
      root,
    ),
  ]);
  expect(model).toMatchObject({ ok: true, committed: true });
  expect(context).toMatchObject({ ok: true, committed: true });
  const stored = await readFleetUpdateSession(sessionId, env);
  expect(stored).toMatchObject({ kind: "v2" });
  if (stored.kind === "v2") {
    expect(stored.value.fields.model.value).toBe("GPT-6.1");
    expect(stored.value.fields.ctx.value).toEqual({ tokens: 1400, pct: 28 });
    expect(stored.value.revision).toBe(2);
  }
});

test("stale, owner, vendor, and identity refusals preserve record bytes and inode", async () => {
  const cases = [
    {
      request: patch("codex-rollout", {
        model: { value: "GPT-6.1", observedAt },
      }),
      record: session(),
      code: "STALE_OBSERVATION",
    },
    {
      request: patch("codex-thread-identity", {
        model: { value: "GPT-6.1", observedAt: laterAt },
      }),
      record: session(),
      code: "OWNER_FORBIDDEN",
    },
    {
      request: patch(
        "codex-provider-status",
        { ctx: { value: { tokens: 1400, pct: 28 }, observedAt: laterAt } },
        { session_id: sessionId, vendor: "claude" },
      ),
      record: session({ vendor: "claude" }),
      code: "VENDOR_FORBIDDEN",
    },
    {
      request: patch("codex-rollout", {
        model: { value: "GPT-6.1", observedAt: laterAt },
      }),
      record: session({ session_id: "other-session" }),
      code: "IDENTITY_MISMATCH",
    },
  ];
  for (const item of cases) {
    const { root, env } = await fixture();
    const path = await seed(root, item.record);
    const before = await snapshot(path);
    expect(await updateFleetSession(item.request, env)).toMatchObject({
      ok: false,
      error: { code: item.code },
    });
    await expectUnchanged(path, before);
  }
});

test("malformed, overlarge, and unreadable records refuse without mutation", async () => {
  const cases = [
    { prepare: (path: string) => writeFile(path, "{") },
    { prepare: (path: string) => writeFile(path, "x".repeat(65 * 1024)) },
  ];
  for (const item of cases) {
    const { root, env } = await fixture();
    const { session: path, sessionDir } = paths(root);
    await mkdir(sessionDir, { recursive: true });
    await item.prepare(path);
    const before = await snapshot(path);
    expect(
      await updateFleetSession(
        patch("codex-rollout", {
          model: { value: "GPT-6.1", observedAt: laterAt },
        }),
        env,
      ),
    ).toEqual({ ok: false, error: { code: "READ_FAILED" } });
    await expectUnchanged(path, before);
  }

  const { root, env } = await fixture();
  const { session: path, sessionDir } = paths(root);
  await mkdir(path, { recursive: true });
  const before = (await stat(path)).ino;
  expect(
    await updateFleetSession(
      patch("codex-rollout", {
        model: { value: "GPT-6.1", observedAt: laterAt },
      }),
      env,
    ),
  ).toEqual({ ok: false, error: { code: "READ_FAILED" } });
  expect((await stat(path)).ino).toBe(before);
  expect(await readdir(sessionDir)).toEqual([`${sessionId}.json`]);
});

test("a held lock times out near its bound and is never stolen", async () => {
  const { root, env } = await fixture();
  const { lock } = paths(root);
  await mkdir(lock, { recursive: true });
  const inode = (await stat(lock)).ino;
  const started = performance.now();
  expect(
    await updateFleetSession(
      patch("codex-rollout", {
        model: { value: "GPT-6.1", observedAt: laterAt },
      }),
      env,
    ),
  ).toEqual({ ok: false, error: { code: "LOCK_TIMEOUT" } });
  const elapsed = performance.now() - started;
  expect(elapsed).toBeGreaterThanOrEqual(180);
  expect(elapsed).toBeLessThan(1_000);
  expect((await stat(lock)).ino).toBe(inode);
  expect(existsSync(paths(root).session)).toBe(false);
});

test("a missing record bootstraps unobserved cells before merging", async () => {
  const { root, env } = await fixture();
  const result = await updateFleetSession(
    patch("codex-rollout", {
      model: { value: "GPT-6.1", observedAt: laterAt },
    }),
    env,
  );
  expect(result).toMatchObject({
    ok: true,
    committed: true,
    changed: ["model"],
  });
  if (!result.ok) return;
  expect(result.value.revision).toBe(1);
  expect(result.value.fields.model.value).toBe("GPT-6.1");
  expect(result.value.fields.ctx).toEqual({
    value: { na: true, why: "not observed" },
    observedAt: null,
  });
  expect(existsSync(paths(root).session)).toBe(true);
});

test("schema 1 remains readable and a patch preserves its bytes and inode", async () => {
  const { root, env } = await fixture();
  const path = await seed(root, legacySession());
  const before = await snapshot(path);
  expect(await readFleetUpdateSession(sessionId, env)).toMatchObject({
    kind: "v1",
  });
  expect(
    await updateFleetSession(
      patch("codex-rollout", {
        model: { value: "GPT-6.1", observedAt: laterAt },
      }),
      env,
    ),
  ).toEqual({ ok: false, error: { code: "LEGACY_SCHEMA" } });
  await expectUnchanged(path, before);
});

test("write and rename failures preserve the old record and clean their temporary file and lock", async () => {
  for (const fault of ["write", "rename"] as const) {
    const { root } = await fixture();
    const path = await seed(root, session());
    const before = await snapshot(path);
    expect(
      await runChild(
        patch("codex-rollout", {
          model: { value: "GPT-6.1", observedAt: laterAt },
        }),
        root,
        fault,
      ),
    ).toEqual({ ok: false, error: { code: "WRITE_FAILED" } });
    await expectUnchanged(path, before);
    expect(await readdir(paths(root).sessionDir)).toEqual([
      `${sessionId}.json`,
    ]);
    expect(await readdir(paths(root).lockDir)).toEqual([]);
  }
});

test("post-commit lock release failure is committed success with an explicit cleanup warning", async () => {
  const { root, env } = await fixture();
  expect(
    await runChild(
      patch("codex-rollout", {
        model: { value: "GPT-6.1", observedAt: laterAt },
      }),
      root,
      "rmdir",
    ),
  ).toMatchObject({
    ok: true,
    committed: true,
    cleanupWarning: "LOCK_RELEASE_FAILED",
  });
  expect(await readFleetUpdateSession(sessionId, env)).toMatchObject({
    kind: "v2",
  });
  expect(existsSync(paths(root).lock)).toBe(true);
});

test("missing runtime and traversal requests refuse without writing the fixture", async () => {
  const { root, env } = await fixture();
  const valid = patch("codex-rollout", {
    model: { value: "GPT-6.1", observedAt: laterAt },
  });
  expect(await updateFleetSession(valid, {})).toEqual({
    ok: false,
    error: { code: "READ_FAILED" },
  });
  expect(
    await updateFleetSession(
      { ...valid, target: { session_id: "../escape", vendor: "codex" } },
      env,
    ),
  ).toEqual({ ok: false, error: { code: "INVALID_REQUEST" } });
  expect(await readdir(root)).toEqual([]);
});
