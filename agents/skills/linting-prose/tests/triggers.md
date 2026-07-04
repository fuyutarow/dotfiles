# Trigger desk-check set (F3) — re-run after ANY description edit

Procedure: for each row, ask "given this user ask and the description alone, does the router pick
this skill?" Fire rows must match; no-fire rows must route to the named owner. A failed row = a
description defect — fix the description, not the row.

## FIRES (≥5)

| ask | why |
|---|---|
| 「このレポートを推敲して」「文章校正かけて」 | core territory (校正/推敲 keywords) |
| 「このabstract、LLMっぽい/AI臭い文体を直して」 | AI-slop keywords |
| 「ルー語がひどい/ジャーゴンだらけ。外部向けに直せる?」 | register/code-mixing keywords |
| agent が自分の review/status prose を出す前の self-lint | "an agent's own review prose" |
| 外賓向け one-pager を書き始める前（audience line から） | "Use BEFORE writing" + 外賓向け |
| 「この文書、textlint どの config で回すべき?」 | textlint/prh keywords + profile choice |
| 「撤回したはずの主張が表に残ってないか見て」 | lifecycle keywords (撤回済み) |

## MUST NOT FIRE (≥5, near-miss)

| ask | routes to |
|---|---|
| 「スライドの章立て/デッキの流れを設計して」 | designing-presentations |
| 「この設計書、情報が散在してる。MECE に再構成して」 | structuring-documents |
| 「この SKILL.md の文面を改善して」 | forging-skills (model-facing prose) |
| 「textlint を pre-commit hook / CI に組み込んで」 | operating-the-harness |
| 「この20本の論文をまとめてサーベイに」 | systematizing-knowledge |
| README の一語 typo を直すだけ | just fix it — no skill ceremony |
| 変数名・コード内コメントの英語を直す | not audience prose (code identifiers) |
