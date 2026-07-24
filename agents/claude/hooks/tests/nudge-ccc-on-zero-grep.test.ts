import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { runHook, tempDir } from "./helpers.ts";

// A ccc-registered project: a temp dir carrying `.cocoindex_code/settings.yml`.
function registerProject(): string {
  const dir = tempDir("ccc-project-");
  mkdirSync(join(dir, ".cocoindex_code"), { recursive: true });
  writeFileSync(
    join(dir, ".cocoindex_code", "settings.yml"),
    "include_patterns: []\n",
  );
  return dir;
}

const zeroHitResponse = () => ({
  mode: "files_with_matches",
  filenames: [],
  numFiles: 0,
  totalFiles: 0,
});
const nonZeroHitResponse = () => ({
  mode: "files_with_matches",
  filenames: ["a.ts"],
  numFiles: 1,
  totalFiles: 1,
});

function grepPayload(path: string, sessionId: string, response: unknown) {
  return {
    session_id: sessionId,
    tool_name: "Grep",
    tool_input: { pattern: "needle", path },
    tool_response: response,
    cwd: path,
  };
}

describe("nudge-ccc-on-zero-grep", () => {
  const HOOK = "nudge-ccc-on-zero-grep.ts";

  test("zero-hit grep inside a ccc-registered project -> additionalContext with project path", () => {
    const project = registerProject();
    const r = runHook(HOOK, grepPayload(project, "sess-a", zeroHitResponse()));
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    const ctx: string = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain(project);
    expect(ctx).toContain("ccc search");
    expect(ctx).toContain("Grep 0 hits ≠ 不在");
    expect(ctx).toContain("CC3");
  });

  test("same session_id + same project fired twice -> second call is silent", () => {
    const project = registerProject();
    const payload = grepPayload(project, "sess-b", zeroHitResponse());
    const r1 = runHook(HOOK, payload);
    expect(r1.code).toBe(0);
    expect(r1.stdout.trim()).not.toBe("");

    const r2 = runHook(HOOK, payload);
    expect(r2.code).toBe(0);
    expect(r2.stdout.trim()).toBe("");
  });

  test("non-zero-hit grep response -> silent", () => {
    const project = registerProject();
    const r = runHook(
      HOOK,
      grepPayload(project, "sess-c", nonZeroHitResponse()),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("unregistered directory (no .cocoindex_code anywhere up to root) -> silent", () => {
    const dir = tempDir("ccc-none-");
    const r = runHook(HOOK, grepPayload(dir, "sess-d", zeroHitResponse()));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("malformed stdin -> FAIL OPEN exit 0", () => {
    const r = runHook(HOOK, "{not json");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("different session_id on the same project -> fires again", () => {
    const project = registerProject();
    const r1 = runHook(
      HOOK,
      grepPayload(project, "sess-f1", zeroHitResponse()),
    );
    expect(r1.code).toBe(0);
    expect(r1.stdout.trim()).not.toBe("");

    const r2 = runHook(
      HOOK,
      grepPayload(project, "sess-f2", zeroHitResponse()),
    );
    expect(r2.code).toBe(0);
    expect(r2.stdout.trim()).not.toBe("");
    const parsed2 = JSON.parse(r2.stdout);
    expect(parsed2.hookSpecificOutput.additionalContext).toContain(project);
  });
});
