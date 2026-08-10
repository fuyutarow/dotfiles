// doctrine-check.ts — mechanical floor over a DOCTRINE draft.
//
// THIS IS NOT A SEMANTIC CHECK. It cannot tell you whether the sacrifice is the right one,
// whether the regime is real, whether the binding surface actually binds, or whether the
// divergence probe was run honestly. It checks SHAPE only: that each rule states what it
// defeats, names a surface, and that the document carries a custodian and a review date.
// Judgment stays with the gates in SKILL.md; this script owns the floor beneath them.
//
// Usage:  bun scripts/doctrine-check.ts <doctrine.md> [more.md ...]
// Exit:   0 = no FAIL (WARNs may still be present), 1 = at least one FAIL, 2 = usage/IO error.

import { cli } from "cleye";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

const UNFALSIFIABLE = [
  "integrity", "quality", "excellence", "respect", "innovation", "transparency",
  "accountability", "teamwork", "customer focus", "safety first", "professionalism",
  "誠実", "品質", "卓越", "尊重", "革新", "透明性", "責任感", "チームワーク", "安全第一",
];

const SURFACE_TOKENS = [
  "NUMBER-TRANSFERS-RIGHT", "STOP-AT-DETECTION", "CAP-PLUS-INCENTIVE-CUT",
  "DEFAULT-NON-EXTENSION", "PROGRAM-DENIES", "ADVISORY",
];

const TRADE_FORM = /(?:^|[^-<>=])[>＞](?:[^-<>=]|$)/;
const TABLE_SEPARATOR = /^\|[\s:|-]+\|?$/;

let failures = 0;

const fail = (file: string, message: string): void => {
  process.stdout.write(`FAIL ${file}: ${message}\n`);
  failures += 1;
};
const warn = (file: string, message: string): void => {
  process.stdout.write(`WARN ${file}: ${message}\n`);
};

const cells = (row: string): string[] => {
  let parts = row.trim().split("|");
  if (row.trim().startsWith("|")) parts = parts.slice(1);
  if (row.trim().endsWith("|")) parts = parts.slice(0, -1);
  return parts.map((c) => c.trim());
};

const findColumn = (header: string[], pattern: RegExp): number =>
  header.findIndex((h) => pattern.test(h));

type RuleTable = { header: string[]; rows: string[][] };

// A rule table is a markdown table whose header names both a rule column and a
// defeated-value column. Anything else in the document is ignored.
function findRuleTable(lines: string[]): RuleTable | undefined {
  for (let i = 0; i < lines.length - 1; i += 1) {
    const line = lines[i] ?? "";
    if (!line.trim().startsWith("|")) continue;
    if (!TABLE_SEPARATOR.test((lines[i + 1] ?? "").trim())) continue;
    const header = cells(line);
    if (findColumn(header, /rule|規則|原則|条/i) === -1) continue;
    if (findColumn(header, /defeat|sacrific|犠牲|捨て|失う/i) === -1) continue;
    const rows: string[][] = [];
    for (let j = i + 2; j < lines.length; j += 1) {
      const row = lines[j] ?? "";
      if (!row.trim().startsWith("|")) break;
      if (TABLE_SEPARATOR.test(row.trim())) continue;
      rows.push(cells(row));
    }
    return { header, rows };
  }
  return undefined;
}

async function checkFile(file: string): Promise<void> {
  let text: string;
  try {
    text = await Bun.file(file).text();
  } catch {
    fail(file, "cannot read file");
    return;
  }
  const lines = text.split("\n");

  // --- document-level requirements (D2, D6, D7) ---
  if (!/custodian|CUSTODIAN|管理者|所管/.test(text)) {
    fail(file, "no CUSTODIAN named — D2 requires one owner who may change this");
  }
  if (!/review-by|REVIEW-BY|next review|次回レビュー|レビュー期限/i.test(text)) {
    fail(file, "no review-by date — D2 requires a review commitment at publication");
  }
  if (!/retirement trigger|RETIREMENT TRIGGER|失効条件|撤回条件/i.test(text)) {
    fail(file, "no RETIREMENT TRIGGER — D2 requires the observable that retires a rule");
  }
  if (!/deviation log|DEVIATION LOG|逸脱台帳|例外台帳/i.test(text)) {
    warn(file, "no DEVIATION LOG — D6 expects legitimate deviation to have a home");
  }
  if (!/advance non-compliance|ADVANCE NON-COMPLIANCE|事前非遵守|事前宣言/i.test(text)) {
    warn(file, "no ADVANCE NON-COMPLIANCE section — D6's advance-declaration instrument is absent");
  }
  if (!/divergence probe|DIVERGENCE PROBE|分岐テスト|分岐率/i.test(text)) {
    warn(file, "no DIVERGENCE PROBE recorded — D7 is unpassed until it runs");
  }

  // --- rule-level requirements (D1, D5) ---
  const table = findRuleTable(lines);
  if (table === undefined) {
    fail(file, "no rule table found — need a table with a rule column and a defeated-value column");
    return;
  }

  const ruleColumn = findColumn(table.header, /rule|規則|原則|条/i);
  const defeatedColumn = findColumn(table.header, /defeat|sacrific|犠牲|捨て|失う/i);
  const surfaceColumn = findColumn(table.header, /surface|拘束面|機構|enforce/i);
  if (surfaceColumn === -1) {
    fail(file, "rule table has no binding-surface column — D5 cannot be checked");
  }

  if (table.rows.length === 0) fail(file, "rule table has no rows");
  if (table.rows.length > 7) {
    warn(
      file,
      `${table.rows.length} rules — past ~7 the set exceeds what one actor recites; justify or merge (the cap is a memory argument, not a measurement)`,
    );
  }

  for (const [index, row] of table.rows.entries()) {
    const label = `rule row ${index + 1}`;
    const rule = row[ruleColumn] ?? "";
    const defeated = row[defeatedColumn] ?? "";

    if (rule === "") {
      fail(file, `${label}: empty rule cell`);
      continue;
    }
    if (!TRADE_FORM.test(rule)) {
      fail(file, `${label}: no "A > B" trade form in the rule cell — D1`);
    }
    if (defeated === "" || defeated === "-" || defeated === "—") {
      fail(file, `${label}: no defeated value named — D1`);
    }
    const lowered = rule.toLowerCase();
    for (const word of UNFALSIFIABLE) {
      if (lowered.includes(word.toLowerCase()) && !TRADE_FORM.test(rule)) {
        fail(file, `${label}: bare value "${word}" with no trade — fails the negation test (D1)`);
        break;
      }
    }
    if (/\bboth\b|も.*も大事|両立/.test(rule)) {
      fail(file, `${label}: "both" with no ordering — trade-off erasure (D1)`);
    }
    if (surfaceColumn !== -1) {
      const surface = row[surfaceColumn] ?? "";
      if (surface === "" || surface === "-" || surface === "—") {
        fail(file, `${label}: no binding surface named and not marked ADVISORY — D5`);
      } else if (!SURFACE_TOKENS.some((t) => surface.toUpperCase().includes(t))) {
        warn(
          file,
          `${label}: binding surface "${surface}" is not one of the named types or ADVISORY — check it is a real mechanism`,
        );
      }
    }
  }
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "doctrine-check.ts",
      // Optional, not `<required>`: the empty case keeps its own exit-2 usage message
      // rather than cleye's exit-1 "missing parameter".
      parameters: ["[files...]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  const files = parsed._;
  if (files.length === 0) {
    process.stderr.write("usage: bun scripts/doctrine-check.ts <doctrine.md> [more.md ...]\n");
    process.exit(2);
  }
  for (const file of files) await checkFile(file);
  process.exit(failures === 0 ? 0 : 1);
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(`FATAL: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  });
}

export { checkFile, findRuleTable };
