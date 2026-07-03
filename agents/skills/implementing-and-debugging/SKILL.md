---
name: implementing-and-debugging
description: Discipline for the ACT of writing or fixing non-trivial code — the guards that stop flailing once you start changing things. Reconstruct the ORIGINAL code's design intent before any rewrite; scope the edit surface (which files, how many) before touching; ground each changed file against a reference implementation; fix the 病因 (root cause) not the 症状 (symptom) — no band-aid / 一時しのぎ / 場当たり patch; fear the change that makes it WORSE (regression); declare your unknowns; for a hard bug present a divide-and-conquer plan, not guesses. Use when implementing a feature, refactoring, or debugging — especially when a fix keeps missing, you're guessing at causes, or about to redesign code you haven't fully understood. Triggers: 実装, リファクタ, デバッグ, バグ修正, 思い付きdebug, 場当たり, 一時しのぎ, 根本原因, 症状 vs 病因, 意図を理解せず, なぜなぜ, "this fix isn't working", "keep guessing". Upstream fact-inspection is raising-resolution; forward bets/durability are acting-on-hypotheses; post-hoc diff review is /code-review. English skill; respond in the user's language (default Japanese).
---

# Implementing & debugging — the discipline of the act

> **Version**: v2607.1.0 (2026-07-04) — distilled from the house `/impl` + `/debug` prompts.
> **Scope**: the guards that govern WRITING or FIXING code once understanding is in hand.
> Understanding a present fact is upstream (`raising-resolution`, a silent sub-step here);
> a forward bet on the world is `acting-on-hypotheses`. This skill owns the act between them.

## THE LAW

> Once you start changing code, the failure mode is **flailing** — 思い付き / 場当たり / 一時しのぎ:
> guessing at causes, patching symptoms, and redesigning code whose intent you never
> reconstructed. The cure is not more effort; it is **grounding the change** — in the original
> intent, in a reference implementation, in the root cause, and in a plan whose blast radius you
> named before you touched anything. A change you cannot explain the intent of, or that you fear
> might make things worse and shipped anyway, is not a fix — it is the next bug.

## MUST NOT FIRE — this is not ceremony

Do **not** invoke on a typo, a rename, a one-line obvious edit, a mechanical change, or any task
you could describe in one sentence. Gating a trivial edit behind this discipline is this skill
failing. It fires on **non-trivial** implementation/refactor, or a debug that is **not going
cleanly** (a fix that keeps missing, guessing at causes, about to rewrite unfamiliar code).

## The BUILD gate — before implementing something non-trivial

Not a box-ticking pre-pass; each line changes what you do next. Skip any that a specific change
makes irrelevant, but do not skip because it "looks like a one-liner."

- **Drill down on the need first.** Be precise about the requirement the change must satisfy
  before you design — building the *wrong* thing is worse than building it slightly wrong. (Raising
  the 課題's resolution is the upstream sub-step → `raising-resolution`; the guard here is: do not
  start implementing against a blurry requirement.)
- **Reconstruct intent before you touch.** Understand what the code you're modifying was *for* —
  its design intent — before any structural change. Do NOT redesign code whose intent you have
  not reconstructed; infer it, and if you can't, that's an unknown to declare, not to guess past.
- **Scope the edit surface.** Name the set of files you will create/edit and roughly how many,
  before writing. A change whose blast radius you didn't predict is a change you don't control.
- **Ground each file against a reference.** For each file, identify the exemplar implementation
  you're modeling it on (an existing pattern in this repo, a known-good sibling). Consistency
  comes from imitation, not invention.
- **Coherent, non-throwaway design.** The plan must be internally consistent and coherent with
  the stated requirements — not a shape you'll have to rip out next week. (Whether the design
  will age well against an *uncertain future* is a bet → `acting-on-hypotheses`.)
- **Declare unknowns.** Surface the opaque regions now, as output — don't paper over them.

## The DEBUG gate — when a fix is flailing

- **Stop guessing; end 思い付きdebug now.** First **enumerate every current blocker/wall** — the
  full list, before proposing any change.
- **Confess every assumption.** State what you're assuming but have not verified. (Grounding each
  assumption against a fact is the upstream job → `raising-resolution` runs here as a sub-step.)
- **Name the 症状, drill to the 病因.** Do you even agree on what the bug *is*? Separate the
  symptom from the cause; don't fix the symptom.
- **No band-aid.** 姑息な一時しのぎ / 場当たり / 探索的なだけの patch is forbidden — fix the root
  cause or say you can't yet. A "temporary" hack outlives you.
- **Fear the regression.** Before shipping, ask what this change could make *worse*. A fix that
  worsens the problem is a net negative; do-no-harm outranks looking productive.
- **Present a divide-and-conquer plan.** For a hard bug, the deliverable is a purpose-rational
  D&C plan (isolate → bisect → verify each piece), not a scattershot of edits. What is your
  reference for this fix?
- **Verify the fix reproduces-then-passes.** Write the failing test first when you can; a fix
  with no check that it worked is unverified (→ close the loop, don't assert "done").

## Routing — sibling cuts

| Sibling | Cut |
|---|---|
| `raising-resolution` | DECISIVE cut: "am I about to *speculate instead of inspect a present fact*?" → there (upstream, content-agnostic, produces no artifact). "Am I about to *write/change code* and need to do it without flailing?" → here. It runs as a silent sub-step inside every gate above. |
| `acting-on-hypotheses` | The change is a **known** implementation, not a bet on the world. Forward bets (spike/MVP/will-it-scale) and **future-durability** (陳腐化しない設計) → there. Executing a defined change correctly → here. |
| `/code-review` (built-in) | Post-hoc: reviews a DIFF for bugs after it's written. This skill governs BEFORE/DURING the change. Complementary — run `/code-review` after. |
| `writing-julia`, `linting-sui-move`, other language skills | Co-fire: they own language-specific correctness/perf; this owns language-agnostic change-safety. Follow the language skill for idiom; follow this for intent/scope/root-cause/regression. |

## Fire / no-fire

FIRES: "implement / build this feature", refactor a non-trivial module, "debug this / このバグ直して",
a fix that keeps missing, guessing at causes, about to rewrite code you don't fully understand,
"なぜ動かないのか分からない", 場当たり的な修正の兆候.

MUST NOT fire: a typo / rename / one-line obvious edit · a purely mechanical change · a request
to *inspect a fact* with no change pending (→ `raising-resolution`) · deciding whether to *bet on*
an approach (→ `acting-on-hypotheses`) · reviewing an already-written diff (→ `/code-review`).
