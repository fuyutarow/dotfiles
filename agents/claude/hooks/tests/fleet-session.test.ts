import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  fleetSessionRows,
  parseFleetSession,
  readFleetSession,
  writeFleetSession,
} from "../../../../tools/shared/src/fleet-session.ts";
import { fleetSessionFixture } from "./fleet-session-fixture.ts";
import { tempHome } from "./helpers.ts";

test("schema 1 round-trips both vendors and atomic replacement leaves no temp file", async () => {
  const home = tempHome();
  const { session } = await fleetSessionFixture(home);
  const parsed = parseFleetSession(session);
  expect(parsed).toBeDefined();
  if (parsed === undefined) return;
  const runtime = join(home, "runtime");
  expect((await writeFleetSession(parsed, runtime)).ok).toBe(true);
  expect(await readFleetSession("s1", runtime)).toEqual(parsed);
  const codex = {
    ...parsed,
    vendor: "codex",
    rc: "🔗",
  } satisfies typeof parsed;
  expect((await writeFleetSession(codex, runtime)).ok).toBe(true);
  expect(await readFleetSession("s1", runtime)).toEqual(codex);
  expect(await readdir(join(runtime, "fleet/sessions"))).toEqual(["s1.json"]);
});

test("schema validates version, identity, numeric values, timestamps and rc", async () => {
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
    expect(parseFleetSession({ ...session, ...change })).toBeUndefined();
  expect(parseFleetSession("null")).toBeUndefined();
  expect(parseFleetSession("{bad")).toBeUndefined();
});

test("explicit unavailable values and reset timestamps survive parsing and formatting", async () => {
  const { session } = await fleetSessionFixture(tempHome());
  const na = { na: true, why: "not observed\nthis turn" };
  const parsed = parseFleetSession({
    ...session,
    name: na,
    model: na,
    effort: na,
    rc: na,
    ctx: na,
    rate: {
      ...session.rate,
      resets: { five_h: "2026-10-20T01:00:00Z", seven_d: na },
    },
  });
  expect(parsed).toBeDefined();
  if (parsed === undefined) return;
  expect(fleetSessionRows(parsed)).toEqual([
    "Ctx: n/a (not observed this turn)",
    "Rate: 5h 40% ⟳2026-10-20T01:00:00Z · 7d 60%",
  ]);
  expect(parseFleetSession({ ...session, rate: na })).toBeDefined();
});

test("reader fails open for missing runtime, missing file and invalid identity", async () => {
  expect(await readFleetSession("s1", "")).toBeUndefined();
  expect(
    await readFleetSession("s1", join(tempHome(), "missing")),
  ).toBeUndefined();
  expect(await readFleetSession("../escape", tempHome())).toBeUndefined();
});

test("writer creates the runtime directory and returns publication failures as values", async () => {
  const home = tempHome();
  const { session } = await fleetSessionFixture(home);
  const parsed = parseFleetSession(session);
  expect(parsed).toBeDefined();
  if (parsed === undefined) return;
  const runtime = join(home, "new-runtime");
  expect((await writeFleetSession(parsed, runtime)).ok).toBe(true);
  expect(await readFleetSession("s1", runtime)).toEqual(parsed);
  expect((await writeFleetSession(parsed, "")).ok).toBe(false);
  const blocked = join(home, "blocked");
  await Bun.write(blocked, "not a directory");
  expect((await writeFleetSession(parsed, blocked)).ok).toBe(false);
});
