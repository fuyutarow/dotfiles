# Complexity — simple is not easy, and the cost is conserved

> Scope: gate **U2**. What "simple" and "easy" mean precisely enough to audit, where the residual
> complexity goes, and the counter-theses that stop the doctrine from becoming a licence to strip
> functionality. Cognitive-load *facts* live here; the folklore that fails replication is in §6.

## 1. The two words, defined so you can be wrong about them

Hickey, *Simple Made Easy* (Strange Loop, 2011) — verbatim:

> "So the first word is simple. And the roots of this word are sim and plex, and that means one
> fold or one braid or twist… And the opposite of this word is complex, which means braided
> together or folded together. Being able to think about our software in terms of whether or not
> it's folded together is sort of the central point of this talk."

And on *easy*: "the derivation there is to a French word, and the last step of this derivation is
actually speculative, but I bought it because it serves this talk really well, and that is from the
Latin word that is the root of adjacent, which means to lie near and to be nearby." He gives three
senses, in order: **near / at hand** ("easy to obtain because it's nearby"), **familiar** ("near to
our understanding… in our current skill set"), and **within our capabilities**.

The load-bearing asymmetry, verbatim: *"easy is always going to be, you know, easy for whom, or
hard for whom? It's a relative term"* — versus *"if something is interleaved or not, that's sort of
an objective thing… simple is actually an objective notion."*

**What this changes in a design review.** "This is easier" without a named population is not a
checkable claim; reject it or make the author name the population and which of the three senses
they mean. "This is simpler" *is* checkable — so demand the braid: *what two things were folded
together, and are they now separable?* A rearrangement that separates nothing is not a
simplification.

**COMPLECT** is the diagnostic verb, verbatim: "It means to interleave or entwine or braid…
Complect is obviously bad… This is where complexity comes from: complecting." Its opposite is
*compose*, "to place together" — "Composing simple components… is the way we write robust
software." In review, name the complecting explicitly: *"this control complects the submit intent
with the panel's open/closed state."* If you cannot name a pair, you are looking at composition,
which is fine.

**Two Hickey lines that survive translation to interfaces unchanged:**

- On limits: "our understanding is very limited… how many things can you keep in mind at a time?
  It's a limited number, and it's a very small number… every intertwining is adding this burden,
  and the burden is kind of combinatorial."
- On judging the right object: "we're in a business of artifacts… We don't ship source code…
  [simplicity] is an attribute of the artifact, not the original construct." **A design that felt
  clean to author is not thereby simple to operate.** This is the single most transferable line in
  the talk, and the one a model most needs, because a model's felt fluency while producing a design
  is uncorrelated with the design's operating cost.
- On guardrails: "Who drives their car around banging against the guardrail…? do the guardrails
  help you get to where you want to go?… They don't." The interface analogue: validation errors and
  confirmations are guardrails; they stop you leaving the road, they do not tell you where to go.
- "The bottom line is simplicity is a choice. It's your fault if you don't have a simple system…
  It requires constant vigilance."

## 2. The toolkit table — and its transfer boundary

Hickey's "What's in your Toolkit?" slide, ten paired rows (Complexity → Simplicity): State/Objects
→ Values · Methods → Functions, Namespaces · vars → Managed refs · Inheritance, switch, matching →
Polymorphism a la carte · Syntax → Data · Imperative loops, fold → Set functions · Actors → Queues ·
ORM → Declarative data manipulation · Conditionals → Rules · Inconsistency → Consistency. His own
caveat on the same slide: *"The simplicity column just means simpler. It doesn't mean that the
things over there are purely simple."*

**Transfer boundary — do not launder this.** Every row is a code construct; no row contains a UI
noun; Hickey never applies "complect" to a human-facing control anywhere in the talk. The
*vocabulary* transfers (ask "what is braided with what"); the *table* does not. Any UI remapping
("prefer a state snapshot to a stateful widget") is your construction, and must be labelled as
such.

One adjacent talk earns a line. *The Value of Values*: "values make the best interface… For
subsystems [values] can be moved, ported, enqueued." That is the code-side statement of the same
property U3 calls delegability — an inert value can be handed to another actor; a live handle
cannot.

**One adjacent talk that must be handled carefully.** *Design, Composition and Performance*:
"instruments are made for people who can play them — 100% of the time… they do not make anything
for beginners." Read as a design principle for consumer interfaces this is simply the "easy for
whom" question answered by fiat. It is a legitimate *population choice* for a practitioner tool; it
is not an argument that the population question can be skipped. Do not deploy it as a general
licence to ignore novices.

## 3. Tesler's law — the conservation constraint

Tesler, *interactions* (2012), verbatim — this is the primary-source phrasing, and the popularly
circulated "the user, the application developer, or the platform developer" version is a drifted
paraphrase:

> "Every system has an irreducible amount of complexity; the only question is, who is going to have
> to deal with it? The user? The application programmer? Or the platform developer?"

This is why U2's artifact has an **absorber** column and why "no one" is rejected. Every
simplification of one surface is a relocation, and the relocation is the design decision.

**Boundary.** It is a framing device for a trade-off, not a quantitative conservation principle: it
says complexity cannot be *deleted*, it does not say the total is fixed. Tognazzini's critique
targets the static "fixed pie" reading — as burden shifts off users, users escalate their demands
and the total grows. Tesler's own "who is going to have to deal with it" phrasing is arguably
compatible with that. Do not present the law as arithmetic.

## 4. The formal backing — and where it stops

**Out of the Tar Pit** (Moseley & Marks, 2006) supplies the sharpest usable definitions, and one
redefinition that matters enormously here:

> "Essential Complexity is inherent in, and the essence of, the problem (as seen by the users).
> Accidental Complexity is all the rest."

*As seen by the users* — essential complexity is defined against the user's problem, not the
implementation's needs. That is precisely the U2 absorber question stated as a definition: anything
the user must deal with that their own problem does not require is, by this definition, accidental.

They also name the villain: "We believe that the major contributor to this complexity in many
systems is the handling of state," with code volume and explicit control flow next. And they
disagree with Brooks head-on, quoting him — "'The complexity of software is an essential property,
not an accidental one'… We disagree." Their other operative claims: informal reasoning matters more
than testing, because "testing is hopelessly inadequate" for state-dependent behaviour; and
"complexity breeds complexity."

**Brooks, *No Silver Bullet* (1986)** is the constraint on over-promising: essence versus accident
(explicitly "following Aristotle"), and "there is no single development… which by itself promises
even one order of magnitude improvement." Whether Brooks supports or limits Hickey depends on the
reading — Brooks's *essential* is essential to the software's nature, the Tar Pit's is essential to
the user's problem. Those are different sets. Do not cite them as agreeing.

**Ousterhout, *A Philosophy of Software Design* (2018)** is the counter-check that stops
over-application, and the one that transfers most directly to interfaces:

- "Complexity is anything related to the structure of a software system that makes it hard to
  understand and modify the system."
- Three symptoms: **change amplification**, **cognitive load**, **unknown unknowns**.
- "The best modules are **deep**: they allow a lot of functionality to be accessed through a simple
  interface." — the goal is a *simple interface over a complex implementation*, deliberately
  braiding a great deal behind one surface.
- "Sometimes an approach that requires more lines of code is actually simpler."
- His classitis critique explicitly targets the "any method longer than N lines should be divided"
  orthodoxy.

**The synthesis U2 enforces**: decomplecting is a win when it removes a braid the *user* must hold;
it is a regression when it relocates the braid *onto* the user in the name of internal purity. A
shallow interface with many small controls, each individually simple, is the interface-side form of
classitis.

## 5. Norman's counter-thesis — the goal is understandability

Two pieces, both routinely misread:

- ***Simplicity Is Highly Overrated*** (2007). His actual claim is about **purchase-time** behaviour:
  more visible controls read as more powerful at the moment of buying. It is not a general
  endorsement of feature-piling. Do not let it be cited standalone as "complexity is good."
- ***Living with Complexity*** (2010). Complexity is necessary and often irreducible; the target
  metric is **understandability**, not control count. A complex-but-well-structured flow can be more
  understandable than a stripped one.

Operationally: when defending a feature-rich or multi-step design against "just simplify it,"
reframe the metric as *can the user build a correct mental model of why it works this way* — not
*how few controls are on screen*.

## 6. Cognitive load — what is established, and what is folklore

Established enough to design on:

| Finding | Use |
|---|---|
| Sweller (1988) and the CLT line: domain-specific **schemas** are the primary expert/novice difference; load splits into intrinsic / extraneous / germane | Attack **extraneous** load (layout, navigation, mode tracking) first; intrinsic load belongs to the task |
| **Expertise-reversal effect**: scaffolding that helps novices measurably *harms* experts | A single density/verbosity setting cannot serve both populations; this is the real argument for a second path (accelerators), not "make it simpler" |
| Nielsen's response-time limits: 0.1 s / 1 s / 10 s (tracing to Miller 1968 and Card et al. 1991) | See `reversibility.md` §5 — these are engineering budgets, not vibes |

Folklore that does **not** survive contact with the literature — flag every one of these when cited:

| Folklore | Reality |
|---|---|
| "7±2 items, so cap the menu" | Miller's actual claim is about immediate memory span for unrelated chunks; it is not a UI capacity law and does not bound menu length |
| "Hick's Law, so reduce the options" | Liu, Gori, Rioul, Beaudouin-Lafon & Guiard, *How Relevant is Hick's Law for HCI?* (CHI '20) — Hick's law models forced-choice reaction time, rare in real UIs. Most menu use is **search/recognition**, where more well-organized options can be *faster* |
| "Fitts's Law, so bigger and closer is always better" | Check the input modality and the population's motor range before applying; the model's constants are not universal |
| "The jam study — fewer choices sell better" | Scheibehenne, Greifeneder & Todd (2010) meta-analysis finds a mean effect near zero. If option reduction is proposed, name the specific moderator (time pressure, hard-to-compare options, genuinely uncertain preferences) that would make it hold here |
| "I ran a heuristic evaluation, so this is a finding" | Hertzum & Jacobsen (2003): a substantial **evaluator effect**, with agreement between evaluators ranging roughly 5–65%. NN/g's own figure is ~35% of problems found by a single evaluator. Run 3–5 independent passes and take the union; never treat one pass — human or agent — as a verdict |

## 7. The U2 decision forks

| Fork | Take A when | Take B when |
|---|---|---|
| **Remove the control vs make the state understandable** | the control encodes no decision the user's own problem requires (accidental, per the Tar Pit definition) | the complexity is the user's problem — then invest in understandability and mental model, not deletion (Norman) |
| **Shallow-and-many vs deep-and-few** | each surface genuinely serves a distinct decision the user makes separately | the surfaces are always used together — collapse them behind one deep interface (Ousterhout), and absorb the braid in the implementation |
| **Familiar vs simple** | the population is large, transient, and low-commitment: buy ease with a conventional (even braided) idiom, and record the debt in the ledger | the population is habituating and long-lived: pay the unfamiliarity once, keep the artifact un-braided |
| **Who absorbs it** | the platform or implementer can absorb it once, for everyone | it must land on the user — then say so explicitly in the ledger, and design the signifier that teaches it |
