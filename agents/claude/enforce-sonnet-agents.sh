#!/usr/bin/env bash
# PreToolUse hook — 全 spawned agent を Sonnet に固定する（例外なし）。
# matcher: Agent|Task|Workflow
#
# Policy (user directive 2026-07-11「例外なく sonnet にするべき」):
#   - Agent/Task: model 省略 → updatedInput で model:'sonnet' を強制注入
#                 （CLAUDE_CODE_SUBAGENT_MODEL の belt — agent 定義 frontmatter の
#                  pinned model にも explicit param が勝つ）。
#                 model が sonnet 以外 → deny（理由文が修正指示になる）。
#                 subagent_type:'fork' は親モデル継承が仕様（model param 無視）→ 素通し。
#   - Workflow:   script 内の全 agent() 呼び出しが model:'sonnet' を literal に
#                 持たなければ deny。検証不能（named workflow / 子 workflow() /
#                 scriptPath 読めない）→ ask でユーザーに委ねる。
#
# 検証器は JS（文字列・テンプレート・コメントを length-preserving に blank した上で
# 括弧深度で agent() の呼び出し範囲を切り、model の値は原文で照合 — prompt 文字列内の
# "model:'sonnet'" では通らない）。bun 優先、node fallback。runtime 無し = fail CLOSED。
set -euo pipefail

PAYLOAD_FILE=$(mktemp)
JS_FILE=$(mktemp)
trap 'rm -f "$PAYLOAD_FILE" "$JS_FILE"' EXIT
cat > "$PAYLOAD_FILE"

RUNTIME=""
for c in bun node /opt/homebrew/bin/bun /opt/homebrew/bin/node \
  /home/linuxbrew/.linuxbrew/bin/bun /home/linuxbrew/.linuxbrew/bin/node /usr/local/bin/node; do
  if command -v "$c" > /dev/null 2>&1; then
    RUNTIME=$(command -v "$c")
    break
  fi
done
if [[ -z "$RUNTIME" ]]; then
  # fail CLOSED: 検証できないなら通さない（ポリシーは「例外なく」）
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"sonnet-agent policy: no bun/node runtime found to verify agent models — install bun (brew) and retry"}}\n'
  exit 0
fi

cat > "$JS_FILE" << 'EOF'
const fs = require('node:fs');

const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const tool = payload.tool_name || '';
const ti = payload.tool_input || {};

const out = (o) => { console.log(JSON.stringify(o)); process.exit(0); };
const decide = (permissionDecision, reason, extra = {}) =>
  out({ hookSpecificOutput: {
    hookEventName: 'PreToolUse', permissionDecision,
    permissionDecisionReason: reason, ...extra } });

const SONNET = /sonnet/i;

// ── Agent / Task ─────────────────────────────────────────────────────────
if (tool === 'Agent' || tool === 'Task') {
  if (ti.subagent_type === 'fork') process.exit(0); // fork は親モデル継承が仕様
  const m = ti.model;
  if (m && !SONNET.test(m)) {
    decide('deny',
      `sonnet-agent policy: model '${m}' is not allowed — every subagent runs on Sonnet. ` +
      `Re-issue this call with model:'sonnet' or omit model.`);
  }
  if (!m) {
    // 明示注入: agent 定義 frontmatter の pinned model より call param が勝つ
    decide('allow', "sonnet-agent policy: injected model:'sonnet'",
      { updatedInput: { ...ti, model: 'sonnet' } });
  }
  process.exit(0); // already sonnet
}

if (tool !== 'Workflow') process.exit(0);

// ── Workflow ─────────────────────────────────────────────────────────────
let src = typeof ti.script === 'string' ? ti.script : null;
if (!src && ti.scriptPath) {
  try { src = fs.readFileSync(ti.scriptPath, 'utf8'); }
  catch (e) {
    decide('ask', `sonnet-agent policy: cannot read scriptPath '${ti.scriptPath}' ` +
      `(${e.message}) — agent models unverified.`);
  }
}
if (!src) {
  decide('ask', `sonnet-agent policy: named workflow '${ti.name ?? '?'}' — script not ` +
    `inspectable, agent models unverified. Confirm its agents run on Sonnet.`);
}

// 文字列・テンプレート・コメントの中身を空白化（長さ保存）。
// → 中の括弧が呼び出し範囲スキャンを壊さず、prompt 文中の agent(/model: が検査を偽装できない。
function blank(s) {
  const chars = [...s];
  let st = 'code'; // code | s1 | s2 | tpl | line | block
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i], n = chars[i + 1];
    if (st === 'code') {
      if (c === "'") st = 's1';
      else if (c === '"') st = 's2';
      else if (c === '`') st = 'tpl';
      else if (c === '/' && n === '/') { st = 'line'; chars[i] = ' '; }
      else if (c === '/' && n === '*') { st = 'block'; chars[i] = ' '; }
    } else if (st === 's1' || st === 's2' || st === 'tpl') {
      const q = st === 's1' ? "'" : st === 's2' ? '"' : '`';
      if (c === '\\') { chars[i] = ' '; if (n !== undefined && n !== '\n') { chars[i + 1] = ' '; i++; } }
      else if (c === q) st = 'code';
      else if (c !== '\n') chars[i] = ' ';
    } else if (st === 'line') {
      if (c === '\n') st = 'code'; else chars[i] = ' ';
    } else { // block
      if (c === '*' && n === '/') { chars[i] = ' '; chars[i + 1] = ' '; i++; st = 'code'; }
      else if (c !== '\n') chars[i] = ' ';
    }
  }
  return chars.join('');
}

const blanked = blank(src);

if (/\bworkflow\s*\(/.test(blanked)) {
  decide('ask', "sonnet-agent policy: script calls workflow() — child workflow agents " +
    "cannot be verified here. Confirm every agent() in the child also passes model:'sonnet'.");
}

const bad = [];
const re = /\bagent\s*\(/g;
let m;
while ((m = re.exec(blanked)) !== null) {
  const open = m.index + m[0].length;
  let depth = 1, i = open;
  while (i < blanked.length && depth > 0) {
    if (blanked[i] === '(') depth++;
    else if (blanked[i] === ')') depth--;
    i++;
  }
  const span = blanked.slice(open, i);
  // span 内の全 model: キーを見て、どれかの値が原文で 'sonnet' literal なら OK
  let ok = false;
  const kre = /\bmodel\s*:\s*/g;
  let km;
  while ((km = kre.exec(span)) !== null) {
    const vpos = open + km.index + km[0].length;
    if (/^['"`]sonnet['"`]/.test(src.slice(vpos, vpos + 8))) { ok = true; break; }
  }
  if (!ok) bad.push(src.slice(0, m.index).split('\n').length);
}

if (bad.length) {
  decide('deny',
    `sonnet-agent policy: agent() call(s) missing model:'sonnet' at line(s) ` +
    `${[...new Set(bad)].join(', ')}. Every agent() in a Workflow script MUST pass ` +
    `{model:'sonnet'} literally (all subagents run on Sonnet — no exceptions). ` +
    `Fix the script and re-invoke.`);
}
process.exit(0);
EOF

exec "$RUNTIME" "$JS_FILE" "$PAYLOAD_FILE"
