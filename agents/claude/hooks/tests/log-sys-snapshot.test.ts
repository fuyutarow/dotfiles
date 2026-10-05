import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "../../../hooks/zod.ts";
import { parseJson } from "../../../hooks/narrow.ts";
import { runHook, tempHome } from "./helpers.ts";
import { promptParts } from "../prompt-stamp.ts";
import { decoded } from "../../../hooks/tests/decode.ts";

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

function writeSession(
  home: string,
  sid: string,
  rows: string[],
  ageMs = 1_000,
): void {
  const dir = join(home, ".cache", "claude", "statusline-session");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${sid}.json`),
    JSON.stringify({
      at: Temporal.Now.instant().epochMilliseconds - ageMs,
      rows: rows.map((line) => ({ line })),
    }),
  );
}
// The hook prefixes user@host and the event time and joins fields with the bar's dimmed "|"; strip both.
const ESC = String.fromCodePoint(0x1b);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "gu");
const Message = z.looseObject({ systemMessage: z.string() });
const messageOf = (stdout: string): string =>
  decoded(Message, parseJson(stdout)).systemMessage;
const body = (stdout: string): string =>
  messageOf(stdout)
    .replace(ANSI, "")
    .replace(/^[^@\s]+@[^:\s]+:\d\d-\d\d \d\d:\d\d [+-]\d\d(?:\d\d)? \| /u, ""); // the prompt-stamp.ts head, offset included
const fire = (home: string, event: string) =>
  runHook(HOOK, { hook_event_name: event, session_id: "s1" }, { HOME: home });

describe("log-sys-snapshot", () => {
  test("Stop attaches the cached Sys row as a systemMessage", () => {
    const r = fire(homeWithCache(1_000), "Stop");
    expect(r.code).toBe(0);
    expect(body(r.stdout)).toBe(LINE);
  });

  test("one line: user@host:local event time, then the fields, joined by the bar's dimmed |", () => {
    const msg = messageOf(fire(homeWithCache(1_000), "Stop").stdout);
    expect(msg).not.toContain("\n");
    const { user, host } = promptParts("");
    expect(msg.replace(ANSI, "")).toMatch(
      new RegExp(
        `^${RegExp.escape(`${user}@${host}:`)}\\d\\d-\\d\\d \\d\\d:\\d\\d [+-]\\d\\d(?:\\d\\d)? \\| Sys: CPU 25%`,
        "u",
      ),
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
      "\u001B[38;5;74mSys:\u001B[0m CPU \u001B[38;5;71m25%\u001B[0m";
    const cur = decoded(
      z.looseObject({}),
      parseJson(readFileSync(cache, "utf8")),
    );
    writeFileSync(cache, JSON.stringify({ ...cur, ansi: colored }));
    expect(messageOf(fire(home, "Stop").stdout)).toContain(colored);
  });
  const CTX = "Ctx: 120k 60%";
  const RATE = "Rate: 5h 40% ⟳2h · 7d 60% ⟳5d";
  test("this session's rows follow the time in the order given: Ctx, Rate, then Sys", () => {
    const home = homeWithCache(1_000);
    writeSession(home, "s1", [CTX, RATE]);
    expect(body(fire(home, "Stop").stdout)).toBe(`${CTX} | ${RATE} | ${LINE}`);
  });
  test("another session's rows are never shown here", () => {
    const home = homeWithCache(1_000);
    writeSession(home, "other", ["Ctx: 9k 5%", "Rate: 7d 51% ⟳5d"]);
    expect(body(fire(home, "Stop").stdout)).toBe(LINE);
  });
  test("stale or empty session rows leave only the Sys row", () => {
    const stale = homeWithCache(1_000);
    writeSession(stale, "s1", [CTX, RATE], 10 * 60_000);
    expect(body(fire(stale, "Stop").stdout)).toBe(LINE);
    const empty = homeWithCache(1_000);
    writeSession(empty, "s1", [""]);
    expect(body(fire(empty, "Stop").stdout)).toBe(LINE);
  });
});
