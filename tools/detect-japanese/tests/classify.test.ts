import { expect, test } from "bun:test";
import { join } from "node:path";
import { classifyJapanesePrimary } from "../src/classify.ts";

test.each([
  [
    "Japanese technical prose with worker terminology",
    "コーディネーターと worker が結果を確認し、agx の実行記録を日本語で報告します。",
    "japanese-primary",
  ],
  [
    "English prose",
    "The coordinator reviewed the result and will report the implementation details now.",
    "non-japanese",
  ],
  [
    "Chinese incident quotation alone is not Japanese",
    "> 这是中文事故说明，检查不能只确认英语不存在，否则中文会被当成日语。",
    "non-japanese",
  ],
  [
    "actual Chinese incident is not Japanese",
    "已将正本收回为通用版本…它保留了原来的五项指令…",
    "non-japanese",
  ],
  [
    "Japanese phrase cannot hide long Chinese prose",
    "確認しました。 这是中文说明，这是中文说明，这是中文说明，这是中文说明，这是中文说明。",
    "non-japanese",
  ],
  [
    "recorded Chinese counterexample cannot gain admission from a Japanese token phrase",
    "確認しました。这是中文说明这是中文说明这是中文说明这是中文说明。",
    "non-japanese",
  ],
  [
    "kanji-heavy Japanese technical prose remains admitted",
    "運用担当者は本番環境の障害対応手順を確認し、設定変更の影響を記録します。",
    "japanese-primary",
  ],
  [
    "short Han-only heading beside Japanese prose remains admissible",
    "確認しました。\n概要",
    "japanese-primary",
  ],
  [
    "ticket identifiers do not outweigh Japanese status prose",
    "th600_salv の再実行は bench_rep で失敗、u_dirty は未確認です。",
    "japanese-primary",
  ],
  [
    "dispatch identifiers and run IDs do not outweigh Japanese prose",
    "agt_xj15 を luna-high で再 dispatch しました。run 20261012-0312 は PASS。",
    "japanese-primary",
  ],
  [
    "identifier-heavy Markdown table beside Japanese prose remains admissible",
    "状態は次のとおりです。\n\n| issue | 状態 | worker |\n|---|---|---:|\n| th600_salv | active | 1 |\n| u_dirty | blocked | 0 |",
    "japanese-primary",
  ],
  [
    "paths and verification status do not outweigh Japanese prose",
    "完了。tools/agx/src/ticket.ts と CHANGELOG を更新、verify は exit=0。",
    "japanese-primary",
  ],
  [
    "short English completion message remains non-Japanese",
    "Done. I updated the classifier and all tests pass now.",
    "non-japanese",
  ],
  [
    "Japanese phrase cannot hide long English prose",
    "確認しました。 The implementation details are all written in English and this must not bypass the language hook.",
    "non-japanese",
  ],
  ["short Han-only abstains", "確認", "insufficient"],
  [
    "code and identifiers do not make prose non-Japanese",
    "実装を確認しました。\n```ts\nconst response = await readTranscript(path);\n```\n`detect-japanese` を利用します。",
    "japanese-primary",
  ],
  ["empty text has no human prose", "", "insufficient"],
  ["code only has no human prose", "```ts\nconst x = 1;\n```", "insufficient"],
] as const)("%s", (_name, text, outcome) => {
  expect(classifyJapanesePrimary(text).outcome).toBe(outcome);
});

test("CLI emits structured outcomes with meaningful exit statuses", async () => {
  const cli = join(import.meta.dir, "../src/cli.ts");
  for (const [text, code, outcome] of [
    ["結果を日本語で報告します。", 0, "japanese-primary"],
    ["This response is English prose.", 1, "non-japanese"],
    ["確認", 2, "insufficient"],
  ] as const) {
    const result = Bun.spawn([process.execPath, cli], {
      stdin: new Blob([text]),
      stdout: "pipe",
    });
    const stdout = await new Response(result.stdout).text();
    expect(await result.exited).toBe(code);
    expect(stdout).toContain(`"outcome":"${outcome}"`);
  }
});

test("English evidence counts only qualifying plain-word runs", () => {
  const short = classifyJapanesePrimary("alpha beta gamma");
  expect(short.outcome).toBe("insufficient");
  expect(short.evidence.englishLetters).toBe(14);

  const broken = classifyJapanesePrimary("alpha_beta gamma delta");
  expect(broken.outcome).toBe("insufficient");
  expect(broken.evidence.englishLetters).toBe(0);

  const acrossLines = classifyJapanesePrimary("alpha beta\ngamma delta");
  expect(acrossLines.outcome).toBe("insufficient");
  expect(acrossLines.evidence.englishLetters).toBe(0);

  const prose = classifyJapanesePrimary("alpha, beta; gamma: delta");
  expect(prose.outcome).toBe("non-japanese");
  expect(prose.reason).toBe("english-prose");
  expect(prose.evidence.englishLetters).toBe(19);
});

test("simplified-only Han markers report their own rejection reason", () => {
  const result = classifyJapanesePrimary(
    "这是中文说明这是中文说明这是中文说明这是中文说明。",
  );
  expect(result.outcome).toBe("non-japanese");
  expect(result.reason).toBe("chinese-markers");
  expect(result.evidence.chineseMarkers).toBeGreaterThanOrEqual(3);
});
