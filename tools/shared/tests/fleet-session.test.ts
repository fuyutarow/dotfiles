import { afterEach, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FleetSessionSchema,
  FleetSessionUnavailableSchema,
  parseFleetSession,
  readFleetSession,
  writeFleetSession,
  type FleetSession,
  type FleetSessionRead,
  type FleetSessionUnavailable,
} from "../src/fleet-session.ts";

const roots: string[] = [];
const unavailable = (why: string): FleetSessionUnavailable => ({
  na: true,
  why,
});

function expectUnavailable(value: FleetSessionRead, reason: string) {
  const parsed = FleetSessionUnavailableSchema.safeParse(value);
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data.why).toContain(reason);
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "fleet-session-"));
  roots.push(root);
  return { root, env: { XDG_RUNTIME_DIR: root } };
}

const record = {
  schema: 1,
  session_id: "session-123",
  vendor: "codex",
  name: "my-project-agt_abc123",
  model: "GPT-6",
  effort: "high",
  ctx: { tokens: 1200, pct: 24.5 },
  rate: { five_h_pct: 18, seven_d_pct: 42, resets: "2026-10-20T00:00:00Z" },
  cwd: "/work/my-project",
  pane_id: "%4",
  updated_at: "2026-10-19T12:30:00.000Z",
} satisfies FleetSession;

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

test("parses a valid schema 1 session and rejects invalid known fields", () => {
  expect(parseFleetSession(JSON.stringify(record))).toEqual(record);
  expect(FleetSessionSchema.safeParse({ ...record, schema: 2 }).success).toBe(
    false,
  );
  expect(
    FleetSessionSchema.safeParse({ ...record, session_id: "../escape" })
      .success,
  ).toBe(false);
  expect(
    FleetSessionSchema.safeParse({ ...record, name: "not-an-agent-name" })
      .success,
  ).toBe(false);
  expect(parseFleetSession("{")).toMatchObject({ na: true });
});

test("read returns an explicit na reason when the record is missing", async () => {
  const { env } = await fixture();
  expect(await readFleetSession(record.session_id, env)).toEqual(
    unavailable(`fleet session ${record.session_id} is missing`),
  );
});

test("read reports missing XDG_RUNTIME_DIR and invalid session ids as na", async () => {
  expect(await readFleetSession(record.session_id, {})).toEqual(
    unavailable("XDG_RUNTIME_DIR is not set"),
  );
  expect(
    await readFleetSession("../escape", { XDG_RUNTIME_DIR: "/tmp" }),
  ).toEqual(unavailable("invalid session_id"));
});

test("write atomically publishes a private file that read can parse", async () => {
  const { root, env } = await fixture();
  expect(await writeFleetSession(record, env)).toEqual({
    ok: true,
    value: undefined,
  });
  const dir = join(root, "fleet", "sessions");
  const files = await readdir(dir);
  expect(files).toEqual([`${record.session_id}.json`]);
  const path = join(dir, `${record.session_id}.json`);
  expect((await stat(path)).mode & 0o777).toBe(0o600);
  expect(await readFile(path, "utf8")).toBe(`${JSON.stringify(record)}\n`);
  expect(await readFleetSession(record.session_id, env)).toEqual(record);
});

test("writer refuses invalid records and missing runtime directories", async () => {
  expect(
    await writeFleetSession(
      { ...record, schema: 2 },
      { XDG_RUNTIME_DIR: "/tmp" },
    ),
  ).toMatchObject({ ok: false });
  expect(await writeFleetSession(record, {})).toMatchObject({ ok: false });
});

test("supports both vendors, explicit unavailable fields, and a null pane", () => {
  const vendors: FleetSession["vendor"][] = ["claude", "codex"];
  for (const vendor of vendors) {
    const session = {
      ...record,
      vendor,
      name: unavailable("session has no assigned name"),
      model: unavailable("model not reported"),
      effort: unavailable("effort not reported"),
      ctx: unavailable("context not reported"),
      rate: unavailable("subscription usage unavailable"),
      pane_id: null,
    };
    expect(parseFleetSession(JSON.stringify(session))).toEqual(session);
  }
});

test("rejects malformed, incomplete, and out-of-range records with a reason", () => {
  const invalid = [
    null,
    [],
    { ...record, schema: 2 },
    { ...record, vendor: "other" },
    { ...record, session_id: ".." },
    { ...record, session_id: "a/b" },
    { ...record, name: "project-pi_123" },
    { ...record, model: "" },
    { ...record, effort: { na: true, why: "" } },
    { ...record, ctx: { tokens: -1, pct: 0 } },
    { ...record, ctx: { tokens: 1.5, pct: 0 } },
    { ...record, ctx: { tokens: 1, pct: 101 } },
    { ...record, rate: { ...record.rate, five_h_pct: -1 } },
    { ...record, rate: { ...record.rate, seven_d_pct: 101 } },
    { ...record, cwd: "" },
    { ...record, pane_id: undefined },
    { ...record, updated_at: "yesterday" },
    { ...record, extra: true },
  ];
  for (const value of invalid) {
    expectUnavailable(
      parseFleetSession(JSON.stringify(value)),
      "invalid fleet session:",
    );
  }
  const boundaries = {
    ...record,
    ctx: { tokens: 0, pct: 100 },
    rate: { ...record.rate, five_h_pct: 0, seven_d_pct: 100 },
  };
  expect(parseFleetSession(JSON.stringify(boundaries))).toEqual(boundaries);
});

test("read reports unreadable and invalid files as reasoned na", async () => {
  const { root, env } = await fixture();
  const path = join(root, "fleet", "sessions", `${record.session_id}.json`);
  await mkdir(path, { recursive: true });
  expectUnavailable(
    await readFleetSession(record.session_id, env),
    "could not be read",
  );
  await rm(path, { recursive: true });
  await writeFile(path, "{");
  expectUnavailable(
    await readFleetSession(record.session_id, env),
    "invalid fleet session:",
  );
});

test("read rejects a valid record belonging to a different session", async () => {
  const { root, env } = await fixture();
  expect(await writeFleetSession(record, env)).toMatchObject({ ok: true });
  const path = join(root, "fleet", "sessions", `${record.session_id}.json`);
  await writeFile(path, JSON.stringify({ ...record, session_id: "other" }));
  expectUnavailable(
    await readFleetSession(record.session_id, env),
    "mismatched session_id",
  );
});

test("replacement publishes a new file while an open reader retains the old one", async () => {
  const { root, env } = await fixture();
  expect(await writeFleetSession(record, env)).toMatchObject({ ok: true });
  const path = join(root, "fleet", "sessions", `${record.session_id}.json`);
  const oldReader = await open(path, "r");
  const updated = { ...record, model: "GPT-6.1" };
  const result = await writeFleetSession(updated, env);
  const oldContents = await oldReader.readFile("utf8");
  await oldReader.close();
  expect(result).toEqual({ ok: true, value: undefined });
  expect(parseFleetSession(oldContents)).toEqual(record);
  expect(await readFleetSession(record.session_id, env)).toEqual(updated);
  expect(await readdir(join(root, "fleet", "sessions"))).toEqual([
    `${record.session_id}.json`,
  ]);
});

test("failed rename returns the error and removes its same-directory temporary file", async () => {
  const { root, env } = await fixture();
  const dir = join(root, "fleet", "sessions");
  const filename = `${record.session_id}.json`;
  await mkdir(join(dir, filename), { recursive: true });
  const result = await writeFleetSession(record, env);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  expect(await readdir(dir)).toEqual([filename]);
});

test("directory creation errors are returned as values", async () => {
  const { root, env } = await fixture();
  await writeFile(join(root, "fleet"), "blocked");
  const result = await writeFleetSession(record, env);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toBeInstanceOf(Error);
  expect(await readFile(join(root, "fleet"), "utf8")).toBe("blocked");
});

test("default environment writes and reads the same runtime path", async () => {
  expect(await writeFleetSession(record)).toMatchObject({ ok: true });
  expect(await readFleetSession(record.session_id)).toEqual(record);
});

test("parse returns na for a valid JSON document with the wrong shape", () => {
  expect(parseFleetSession(JSON.stringify({ schema: 1 }))).toMatchObject({
    na: true,
  });
});
