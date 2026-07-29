import { describe, expect, test } from "bun:test";
import { assistant, runHook, user, writeTranscript } from "./helpers.ts";

const REPO = "/home/fuyu/Workspace/firedancer";

const stopPayload = (
  transcript_path: string,
  active = false,
  cwd: string = REPO,
) => ({
  transcript_path,
  stop_hook_active: active,
  cwd,
});

// >=8 lines are required to escape the CONTEXT GATE. `filler` pads without adding any
// diagnosis token or canonical pointer of its own.
const filler = "これは通常の説明行です。\n".repeat(8);

describe("detect-uncited-diagnosis", () => {
  const HOOK = "detect-uncited-diagnosis.ts";

  test("diagnosis token, no citation, >=8 lines -> systemMessage emitted", () => {
    const body = `${filler}クリティカルイシューは提案の生成です。`;
    const t = writeTranscript([user("何が問題?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(typeof parsed.systemMessage).toBe("string");
    expect(parsed.systemMessage).toContain("クリティカル");
    expect(parsed.systemMessage).toContain("docs/INDEX.md");
  });

  test("diagnosis with a docs/ pointer -> silent", () => {
    const body = `${filler}クリティカルイシューは docs/D2607_32 が名指ししています。`;
    const t = writeTranscript([user("何が問題?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("diagnosis with a file:line -> silent", () => {
    const body = `${filler}原因は theory/AXIOMATIC-SYSTEM.md:323 の到達条件です。`;
    const t = writeTranscript([user("原因は?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("diagnosis with an explicit 正本に無い admission -> silent", () => {
    const body = `${filler}突破口については正本に無いので、発注者へ回します。`;
    const t = writeTranscript([user("突破口は?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("short reply is exempt by the context gate", () => {
    const body = "クリティカルイシューは提案の生成です。";
    const t = writeTranscript([user("何が問題?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("no diagnosis token -> silent even without any citation", () => {
    const body = `${filler}発射しました。完了を待ちます。`;
    const t = writeTranscript([user("進めて"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("stop_hook_active loop guard -> silent", () => {
    const body = `${filler}クリティカルイシューは提案の生成です。`;
    const t = writeTranscript([user("何が問題?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t, true));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("a diagnosis quoted inside a fence does not fire", () => {
    const body = `${filler}\n\`\`\`text\nクリティカルイシューは提案の生成です。\n\`\`\`\n引用です。`;
    const t = writeTranscript([user("何?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("a citation only inside a fence does NOT satisfy", () => {
    const body = `${filler}クリティカルイシューは提案の生成です。\n\n\`\`\`text\ndocs/D2607_32\n\`\`\``;
    const t = writeTranscript([user("何?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(typeof parsed.systemMessage).toBe("string");
  });

  test("ブレイクスルー token fires without a citation", () => {
    const body = `${filler}ブレイクスルーは状態を運ぶことです。`;
    const t = writeTranscript([user("突破は?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.systemMessage).toContain("ブレイクスルー");
  });

  test("missing transcript_path -> silent, exit 0", () => {
    const r = runHook(HOOK, { stop_hook_active: false });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("REPO GATE — outside firedancer the hook no-ops", () => {
    const body = `${filler}クリティカルイシューは提案の生成です。`;
    const t = writeTranscript([user("?"), assistant(body)]);
    const r = runHook(
      HOOK,
      stopPayload(t, false, "/home/fuyu/Workspace/other-repo"),
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("REPO GATE — missing cwd no-ops", () => {
    const body = `${filler}クリティカルイシューは提案の生成です。`;
    const t = writeTranscript([user("?"), assistant(body)]);
    const r = runHook(HOOK, { transcript_path: t, stop_hook_active: false });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });
});
