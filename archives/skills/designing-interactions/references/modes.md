# Modes — the theory, the empirics, and why the dogma is wrong

> Scope: gate **U1**. What a mode is (precisely), what makes one legitimate, what the accident
> literature actually establishes, and the historical arc of the modelessness doctrine including
> its retirement. Grades and forbidden citations live in `evidence.md`; the reversibility exit
> from U1 is owned by `reversibility.md`.

## 1. The definition, and the clause everyone drops

Raskin, *The Humane Interface* (2000), Ch. 2 — verbatim:

> "A human-machine interface is modal with respect to a given gesture when (1) the current state
> of the interface is not the user's locus of attention and (2) the interface will execute one
> among several different possible responses to the gesture, depending on the system's current
> state."

Four consequences that change what you do:

1. **Modality is a property of a GESTURE, not of a screen or an app.** You cannot label a product
   "modal" in one shot. The ledger has one row per gesture.
2. **Clause (2) alone is nearly universal.** Raskin's own worked example: Backspace erases a
   different character depending on state, yet is *not* modal, "because your locus of attention is
   the object that you are erasing." An audit that fires on clause (2) alone will flag everything
   and therefore inform nothing.
3. **Modality is relative to the user's attention, not to the system's state diagram.** The same
   gesture is modal for a distracted novice and non-modal for a habituated expert reading a cue at
   the cursor. This is why "our expert users are fine with it" is a *real* argument — and also why
   it collapses the moment the cue is peripheral.
4. **A status bar is not a fix.** A peripheral indicator does not reliably become the locus of
   attention, so by Raskin's own definition it does not remove the modality. NN/g documents this
   as a named failure mode, not a hypothesis. The mitigation is a cue **at the point of action**:
   cursor shape, inline highlight, the control's own rendering.

Tesler's narrower definition, from his 1981 *Byte* article and requoted in *interactions* (2012),
is worth keeping alongside it because it excludes object-scoped state: a mode is "a state of the
user interface that lasts for a period of time, is not associated with any particular object, and
has no role other than to place an interpretation on operator input." Under Tesler's definition a
selected object's own properties are not a mode; under a loose colloquial usage they would be.
Say which definition you are using.

## 2. Quasimodes — the one carve-out Raskin grants

A **quasimode** is held open by continuous user effort: Shift, a held modifier, a press-and-hold
gesture, Raskin's own LEAP keys. Release is an **involuntary exit** — the user cannot forget to
leave, because leaving is what stopping does. Caps Lock is the canonical counter-example and the
reason the carve-out is narrow.

Does **not** qualify: toggled modes, modes that expire on a timeout, modes that end "on the next
click elsewhere." Those are ordinary modes with a shorter mean lifetime.

Mobile sheets are best read through this lens. Their defensible property is not that they are
non-modal — most are modal — but that they are scoped, visually connected to the content behind
them, and dismissed by a cheap, obvious, near-involuntary gesture. That is a refinement of
Raskin's criteria, not an abandonment. (This reading is argued, not retrieved from a source that
makes the connection explicitly.)

## 3. Monotony, habituation, and why confirmations decay

- **Monotony**: one way to accomplish each thing. Raskin's normative claim is that choosing among
  redundant gestures is itself an attention cost, so the burden of proof falls on *keeping* the
  third way to do something, not on removing it. He concedes monotony is routinely broken for
  backward compatibility, and that users self-monotonize anyway. Treat it as a design-time bias,
  not an empirical finding.
- **Habituation** is the mechanism that makes modes dangerous and confirmations useless. A
  frequently-repeated gesture becomes automatic; so does the OK-click that guards it. Raskin's
  *"Never Use a Warning When You Mean Undo"* (A List Apart) argues the obtrusiveness of a warning
  and its usefulness are inversely related. The argument is introspective, not experimental — cite
  it as his considered design position.
- The mechanism **requires repetition**. A genuinely rare, high-consequence action ("format this
  drive," asked once a year) has no habit to build, which is exactly the residue U4 assigns to a
  gate.

## 4. Norman's vocabulary — used correctly

**Mode error**, 2013 edition, verbatim: *"A mode error occurs when a device has different states in
which the same controls have different meanings: we call these states modes."*

1988/2002 edition, Ch. 5, verbatim: *"Mode errors are inevitable in anything that has more possible
actions than it has controls or displays; that is, the controls mean different things in the
different modes."* The popular gloss ending "…so the controls must do double duty" is **not
Norman's sentence** — see `evidence.md` §Forbidden.

Operational consequence of the 1988 line: the moment a feature count exceeds the control count,
mode-error mitigation is a budgeted design cost, not something careful users will absorb.

**Error taxonomy (2013).** Slips are execution-level: *action-based* and *memory-lapse*. Mistakes
are goal-level: *rule-based*, *knowledge-based*, *memory-lapse*. Deliberate violations are a third
category, outside both. A mode error is an **action-based slip** — which decides the fix: better
state-visibility at the moment of action, not better training or better task framing.

**Gulfs.** The Gulf of Execution is closed *before* the act by making the possible actions visible
and matched to the plan; the Gulf of Evaluation is closed *after* it by making the result legible.
Two different jobs. The seven stages are Norman's own "rough approximation," not a pipeline.

**Affordance vs signifier.** Norman's correction, verbatim: *"I should have used the term
'perceived affordance'"* and *"Forget affordances: what people need, and what design must provide,
are signifiers."* Stop writing "this button affords clicking" when you mean it *signals* clickability.

**Forcing functions** — the vocabulary for a mandatory gate, and each type prevents a different
failure: **interlock** (order of operations matters), **lock-in** (premature exit loses work or
state), **lockout** (entry into the state is itself the hazard). Norman's own framing: forcing
functions are "almost always a nuisance in normal usage." **Constraints** come in four kinds —
physical, cultural, semantic, logical — and cultural/semantic constraints are population-relative,
so a mapping that reads as obvious to your test users may invert elsewhere.

## 5. What the accident literature actually establishes

This is the strongest empirical evidence that modes hurt, and it does **not** license "add more gates."

| Case | What actually failed | The fix that shipped |
|---|---|---|
| **Air Inter A320, Strasbourg (20 Jan 1992, 87 of 96 killed)** | one Flight Control Unit field displayed Vertical Speed and Flight Path Angle in visually similar formats; a crew intending −3.3° FPA entered "33" and got −3,300 ft/min | **display disambiguation** — VS shown as four digits, distinguishable from FPA's format. The mode was kept. |
| **Therac-25 "Malfunction 54"** | a data-entry race: an operator editing the mode/energy field faster than the ~8-second magnet-setting routine; the completion flag "only indicates that the cursor has been down to the command line, not that it is still there" | not a Raskin-style mode slip at all — **silent state desync wearing a mode's clothes**. Fix is a lock during the processing window, not a UI indicator. |
| **Sarter & Woods (1995), *Human Factors* 37(1):5–19** | automation flexibility imposes mode-tracking demands the interface fails to support → "automation surprise" | their prescription is **fewer, more salient modes**, explicitly not more interlocks. Do not cite this paper as support for adding gates. |
| **AHRQ infusion-pump review** | routing around the safe path | recommends "design-oriented solutions that **constrain users to follow the preferred workflow**, such as defaulting users into using the drug library" — in a safety-critical domain, the burden of proof sits on whoever wants the bypass |

Counter-pattern to hold alongside the last row: some infusion pumps deliberately **fail-operate**
(continue infusing through an alarm) because for a life-sustaining infusion the forced stop is the
larger hazard. Evaluate the stop itself.

NN/g's checklist, when a mode survives: (1) can you avoid it? (2) if not, **≥2 redundant** salience
signals for the current state — e.g. cursor change *and* highlighting on the mode-selector control;
(3) never let transitions happen silently or indirectly; (4) prefer transient modes to persistent
ones; (5) reserve a confirmation for what feedback cannot cover; (6) avoid modes entirely where a
slip would be unsafe.

## 6. Object→Verb, and what it does and does not buy

Ueno's argument (systematizing a lineage he traces to Kay and PARC, not claiming to originate it):
Object→Verb ordering is modeless **by construction**, because there is no dedicated "waiting for
the object" state — 「もし対象物を選んだ後で別のことをしたくなったら、何もせずそのまま別の行動に
移ればよい」. Verb→Object ordering necessarily creates at least one such mode.

Two boundaries the doctrine's own advocates concede:

- Task-oriented (verb-first) framing is defensible when there is only a single object, or when the
  user's intended action is not yet determined.
- **Kakoune/Helix are the instructive case.** They invert vi's verb→object grammar to object→verb
  with instantaneous feedback — because "vi changes are made in the dark, we don't see their effect
  until the whole editing sentence is finished." They **kept the modes**. The most successful
  internal critique of modal editing was about feedback timing and locus of attention, not about
  the existence of modes. That is the shape of most correct fixes.

Implementation consequence: default bulk-editing UI to select-then-act (a contextual action bar
that populates from the current selection), not tool-then-target.

## 7. The historical arc — and the retirement

| Era | What the doctrine said |
|---|---|
| **Apple HIG, 1987** | "With few exceptions, a given action should always have the same result, irrespective of past activities." **And** it enumerated permitted mode categories — application-level, spring-loaded, alert, real-world-tool metaphor, attribute-only, unrecoverable-error blocking — each conditioned on "a clear visual indication of the current mode… near the object most affected," plus "No mode should ever prevent a user from saving a document or quitting the application." It was a cost-benefit framework from day one. |
| **OS X HIG, ~2011** | "Embrace Modelessness": "Users appreciate apps that allow them to be in control… overusing modes that require users to follow a specific path." |
| **~2017** | Apple deletes the Design Principles chapter; Modelessness stops being a named principle. |
| **Current HIG** | Eight principles — Purpose, Agency, Responsibility, Familiarity, Flexibility, Simplicity, Craft, Delight. **None is Modelessness.** The Modality page recommends modality as a governed technique ("Present content modally only when there's a clear benefit"), and Sheets are documented as *always modal* on macOS, tvOS, visionOS and watchOS. |

The honest summary is not "modelessness died." It is: **demoted from a proscriptive named
principle to an implicit background default, while modality was promoted from confessional
anti-pattern to a first-class, deliberately-scoped pattern.** Material, GNOME and Fluent land in
the same place — modal surfaces are normal named components, framed as interruptive and to be
scoped, with non-modal alternatives preferred for anything not requiring a decision.

**The strongest counter-citation is from inside the tradition.** Gentner & Nielsen, *The Anti-Mac
Interface* (CACM 1996), hosted by NN/g itself: "even the section on modelessness in the Macintosh
Human Interface Guidelines is primarily devoted to explaining how to use modes successfully," and
"the basic problem presented by modelessness is that the user cannot cope with everything at once.
Users need the interface to narrow their attention and choices" — "real life is highly moded: What
you can do in the swimming pool is different from what you can do in the kitchen." They frame it as
a deliberate thought experiment, not a report that users reject modelessness; cite it to kill the
appeal-to-authority, not as evidence about users.

## 8. Measuring, when you need a number

Raskin's apparatus is the one quantitative instrument in this corpus. GOMS keystroke-level
operators: K = 0.2 s (keying), P = 1.1 s (pointing), H = 0.4 s (homing between devices), M = 1.35 s
(mental preparation), R = system response. Sum them over two candidate designs for the same task
to get predicted expert completion times. His information-efficiency measure is E = (minimum
information the task requires) / (information the user must supply), bounded 0–1.

**Boundary — and it is severe.** GOMS/KLM models expert, error-free execution of an already-learned
task. It excludes learning, error recovery, and novice performance entirely. It cannot justify a
design choice aimed at first-time or infrequent users, which is most modality decisions.
