# Triggering — naming, description engineering, fire/no-fire proof

> Scope: pipeline step 4 (SKILL.md). The `name:` + `description:` pair is the skill's API — the
> ONLY surface the model sees when deciding whether to load the body. Matching is **LEXICAL**
> (surface tokens, not intent: a keyword matches only if it literally appears — stem-tolerant in
> practice, but never design on that: cover the surface forms your user actually types) and
> **BUDGETED** (listings truncate under a context budget). This file owns engineering that surface and proving
> it fires; the harness mechanics of listing, budget fractions, truncation, and `/doctor`
> diagnostics are owned by the operating-the-harness skill — pointed at, never restated here.
>
> Contents: §1 the triggering LAW · §2 naming · §3 description anatomy (8 parts) · §4 winning the
> match vs incumbents · §5 fire/no-fire test sets (gate F3) · §6 machinery · §7 anti-patterns.

## 1. THE TRIGGERING LAW

> **"Claude only consults skills for tasks it can't easily handle on its own."** — the official
> plugin default's own text, buried three paragraphs deep in its description-optimization step;
> promoted here to law because it governs every choice below.

Three consequences, each changing what you write:

1. **A perfect match can still no-fire.** On a trivial ask the model answers directly even when
   every keyword matches. Do not debug that no-fire by inflating the description — the mechanism
   is working. Aim the description at the asks the model would fumble WITHOUT the body.
2. **Auto-trigger is NEVER guaranteed — verify invocation, don't trust the match.** The F3 test
   set (§5) is the proof artifact; live diagnostics (listing budget, drop order, `/doctor`) →
   operating-the-harness.
3. The plugin's corrective — Claude "undertriggers", so make descriptions "a little pushy" — is
   absorbed WITH a correction: pushiness is safe only when paired with explicit no-fire cuts
   (§3 parts 3–4, §5). Push without negative space converts under-triggering into misfires.

## 2. Naming

| Rule | Source |
|---|---|
| Gerund `<verb-ing>-<object>` (`writing-julia`, `forging-skills`) | Official best-practices RECOMMENDS gerund form (platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices); this collection MANDATES it — "inconsistent patterns within your skill collection" is itself a documented official anti-pattern (same page), so one shape for all |
| Lowercase letters / digits / hyphens only, ≤64 chars | Anthropic platform validation (platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) |
| No leading/trailing hyphen, no consecutive `--`, name = parent directory name | agentskills.io/specification — the hyphen-shape and dir-match rules appear ONLY there, not in Anthropic's docs; treat them as binding anyway |
| No reserved words `claude` / `anthropic` | Anthropic platform docs ONLY (overview page) — agentskills.io does NOT carry this rule. Both divergences cut one way: obey the UNION of the two sources; a name valid everywhere never bites |

The name is trigger surface too: names survive the listing-budget drops that truncate
descriptions (mechanics → operating-the-harness), so the name itself must carry the object —
`forging-skills`, never `skill-helper`.

## 3. Description anatomy — the house 8-part shape

Parts 1–6 appear in this order inside the description; 7–8 constrain the whole.

| # | Part | Contract |
|---|---|---|
| 1 | **3rd-person what+when opener** | "Forges… / Audits… Use when(ever)…" — official rule: always third person; the description is injected into the system prompt and inconsistent POV causes discovery problems |
| 2 | **Trigger keywords WITH Japanese doublets** | Matching is lexical and the user prompts in Japanese: スキル作成 matches ONLY if スキル作成 literally appears. Every load-bearing English keyword gets its Japanese doublet; include quoted user-phrasings ("turn this into a skill") |
| 3 | **Typed cuts IN the description** | DECISIVE / CARDINALITY / PURPOSE one-liners against each overlapping sibling — routing must resolve at match time, from descriptions alone. The cut's rationale lives in a reference; the description carries only the one-line question |
| 4 | **Precedence / owner-filter declarations** | MANDATORY-read status, LOWEST-precedence-yields-to lists, CO-FIRES-with clauses — whichever the skill's position in the family requires; co-matching must be resolvable without loading any body |
| 5 | **Workflow-native clause** | One sentence declaring the solo/fan-out split, always naming what stays SOLO |
| 6 | **Language directive LAST** | "English skill; respond in the user's language (default Japanese)" — final sentence, mirrored by a body Language section pinning stable tokens |
| 7 | **Block scalar `>-` ALWAYS** | A plain scalar breaks on any "X: " colon-space inside the text — YAML reads it as a mapping and the description parses to garbage (observed 2026-07-02). No exceptions |
| 8 | **Length** | Platform hard cap: 1024 chars (API-deployment validation). Claude Code's listing truncates longer entries — observed failure window ~1520–1570 chars (2026-07); keep ≤1500 so the tail-positioned language directive survives. The exact cap number and its config knobs live in operating-the-harness — this file records only the observed failure |

## 4. Winning the match vs incumbents

When a default/generic skill already owns the ask, out-lexicalize DELIBERATELY: cover the
incumbent's own tokens, add what it lacks, cut against it by name. Worked example — this skill's
description vs the two skill-creator defaults (trigger surfaces quoted, 2026-07 dissection):

- Codex system default: "Guide for creating effective skills. This skill should be used when
  users want to create a new skill (or update an existing skill)…"
- Official plugin: "Create new skills, modify and improve existing skills, and measure skill
  performance. Use when users want to … run evals … optimize a skill's description for better triggering accuracy."

| Lexical surface | Codex | Plugin | A winning description must |
|---|---|---|---|
| create / update / optimize a skill, evals, benchmark | ✓ | ✓ | Include the SAME tokens — cover their whole ask |
| `SKILL.md`, `frontmatter`, `agents/skills/` | — | — | Include — the tokens this user actually types |
| Japanese (スキル作成 / スキルを作って / スキル改善) | — | — | Include — the user prompts in Japanese |
| Negative space (should-NOT-fire carve-outs) | — | — | Include cuts + precedence so a double-fire resolves |

(Instructive irony: the plugin teaches near-miss negatives for OTHER skills while shipping none
for its own.) Siblings get the same discipline: operating-the-harness already claims "Skills
(SKILL.md)" in its description — without a typed cut, a SKILL.md ask races three ways.

Ethics of the match: out-lexicalizing is legitimate only as BETTER COVERAGE — include an
incumbent's tokens because this skill genuinely serves those asks (invoking the incumbent's
machinery by pointer, §6), and CUT explicitly against the incumbent so any double-fire resolves
deterministically. Tokens you don't serve are a misfire factory, not a win.

## 5. Fire / no-fire test sets — gate F3

The trigger artifact: a query table that ships IN the skill (SKILL.md MUST-NOT-FIRE section, or
`tests/triggers.md` for long sets) and is re-run as a desk-check after EVERY description edit.
Query-design craft absorbed from the official plugin (credited — the best prose it contains):

| Requirement | Rule |
|---|---|
| ≥5 should-fire | Realistic-messy, as users actually type: real filenames ("Q4 sales final FINAL v2.xlsx"), typos, backstory clutter; ≥1 in Japanese; ≥1 describing the situation without any headline keyword |
| ≥5 should-NOT-fire | NEAR-MISS negatives — the plugin's own rule: "don't make should-not-trigger queries obviously irrelevant… 'Write a fibonacci function' as a negative test for a PDF skill is too easy." Each row names which sibling (or no skill) fires instead |
| Co-fire rows | Braided asks where a sibling should ALSO fire (state the order) or INSTEAD fire — these rows are the executable form of the description's cuts (§3 part 3) |

Desk-check protocol: for each row, read ONLY the name + description — the model's stage-1 view
(disclosure stages → operating-the-harness) — and answer fire / no-fire / co-fire. A wrong answer
is a description bug (or a badly designed query — decide which, in writing, before editing);
contested rows escalate to live evals (§6). A green desk-check after every edit is the regression floor.

## 6. Machinery — invoke, never rebuild

Trigger-eval rows ONLY (paths: SKILL.md routing table). Shared invocation details — uv/pyyaml,
`cwd=$PLUGIN`, the `-m scripts.*` module form — and the FULL machinery table live in
`verifying.md` §4; do not restate them here.

| Need | Invoke | Note |
|---|---|---|
| Live trigger eval | `python -m scripts.run_eval …` | N runs per query, trigger threshold 0.5; PROXY CAVEAT below |
| Description-optimization loop | `python -m scripts.run_loop --eval-set … --skill-path … --model <session model> --max-iterations 5` | 60/40 train/test split, blinded test scoring, best-by-test-score — real anti-overfit machinery; never rebuild it |
| Description rewriter | `python -m scripts.improve_description …` | anti-overfit prompt, 1024-char auto-shorten retry |

**PROXY CAVEAT** — attach to every run_eval/run_loop result you cite: the machinery does NOT
install your SKILL.md; it writes a temporary `.claude/commands/<name>-skill-<uuid>.md` proxy
carrying the description and detects invocation from stream events. It measures the DESCRIPTION
as a trigger through a command proxy — an approximation, not the installed-skill listing path.
Order of proof: skill-check floor → F3 desk-check → run_eval on contested rows → one real
installed-skill session before freezing.

## 7. Anti-patterns

| Anti-pattern | Observable tell | Fix |
|---|---|---|
| Description-as-summary | An abstract of the skill: no "Use when", no token a user would type | §3 parts 1–2 |
| Monolingual triggers | Zero Japanese in a description written for a user who prompts in Japanese | Doublet every load-bearing keyword (§3 part 2) |
| "When to Use" in the BODY | A body section restating triggers — the body loads only AFTER triggering, so it can never influence the decision; dead weight (the Codex default itself flags these sections as unhelpful) | All when-information in `description:`; delete the body section |
| Untyped cut | "related to X", "for complex cases" — unanswerable at runtime | One askable question with a named type: DECISIVE / CARDINALITY / PURPOSE (§3 part 3) |
| Description race left standing | Two descriptions match one ask; neither names the other; fire order is luck | Cut in BOTH descriptions + a precedence/sequencing clause; add the F3 co-fire row that proves it resolved (§4–5) |
