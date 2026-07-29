# Verifying — prove the skill before freezing, keep it alive after

> Scope: pipeline steps 6–7 — hostile verification of a forged skill, then its maintenance
> loop. This file owns the meta-workflow THIS skill itself runs on (audit→spec→forge→verify→fix),
> the verification fleet, forward-testing, the invocation pointers into the default
> skill-creators' eval machinery, and ship/reforge. What each verified property MEANS (the
> LAW, one-home, sibling cuts, trigger design) lives in its home file — this file only
> proves it. Harness mechanics (agent tools, workflows, budgets) → the `operating-the-harness`
> skill; the generic agent contract and consensus-is-not-evidence argument →
> `orchestrating-agents` — pointed at, not restated.

## §0 The stance — a skill has TWO objects to verify

| Object | Question | Proven by |
|---|---|---|
| **Surface** (trigger) | Fires on the right asks, silent on the rest, wins its races? | trigger desk-check (§2) + live eval machinery (§4) |
| **Content** (body) | Every retained line TRUE and OPERATIONAL — changes what the executor does? | the hostile fleet (§2) + forward-testing (§3) |

The defaults test only the surface plus task success. Their termination condition is the
anti-pattern, credited verbatim (official plugin skill-creator): *"Keep going until: The user
says they're happy / The feedback is all empty… / You're not making meaningful progress."*
A happy user is the absence of a gate, not a gate. House rule: NEVER ship on vibes — ship
when every fleet lens has reported and the editor has signed every finding's resolution.

## §1 The meta-workflow — 鍛錬: audit → spec → forge → verify → fix

Proven 2026-07-02 across the 8-skill reforge. This is the execution model of skill-forging
itself; §7 calibrates its size.

| Phase | Mode | Why | Contract |
|---|---|---|---|
| **AUDIT** | FAN-OUT | surfaces are independent reads; no judgment is being formed yet | one agent per source / sibling / target file; returns the structured verdict below, never free prose |
| **SPEC** | SOLO | the architecture must sit in ONE context — assembled from shards it is not an architecture | the editor decides each file's treatment and writes ONE signed spec per output file; drafters deviate only by ARGUING BACK in their report, never silently |
| **FORGE** | FAN-OUT | signed specs + disjoint files make parallel drafting collision-free | one drafter per file, disjoint ownership (no two agents write the same file); the spec travels IN FULL inside the prompt — "paraphrase drifts" |
| **VERIFY** | FAN-OUT, read-only | lenses must not share context — correlated verifiers are one observation, not N | the fleet of §2; an auditor that edits the artifact under audit destroys the evidence chain |
| **FIX** | SOLO | findings braid across files; one signer keeps resolutions consistent | the editor reads every finding's EVIDENCE (not just its verdict line) and signs every fix |

Audit verdict schema (compact; one per examined file):

```json
{"file":"", "stage_map":"which pipeline stage(s) this content serves",
 "epistemics_danger":"the claim most likely to be wrong or stale + why",
 "constraints":"architectural facts any spec must respect (owners, seams, pointers)",
 "treatment":"absorb | pointer | rewrite | retire"}
```

Verifier prompts are **refutation-first**: "find what is WRONG with this file against
<the named bar>; when uncertain whether something is a finding, REPORT it." A verifier asked
to confirm, confirms. Note the deliberate asymmetry: drafters resolve doubt by arguing back;
verifiers resolve doubt by reporting.

## §2 The verification fleet — one lens per failure class

Diversify the LENS, not the count: identical prompts return correlated errors — one
observation, not N (argument owned by `orchestrating-agents`). Each lens names what it attacks:

| Lens | Attacks |
|---|---|
| **Self-contradiction** | new content that contradicts the skill's OWN LAW, gates, or seam clauses |
| **Architecture** | one-home violations, atomic-build completeness, dangling pointers, YAML validity |
| **Sibling cuts** | read the SIBLING'S actual boundary text, not this skill's claim about it; description races — two descriptions that both win the same ask |
| **Bloat / drift** | lines that change nothing a forger does; voice/language mismatch; restated numbers whose home is `operating-the-harness` |
| **Spec fidelity** | spec items a drafter silently dropped or altered |
| **Comparative judge** — whenever an incumbent exists | N realistic asks answered with OLD loaded vs NEW loaded — does the new one actually WIN? A tie is a regression at cost |
| **Trigger desk-check** | run the fire/no-fire table against ALL plausibly-matching descriptions in the collection, not just the new skill's own |

## §3 Forward-testing — anti-leak + baseline discipline

Two absorbed disciplines, credited:

- **Anti-leak** (from the Codex default skill-creator): stress-test with FRESH subagents
  prompted exactly as a user would ask; pass artifacts, never diagnoses; delete produced
  artifacts between iterations so no run inherits the last one's residue. Their rule, kept
  verbatim: *"If forward-testing only succeeds when subagents see leaked context, tighten
  the skill."*
- **Baseline** (from the official plugin): snapshot the skill (`cp -r <dir> skill-snapshot/`)
  BEFORE editing so old-vs-new is a fair comparison; spawn with-skill AND baseline runs in
  the SAME turn — sequential runs confound model/context drift with skill effect.

## §4 Live eval machinery — invoke, never rebuild

External machinery, marketplace-managed, treat read-only (paths defined once in SKILL.md's
routing table; this is the synced working copy — re-sync on reforge, do not diff for identity):
`PLUGIN=~/.claude/plugins/marketplaces/claude-plugins-official/plugins/skill-creator/skills/skill-creator` ·
`CODEX=~/.codex/skills/.system/skill-creator`

| Need | Invocation | Caveat |
|---|---|---|
| Frontmatter lint | `uv run --with pyyaml python $PLUGIN/scripts/quick_validate.py <skill-dir>` | syntax floor only — vague prose passes it |
| Trigger eval / description loop | `python -m scripts.run_eval` / `python -m scripts.run_loop --eval-set … --skill-path …` | cwd MUST be `$PLUGIN` (package-relative imports); needs the `claude` CLI (they strip `CLAUDECODE` to nest `claude -p`); what a result actually measures — the PROXY CAVEAT — is owned by `triggering.md` §6, not restated here |
| Benchmark aggregation | `python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>` | cwd `$PLUGIN`; hard-depends on the `<skill>-workspace/iteration-N/…` layout |
| Human review viewer | `$PLUGIN/eval-viewer/generate_review.py <workspace>/iteration-N …` | their own rule: never hand-write viewer HTML |
| Human trigger arbitration | `$PLUGIN/assets/eval_review.html` (fill the template, open in a browser) | optional human sign-off surface for contested fire/no-fire rows; the desk-check's solo adjudication is the house default — use this when the user should arbitrate |
| Grader / comparator / analyzer | feed `$PLUGIN/agents/{grader,comparator,analyzer}.md` VERBATIM to spawned agents | outputs must match `$PLUGIN/references/schemas.md` exactly — the viewer reads those field names |
| Package as `.skill` | `python -m scripts.package_skill <skill-dir>` | cwd `$PLUGIN`; validates first, excludes `evals/` |
| Codex-target scaffold | `$CODEX/scripts/init_skill.py <name> --path <dir>` | Codex-target scaffolds ONLY — house skills use the house shape; a pointer, not a default |
| Codex target only | `$CODEX/scripts/generate_openai_yaml.py <skill-dir>` + `$CODEX/references/openai_yaml.md` | ONLY when the skill must also live in `~/.codex/skills` |

## §5 The mechanical floor — scripts/skill-check.ts

Run this skill's `bun scripts/skill-check.ts <skill-dir>` over the target BEFORE any semantic
lens; run it over the whole collection whenever a description or cut changed. Structural checks
FAIL; prose-debt checks WARN (measurement — their enforcement moment is the forge exit; the
rule's SOLE home is the dual-reader bar, `architecture.md` §5, surfaced through F1). Meaning
stays with the semantic lenses. And prove any NEWLY added check fires —
inject a known-bad string, watch it FAIL, revert. A gate never seen failing is decoration.

## §6 Ship & maintain

**Ship.** ONE atomic commit — SKILL.md + every reference + scripts, no dangling index
pointer. Deploy with `mise run link:skills` (links into `~/.claude/skills` and
`~/.agents/skills`). Then verify the live reload: the new description appearing in the
session's skill listing is the cheapest end-to-end smoke test that the YAML parsed and the
link landed.

**Staleness triggers** — any ONE forces a reforge:

| Trigger | Note |
|---|---|
| A version-pinned fact aged past its date | the version header records the verification epoch — respect it |
| An observed in-session failure the skill should have prevented | the HIGHEST-grade source a skill can acquire — encode it |
| A new sibling changed the cut topology | re-run the sibling-cut lens across the whole family |
| Official docs moved | re-fetch on EVERY reforge; never trust the previous harvest |
| Harness capabilities changed | e.g. workflows arriving made 8 skills stale at once (2026-07) |
| Prose-debt WARNs grew since the last reforge | the 堆積-analogue for prose: 2+ debt classes firing, or ≥20 long sentences, queues the skill (added 2026-07-24; corpus baseline in the ledger) |

**Reforge = re-AUDIT first, never append-only patching** — a patch that skips the audit
inherits every stale assumption it was meant to fix. An update is the same meta-workflow
(§1) at smaller scale: re-run the affected phases on the delta, not the world.

**Reforge vs create** (pipeline step 0). EXTEND the incumbent when an existing skill owns the
territory — a near-duplicate sibling is a routing bug. Forge a NEW sibling only when you can
write a typed cut (DECISIVE / CARDINALITY / PURPOSE) that neither blurs nor races the incumbent's
boundary. If you cannot write the cut, it is the same skill — and you are reforging it.

## §7 Scale calibration — size the fleet to the skill

| Job | Fleet |
|---|---|
| Small procedural skill (one task, no contested siblings) | SOLO end-to-end, zero agents — `skill-check.ts` + a hand trigger desk-check suffice; write the F3 waiver into the produced skill (gate table, SKILL.md) |
| Standard skill | 2–4 agents: 1 audit, 1–2 verify lenses, 1 trigger desk-check |
| Flagship / reforge-of-N / superseding an incumbent | the full §1 workflow with the full §2 fleet, comparative judge included |

No harness → the same passes run serially as separate focused passes. The lens LIST never
shrinks with scale — only the parallelism does.
