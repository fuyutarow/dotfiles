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
    expect(ctx).toContain("0 hits ≠ 不在");
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

// Bash-borne searches (2026-07-25) — the pathway the Grep-only matcher missed entirely.
// The two commands below are transcribed from the firedancer audit transcript that
// exposed the hole; both reached "not present" and neither fired the old hook.
describe("Bash search coverage", () => {
  const HOOK = "nudge-ccc-on-zero-grep.ts";

  // A fresh temp project per call keeps the once-per-(session,project) sentinel from
  // making these tests order- or run-dependent.
  const bash = (
    command: string,
    resp: unknown,
    session: string,
    project = registerProject(),
  ) => ({
    session_id: session,
    cwd: project,
    tool_name: "Bash",
    tool_input: { command },
    tool_response: resp,
  });

  test("observed case A: compound echo+grep whose only output is the banner", () => {
    const cmd =
      'echo "=== grep for RDT-related scaffolds ===" && grep -n "GB119\\|RDT\\|r_max" docs/ledger.md | head -80';
    const r = runHook(
      HOOK,
      bash(
        cmd,
        { stdout: "=== grep for RDT-related scaffolds ===\n", stderr: "" },
        "s-bash-a",
      ),
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("ccc search");
  });

  test("observed case B: ugrep prints 'No matches found'", () => {
    const r = runHook(
      HOOK,
      bash(
        'grep -n "GB118" docs/ledger.md',
        { stdout: "No matches found\n", stderr: "" },
        "s-bash-b",
      ),
    );
    expect(r.stdout).toContain("ccc search");
  });

  test("find with -iname and no output fires", () => {
    const r = runHook(
      HOOK,
      bash('find . -iname "*gb119*"', { stdout: "", stderr: "" }, "s-bash-c"),
    );
    expect(r.stdout).toContain("ccc search");
  });

  test("a search WITH hits stays silent", () => {
    const r = runHook(
      HOOK,
      bash(
        'rg -n "pattern" src/',
        { stdout: "src/a.ts:12:pattern\n", stderr: "" },
        "s-bash-d",
      ),
    );
    expect(r.stdout.trim()).toBe("");
  });

  test("a non-search Bash command stays silent even with empty output", () => {
    const r = runHook(
      HOOK,
      bash("mkdir -p /tmp/x", { stdout: "", stderr: "" }, "s-bash-e"),
    );
    expect(r.stdout.trim()).toBe("");
  });

  test("a bare `find dir` listing is not a search", () => {
    const r = runHook(
      HOOK,
      bash("find build", { stdout: "", stderr: "" }, "s-bash-f"),
    );
    expect(r.stdout.trim()).toBe("");
  });

  test("an errored command is not evidence of absence", () => {
    const r = runHook(
      HOOK,
      bash(
        'grep -n "x" missing.md',
        { stdout: "", stderr: "grep: missing.md: No such file" },
        "s-bash-g",
      ),
    );
    expect(r.stdout.trim()).toBe("");
  });

  test("`--include=*.grep` in a non-search command does not trip the verb regex", () => {
    const r = runHook(
      HOOK,
      bash("ls --include=*.grep", { stdout: "", stderr: "" }, "s-bash-h"),
    );
    expect(r.stdout.trim()).toBe("");
  });

  test("fires at most once per session x project", () => {
    const project = registerProject();
    const first = runHook(
      HOOK,
      bash(
        'grep -n "zzz" a.md',
        { stdout: "", stderr: "" },
        "s-bash-once",
        project,
      ),
    );
    expect(first.stdout).toContain("ccc search");
    const second = runHook(
      HOOK,
      bash(
        'rg -n "yyy" b.md',
        { stdout: "", stderr: "" },
        "s-bash-once",
        project,
      ),
    );
    expect(second.stdout.trim()).toBe("");
  });

  test("output that merely CONTAINS 'No matches found' is a hit, not a miss", () => {
    const r = runHook(
      HOOK,
      bash(
        'rg -N "No matches found" test.log',
        {
          stdout: "test.log:12:assert ugrep prints 'No matches found'\n",
          stderr: "",
        },
        "s-bash-substr",
      ),
    );
    expect(r.stdout.trim()).toBe("");
  });
});

// T2 (2026-07-25) — the half a zero-hit trigger cannot see: grep FOUND something, so
// nothing looked wrong, and the real implementation sat under a different name.
describe("T2 search-run trigger", () => {
  const HOOK = "nudge-ccc-on-zero-grep.ts";
  const hit = { stdout: "src/a.ts:1:found\n", stderr: "" };
  const bash = (command: string, session: string, project: string) => ({
    session_id: session,
    cwd: project,
    tool_name: "Bash",
    tool_input: { command },
    tool_response: hit,
  });

  test("8 hitting searches with no ccc -> nudge naming the stride count", () => {
    const project = registerProject();
    let last = { stdout: "", code: 0 };
    for (let i = 1; i <= 8; i++) {
      last = runHook(HOOK, bash(`rg -n "tok${i}" src/`, "s-t2", project));
      if (i < 8) expect(last.stdout.trim()).toBe("");
    }
    expect(last.stdout).toContain("8 literal searches");
    expect(last.stdout).toContain("ccc search");
  });

  test("running ccc silences T2 permanently for that session x project", () => {
    const project = registerProject();
    runHook(HOOK, bash("ccc search 'concept' --limit 8", "s-t2b", project));
    for (let i = 1; i <= 12; i++) {
      const r = runHook(HOOK, bash(`rg -n "tok${i}" src/`, "s-t2b", project));
      expect(r.stdout.trim()).toBe("");
    }
  });

  test("merely MENTIONING ccc in a heredoc does not count as running it", () => {
    const project = registerProject();
    let last = { stdout: "", code: 0 };
    // A commit message that talks about ccc must not silence the nudge.
    runHook(
      HOOK,
      bash("git commit -m 'use ccc search next time'", "s-t2c", project),
    );
    for (let i = 1; i <= 8; i++) {
      last = runHook(HOOK, bash(`rg -n "tok${i}" src/`, "s-t2c", project));
    }
    expect(last.stdout).toContain("literal searches");
  });

  test("outside a ccc project T2 never fires", () => {
    const dir = tempDir("ccc-none-t2-");
    for (let i = 1; i <= 12; i++) {
      const r = runHook(HOOK, bash(`rg -n "tok${i}" src/`, "s-t2d", dir));
      expect(r.stdout.trim()).toBe("");
    }
  });
});
