import { describe, expect, test } from "bun:test";
import { assistant, runHook, user, writeTranscript } from "./helpers.ts";

const stopPayload = (transcript_path: string, active = false) => ({
  transcript_path,
  stop_hook_active: active,
});

// A >=8-line assistant reply is required to escape the CONTEXT GATE (short conversational
// replies are exempt). `filler` pads a message to that length without adding any claim or
// denominator token of its own.
const filler = "これは通常の説明行です。\n".repeat(8);

describe("detect-groundless-claim", () => {
  const HOOK = "detect-groundless-claim.ts";

  test("claim token, no denominator, >=8 lines -> systemMessage JSON emitted", () => {
    const body = `${filler}この検証は実証されました。`;
    const t = writeTranscript([user("進捗どう?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(typeof parsed.systemMessage).toBe("string");
    expect(parsed.systemMessage).toContain("実証");
    expect(parsed.systemMessage).toContain("分母");
  });

  test("claim WITH a denominator (分母 word) -> silent exit 0", () => {
    const body = `${filler}この件は実証されました。分母は agents/claude/hooks/lib.ts:47 を照合済みです。`;
    const t = writeTranscript([user("進捗どう?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("claim WITH a file:line citation (no 分母 word) -> silent exit 0", () => {
    const body = `${filler}この件は実証されました。根拠は agents/claude/hooks/lib.ts:47 です。`;
    const t = writeTranscript([user("進捗どう?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("short message with a claim token (<8 lines) -> silent", () => {
    const t = writeTranscript([
      user("進捗どう?"),
      assistant("実証できました。"),
    ]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("claim only inside a code fence -> silent (code-stripped)", () => {
    const body = `${filler}\`\`\`\n実証されました。達成です。\n\`\`\`\n`;
    const t = writeTranscript([user("進捗どう?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("malformed stdin -> FAIL OPEN exit 0", () => {
    const r = runHook(HOOK, "{not json");
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });

  test("loop guard: stop_hook_active -> silent exit 0", () => {
    const body = `${filler}この検証は実証されました。全体として達成です。`;
    const t = writeTranscript([user("進捗どう?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t, true));
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe("");
  });
});
