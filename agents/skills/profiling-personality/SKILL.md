---
name: profiling-personality
description: >-
  Build a provisional personality read (dossier) of a SPECIFIC person — or a dyadic
  相性 / compatibility read of TWO people — from everyday language and behavior: chat history,
  messages, word choice, verbal habits. For understanding and building closer
  relationships (non-clinical, non-forensic). Use when the user wants to
  analyze / profile someone's personality or communication style from text or behavior, understand
  "what kind of person is X", read someone from their トーク履歴 / 発言 / 言動のクセ, or assess
  traits / values / attachment / motivation / 相性. Backbone: HEXACO. Trigger on: personality
  profiling, パーソナリティ分析, 人格プロファイリング, 性格分析, read / understand a person, Big Five /
  OCEAN, HEXACO, trait inference from text, attachment style / 愛着スタイル, values / 価値観
  (Schwartz), Dark Triad, communication style, 相性分析 / compatibility / dyadic fit,
  相手を理解したい, 人間理解, プロファイリング. MBTI / Enneagram / DISC / astrology asks FIRE this
  skill to REFRAME — never to deliver a type. Enforces: aggregate never
  point-predict (text ceiling r≈.4 = stranger-level), confidence scaled to trait visibility,
  per-person baseline, competing hypotheses, the Barnum filter, an ethics gate.
  This skill READS; it does not coach moves — dating next-move / 返信文 / 誘い方 → courting-on-apps.
  LANGUAGE → here; 外見・顔・声・仕草・写真 → reading-people-in-person.
  NOT for: explaining a framework in the abstract, writing a personality quiz, criminal / offender
  profiling, lie-detection, DSM diagnosis, or covert manipulation / psychographic targeting.
---

# Profiling personality — a disciplined read of a person from how they talk and act

> **Version**: v2607.2.0 (2026-07-03)
> **Changelog**: v2607.2.0 — dyadic 相性 reads formalized (method.md §L5-dyad: SRM
> actor/partner/relationship decomposition, Joel 2017 unpredictability ceiling → 相性 output =
> meeting-viability + friction forecast + callback-material inventory; PPR + shared reality as the
> relationship-effect mechanisms); READ/MOVE boundary vs `courting-on-apps` (this skill reads,
> never scripts courtship moves); G6 rationale rewritten as incentive dynamics (holdup →
> underinvestment → joint surplus dies), never moralizing. Source: 2026-07-03 live session
> (highest-grade — observed boundary breach + user feedback).
> **Scope**: build a **provisional, falsifiable case-formulation** of a specific individual from
> everyday language and behavior (chat logs, messages, verbal habits, observed conduct), for
> understanding, communication, and relationship-building. Non-clinical, non-forensic.
> **Lineage**: distilled from a 4-stream adversarially-verified survey (2026-07) of trait
> frameworks (Big Five / HEXACO / Dark Tetrad), language→trait computational literature
> (Pennebaker/LIWC, myPersonality/WWBP, LLM inference), validity & ethics (thin-slice, RAM, SOKA,
> Barnum, WEIRD, state-vs-trait), and practitioner tradecraft (negotiation, clinical formulation,
> intelligence analysis). Every load-bearing number is graded and homed in `references/`.
> **Build order (atomic).** SKILL.md + 5 references + script + tests ship in ONE commit; verify:
> `for f in method frameworks observable-cues calibration-and-ethics dossier-template; do test -f references/$f.md || echo MISSING $f; done; test -x scripts/dossier-check.sh || echo MISSING script; test -f tests/trigger-set.md || echo MISSING tests`

## Language

This skill is written in English; **respond to the user in their language (default Japanese).**
Keep these tokens stable even inside Japanese prose — they are technical identifiers:
**baseline, state vs trait, aggregate, confidence tier, Barnum filter, competing hypotheses,
case-formulation, HEXACO, Honesty-Humility, deviation**.

## THE LAW

> A personality read is a **provisional, falsifiable case-formulation built from many weak,
> aggregated signals against THIS person's own baseline — never a fixed type-label read off a
> single slice.** The framework (HEXACO) is only the coordinate system; the value is the method.
> Three numbers govern every claim and cannot be wished away: (1) the text ceiling is
> **stranger-level** — a rich model tops out at r≈.4, a single conversation lands at the
> stranger/casual level (~r.38), never the intimate level (spouse ≈.58);
> (2) a single sample is **50–70 % state, not trait** — one message shows a mood, not a
> disposition; (3) **visibility is unequal** — extraversion/warmth are readable, but
> neuroticism, anxiety, honesty, and intelligence are near-unknowable from thin text (the person
> themself is the expert there). A read that ignores these three is astrology with citations.

**Calibration inversion (why this skill pushes the way it does).** The psychology *literature*
was written to correct human *under-reading* (people fail to use available cues — Funder's RAM).
A capable model fails the **inverse** way: it will confidently generate a fluent, complete,
Barnum-perfect personality essay from three messages. So this skill's prominence is inverted from
the textbooks — the **gates below, the confidence ceilings, and MUST-NOT-FIRE are first-class**,
and "how to read cue X" is demoted to a reference. The default failure here is *overclaiming*, not
under-reading.

## The gates — every dossier passes all six (each names a checkable artifact)

同型 with the house skills: a gate with no artifact is 感触 (a vibe), not a gate. The dossier
template (`references/dossier-template.md`) has one section per gate; `scripts/dossier-check.sh`
greps for them. No section → gate un-passed.

| Gate | Inverts (the failure) | ARTIFACT in the dossier |
|---|---|---|
| **G1 BASELINE** | reading deviation against a population stereotype instead of the person's own normal | A filled **Baseline** section: this person's neutral-context normal (pace, register, warmth, verbosity) before any trait claim (`references/method.md` §L0) |
| **G2 AGGREGATE-OR-ABSTAIN** (a.k.a. "state vs trait" — the same gate, named for the dossier step) | inferring a stable trait from one message/conversation | Every trait claim cites **≥2 time/context-separated observations**, OR is downgraded to a labelled **state** reading ("in this message…", not "this person is…") (`method.md` §L2) |
| **G3 CALIBRATE** | one confidence for all traits; a confident neuroticism read from thin text | Every claim carries a **confidence tier (A/B/C)** scaled to trait visibility; Tier-C internal/evaluative traits are withheld or flagged near-unknowable; no claim phrased above the stranger-level ceiling (`references/calibration-and-ethics.md` §1) |
| **G4 BARNUM FILTER** | fluent statements true of ~everyone that *feel* accurate | Each statement passes 4 checks — base-rate (<70–80 % would also endorse), falsifiable, unique-to-them, favorability-balanced; a struck-vs-kept note proves the filter ran (`calibration-and-ethics.md` §3) |
| **G5 COMPETING HYPOTHESES** | one tidy story; confirmation-seeking | ≥2 explanations per behavior cluster, **prefer the least-disconfirmed** (not most-confirmed), and a named **indicator that would flip the read** (`method.md` §L6, ACH) |
| **G6 ETHICS/CONSENT** | covert dossier / manipulation / fixed labelling | Stated legitimate purpose (understand / communicate / self-protect); reversible, falsifiable language not fixed type-labels; inferred traits treated as sensitive (`calibration-and-ethics.md` §6) |

## The framework — HEXACO backbone, and what it is NOT

The user's recurring question — *"is HEXACO enough, or is something more effective?"* — is answered
in full at `references/frameworks.md`. The short, evidence-backed verdict:

- **Backbone = HEXACO** (Big Five O C E A N **+ Honesty-Humility**). Adopt HEXACO whole, not Big
  Five with H bolted on: Big Five recovers only R²≈.18 of Honesty-Humility, and H is the axis that
  carries "will this person exploit others when it's safe" — diffuse in Big Five's Agreeableness.
- **Add-ons that earn their place**: Big Five **Aspects** (10, when text is rich) for resolution;
  the **Interpersonal Circumplex** (dominance × warmth) as the *vocabulary for interaction
  dynamics* and dyadic prediction; the **Dark Tetrad via SD4** as a *focused overlay only* for
  sadism / grandiose narcissism (low-H already covers general manipulativeness — latent overlap
  r≈−.95, though "distinct-yet-correlated" is a live debate; do not treat them as identical).
- **Rejected — the skill reframes, does not comply**: **MBTI, Enneagram, DISC, astrology.** Type
  instability (~50 % relabel in 5 weeks), false dichotomies, ~1 % criterion validity, Barnum-driven.
  GFP ("general factor") is treated as an impression-management artifact, not a trait.
- **The framework is only Layer 3 of the method (McAdams' "psychology of the stranger").** Most
  "personality profiling" stops at a trait label; this skill does not. Values, attachment, and
  motivation (Layer 4) answer *why*, and the practitioner method (baseline→deviation, competing
  hypotheses) is where the practical intelligence lives.

## The method — a six-layer pipeline (full detail in `references/method.md`)

Each layer outputs a hypothesis with a confidence and a "what would change my mind." No layer is
ground truth.

| Layer | Does | Gate it satisfies |
|---|---|---|
| **L0 Baseline** | establish THIS person's neutral normal (idiographic, re-checked over time) | G1 |
| **L1 Observable signal** | capture low-inference cues + the **triggering stimulus**; clusters (≥2), never a single "tell" | — |
| **L2 State/context adjustment** | separate today's mood/stress from disposition; single sample = state, not trait | G2 |
| **L3 Trait estimate** | provisional HEXACO placement, confidence-tiered; intentionally thin on its own | G3 |
| **L4 Values / attachment / motivation** | the *why* — Schwartz values, regulatory focus, attachment signature (relationship-specific, not a clinical type) | — |
| **L5 Interpersonal prediction** | place on dominance × warmth; complementarity predicts dyadic friction/fit; **§L5-dyad**: two dossiers → one 相性 forecast (SRM; Joel-2017 ceiling — viability + friction, never "deep compatibility") | — |
| **L6 What to do** | test the read live (labels, calibrated questions); hold competing hypotheses; deliver as case-formulation | G5, G6 |

**Cross-cutting spine** (four practitioner domains converged on it independently, which is why it
outranks any single technique): **baseline before deviation · competing hypotheses not one story ·
cluster/triangulate across contexts · confidence is falsifiable and revisable with a pre-named
flip indicator.**

## Output — always a detailed dossier

Default output is the **full dossier** (`references/dossier-template.md`): Baseline → Observations
(with stimuli) → State-vs-trait → HEXACO estimate (confidence-tiered) → Values/Attachment overlay
→ Interpersonal prediction → Competing hypotheses + flip indicators → How to engage → Ethics note.
Fill every section; where evidence is thin, **write the abstention explicitly** ("insufficient to
read N — withheld per G3") rather than manufacturing a paragraph. A short read is a dossier with
honest "withheld" rows, not a dossier with sections deleted.

## Japanese / non-WEIRD guard (first-class — the user profiles in Japanese)

The English pronoun-frequency method **does not port to Japanese** and several defaults actively
mislead. Load `references/observable-cues.md` §5 before profiling Japanese text. Non-negotiable:

- **Never count 私 / 一人称 frequency as self-focus.** Japanese drops ~37 % of arguments (pro-drop);
  a naive I-count undercounts self-reference by half or more. The English "high-I ↔ self-focus/
  distress" finding is **untested in Japanese — do not assume transfer.**
- The Japanese-specific signal is first-person **choice** (私/僕/俺/自分/あたし) as a *sociolinguistic*
  index (gender, formality, assertiveness, relationship) — but it is not computationally validated;
  treat as a weak contextual cue, not a scored trait.
- **Reference-group effect + interdependent self-construal**: Japanese self-report is judged
  against a local reference group and is more context-dependent/modest — apparent "low trait" may
  be response style, not disposition. Don't export Western mean-levels; an emic dimension
  (Interpersonal Relatedness / 人情・和) may be missed by Big Five entirely.

## Scope boundaries — three response modes

Over-firing (a fluent profile from nothing) is this skill failing its own LAW. Three distinct
behaviors — do not conflate "fires-to-reframe" with "stays silent":

**A. OUT OF SCOPE — decline without producing a dossier:**

| Ask | Why |
|---|---|
| criminal / offender / forensic profiling; predict dangerousness | self-labeled profilers ≈ non-experts; this skill is non-forensic. Decline |
| lie/deception detection from microexpressions / "text tells" | human lie-detection ≈ 54 % (chance); single-cue tells debunked (`calibration-and-ethics.md` §5). Refuse the framing |
| clinical diagnosis ("do they have BPD/NPD") | NOT a clinician; offer a non-diagnostic case-formulation of *behavior patterns* only, with the diagnosis boundary stated |
| a general "how do personality tests work" / "summarize Big Five" question | just answer it — no dossier ceremony |
| "write a personality quiz / questionnaire" | content authoring, not profiling a person — plain task |
| dating next-move coaching — 返信文・誘い方・デート設計・沈黙からの復帰・文例 | **`courting-on-apps`** (where installed) owns the MOVE; this skill hands it the dossier and stops (method.md §L6 boundary) |

**B. FIRES, then reframes or refuses via a gate** (the skill loads and acts — this is not silence):

| Ask | Action |
|---|---|
| "what's their MBTI / 16personalities / enneagram / DISC type" | FIRE → REFRAME to HEXACO + method; explain type-invalidity (`frameworks.md`) — never deliver a type |
| covert dossier / manipulate / psychographic targeting / "make them fall for me" | FIRE → **G6 refuses** — illegitimate purpose; real-world targeting effectiveness ≈ 0 anyway |
| profile from one message with high confidence | FIRE → **G2+G3 downgrade** to a state reading; state the ceiling |

## Routing — sibling cuts (typed)

| Sibling | Cut |
|---|---|
| `systematizing-knowledge` | CARDINALITY + object cut: SoK synthesizes a position from a **paper corpus**; this profiles a **person** from their language. The survey that BUILT this skill ran under SoK; *using* the skill does not. |
| `raising-resolution` | PURPOSE cut: raising-resolution says "inspect before you assert" about any artifact; this skill is the domain instrument for one artifact class — a person. Its G2/G3 (aggregate, calibrate) are the personality-specific form of that discipline. raising-resolution yields (lowest precedence). |
| `acting-on-hypotheses` | DECISIVE cut: reading a person from evidence that ALREADY EXISTS (chat logs) is knowable-from-what-exists → here. Deciding a forward bet/experiment whose outcome reality hasn't set → there. Note the edge case this skill owns: a person is *inspectable but permanently under-determined* (the r≈.4 ceiling never closes) — still not a forward bet, but the irreducible uncertainty is exactly why the calibration gates (G2/G3) exist. The "competing hypotheses / flip indicator" discipline is shared vocabulary, not shared territory. |
| `forging-skills` | PURPOSE cut: forging-skills makes operating manuals for *executors*; this makes a read of a *person*. Name-adjacent ("profiling"), zero overlap. |
| `reading-people-in-person` | **DECISIVE cut — the evidence CHANNEL.** Runtime question: *"Is the evidence LANGUAGE (chat logs, messages, word choice), or a PERCEPTUAL channel (appearance, face, voice, behavior, their space)?"* Language → here. Perceptual → there, **whether live or captured** — a photo or video is stored *and* perceptual, and this skill's own scope disclaims images. **Seam contract:** this skill's `calibration-and-ethics.md` §1 stays the SOLE HOME of the confidence tiers and the accuracy ceiling, §3 of the Barnum filter, §6 of the general ethics gate; `observable-cues.md` §4 stays the SOLE HOME of **TEXT** folklore. That skill owns **channel validity** and **PERCEPTUAL** folklore. Agrees in SUBSTANCE — do **not** diff for byte-identity; re-diff only if either side's question clause changes. Natural sequential co-fire: its encounter note feeds this skill's dossier. Canonical phrasing of the cut is owned **there**. |
| `courting-on-apps` (Personal-Drive/skills — separate collection, co-installed on claude.ai projects) | PURPOSE cut — **READ vs MOVE**. Runtime question: "is the deliverable an understanding/forecast of person(s), or the next move/message in a courtship?" Understanding/forecast (dossier, 相性, friction, flip indicators) → here. Next move (何を送る・いつ誘う・デート設計・復帰・文例, stage discipline) → there. Natural sequential co-fire: this skill produces the read, that skill converts it into a hand. Both scripting moves here and re-profiling there are boundary breaches (observed 2026-07-03, encoded both sides). |

**Reciprocal pointers (F2).** Two landed: (1) `raising-resolution`'s subtractive owner-filter yields to
this skill (it enumerates the domain owners it defers to, and profiling-personality is a
domain-artifact owner); (2) `reading-people-in-person` names this skill in its description and routing
table, and this skill names it above — the cut's canonical phrasing is owned **there** (2026-07-09).
The remaining cuts are non-racing and need no reciprocal edit.

## Reference index — load the file you need

| File | Covers | Read when |
|---|---|---|
| `references/method.md` | the six-layer pipeline in operational detail; the practitioner spine (Navarro baseline/clusters, ACH competing hypotheses, Voss live-testing, clinical formulation-not-diagnosis) | running any profile; this is the core how-to |
| `references/frameworks.md` | HEXACO backbone + the full "is HEXACO enough" verdict; Big Five Aspects; IPC; Dark Tetrad overlay; why MBTI/Enneagram/DISC/GFP are rejected; reconciled contradictions | choosing the coordinate system; a framework question; reframing an MBTI ask |
| `references/observable-cues.md` | cue→trait tables (LIWC/function words with caveats, computational ceilings, behavioral cues, what's ROBUST vs FOLKLORE), the quarantine list, **§5 Japanese/cross-linguistic guard** | Layer 1; extracting signal from text; ANY Japanese profiling |
| `references/calibration-and-ethics.md` | R1–R8 calibration discipline (SOLE HOME of the confidence tiers + ceiling); thin-slice/RAM/SOKA; the E>C>>N visibility gradient; the Barnum filter operationalized; state-vs-trait; WEIRD/cross-cultural; ethics/consent; the do-not-cite list | Gates G3/G4/G6; before stating any confidence; before Tier-C claims |
| `references/dossier-template.md` | the full dossier output format, one section per gate, with a worked mini-example and the "withheld" convention | producing the output; the default deliverable shape |
| `scripts/dossier-check.sh` | greps a produced dossier for all six gate headings + a G3 tier marker; structural floor only | verifying a dossier before delivering it |
| `tests/trigger-set.md` | fire / no-fire trigger set (F3) | after any description edit |
