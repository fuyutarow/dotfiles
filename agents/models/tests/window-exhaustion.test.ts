import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { exhaustionPolicy, loadRoster, ROSTER_PATH } from "../roster.ts";

const DECLARATION =
  'on_window_exhausted = { codex = "continue", claude = "stop" }';

async function rosterWith(source: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "roster-exhaustion-"));
  const path = join(dir, "dispatch-roster.toml");
  await writeFile(path, source);
  return path;
}

test("committed roster declares the exhaustion action per route", async () => {
  const loaded = await loadRoster(ROSTER_PATH);
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;
  expect(exhaustionPolicy(loaded.value.auto)).toEqual({
    codex: "continue",
    claude: "stop",
  });
});

test("an omitted declaration means continue for every route", async () => {
  const source = (await readFile(ROSTER_PATH, "utf8")).replace(
    `${DECLARATION}\n`,
    "",
  );
  expect(source).not.toContain("on_window_exhausted");
  const loaded = await loadRoster(await rosterWith(source));
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;
  expect(exhaustionPolicy(loaded.value.auto)).toEqual({
    codex: "continue",
    claude: "continue",
  });
});

test("an unknown action value rejects the roster load", async () => {
  const source = (await readFile(ROSTER_PATH, "utf8")).replace(
    DECLARATION,
    'on_window_exhausted = { codex = "pause", claude = "stop" }',
  );
  const loaded = await loadRoster(await rosterWith(source));
  expect(loaded.ok).toBe(false);
});

test("an unknown route key rejects the roster load", async () => {
  const source = (await readFile(ROSTER_PATH, "utf8")).replace(
    DECLARATION,
    'on_window_exhausted = { codex = "continue", gemini = "stop" }',
  );
  const loaded = await loadRoster(await rosterWith(source));
  expect(loaded.ok).toBe(false);
});
