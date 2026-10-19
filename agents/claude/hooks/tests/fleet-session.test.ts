import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  FleetSessionSchema,
  parseFleetSession,
  readFleetSession,
  writeFleetSession,
  type FleetSessionUnavailable,
} from "../../../../tools/shared/src/fleet-session.ts";
import { fleetSessionFixture } from "./fleet-session-fixture.ts";
import { tempHome } from "./helpers.ts";

test("schema 1 round-trips both vendors and atomic replacement leaves no temp file", async () => {
  const home = tempHome();
  const { session } = await fleetSessionFixture(home);
  const parsed = FleetSessionSchema.safeParse(
    parseFleetSession(JSON.stringify(session)),
  );
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  const env = { XDG_RUNTIME_DIR: join(home, "runtime") };
  expect((await writeFleetSession(parsed.data, env)).ok).toBe(true);
  expect(await readFleetSession("s1", env)).toEqual(parsed.data);
  const codex = {
    ...parsed.data,
    vendor: "codex",
  } satisfies typeof parsed.data;
  expect((await writeFleetSession(codex, env)).ok).toBe(true);
  expect(await readFleetSession("s1", env)).toEqual(codex);
  expect(await readdir(join(env.XDG_RUNTIME_DIR, "fleet/sessions"))).toEqual([
    "s1.json",
  ]);
});

test("schema validates version, identity, numeric values, timestamps and extra fields", async () => {
  const { session } = await fleetSessionFixture(tempHome());
  for (const change of [
    { schema: 2 },
    { vendor: "other" },
    { session_id: "../escape" },
    { updated_at: "yesterday" },
    { ctx: { tokens: -1, pct: 10 } },
    { rate: { five_h_pct: 20 } },
    { rc: "connected" },
    { name: "unnamed" },
  ])
    expect(
      parseFleetSession(JSON.stringify({ ...session, ...change })),
    ).toMatchObject({ na: true });
  expect(parseFleetSession("null")).toMatchObject({ na: true });
  expect(parseFleetSession("{bad")).toMatchObject({ na: true });
});

test("explicit unavailable values and reset timestamps survive parsing", async () => {
  const { session } = await fleetSessionFixture(tempHome());
  const na = {
    na: true,
    why: "not observed\nthis turn",
  } satisfies FleetSessionUnavailable;
  const value = {
    ...session,
    name: na,
    model: na,
    effort: na,
    ctx: na,
    rate: {
      ...session.rate,
      resets: "2026-10-20T01:00:00Z",
    },
  };
  expect(parseFleetSession(JSON.stringify(value))).toEqual(value);
  const unknownRate = { ...session, rate: na };
  expect(parseFleetSession(JSON.stringify(unknownRate))).toEqual(unknownRate);
});

test("reader fails open for missing runtime, missing file and invalid identity", async () => {
  expect(await readFleetSession("s1", { XDG_RUNTIME_DIR: "" })).toMatchObject({
    na: true,
  });
  expect(
    await readFleetSession("s1", {
      XDG_RUNTIME_DIR: join(tempHome(), "missing"),
    }),
  ).toMatchObject({ na: true });
  expect(
    await readFleetSession("../escape", { XDG_RUNTIME_DIR: tempHome() }),
  ).toMatchObject({ na: true });
});

test("writer creates the runtime directory and returns publication failures as values", async () => {
  const home = tempHome();
  const { session } = await fleetSessionFixture(home);
  const parsed = FleetSessionSchema.safeParse(
    parseFleetSession(JSON.stringify(session)),
  );
  expect(parsed.success).toBe(true);
  if (!parsed.success) return;
  const env = { XDG_RUNTIME_DIR: join(home, "new-runtime") };
  expect((await writeFleetSession(parsed.data, env)).ok).toBe(true);
  expect(await readFleetSession("s1", env)).toEqual(parsed.data);
  expect(
    (await writeFleetSession(parsed.data, { XDG_RUNTIME_DIR: "" })).ok,
  ).toBe(false);
  const blocked = join(home, "blocked");
  await Bun.write(blocked, "not a directory");
  expect(
    (await writeFleetSession(parsed.data, { XDG_RUNTIME_DIR: blocked })).ok,
  ).toBe(false);
});
