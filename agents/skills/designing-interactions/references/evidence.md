# Evidence — grades, forbidden citations, and the calibration this skill was tuned to

> **SOLE home** for source grading in this skill. Any claim in `modes.md`, `complexity.md`,
> `delegability.md` or `reversibility.md` that is cited by name is graded here. A grade written
> anywhere else in this skill is a bug.
>
> Provenance: a 15-agent survey (2026-07-28), whose 153 verbatim/author-confirmed claims were then
> re-fetched by three independent adversarial quote auditors instructed to refute. Six failed.

## 1. Grade table

| Grade | Meaning | Handling |
|---|---|---|
| **author-confirmed** | verified against the author's own materials, wording located | may be quoted in the source's voice |
| **needs-verification** | named in the source; exact wording or a figure not retrieved | label it; **DO-NOT-FABRICATE** the unretrieved part |
| **third-party** | non-author commentary, critique, or secondary reporting | name the party |
| **constructed** | this skill's own operationalization, found in no source | never present in an author's voice |

| Source | Grade | Note |
|---|---|---|
| Raskin, *The Humane Interface* — mode definition, quasimodes, monotony, GOMS/KLM operators, efficiency measure E | **author-confirmed** | mode definition verified across four independent renderings of the book text; the word "possible" in clause (2) is load-bearing and was restored by audit |
| Raskin, *Never Use a Warning When You Mean Undo* (A List Apart) | **author-confirmed** | argues from introspection, not experiment — his considered design position |
| Norman, *DOET* — 2013 mode-error definition, slip/mistake taxonomy, gulfs, seven stages, forcing functions, four constraints, undo principle | **author-confirmed** | except as noted in §2 |
| Norman — "mode error = action-based slip" | **constructed** | the category name is solid; no 2013 sentence assigning it in those words was located |
| Norman, *Simplicity Is Highly Overrated* / *Living with Complexity* | **needs-verification** | thesis consistent across independent secondary reports; the books' running prose was not read |
| Tesler — 1981/2012 mode definition, the conservation law, the tool-metaphor carve-out | **author-confirmed** | *interactions* (2012) is the primary wording; see §2 for the drifted paraphrase |
| Tognazzini's critique of the conservation law | **third-party** | held secondhand; fetch the askTog original before quoting |
| Apple HIG — 1987 modelessness section and permitted-mode list; ~2011 "Embrace Modelessness"; current eight principles; current Modality and Sheets pages | **author-confirmed** | the ~2011 wording is corroborated across two retrievals but Apple's original PDF was not opened; current pages are a **living document** — re-fetch on reforge |
| The ~2017 retirement of the Design Principles chapter | **third-party** | Ueno's investigative account; not independently cross-checked against the Wayback Machine |
| Ueno — Object→Verb produces modelessness by construction; OOUI boundaries | **author-confirmed** | he explicitly presents it as systematizing a Kay/PARC lineage, not originating it |
| Gentner & Nielsen, *The Anti-Mac Interface* (CACM 1996) | **author-confirmed** | framed by its authors as a thought experiment, not a user study |
| Hickey, *Simple Made Easy* — etymology, complect/compose, the ten-row toolkit slide, juggling, guardrails, "simplicity is a choice," artifact-not-construct | **author-confirmed** | transcript verified; the slide table cross-checked row-by-row against his spoken narration |
| Hickey, *Design, Composition and Performance* / *The Value of Values* | **author-confirmed** | quoted narrowly; the instruments line is a population choice, not a general licence (`complexity.md` §2) |
| Moseley & Marks, *Out of the Tar Pit*; Brooks, *No Silver Bullet*; Ousterhout, *A Philosophy of Software Design* | **author-confirmed** | quoted with section/chapter anchors |
| Gancarz, Tenet 8 — CUI definition and the five arguments; the irreversible-action carve-out | **author-confirmed** | read via a third-party mirror of the chapter; only Tenets 8–9 were read directly |
| Raymond, *TAOUP* — seventeen rules, interface bestiary, Rule of Silence; McIlroy's summary | **author-confirmed** | |
| clig.dev · 12-Factor CLI · GNU Coding Standards · POSIX Utility Syntax Guidelines | **author-confirmed** | 12-Factor retrieved via a mirror — exact phrasing approximate; POSIX Guideline 7 quoted, the rest paraphrased by the fetch |
| Anthropic — *Building Effective Agents*, *Writing effective tools for AI agents*; MCP spec error-handling, human-in-the-loop, tool annotations | **author-confirmed** | |
| NN/g — ten heuristics, *Modes in User Interfaces*, *Confirmation Dialogs*, *Wizards*, response-time limits | **author-confirmed** | |
| Shneiderman's eight golden rules; *Direct Manipulation* (1983); Hutchins/Hollan/Norman (1985) | **author-confirmed** | cite rule *titles* as authoritative; the elaborating prose circulates in paraphrase |
| Cooper, *About Face* — dialog-box line, excise, "Do, don't ask," perpetual intermediates, possibility-vs-probability, wizards | **author-confirmed** | via a licensed excerpt of the book, not a quote aggregator; see §2 for the misquoted punctuation |
| Bret Victor, *Inventing on Principle* / *Learnable Programming* | **author-confirmed** | |
| Figma engineering — multiplayer LWW, the undo invariant, autosave two-phase commit | **author-confirmed** | vendor engineering blog; a single product's architecture, not a general finding |
| Kleppmann et al., *Local-first software* — seven ideals, Table 1 | **author-confirmed** | Table 1's ✓ / partial / ✗ legend must not be collapsed (§2) |
| Yu & Ignat (DAIS 2015) on collaborative undo; GoF Command; CRDT/OT properties | **author-confirmed** / **third-party** | CRDT and OT property statements are from the standard literature summary, not one primary paper |
| Sweller (1988) and cognitive-load theory; expertise-reversal | **author-confirmed** | abstract-level for Sweller |
| Hertzum & Jacobsen (2003) evaluator effect; Liu et al. CHI'20 on Hick's Law; Scheibehenne et al. (2010) choice-overload meta-analysis | **author-confirmed** | abstract-level; all three are the *boundary* citations that discipline the folklore |
| Poller & Garter, *The Effects of Modes on Text Editing by Experienced Editor Users*, *Human Factors* (1984), doi:10.1177/001872088402600408 | **third-party** | surfaced by the audit as the one genuine empirical result on modal editing; the article itself was not read in full |
| Air Inter A320 (Strasbourg) mechanism and the display fix | **needs-verification** | no primary BEA/FAA source retrieved; secondary tellings converge on the mechanism, disagree on the date |
| Sarter & Woods (1995) automation surprise | **needs-verification** | abstract-level only; full text paywalled |
| Leveson & Turner, Therac-25 | **third-party** | quoted via a course-page mirror; the IEEE original was not machine-readable |
| AHRQ infusion-pump workflow-constraint recommendation | **author-confirmed** | |
| Infusion-pump fail-operate counter-pattern | **needs-verification** | a single unattributed secondary snippet; the fail-operate/fail-safe distinction itself is standard systems-safety vocabulary |
| The U3 legitimacy carve-out ("interactivity IS the deliverable" / "has a batch twin") | **constructed** | a targeted search for a named authority found none. Present as inference from precedent |
| "Every stateful surface is maximally modal for an agent" | **constructed** | derivable from Raskin's clause (1) since an agent has no persistent locus of attention; stated nowhere. Treat as an argument, not a citation |
| "AX" / agent-experience discourse; `llms.txt` | **third-party** | real but thin; emerging practitioner vocabulary, not an established field |

## 2. FORBIDDEN citations — verified wrong, fabricated, or untraceable

Every row below survived at least one plausible-sounding pass before an auditor killed it. Do not
reintroduce them.

| Do not write | Why | Write instead |
|---|---|---|
| "Mode errors are inevitable in any device designed to have more possible actions than it has controls or displays, **so the controls must do double duty**" — as Norman | The trailing clause is **not Norman's**. The page usually cited for it does not contain the sentence at all | The verified 1988 wording: "…that is, the controls mean different things in the different modes." Or the 2013 definition |
| "We should eliminate the concept of error" — as a Norman quotation | **UNRETRIEVABLE.** The sentiment is solidly his; the sentence was not located in any primary or near-primary source | Paraphrase the position and cite *Human Error? No, Bad Design* by title, not by quotation |
| "An Efficiency Comparison of Text Editors Used in Academic Research and Development" (styled as a PLOS ONE study, 40 Vim/Emacs users) | **Satire.** Fictional university and country, fabricated author names, a nonexistent Knuth title. It circulates as real | Poller & Garter (1984) is the genuine study — and it favours the *moded* editor, which is not what people cite the fake one for |
| "Bottom sheets get 25–30% higher engagement than full modals" | Untraceable to any named study; almost certainly marketing copy | Make the argument structurally (scoped, cheap exit) with no number |
| "65% of pilots were unaware… only 15% could describe the active mode… 4 of 20" | From a secondary blog, not the paywalled Sarter & Woods article | Cite the mechanism (automation surprise) without the figures until the primary is read |
| Raskin's definition **without** the word "possible" in clause (2) | The audit restored it from four independent renderings of the book text | Quote it as printed in `modes.md` §1 |
| "A dialog box is another room. Have a good reason to go there." | Punctuation and phrasing drift from the book | "A dialog box is another room; you should have a good reason to go there" (ch. 34) — or the ch. 53 variant |
| "Every application has an inherent amount of irreducible complexity… the user, the application developer, or the platform developer" | A drifted secondary paraphrase of Tesler's law | The 2012 *interactions* wording, quoted in `complexity.md` §3 |
| "Don't Mode Me In" presented as a quotation from Tesler's writing or an interview | Well-attested as his personal motto and T-shirt/licence-plate slogan; not verified as published prose | Use it as flavour, attributed as his motto |
| "Programmers know the benefits of everything and the tradeoffs of nothing" — as Hickey | The epigram on his slide is **Perlis**: "LISP programmers know the value of everything and the cost of nothing" | Attribute to Perlis |
| Hickey's *easy* etymology stated as settled, or the Latin verb named | He calls the last derivation step "actually speculative," and never names the verb in the talk | Present it as his self-declared rhetorical device |
| Google Docs "fails" Fast/Offline in the local-first Table 1 | The paper distinguishes *partially meets* from *does not meet*; only Privacy is a full miss | Reproduce the three-level legend |
| Gancarz's TOC entry "1 Tenet 1: Small is beautiful" | The actual entry is **2.1** | — |
| Any of the six Gancarz tenets whose titles are not reproduced in `delegability.md` | Not verified | Ship the slot, not an invented list |

## 3. The calibration inversion — who this skill is aimed at

Every source here was written to correct a *human* practitioner. The consumer is a model. The
prominence decisions follow from the difference.

| | The sources' audience | This skill's consumer |
|---|---|---|
| **dominant error** | adds modes, dialogs, wizards and captive flows without noticing; conflates *easy* with *simple* | **produces a fluent design rationale for whatever it already built.** A model can justify any interface persuasively, in either direction, without ever enumerating the states |
| **secondary error** | over-corrects into purism (rare, slow) | **over-corrects at machine speed**: strips confirmations off irreversible actions, "decomplects" into indirection, deletes a legitimate interlock because a doctrine said modes are bad |
| **corrective bias** | *notice the mode; reach for undo; do not hold the user captive* | *enumerate before you judge; the gates are conjunctive tests; the doctrine's own sources refute the dogma* |
| **what is prominent** | the principles | **the artifacts** (four enumerations, not four principles) and **MUST-NOT-FIRE**, which carries the anti-dogma table as first-class content rather than a caveat |

This is why every gate is passed by a table rather than an argument, and why the anti-dogma
evidence sits in `SKILL.md` rather than in a reference: a model that loads only the body must meet
the refutation before it meets the doctrine.

**Agent-epistemics delta** (the execution model's Step-A archetype is CITATION-RELAY). Gestures,
states, tasks and actions are observables on the artifact, so agents can enumerate them and a
relayed conclusion without its locus is worth nothing. But **where a user's attention sits, and
whether a cue is discoverable, are not observables an agent can produce.** An agent asserting them
is counterfeiting the signal — N agents agreeing a mode is obvious is one correlated guess, not one
user finding it. Route attention claims to `acting-on-hypotheses` as forward bets with a cheap test,
never accept them as findings here.

## 4. Known retrieval gaps — the reforge queue

- Apple's HIG is a living document and its *Undo and redo* page is client-rendered and was not
  machine-readable. Re-fetch the modality, sheets, undo and principles pages on every reforge.
- Gancarz: only Tenets 8–9 read directly, via a mirror. The other seven tenet titles and any
  exception he may draw elsewhere in the book are unretrieved.
- Sarter & Woods (1995) full text; the BEA/FAA primary for Strasbourg; the Therac-25 IEEE original.
- Poller & Garter (1984) read only at citation level — the single most load-bearing empirical
  counter-result in this skill rests on an unread article.
- No study was found on whether object-verb ordering measurably outperforms verb-object outside
  Kakoune's own design rationale.

## 5. Open questions

1. Does the "≥2 redundant local cues" prescription have any measured effect size, or is it
   consensus craft? Nothing quantitative was retrieved.
2. Is there any measurement of mode-error rate as a function of cue distance from the locus of
   attention? The claim that status bars fail is documented as practice, not as a number.
3. The conservation law is untested as stated. Is there a domain where total complexity measurably
   *fell* rather than moved — which would settle the Tognazzini dispute?
4. Agent-driven surfaces are a genuinely new consumer with a first-party literature about two years
   old. Which of the four gates changes shape when the dominant driver is not human — and does
   delegability stop being a virtue and start being a security surface?
