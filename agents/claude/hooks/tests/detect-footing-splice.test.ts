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

// >=8 lines are required to escape the CONTEXT GATE. `filler` adds no comparison marker,
// no measurement-shaped number and no condition token.
const filler = "これは通常の説明行です。\n".repeat(8);

describe("detect-footing-splice", () => {
  const HOOK = "detect-footing-splice.ts";

  test("comparison + two measurements + no conditions -> systemMessage emitted", () => {
    const body = `${filler}fixed32 は 3.567006 で、相手は 2.931343 です。差は 0.635663 です。`;
    const t = writeTranscript([user("どうなった?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(typeof parsed.systemMessage).toBe("string");
    expect(parsed.systemMessage).toContain("P8");
  });

  test("same comparison with N stated -> silent", () => {
    const body = `${filler}N=2^19 で fixed32 は 3.567006、相手は 2.931343 です。差は 0.635663 です。`;
    const t = writeTranscript([user("どうなった?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("saying which axes do not match also satisfies", () => {
    const body = `${filler}3.567006 と 2.931343 を並べますが、土俵が揃っていません。`;
    const t = writeTranscript([user("どうなった?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("comparison with only ONE measurement-shaped number -> silent", () => {
    const body = `${filler}差は 0.635663 でした。前より良いです。`;
    const t = writeTranscript([user("どう?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("two measurements with NO comparison marker -> silent", () => {
    const body = `${filler}実測は 3.567006 でした。別の実測は 2.931343 でした。`;
    const t = writeTranscript([user("値は?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("counts and line numbers are not measurements -> silent", () => {
    const body = `${filler}18 対 12 のセルが終わり、docs/D2607_32:319 より良い順序です。`;
    const t = writeTranscript([user("状況は?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("numbers only inside a fence do not fire", () => {
    const body = `${filler}差は次のとおりです。\n\n\`\`\`text\n3.567006 対 2.931343\n\`\`\``;
    const t = writeTranscript([user("差は?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("conditions only inside a fence do NOT satisfy", () => {
    const body = `${filler}fixed32 は 3.567006、相手は 2.931343 で、差は 0.635663 です。\n\n\`\`\`text\nN=2^19\n\`\`\``;
    const t = writeTranscript([user("差は?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(typeof parsed.systemMessage).toBe("string");
  });

  test("倍 marker fires without conditions", () => {
    const body = `${filler}0.141150 に対し 0.138910 なので、およそ 1.016000 倍です。`;
    const t = writeTranscript([user("比は?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.systemMessage).toContain("倍");
  });

  test("short reply is exempt", () => {
    const body = "3.567006 対 2.931343 で差は 0.635663 です。";
    const t = writeTranscript([user("差は?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("stop_hook_active loop guard -> silent", () => {
    const body = `${filler}fixed32 は 3.567006、相手は 2.931343 で、差は 0.635663 です。`;
    const t = writeTranscript([user("差は?"), assistant(body)]);
    const r = runHook(HOOK, stopPayload(t, true));
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("missing transcript_path -> silent, exit 0", () => {
    const r = runHook(HOOK, { stop_hook_active: false });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("REPO GATE — outside firedancer the hook no-ops", () => {
    const body = `${filler}fixed32 は 3.567006 で、相手は 2.931343 です。差は 0.635663 です。`;
    const t = writeTranscript([user("?"), assistant(body)]);
    const r = runHook(
      HOOK,
      stopPayload(t, false, "/home/fuyu/Workspace/other-repo"),
    );
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });

  test("REPO GATE — missing cwd no-ops", () => {
    const body = `${filler}fixed32 は 3.567006 で、相手は 2.931343 です。差は 0.635663 です。`;
    const t = writeTranscript([user("?"), assistant(body)]);
    const r = runHook(HOOK, { transcript_path: t, stop_hook_active: false });
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });
});
