# Reconciliation — the moderators that dissolve the field's fights (the Aufhebung)

> **Scope**: the SOLE home of the reconciliations. The paper-writing canon is a field of apparent
> contradictions — "tell a story" vs "just report the facts", "be bold" vs "hedge everything",
> "follow IMRaD" vs "build an argument". A skill that picked a side on each would be wrong half the
> time. Instead, almost every fight dissolves into a **split-by moderator**: a runtime-answerable
> question that tells you *which side wins in this regime*. This file argues each with its two camps,
> the regime, and the **decision variable** the writer actually evaluates. SKILL.md carries the
> one-line version; this file carries the argument. Provenance for every attribution: `sources.md`.
>
> The moderators are not independent tips — they compose. Most reduce to one of four master splits:
> **by ZONE** (persuasion surface vs record surface), **by AXIS** (importance vs certainty), **by
> SCALE** (sentence vs document), and **by FILL** (universal schema vs field-dependent content).
> Learn the four master splits and you can re-derive the rest.

## §1 — The zone-split law (the master structural moderator)

> **Narrative, value-framing, and persuasion live only on the PERSUASION surfaces; the RECORD
> surfaces stay austere and complete. Persuasion changes SALIENCE and ORDER — never the facts, the
> timing of a hypothesis, or a claim's reach.**

| Surface | Zone | Governed by | The wrong test to apply |
|---|---|---|---|
| Title · Abstract · Introduction · Discussion | **PERSUASION** | value, story arc (OCAR/ABT), the funnel/CARS, field-code, bold significance, editor-facing pitch | "is this complete / neutral?" — no; it is *selective and framed* on purpose |
| Methods · Results · Supplement · released code | **RECORD** | austerity, completeness, neutral reporting, 事実 (fact) marking, reproducibility | "does this create value / tell a story?" — a **category error**; completeness for the record is the test |

This one law resolves a whole family of tensions at once — *story vs facts*, *narrative vs
mathematical austerity*, *value-cutting vs reproducibility*, *one clean message vs exhaustive
defense*, and 木下's *事実と意見の峻別* mapped onto section boundaries. The reconciliations below are
its specializations.

**The narrative-integrity test (run on any framing move).** *"If I deleted this narrative framing,
would any truth-value, effect size, uncertainty statement, or the timing of a hypothesis change?"*
- **No** → the narrative is legitimate scaffolding (it changed only what the reader notices first and
  how the pieces connect). Keep it.
- **Yes** → the narrative is bending the evidence. That is **spin**, not story. Cut it.

Corollary — **the ABT "Therefore" must be evidence-licensed, not narrative-licensed.** A story wants
a clean "therefore"; the data may only support "and, in one regime, weakly". Report the messy result
in the (record-zone) Results; if several genuine "but"s survive honest framing, that is a signal to
**narrow scope or split the paper**, never to bury the inconvenient finding. HARKing — writing an
exploratory finding as if it were the a-priori hypothesis — is the zone-split violated in the time
dimension: narrative *logic* (why the question matters, how findings connect) is free; *epistemic/
temporal* claims (what was predicted, pre-registered, confirmatory vs exploratory) must be literally
true. Label exploratory findings as such.

## §2 — Importance vs certainty (the master claim moderator, 主張の仕方の核)

> The bold-vs-hedge fight conflates **two orthogonal axes**. Separate them and both camps are right.

| Axis | Question | Camp that guards it | Failure it prevents |
|---|---|---|---|
| **IMPORTANCE** (ambition / scope / stakes) | how much would this change an expert reader's beliefs? | McEnerney (an uncontested claim bores expert readers), venue novelty reward | a timid, uncontested claim nobody resists — invisible |
| **CERTAINTY** (epistemic confidence) | how sure does the evidence let me be? | Hyland (hedging), Boutron (anti-spin), reviewer rigor | an overreach a reviewer shreds — credibility collapse |

**The synthesis: maximize importance, calibrate certainty.** Write *"X substantially changes Y*
(bold scope) *under conditions C, with effect e [95% CI …]*" (exact confidence). The operational
rule — **hedge the SCOPE, assert the CORE**: state the bounded claim itself in strong, unhedged
language, and put all the hedging into *where* it holds (the Toulmin qualifier + rebuttal), not into
the verb. The dominant model failure is hedging the assertion's verb ("may possibly suggest") instead
of its scope; the fix is the flat form **"In regime S, X — unless Y."**

- **Never buy boldness by inflating certainty.** Buy it by widening significance/scope while stating
  confidence exactly. A booster ("clearly", "demonstrates", "significant") is legitimate confidence
  only when the *next sentence* can defend it; on the contested frontier claim it is compensation and
  a reviewer reads it as the weakest-evidenced spot. **Gate every booster on "can I defend this in
  the next sentence?"**
- **Second regime — by section (a specialization of §1).** At the evidence frontier (Results) hedge
  tightly to the data; when framing the contribution/stakes (Intro, Discussion-implications) assert
  boldly what is *at stake*. Boldness on the finding's *importance*, humility on its *reach*.
- **Which failure is worse is field-set.** Clinical / high-consequence empirical work: overclaim has
  an asymmetric downside (a harmed reader) → err cautious. ML / theory: the cost of a wrong claim is
  a rebuttal, not a patient → a clearly-scoped bold claim is rewarded. Match register to the field's
  **error cost**. (For the model consumer, the net is decided in `sources.md` §inversion:
  over-claiming/fabrication is the more fatal half.)

## §3 — Scale, answer-first, and the remaining structural moderators

**Answer-first vs. build-up → split by SCALE.** *Within* a sentence, the new/emphatic idea goes at
the end (the stress position — that mechanic is `linting-prose`). *Across* the document, the thesis
is announced early (abstract, end-of-intro) and re-earned. So point-first governs the macro-order;
new-at-the-end governs every sentence. At every **skim surface** (title, abstract, first paragraph,
section-opening topic sentences, figure captions) → **answer-first / BLUF**, because a reviewer
triages non-linearly and must find the contribution in a rapid first-pass skim. Crucially: scientific "suspense"
is **not** withholding the answer (that is a mystery novel, fatal for a triaging reader) — it is the
**gap/challenge** (Swales CARS Move 2; Schimel's Challenge): name the unsolved problem to create felt
need, *while the reader already knows the take-home from the abstract*. **Disclose the destination at
the top of every level, then still motivate the journey.**

**Template vs. argument → split CONTAINER from CONTENT.** IMRaD is the container (the headings
reviewers navigate by — keep them). The argument is the content that flows *through* the slots, and a
single governing claim decides what enters each and in what order. **Fill by logic, not chronology**:
Intro = the CARS/funnel motivation (not a lit-dump); Methods = exactly enough to reproduce *and to
license the claims*, ordered by argument not calendar; Results = the evidence chain for the thesis;
Discussion = the resolution. Test on every subsection: *"which part of my argument does this serve?"*
If "none, it's just what we did" → cut it or relegate to the supplement.

**Convey vs. create value → split SOURCE from SELECTOR.** Your actual results are the **source** (the
substance — you cannot manufacture value from nothing); the reader's problem is the **selector** (what
this community finds costly not to know). When they conflict — you are proud of a method detail no
reader needs — reader-value wins for prominence, but reader-value is always computed over the *actual*
contribution, never invented. Expression is permitted only where it coincides with reader utility.

**Persuade vs. objectivity → split ACCESS from PERCEPTION.** Ask of any rhetorical move: does it
change the reader's *access* to the truth (foregrounding, clear framing, arguing hard for importance —
legitimate) or their *perception of the truth against what the data show* (hiding limitations,
overstating effects, selective reporting — spin)? Do **both** at once: report limitations prominently
AND argue forcefully for significance. The false dichotomy is "honesty requires flatness" or "impact
requires concealment"; both are wrong.

**Outline vs. discover → split by STAGE (sequential, not opposed).** Writing-to-discover belongs in
the *private* exploratory phase whose goal is to *find* the central claim (cheap, throwaway). The
moment you commit to the *shared* artifact, outline-first (Whitesides: outline the claims and even the
figures before prose) prevents the sunk cost of polishing prose you will cut. Decision variable: *"Do
I already know my central claim?"* No → write to discover. Yes → outline, then write to the outline.
The outline is a **living hypothesis**, revised as understanding improves (this honors the discovery
camp). Corollary: draft a **provisional** contributions list early as a planning device; **finalize**
the abstract and intro last, once results are settled.

**Related-work early vs. late → split by the citation's FUNCTION, not its timing wholesale.**
Gap-establishing / motivational citations (few, load-bearing, showing the problem is real and open —
CARS Moves 1–2) go **early and sparse** in the intro. The exhaustive comparison/positioning-against-
alternatives goes **late**, after the reader grasps your contribution and can appreciate the contrast
(this is what SPJ's "related work later" is actually about). Failures bracketed: all-early → your idea
is smothered; all-late → the intro floats free of the field and reads as literature-unaware. **Genre
moderator**: CS/ML top venues favor a late related-work section; math/theory often MUST situate early
(a theorem's meaning is defined relative to known results); empirical science sits between.

**One message vs. contributions list → HIERARCHY, not parity.** Keep ONE governing thesis at the top
(Mensh-Kording Rule 1; SPJ "one ping"; 主張を絞る); allow multiple contributions **subordinated** to
it as pillars that ladder up to a single sentence. Test: can every listed contribution be shown to
serve the one top-level claim? If not, it belongs in a different paper. Contributions may be plural;
the message is singular and governs them. **This skill asserts only the single-apex rule** (one paper,
one governing claim, never co-equal contributions); the *pyramid shape* of that apex-over-supports is
owned by `designing-presentations` (Minto), and the *MECE of the supports* by `structuring-documents` —
reuse those, do not re-derive them here. (The *bulleted list* itself is a venue convention →
`genre-playbooks.md`.)

**Disclose vs. don't-arm-the-reviewer → TRIAGE BY ANSWERABILITY.** Objections you can answer or bound:
raise and engage in-text (inoculation raises credibility, pre-empts the review). Objections you cannot
answer: convert to an explicitly stated scope/limitation ("we do not claim …; future work"), not a
full engagement you will lose. **Never omit an objection the reviewer will certainly raise regardless**
— *undisclosed-but-discoverable is the losing quadrant.* Concede the survivable specifically; defend
the load-bearing; do not hedge diffusely across every claim (uniform hedging reads as no result).

**Editor vs. reviewer → split register by SURFACE-READER.** Be assertive about *significance* to the
**editor** (cover letter and abstract framing — triage-facing, not refereed); be calibrated/modest
about *claims* to the **reviewer** (the manuscript body). The register is chosen by who reads that
surface, not by a single global tone.

## §4 — Schema vs. fill (the field-dependence moderator)

> Toulmin's own resolution to "one universal argument template vs. field-dependent standards":
> **the schema is field-invariant; the fill is field-dependent.**

Every field's argument has the same *slots* — claim, grounds, warrant, backing, qualifier, rebuttal
(and the FORCE of "probably / must / cannot" is invariant). But the **BACKING** that authorizes a
warrant, and the **CRITERIA** for meeting a modal force, are field-relative: a *proof* in math, a
*randomized control* in experimental science, an *ablation + variance across seeds* in ML, a
*replication* in psychology. So:
- Use the schema universally; fill BACKING and QUALIFIER with the **target venue's currency** — and
  never import another field's standard of proof (intuition where the field demands a proof; a bare
  leaderboard delta where the field wants mechanism).
- **Cost has two currencies** (the "so what?" moderator). *Practical* cost (tangible harm/benefit) is
  demanded in applied venues; *conceptual* cost (a larger question left unanswerable, an understanding
  forfeited) is fully legitimate significance in theory/math. The rule is not "show practical impact"
  but "show the appropriate cost currency for this venue" — and **never fake practical payoff for
  conceptual work.**
- **Calibrate to the floor-reader, not the ceiling.** The "one reader" you write for is the
  *least-specialized competent* member you must still reach (a strong non-specialist for a broad
  venue; the sub-field expert for a specialist journal). Rigor is invariant to audience; motivation
  and detail-granularity are not.
- **Plain vs. field-code → split STRUCTURE from LEXICON.** Structure/syntax is always plain (that
  layer is `linting-prose`, unconditional). Vocabulary is audience-calibrated: a term that is *shared
  coin* of this community and compresses meaning a plain phrase would lose ("overfitting",
  "identifiability", "well-posedness") → use it undefined (defining it insults the reader); a
  newly-coined or idiosyncratic term, or notation local to your paper → define at first use.
  Calibrate to the *narrowest realistic reviewer*.

## §5 — The value reset (McEnerney) — run this before anything else

Before the first slot of the CLAIM SPEC, reset the goal. Two rival models of what a paper is:
- **Communication / pipe model** (what school teaches): writing *transmits the writer's ideas* to
  readers. Under it you write "In this paper we present what we did." This is the model the consumer
  defaults to, and it is the wrong one.
- **Value model** (McEnerney): writing *creates value for a community of expert readers by changing
  what they believe*. Value is located in the **reader**, not in the text or the writer. Experts read
  to *find problems they can use*, not to understand you.

Operational reset — write these down before drafting:
1. **Name the reader community** (the actual venue's reviewers, concretely — not "researchers").
2. **Their accepted belief** (what the community currently holds — the consensus you will destabilize).
3. **Their doubt / the instability** (what is contested, anomalous, or open) — marked with the field's
   instability code ("however", "inconsistent", "anomaly", "surprising", "fails").
4. **The cost to *them*** if the instability stays unresolved (a **gap without a cost is not a
   problem** — this is the G1 artifact). Even a pure "we did it better / we proved it" paper has an
   instability available: **relocate it to the limitation of prior work** — "however, existing methods
   cannot guarantee Y" — with the cost of that failure coded onto the reader.

The single most common consumer failure this reset fixes: **"clear and useless"** — fluent, correct,
well-organized prose that summarizes what was done and never establishes a real instability with a
cost to a specific community. Surface clarity is exactly what the model is good at, and clarity is
*necessary but not sufficient*. The value comes from the **rupture** (consensus → instability →
coded cost → your resolution), not from the summary.
