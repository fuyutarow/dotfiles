# Slides, visuals & cognitive load — the assertion-evidence + multimedia-learning layer

> Scope: the evidence-backed slide/visual layer of a talk. The body's spine ("a talk is engineered
> cognition change") commits you to ONE message per slide carried by an assertion-title and visual
> evidence; this file supplies WHY that works, exactly how strong the evidence is, and the regimes
> where each rule flips. Tool names (PowerPoint/Keynote/Figma/Beamer) are interchangeable and out of
> scope; the principles here outlive any tool. Where a claim is contested or effect-size-dependent it
> is flagged inline — never assert undated empirical specifics as durable law, and never repeat a
> debunked myth as true (the myths live in `delivery-objections-and-evidence.md`; the few that bear
> directly on slide design are debunked here too).

## Table of contents

- Part A — Assertion-evidence: the highest-leverage single move
- Part B — Cognitive load & working memory: the binding constraint
- Part C — Mayer's multimedia principles
- Part D — The redundancy effect AND its documented reversal conditions
- Part E — Figure-as-compression: Larkin & Simon's "sometimes"
- Part F — Data-ink, chartjunk, preattentive cues, Gestalt
- Part G — Matching slide density to expertise (the expertise-reversal effect)
- Pre-flight checklist for the slide/visual layer
- Anti-patterns for this layer

---

## Part A — Assertion-evidence: the highest-leverage single move

The default deck — a **topic-label title** ("Results", "Background", "Approach") over a **bullet
list** — is the thing the entire slide-design literature was built to replace. The replacement is the
**assertion-evidence (A-E) structure** (Michael Alley, Penn State; popularized in *The Craft of
Scientific Presentations*, 2nd ed. 2013, and at writing.engr.psu.edu/assertion_evidence.html):

1. **The title is a full-sentence ASSERTION** — the one claim this slide proves, stated as a
   sentence the audience could disagree with. Not "Manufacturing variation" but "Manufacturing
   variation cannot be absorbed by per-device calibration alone."
2. **The body is VISUAL EVIDENCE** for that assertion — a figure, a photo, an equation block, a
   table — not a bullet list paraphrasing the title.
3. **The titles, read top to bottom with the body hidden, must reconstruct the entire argument.**
   This is the single most useful test in deck design (the "titles-only test").

**Why this is the highest-leverage move.** A sentence headline forces you to *have* a point per
slide (the discipline kills the agenda-dump slide), it gives the audience a frame to slot the
evidence into before they parse it (advance-organizer logic), and it makes the deck self-auditing:
if the titles don't tell the story, the argument has a hole or a misordering. It operationalizes the
body's "one message per slide" and "titles are conclusions not labels" directly.

**THE EVIDENCE — and the honest caveat.** The controlled study most cited for A-E is **Garner &
Alley** (*Journal of Technical Writing and Communication*, 2013; see also Garner, Alley, et al.,
*Technical Communication* 2009/2011), which found audiences comprehended and retained A-E slides
better than topic-subtitle bullet slides. **Caveat you must keep:** the A-E treatment **bundled at
least six changes at once** — sentence headline, supporting visual, reduced text, larger fonts,
single message, removed bullets. So the studies validate the *bundle*, not the isolated causal claim
that "the sentence headline per se" produces the gain. State A-E as a strongly-supported design
pattern, not as "sentence titles are proven to raise retention by X%."

**Default + escape hatch.** *Default:* every argument slide gets an assertion title + visual
evidence. *Escape hatch — bullets are honest when the content is a genuine enumeration:* a true list
(three options, an agenda, API parameters, acceptance criteria, a sequence of steps). The sin is not
the bullet; it is using bullets as the *body of an argument*, where they fragment reasoning into
disconnected fragments and let weak logic hide (the same failure that makes a prose memo sometimes
beat a deck for a complex decision — Bezos/Amazon).

---

## Part B — Cognitive load & working memory: the binding constraint

Every other rule in this file is downstream of one fact: **working memory is small and the audience
cannot pause you.** Cognitive Load Theory (Sweller, 1988; Sweller, Ayres & Kalyuga, *Cognitive Load
Theory*, 2011) partitions the load on that scarce resource into three kinds:

| Load type | What it is | Designer's job |
|---|---|---|
| **Intrinsic** | Inherent difficulty of the material + element interactivity | *Manage* it — sequence, segment, pre-train terms; you cannot delete it |
| **Extraneous** | Load from HOW it's presented (clutter, split sources, redundant text) | **Eliminate** it — this is the slide designer's primary lever |
| **Germane** | Effort that actually builds the mental schema | *Protect* it — free up capacity by killing extraneous load |

> Note: the three-bucket model and especially the "germane" category have been refined and
> partly contested in the load-theory literature (Kalyuga and others argue germane load is not a
> separate, independently manipulable source). Treat the trichotomy as a *design heuristic* — its
> actionable core ("kill extraneous load to protect capacity for the real material") is robust
> regardless of how the buckets are formally drawn.

**The split-attention effect** (Chandler & Sweller, 1991; Ayres & Sweller in the Mayer
*Cambridge Handbook of Multimedia Learning*, 2nd ed. 2014) is the most actionable consequence:
when understanding requires mentally integrating two physically separated sources that are each
incomprehensible alone — a diagram and a separate legend/key, a graph and a caption below it that
names the lines, code and an off-to-the-side explanation — the integration itself burns working
memory. **Fix: integrate.** Put labels directly on the figure (lines labeled at their ends, not in
a legend), annotations on the curve, the callout on the part it describes. Spatial contiguity is the
positive form of the same principle (Part C).

**The practical budget.** A slide that the audience must *read* while you *talk* is asking them to
run two language streams at once; a figure they must mentally stitch to a separate key adds a search
task. Both spend the same scarce resource that should be spent understanding your point. The rule
that falls out: **subtract first, decorate never** — and the things you subtract first are the ones
that compete for working memory without carrying the message.

---

## Part C — Mayer's multimedia principles

Richard Mayer's **Cognitive Theory of Multimedia Learning (CTML)** and the empirical principles in
the *Cambridge Handbook of Multimedia Learning* (2nd ed. 2014; principles also in *Multimedia
Learning*, 2nd ed. 2009 / 3rd ed. 2020) are the closest thing the field has to a tested rulebook for
slides. The principles that matter for live talks:

| Principle | Rule | Slide action |
|---|---|---|
| **Coherence** | Exclude material that doesn't serve the goal | Cut decorative images, background music, tangential detail, "fun" clipart |
| **Signaling (cueing)** | Highlight the essential | One preattentive cue (color/weight/arrow) aimed at the number that proves the point |
| **Spatial contiguity** | Place related words and pictures NEAR each other | Labels on the figure, not in a separate legend (kills split-attention) |
| **Temporal contiguity** | Present corresponding words and pictures together in time | Reveal the explanation as the relevant visual appears, not before/after |
| **Modality** | Narrate graphics with SPEECH, not on-screen text | Your voice carries the words; the slide carries the picture |
| **Segmenting** | Break a continuous flow into learner-paced chunks | Progressive build/animation of a complex figure, one element at a time |
| **Redundancy** | Don't add on-screen text that duplicates the narration | See Part D — this is the one with critical reversal conditions |

**Caveats you must carry (durability):**

- **Pin the edition.** Mayer's principle set and the supporting meta-analyses have grown and been
  revised across editions (2001 → 2009 → 2014 handbook → 2020). Cite "Mayer, *Multimedia Learning*,
  2nd/3rd ed." or "Mayer (ed.), *Cambridge Handbook*, 2nd ed. 2014" — do not cite a bare year.
- **Effect sizes vary and are context-dependent.** Reported effects (often Cohen's *d* in the
  ~0.5–1.0 range for the strongest principles like contiguity and coherence, smaller and more
  conditional for others) come largely from *instructional* settings — students learning to mastery,
  often self-paced, frequently with novices. A conference audience is not a controlled learning
  study. Use the principles as well-grounded design defaults, not as guaranteed deltas.
- **Most were established with novice learners.** Several principles weaken or reverse for experts —
  the expertise-reversal effect (Part G). "Know your audience's expertise" is therefore partly a
  cognitive-load decision, not just a topic-interest one.

---

## Part D — The redundancy effect AND its documented reversal conditions

This is the single most over-stated rule in presentation advice, so state it precisely.

**The validated harm (the precise claim):** presenting **full, verbatim on-screen text** that
duplicates the **spoken** narration **while a graphic competes for the visual channel**, under
**presenter-fixed pacing**, measurably *lowers* learning (the redundancy effect — Sweller & Chandler;
Kalyuga, Chandler & Sweller, 1999; Mayer & Fiore in the *Cambridge Handbook*). The mechanism: the
eyes try to read the text and watch the graphic at once (both visual channel), and the reading
duplicates the audio for no gain. **The practical rule: never read your slide text aloud while a
figure is showing.** Claim in the title, evidence in the visual, explanation in your voice; on-slide
text is key terms/labels only.

**The DOCUMENTED reversal conditions — when on-screen text HELPS (do not over-apply the ban):**

| Condition | Why text helps here |
|---|---|
| **No graphic competes for the visual channel** | If the slide is text-only, on-screen words don't fight a picture for the eye |
| **Text is a FEW key terms/labels, not the verbatim script** | Short cues anchor and signal; they don't re-run the whole audio stream |
| **Audio is hard to decode** | Non-native listeners, strong accents, noisy room, technical jargon, or no audio (a captioned recording) — text becomes a needed second channel, not a redundant one |
| **The learner controls pacing** | Self-paced material (a doc, a slide the reader can dwell on) removes the time-competition that drives the harm |

So "never put text with speech" is the overstatement to avoid. The defensible, durable claim is the
boxed one above: *full verbatim text concurrent with a graphic under fixed pacing.* For a
non-native or remote-captioned audience, a few on-screen key terms is the *correct* accommodation,
not a violation.

---

## Part E — Figure-as-compression: Larkin & Simon's "sometimes"

A figure is a **compression device that makes an inference free** — not decoration. The foundational
result is **Larkin & Simon, "Why a Diagram Is (Sometimes) Worth Ten Thousand Words"** (*Cognitive
Science*, 1987). The load-bearing word is **sometimes**: two representations can be *informationally
equivalent* (same facts recoverable from each) yet differ sharply in **computational efficiency** —
a diagram wins only when the task exploits **spatial locality and grouping**, so the picture removes
*search* steps (related things sit together) and *inference* steps (a relation is read off directly
instead of derived). A task-irrelevant or ornamental figure is **pure extraneous load** — the worst
case, because it costs working memory and returns nothing.

**The governing test for every figure: "What inference does this make FREE?"** If the answer is
"none — it's illustrative," cut it or replace it with the figure that does make the key inference
free.

**Choose the figure type by the relation it must make instant:**

| Figure type | Makes instant | Use when the audience asks |
|---|---|---|
| **Flow / pipeline** | Sequence and dependency | "What happens in what order? What feeds what?" |
| **Contrast / 2-axis map** | Position relative to alternatives | "How is this different from / better than X?" |
| **Layer / stack** | Composition and level of abstraction | "What sits on top of what? Where does my piece fit?" |
| **Causal / mechanism** | Why one thing produces another | "*Why* does your method work?" |
| **Equation block** | Exact structure of a relationship | "What precisely is the formulation?" (expert audience) |
| **Trend / quantity (chart)** | Magnitude, change, distribution | "How big? Getting better or worse? Compared to what?" |

**Worked selection (pick by the question, not by habit).** *Exec readout, the audience asks "how is
this better than X?"* → a contrast / 2-axis map with your option in the winning quadrant highlighted
(one preattentive cue), not a feature table they must scan. *Research talk, the audience asks "why
does it work?"* → a causal / mechanism diagram that reads the mechanism off the page, not a results
chart that only shows *that* it works. Same data, different free inference; the question selects the
figure.

**Diagram what is "long in prose but instant as a picture."** A four-sentence description of a
data-flow is a flow diagram; "our error is 3x lower across all six conditions" is a contrast chart
with one bar highlighted. Prose that survives compression to a figure should become the figure;
prose whose whole value is precise logical connection between claims may be better as *prose*
(Bezos's counter-condition — fragments can mask weak reasoning).

---

## Part F — Data-ink, chartjunk, preattentive cues, Gestalt

These are **heuristics for aiming the eye, not laws.** They earn their place because they reduce
extraneous load and exploit pre-attentive vision; treat them as strong defaults with known
exceptions.

**Tufte (Edward Tufte, *The Visual Display of Quantitative Information*, 2nd ed. 2001):**
- **Maximize the data-ink ratio** — the fraction of ink that encodes data; erase non-data ink
  (heavy gridlines, 3-D effects, redundant borders, gradient fills).
- **Chartjunk** — decoration that conveys no data — is extraneous load; remove it.
- *The honest caveat:* the "erase all non-data ink / chartjunk always harms" claim is **contested**.
  Bateman et al. ("Useful Junk?", CHI 2010) found embellished charts were sometimes recalled and
  liked *better* with no comprehension cost; Tufte's maximization is an aesthetic-and-clarity
  heuristic, not a proven universal. Default to minimal ink; don't treat a single tasteful visual
  motif as a sin.
- **Sparkline** was coined by Tufte for *inline word-sized charts*; it was only later repurposed
  (Duarte) as a metaphor for a presentation's shape — attribute precisely.

**Knaflic (Cole Nussbaumer Knaflic, *Storytelling with Data*, 2015) — the practitioner layer:**
- **Pick the right chart** for the relation (her families: simple text, table, line, bar, etc.).
- **Declutter** — remove what doesn't earn its place (the data-ink idea, applied).
- **Focus attention with PRE-ATTENTIVE attributes** — color, size, position, bold/weight, are
  processed before conscious attention, so **one** of them, used sparingly, drags the eye to the one
  number that proves your point. (Using five at once destroys the effect — saliency is relative.)
- **Use Gestalt grouping** (proximity, similarity, enclosure, connection, continuity) to make
  related things *look* related, so the audience groups them for free instead of by effort.

**The unifying move:** every chart should have a stated takeaway (an assertion title, Part A) and
exactly one visual emphasis aimed at the evidence for it. A chart with no highlighted point and a
topic label is asking the audience to find your argument — they won't.

---

## Part G — Matching slide density to expertise (the expertise-reversal effect)

There is no single correct slide density; it is **a function of audience expertise.** The
**expertise-reversal effect** (Kalyuga, Ayres, Chandler & Sweller, *Educational Psychologist*, 2003;
Kalyuga, 2007) is the durable finding: **scaffolding and explanatory support that HELP novices
SLOW OR HARM experts**, because for an expert the extra on-screen guidance duplicates a schema they
already have — it becomes redundant load. Worked examples beat problem-solving for novices and
reverse for experts; redundant explanation that aids a beginner is friction for a specialist.

**The design consequence — this FLIPS the sparse-slide default:**

| Audience | Density default | Why |
|---|---|---|
| **Novice / mixed / general** | Sparse: one assertion, one visual, minimal text, progressive build | Protect limited schema-building capacity; scaffold heavily |
| **Expert, slides studied/paused-on** | Higher density is *correct*: dense reference slide, full derivation, complete table | The expert reads fast, wants the data, and on-screen detail is not redundant to a schema they lack |

The clearest case is the **thesis-defense / technical-review backup slide** or an **appendix
derivation**: a dense, information-rich slide that a novice could never absorb in real time is
exactly right for an expert who will pause on it and interrogate it. Calling that a "violation of the
sparse-slide rule" is the mistake — the rule itself is expertise-conditional. (See
`context-playbooks.md` for the defense/Q&A playbook where high-density backup slides are the arsenal.)

---

## Pre-flight checklist for the slide/visual layer

Run this over the built deck (it implements the body's pre-flight for this layer):

- [ ] **Titles-only test** — hide every body; read titles top to bottom. Do they reconstruct the
      whole argument with no gap or jump? If not, fix the argument, not the slide.
- [ ] **Every title is an ASSERTION** (a sentence you could disagree with), not a topic label.
- [ ] **Every argument-slide body is VISUAL evidence**, not bullets paraphrasing the title.
      (Bullets only where the content is a genuine enumeration.)
- [ ] **"So what?" per slide** — each slide moves a belief the audience must hold to act; cut any
      that merely informs.
- [ ] **No verbatim slide text read aloud over a graphic** (the precise redundancy harm, Part D) —
      but DO keep on-screen key terms for non-native / noisy / remote-captioned audiences.
- [ ] **Every figure passes "what inference does this make free?"** (Part E) — else cut or replace.
- [ ] **Labels integrated into figures**, not in a separate legend (kills split-attention, Part B).
- [ ] **One preattentive cue per chart** aimed at the proving number (Part F); chartjunk erased.
- [ ] **Density matched to expertise** (Part G) — sparse for novices, dense reference slides for
      experts who'll study them.
- [ ] **Subtract pass done** — removed everything that competes for working memory without carrying
      the message ("subtract first, decorate never").

---

## Anti-patterns for this layer

| Anti-pattern | Why it fails | Fix |
|---|---|---|
| Topic-label titles ("Background", "Results") | Carry no claim; titles-only test fails | Full-sentence assertion per slide (Part A) |
| Bullet list as the body of an ARGUMENT slide | Fragments reasoning; hides weak logic | Assertion + visual evidence; bullets only for true enumerations |
| Reading slide text aloud while a figure shows | Validated redundancy harm WHEN text is verbatim + a graphic competes + pacing is fixed (Part D) | Words in your voice, evidence in the visual, key terms only on screen |
| Over-applying "never put text with speech" | Hurts non-native / noisy / captioned audiences who need the text channel | Keep short on-screen key terms in the reversal conditions (Part D) |
| Diagram/legend split | Split-attention burns working memory | Integrate labels onto the figure (Part B) |
| Decorative figure / chartjunk that makes no inference free | Pure extraneous load | Keep only figures that remove a search/inference step (Parts E–F) |
| One density for all audiences | Overloads novices, patronizes experts | Tune density to expertise; dense expert backup slides are correct (Part G) |
| Chart with no highlighted point + topic label | Audience must hunt for your argument | One preattentive cue at the proving number + assertion title (Parts A, F) |
| Citing folklore slide stats ("22x more memorable", "we remember 90% of what we do", "93% nonverbal") | Debunked; signals you didn't check sources | Rely on the CTML/CLT core; for the debunkings see `delivery-objections-and-evidence.md` |
| Treating Mayer/Tufte effects as guaranteed deltas | Effects are edition- and context-dependent (mostly novice, instructional, self-paced) | Use as strong defaults with stated caveats; pin the edition (Part C) |

