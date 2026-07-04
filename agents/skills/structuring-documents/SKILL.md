---
name: structuring-documents
description: Organize and restructure a DOCUMENT'S information architecture — the layer beneath sentence readability. Make it MECE (every fact in exactly ONE section; every fact has a home), single-source-of-truth (no claim/number duplicated across sections → one update point), a backward-only reference DAG (later sections cite earlier, never forward), and coherent as a whole 認識体系. Restructure preservation-first: fear the edit that destroys a load-bearing argument, don't rewrite what's already adequate, preserve ambitious claims' implications, and delete genuine nonsense sections — 構造化 is the goal, not 圧縮. Use when a report/spec/design-doc/README/notes is scattered, repeats itself, references forward, or needs reorganizing; also for internal / model-facing docs (reader = the next agent/LLM). Triggers: MECE, 局所化, 情報が散在, 重複, 単一の情報源, 前方参照, ドキュメント再構成, REORG, 保全原則, 認識体系, 構造化, 章立て, single source of truth, restructure/reorganize a doc. NOT sentence/word/register readability → linting-prose; NOT slide/deck order or inserting diagrams → designing-presentations; NOT a paper corpus → systematizing-knowledge; NOT SKILL.md prose → forging-skills. English skill; respond in the user's language (default Japanese).
---

# Structuring documents — information architecture, not sentence polish

> **Version**: v2607.1.0 (2026-07-04) — distilled from the house `/MECE` + `/REORG` + `/LINT_PAGER` prompts.
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
  the perspective/statements behind it. Do NOT restructure a document whose governing thesis you
  have not reconstructed.
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
| `linting-prose` | PURPOSE cut — AXIS. "Will a READER misread a sentence / word / register?" → there (readability vs a declared reader). "Is the document's INFORMATION badly organized — scattered, duplicated, forward-referenced, incoherent, or being destructively over-edited?" → here. Co-fire on different axes; a doc can be perfectly readable yet non-MECE. Note: `linting-prose` lints prose for ANY declared reader (external or internal — its hygiene checks are register-independent); this skill owns the *structure* axis for the same documents, including model-facing ones (reader = the next agent/LLM). |
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
