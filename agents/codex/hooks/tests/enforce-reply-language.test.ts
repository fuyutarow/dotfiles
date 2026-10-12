import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const hook = join(import.meta.dir, "..", "enforce-reply-language.ts");
const shellEntry = join(import.meta.dir, "..", "run-reply-language.sh");

function run(payload: unknown) {
  return Bun.spawnSync([process.execPath, hook], {
    stdin: Buffer.from(JSON.stringify(payload)),
    env: { ...process.env, HOOK_SLUG: "reply-language" },
    timeout: 5_000,
  });
}

function runShellEntry(payload: unknown) {
  return Bun.spawnSync(["sh", shellEntry], {
    stdin: Buffer.from(JSON.stringify(payload)),
    // This is the rendered Codex command's declaration. The shim must preserve it.
    env: { ...process.env, HOOK_SLUG: "dotfiles:reply-language" },
    timeout: 5_000,
  });
}

describe("Codex enforce-reply-language", () => {
  test("blocks the actual Chinese incident from the supported Stop payload", () => {
    const result = run({
      last_assistant_message: "已将正本收回为通用版本…它保留了原来的五项指令…",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('"decision":"block"');
    expect(result.stdout.toString()).toContain("[dotfiles:reply-language]");
  });

  test("allows Japanese technical prose and code-only final replies", () => {
    for (const last_assistant_message of [
      "コーディネーターと worker が結果を確認し、agx の実行記録を日本語で報告します。",
      "```ts\\nconst response = await readTranscript(path);\\n```",
    ]) {
      const result = run({ last_assistant_message });
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toBe("");
      expect(result.stderr.toString()).toBe("");
    }
  });

  test("allows identifier-heavy Japanese status reply end to end", () => {
    const result = run({
      last_assistant_message:
        "th600_salv の再実行は bench_rep で失敗、u_dirty は未確認です。",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe("");
    expect(result.stderr.toString()).toBe("");
  });

  test("preserves the Stop loop guard and does not treat a missing reply as English", () => {
    for (const payload of [
      { stop_hook_active: true, last_assistant_message: "This must not loop." },
      {},
    ]) {
      const result = run(payload);
      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString()).toBe("");
    }
  });

  test("shell entry preserves the declared shared slug", () => {
    const result = runShellEntry({
      last_assistant_message:
        "確認しました。这是中文说明这是中文说明这是中文说明这是中文说明。",
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain('"decision":"block"');
    expect(result.stdout.toString()).toContain("[dotfiles:reply-language]");
  });
});
