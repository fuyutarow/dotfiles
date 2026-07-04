---
name: structuring-documents
description: >-
  Organize and restructure a DOCUMENT'S information architecture — the layer beneath sentence
  readability. Make it MECE (every fact in exactly ONE section; every fact has a home),
  single-source-of-truth (no claim/number duplicated across sections → one update point), a
  backward-only reference DAG (later sections cite earlier, never forward), and coherent as a
  whole 認識体系. Restructure preservation-first: fear the edit that destroys a load-bearing
  argument, don't rewrite what's already adequate, preserve ambitious claims' implications, and
  delete genuine nonsense sections — 構造化 is the goal, not 圧縮. Use when a
  report/spec/design-doc/README/notes is scattered, repeats itself, references forward, or needs
  reorganizing; also for internal / model-facing docs (reader = the next agent/LLM), and when a
  linting-prose finding needs a fix that MOVES information (relocate/dedupe/reorder). Owns the
  pre-writing architecture of 木下『理科系の作文技術』第2〜3章: 目標規定文・一文書一主題・内容の精選・
  重点先行(document scale). Triggers: MECE, 局所化, 情報が散在, 重複, 単一の情報源, 前方参照,
  ドキュメント再構成, REORG, 保全原則, 認識体系, 構造化, 章立て, 目標規定文, 内容の精選, 重点先行,
  single source of truth, restructure/reorganize a doc. Cut vs linting-prose is FIX-LOCALITY:
  rewrite-words-in-place → linting-prose; move-information-across-the-document → here. NOT
  sentence/word/register readability or a paragraph's own topic sentence (→ linting-prose); NOT
  slide/deck order or inserting diagrams (→ designing-presentations); NOT a paper corpus (→
  systematizing-knowledge); NOT SKILL.md prose (→ forging-skills). English skill; respond in the
  user's language (default Japanese).
---

# Structuring documents — information architecture, not sentence polish

> **Version**: v2607.3.0 (2026-07-05) — distilled from the house `/MECE` + `/REORG` + `/LINT_PAGER`
> prompts; v2 fixed the `linting-prose` cut from "orthogonal axes" (overclaim) to a MODE cut; v3
> re-cut that boundary to **FIX-LOCALITY** (rewrite-words-in-place → linting-prose; move-information-
> across-the-document → here) and grounded this skill's pre-writing design in 木下『理科系の作文技術』
> **第2〜3章** — 目標規定文・一文書一主題・内容の精選・重点先行(document scale) now live HERE, not in
> linting-prose L4. F3 artifacts: `tests/forge-verification-ledger.md`.
> **Build order** ATOMIC — verify: `test -f tests/forge-verification-ledger.md || echo MISSING ledger`
> **Scope**: how a document's information is ORGANIZED — partition, references, single-source,
> whole-document coherence, and safe restructuring. Sits BELOW readability (`linting-prose`) and
> BESIDE deck design (`designing-presentations`).

## THE LAW

> A document is an information architecture, not just a stream of sentences. Its failure mode is
> not a bad word choice — that is readability — but bad **organization**: the same fact scattered
> across three sections, a forward reference that leans on what isn't defined yet, a claim
> duplicated until updates drift, a section that is pure noise, or a well-meant edit that
> destroys the load-bearing argument. The bar: **every fact has exactly one home (MECE),
> references point backward only (a DAG), each fact has a single source of truth, the whole reads
> as one coherent 認識体系, and a restructuring pass preserves the thesis it found.** 構造化 is the
> goal; 圧縮 is not.
>
> The architecture rests on a pre-writing anchor (木下『理科系の作文技術』第2〜3章): the document
> asserts **one thing** (**目標規定文** — a single sentence stating what it claims or denies;
> **一文書一主題**), its content is **selected against that thesis** (**内容の精選** — necessary
> facts omitted none, unnecessary facts admitted none: the 木下 grounding of MECE's *home*
> decision), and its information is ordered **conclusion-first** (**重点先行主義** at document /
> section scale — the abstract states the answer, sections run 概観→細部). The paragraph-scale
> instance of 重点先行 (a topic sentence at the paragraph head) is a rewrite-in-place and belongs to
> `linting-prose`; the document-scale instance (which section leads, what the abstract says, section
> order) is a move and belongs HERE.

## MUST NOT FIRE — stay off the readability layer

Do **not** fire on sentence/word/register/tone problems, "LLMっぽい表現", claim calibration, or a
short document that is already well-organized — that is `linting-prose`. Do not fire to design a
slide deck or its section order, or to insert diagrams/tables for visual effect — that is
`designing-presentations`. This skill fires when the **structure** is wrong: scatter, duplication,
forward references, incoherent framework, or a risky reorganization of a non-trivial document.

## The four structural tests

Run these against the document as a whole; each failure names a concrete restructuring move.

- **MECE partition.**
  - *Mutually Exclusive* — each argument/number/definition lives in exactly ONE section. Flag the
    same content 散在 across sections; consolidate it to one locus (局所化).
  - *Collectively Exhaustive* — every piece of information has an appropriate home; flag orphans
    and gaps (content that belongs to no section, or a section a fact should exist in but doesn't).
    The inclusion test is 木下's **内容の精選**: necessary facts omitted none, unnecessary facts
    admitted none — measured against the **目標規定文**, not against "is it true / interesting."
- **Single source of truth (document DRY).** No claim or figure is repeated across sections. Each
  fact has ONE canonical location; everything else references it. Test: to change this fact, do
  you edit one place or many? Many → a maintenance bug waiting to drift.
- **Backward-only reference DAG.** Later sections may reference earlier ones; **forward references
  are forbidden** (they force the reader to hold undefined terms). If section 2 depends on section
  5, the order is wrong or 5's definition belongs earlier.
- **Whole-document coherence (認識体系).** The document's conceptual framework is internally
  consistent and non-contradictory end to end — not just locally. Audit the framework itself, not
  only individual sentences.

## Restructuring — preservation-first (保全原則)

Structural edits are destructive by nature; the danger is losing the argument while "improving"
it. Guards, in order of precedence:

- **Grasp the thesis before you touch.** Extract and hold the document's own purpose, scope, and
  the perspective/statements behind it — reconstruct its **目標規定文** (or write it if the document
  never stated one; an absent thesis is itself the first structural finding). Do NOT restructure a
  document whose governing thesis you have not reconstructed.
- **Fear destructive overwrite.** An edit that drops a load-bearing point is a regression. When in
  doubt, preserve — 論点喪失をする上書き破壊を極端に恐れる.
- **Don't edit what's adequate.** If a section is already well-organized and sufficient, leave it.
  Rewriting-for-the-sake-of-it is churn and risk with no gain.
- **Preserve ambitious claims.** Keep野心的な主張 and their implications intact through the pass;
  restructuring must not sand a bold, earned claim down to mush. (If a claim is *un*earned, that's
  a calibration problem → `linting-prose`, not a structural one.)
- **Delete genuine nonsense.** Whole sections that carry no operative content should be identified,
  listed, and removed — but as a named decision, not a silent cut.
- **Structure, don't compress.** The goal is organization and navigability, not shrinking word
  count. Keep the concrete examples that carry understanding.

## Routing — sibling cuts

| Sibling | Cut (runtime-answerable) |
|---|---|
| `linting-prose` | **FIX-LOCALITY cut** — the runtime question is *how does the fix land?* **Rewrite words in place** (a word, a sentence, a paragraph's topic sentence) → `linting-prose`. **Move information across the document** (relocate a fact to its one home, dedupe, reorder sections, reference DAG, write/repair the 目標規定文, select content by 内容の精選) → HERE. Grounding split, one home per 木下 chapter: **第4〜8章** (paragraph・topic sentence・逆茂木・言い切り・事実と意見/スリカエ・一義/簡潔) = rewrite-in-place = `linting-prose`; **第2〜3章** (目標規定文・一文書一主題・内容の精選・重点先行 at document scale) = move = HERE, unified with this skill's Minto=MECE / DRY / DAG spine. The one shared concept — **重点先行** — is split by scale and stated identically on both sides: paragraph topic-sentence → `linting-prose`; document/section order & abstract → HERE. `linting-prose` may FLAG a buried document-scale conclusion and hand off HERE (one-directional). Both sides register-independent; model-facing docs included. |
| `designing-presentations` | Medium cut. Slide/deck structure, talk section ORDER, and inserting diagrams/tables/ASCII/Mermaid for visual effect → there. Prose-document information architecture → here. (The Mermaid diagram-picker lives in `designing-presentations`.) |
| `systematizing-knowledge` | CARDINALITY cut. A CORPUS of papers → there (ledger, taxonomy, synthesis). A single document's internal structure → here. |
| `forging-skills` | A `SKILL.md`'s model-facing prose → there. General internal/design docs → here. |

## Fire / no-fire

FIRES: "この設計書/README/spec/notes を再構成して" · 議論や数字があちこちに散在 / 重複している ·
MECE になっているか · 前方参照が多い / 章の順序がおかしい · 認識体系に一貫性がない ·
restructure a sprawling doc without losing the argument · a model-facing design doc that's disorganized.

MUST NOT fire: sentence/word/register/tone/claim-calibration (→ `linting-prose`) · slide deck or
its order or inserting visuals (→ `designing-presentations`) · synthesizing many papers
(→ `systematizing-knowledge`) · a `SKILL.md`'s prose (→ `forging-skills`) · a short doc already
well-organized.
