import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
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
const fire = (home: string, event: string) =>
  runHook(HOOK, { hook_event_name: event, session_id: "s1" }, { HOME: home });

describe("log-sys-snapshot", () => {
  test("Stop attaches the cached Sys row as a systemMessage", () => {
    const r = fire(homeWithCache(1_000), "Stop");
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ systemMessage: LINE });
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
});
