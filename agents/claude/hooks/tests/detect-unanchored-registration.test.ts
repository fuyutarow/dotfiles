import { describe, expect, test } from "bun:test";
import { runHook } from "./helpers.ts";

const HOOK = "detect-unanchored-registration.ts";
const REPO = "/home/fuyu/Workspace/firedancer";

function writePayload(filePath: string, content: string, cwd = REPO) {
  return {
    tool_name: "Write",
    tool_input: { file_path: filePath, content },
    cwd,
  };
}

function editPayload(
  filePath: string,
  newString: string,
  cwd = REPO,
  oldString = "old",
) {
  return {
    tool_name: "Edit",
    tool_input: {
      file_path: filePath,
      old_string: oldString,
      new_string: newString,
    },
    cwd,
  };
}

const COMPLETE = [
  "GB120 の登録。",
  "親目標: POC-NORTHSTAR-001。",
  "継承する判定: RESULTS.md:1511。",
  "定理の照合: T12。",
].join("\n");

describe("detect-unanchored-registration", () => {
  test("3行とも揃った登録 -> 通る(silent)", () => {
    const r = runHook(
      HOOK,
      writePayload(`${REPO}/notes/brainstorms/PREREG-GB120.md`, COMPLETE),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("親目標のIDだけ欠ける -> その1件を名指しで指摘", () => {
    const body = [
      "GB120 の登録。",
      "継承する判定: RESULTS.md:1511。",
      "定理の照合: T12。",
    ].join("\n");
    const r = runHook(
      HOOK,
      writePayload(`${REPO}/notes/brainstorms/PREREG-GB120.md`, body),
    );
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const ctx: string = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("親目標のID");
    expect(ctx).not.toContain("継承する判定(file:line)");
    expect(ctx).not.toContain("定理の照合:");
    expect(parsed.systemMessage).toContain("親目標のID");
  });

  test("file:line だけ欠ける -> その1件を名指しで指摘", () => {
    const body = [
      "GB120 の登録。",
      "親目標: POC-NORTHSTAR-001。",
      "定理の照合: T12。",
    ].join("\n");
    const r = runHook(
      HOOK,
      writePayload(`${REPO}/notes/brainstorms/PREREG-GB120.md`, body),
    );
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const ctx: string = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("継承する判定(file:line)");
    expect(ctx).not.toContain("親目標のID:");
    expect(ctx).not.toContain("定理の照合:");
  });

  test("定理の照合だけ欠ける -> その1件を名指しで指摘", () => {
    const body = [
      "GB120 の登録。",
      "親目標: POC-NORTHSTAR-001。",
      "継承する判定: RESULTS.md:1511。",
    ].join("\n");
    const r = runHook(
      HOOK,
      writePayload(`${REPO}/notes/brainstorms/PREREG-GB120.md`, body),
    );
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const ctx: string = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("定理の照合");
    expect(ctx).not.toContain("親目標のID:");
    expect(ctx).not.toContain("継承する判定(file:line):");
  });

  test("定理の照合: 該当なし の明示 -> 定理チェックは通る(欠落に出ない)", () => {
    const body = [
      "GB120 の登録。",
      "親目標: POC-NORTHSTAR-001。",
      "継承する判定: RESULTS.md:1511。",
      "定理の照合: 該当なし。",
    ].join("\n");
    const r = runHook(
      HOOK,
      writePayload(`${REPO}/notes/brainstorms/PREREG-GB120.md`, body),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("対象外の path (README.md) -> 何もしない", () => {
    const r = runHook(
      HOOK,
      writePayload(`${REPO}/README.md`, "no anchors here"),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("対象外のリポジトリ -> 何もしない", () => {
    const r = runHook(
      HOOK,
      writePayload(
        "/home/fuyu/Workspace/other-repo/PREREG-x.md",
        "no anchors",
        "/home/fuyu/Workspace/other-repo",
      ),
    );
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("**/*登録案*.md パス、Edit の new_string に3項目とも欠落 -> 指摘", () => {
    const r = runHook(
      HOOK,
      editPayload(
        `${REPO}/notes/brainstorms/GB120-登録案-新機構-2026-07-28.md`,
        "本文を少し書き足しただけ",
      ),
    );
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    const ctx: string = parsed.hookSpecificOutput.additionalContext;
    expect(ctx).toContain("親目標のID");
    expect(ctx).toContain("継承する判定(file:line)");
    expect(ctx).toContain("定理の照合");
  });

  test("firedancer/RESULTS.md (親ディレクトリ名が firedancer) が3項目とも揃う -> 通る", () => {
    const r = runHook(HOOK, editPayload(`${REPO}/RESULTS.md`, COMPLETE));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("firedancer/RESULTS.md で欠落 -> 指摘(ブロックしない, exit 0)", () => {
    const r = runHook(
      HOOK,
      editPayload(`${REPO}/RESULTS.md`, "些細な追記だけ"),
    );
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
    expect(typeof parsed.systemMessage).toBe("string");
  });

  test("Write/Edit 以外のツール (Bash) -> 何もしない", () => {
    const r = runHook(HOOK, {
      tool_name: "Bash",
      tool_input: { command: "echo hi" },
      cwd: REPO,
    });
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("relative file_path with no cwd -> fail open (silent)", () => {
    const r = runHook(HOOK, {
      tool_name: "Write",
      tool_input: { file_path: "PREREG-x.md", content: "no anchors" },
    });
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("malformed stdin -> FAIL OPEN exit 0", () => {
    const r = runHook(HOOK, "{not json");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
});
