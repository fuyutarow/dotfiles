---
name: writing-technical-japanese
description: >-
  ENTRYPOINT / dispatcher for 木下是雄『理科系の作文技術』-style Japanese technical writing — it holds
  NO craft, it ROUTES to the house skills that do. Fire it when a request names the book or wants the
  WHOLE treatment (設計から監査まで一通り), then dispatch: structuring-documents (書く前の設計 / 第2〜3章
  目標規定文・内容の精選・重点先行・章立て) → linting-prose (書いた文の監査 / 第4〜8章 一文一義・言い切り・
  事実と意見・簡潔) → designing-presentations (口頭発表 / 第11章). For a NARROW structure-only or
  prose-only ask, its target skill fires directly — don't route through here. Residue owned by no
  skill: 記号・数式・単位 (SI) の厳密性・図表キャプションの独立性. `/koreo` is this skill's deliberate
  alias. Trigger on: 理科系の作文技術, 木下是雄, koreo, テクニカルライティング, 実用文を一通り,
  論文・レポートを設計から監査まで, 技術文書を木下式で. Japanese-language skill; respond in the user's language.
---

# 理科系の作文技術 — entrypoint

木下是雄『理科系の作文技術』の作法は、この collection では専門スキルが分担して所有する。
本スキルは craft を持たない **entrypoint** — 対象を見て、下記を順に起動するだけ。

## Dispatch（対象に応じて起動）

1. **`structuring-documents`** — 書く前の設計（第2〜3章）: 目標規定文・一文書一主題・内容の精選・
   重点先行・序論本論結論。文書構造を作る／再構成するなら必ずこれ。
2. **`linting-prose`** — 書いた文の監査（第4〜8章）: パラグラフ・一文一義・主述近接・逆茂木回避・
   言い切り・事実と意見の分離（スリカエ禁止）・簡潔。文・語の校正なら必ずこれ。
3. **`designing-presentations`** — 口頭発表・スライド（第11章）。発表なら。

**順序**: これから書くなら 1 → 2。既存文書の監査なら 2（構造に難があれば 1 へ差し戻す）。
発表資料なら 3 を足す。全 craft は起動先スキルにある — ここには置かない。

## 未所有の残件（どのスキルも持たない）

- **記号・数式・単位**: SI 厳守（`sec`→`s`、`Kg`→`kg`）、数式は文の一部。
- **図表キャプションの独立性**: 本文なしで単体で意味が通り、本文と「図1に示すように」で連動。

理科系原著論文でこれらが要るなら、起動先スキルではカバーされない。その場で明示的に補え。

## Fire / no-fire

FIRES: 「理科系の作文技術で書いて/直して」·「木下式で設計から監査まで」·「論文・レポートを
一通り見て」· `/koreo`。
MUST NOT fire: 構造だけの依頼（→ `structuring-documents` 直接）· 文・語の校正だけ
（→ `linting-prose` 直接）· スライド構成だけ（→ `designing-presentations` 直接）· LaTeX ビルド
（→ `compiling-latex`）· 英文プローズ（本書は日本語実用文の規範）。
