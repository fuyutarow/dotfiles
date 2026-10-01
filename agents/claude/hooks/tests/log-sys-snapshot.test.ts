import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runHook, tempHome } from "./helpers.ts";

const HOOK = "log-sys-snapshot.ts";
const LINE = "Sys: CPU 25% · RAM 18% (10.0/54.9G) · VRAM 28% (3.3/12.0G)";

function homeWithCache(ageMs: number): string {
  const home = tempHome();
  mkdirSync(join(home, ".cache", "claude"), { recursive: true });
  writeFileSync(
    join(home, ".cache", "claude", "statusline-sys.json"),
    JSON.stringify({
      at: Temporal.Now.instant().epochMilliseconds - ageMs,
      line: LINE,
    }),
  );
  return home;
}
// The hook prefixes the event time and joins fields with the bar's dimmed "|"; strip both.
const ANSI = new RegExp("\u001b\\[[0-9;]*m", "g");
const body = (stdout: string): string =>
  (JSON.parse(stdout).systemMessage as string)
    .replace(ANSI, "")
    .replace(/^\d\d-\d\d \d\d:\d\d \| /, "");
const fire = (home: string, event: string) =>
  runHook(HOOK, { hook_event_name: event, session_id: "s1" }, { HOME: home });

describe("log-sys-snapshot", () => {
  test("Stop attaches the cached Sys row as a systemMessage", () => {
    const r = fire(homeWithCache(1_000), "Stop");
    expect(r.code).toBe(0);
    expect(body(r.stdout)).toBe(LINE);
  });

  test("one line: local event time, then the fields, joined by the bar's dimmed |", () => {
    const msg = JSON.parse(fire(homeWithCache(1_000), "Stop").stdout)
      .systemMessage as string;
    expect(msg).not.toContain("\n");
    expect(msg.replace(ANSI, "")).toMatch(
      /^\d\d-\d\d \d\d:\d\d \| Sys: CPU 25%/,
    );
  });
  test("PostToolUse within a minute of the last line stays silent", () => {
    const home = homeWithCache(1_000);
    expect(fire(home, "Stop").stdout).toContain(LINE);
    const r = fire(home, "PostToolUse");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("a stale reading is not shown", () => {
    const r = fire(homeWithCache(10 * 60_000), "Stop");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("no cache is fail-open: exit 0, no output", () => {
    const r = fire(tempHome(), "Stop");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
  test("a cached colored row is preferred over the plain one", () => {
    const home = homeWithCache(1_000);
    const cache = join(home, ".cache", "claude", "statusline-sys.json");
    const colored =
      "\u001b[38;5;74mSys:\u001b[0m CPU \u001b[38;5;71m25%\u001b[0m";
    const cur = JSON.parse(readFileSync(cache, "utf8"));
    writeFileSync(cache, JSON.stringify({ ...cur, ansi: colored }));
    expect(JSON.parse(fire(home, "Stop").stdout).systemMessage).toContain(
      colored,
    );
  });
  const writeRate = (
    home: string,
    sid: string,
    line: string,
    ageMs = 1_000,
  ) => {
    const dir = join(home, ".cache", "claude", "statusline-rate");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, `${sid}.json`),
      JSON.stringify({
        at: Temporal.Now.instant().epochMilliseconds - ageMs,
        line,
      }),
    );
  };
  const RATE = "Rate: 5h 40% ⟳2h · 7d 60% ⟳5d";
  test("this session's Rate row comes first on its own line", () => {
    const home = homeWithCache(1_000);
    writeRate(home, "s1", RATE);
    expect(body(fire(home, "Stop").stdout)).toBe(`${RATE} | ${LINE}`);
  });
  test("another session's Rate row is never shown here", () => {
    const home = homeWithCache(1_000);
    writeRate(home, "other", "Rate: 7d 51% ⟳5d");
    expect(body(fire(home, "Stop").stdout)).toBe(LINE);
  });
  test("a stale or empty Rate row leaves only the Sys row", () => {
    const stale = homeWithCache(1_000);
    writeRate(stale, "s1", RATE, 10 * 60_000);
    expect(body(fire(stale, "Stop").stdout)).toBe(LINE);
    const empty = homeWithCache(1_000);
    writeRate(empty, "s1", "");
    expect(body(fire(empty, "Stop").stdout)).toBe(LINE);
  });
});
