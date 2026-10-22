import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import {
  loadRoster,
  ROUTING_OBJECTIVE,
} from "../../../agents/models/roster.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const ENTRY = fileURLToPath(new URL("../src/next/cli.ts", import.meta.url));
const JsonValue = jsonOf(z.unknown());
const FullRosterView = jsonOf(z.looseObject({ objective: z.string() }));

async function invoke(...args: string[]) {
  const child = Bun.spawn([process.execPath, ENTRY, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("agx worker roster --json prints the validated roster value", async () => {
  const loaded = await loadRoster();
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;

  const result = await invoke("roster", "--json");
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  const parsed = FullRosterView.safeParse(result.stdout);
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data).toEqual({
      ...loaded.value,
      objective: ROUTING_OBJECTIVE,
    });
    expect(parsed.data.objective).toBe(ROUTING_OBJECTIVE);
    expect(parsed.data).toMatchObject(loaded.value);
  }
});

test("roster TICKET emits one selected row without starting a worker or changing records", async () => {
  const loaded = await loadRoster();
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;
  const selected = loaded.value.choice.find(
    (row) =>
      loaded.value.auto.routes === undefined ||
      loaded.value.auto.routes.includes(row.route),
  );
  expect(selected).toBeDefined();
  if (selected === undefined) return;
  const root = await mkdtemp(join(tmpdir(), "agx-roster-filter-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const ticket = join(root, "fixture.md");
  await writeFile(
    ticket,
    '+++\nschema = 2\nname = "filter"\noutcome = "select a worker"\n[proposition]\nid = "FILTER"\nclaim = "one row"\nrefuted_by = "multiple rows"\n+++\n',
  );
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      Response.json({ answers: { worker: { choice: selected.id } } }),
  });
  await using _server = {
    [Symbol.asyncDispose]: async () => {
      await server.stop(true);
    },
  };
  const child = Bun.spawn([process.execPath, ENTRY, "roster", ticket], {
    env: {
      ...process.env,
      HOME: root,
      AGX_STATE_DIR: join(root, "state"),
      DISPATCH_ROSTER_PATH: join(
        import.meta.dir,
        "../../../agents/models/dispatch-roster.toml",
      ),
      JEV_URL: server.url.href,
      TYPESAFE_API_KEY: "fixture",
    },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10000,
  });
  const [out, err, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(exit, err).toBe(0);
  expect(err).toBe("");
  expect(out.trim().split("\n")).toHaveLength(1);
  const parsed = JsonValue.safeParse(out);
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data).toEqual(selected);
  expect(await Bun.file(join(root, "state/records.jsonl")).exists()).toBe(
    false,
  );
});

test("renamed worker CLI reads pre-rename records byte for byte", async () => {
  const root = await mkdtemp(join(tmpdir(), "agx-record-compat-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const original = await Bun.file(
    join(import.meta.dir, "next/fixtures/lost-race-records.jsonl"),
  ).text();
  const path = join(root, "records.jsonl");
  await writeFile(path, original);
  const child = Bun.spawn([process.execPath, ENTRY, "ls", "--all", "--json"], {
    env: { ...process.env, AGX_STATE_DIR: root },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10000,
  });
  const [out, err, exit] = await Promise.all([
    child.stdout.text(),
    child.stderr.text(),
    child.exited,
  ]);
  expect(exit, err).toBe(0);
  const rows = jsonOf(
    z.array(z.looseObject({ id: z.string(), state: z.string() })),
  ).safeParse(out);
  expect(rows.success).toBe(true);
  if (rows.success) {
    expect(rows.data).toHaveLength(5);
    expect(rows.data.every((row) => row.state === "ended")).toBe(true);
  }
  expect(await Bun.file(path).text()).toBe(original);
});
