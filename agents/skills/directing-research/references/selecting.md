# Selecting — choosing what to work on by consequence, not fluency (G1)

> **Scope**: the SOLE home of G1 — problem selection and research taste (観察眼). The mechanism that
> replaces the virtue "have courage / work on important problems", because an agent has no courage to
> summon and no fear to overcome — its failure is **tractability substitution** (scoring "can I start
> now" and calling it importance). Provenance: `sources.md`. Cut: INVENTING the novel thesis →
> `forging-novel-theses`; running one de-risking spike → `acting-on-hypotheses`; here is the SELECTION
> across candidate problems — which one earns the effort.

## §1 — Consequence before fluency (the core mechanism)

**Hamming's test, run on yourself as a recurring audit**: "What are the important problems of my field?"
and "Why am I not working on them?" — treat a persistent gap between the two lists as a **defect to fix,
not a fact to accept.** Local productivity silently reselects you onto tangential, tool-shaped work; the
audit forces effort back onto consequence.

**The mechanism** (the SPEC's G1 slate): *before* writing any method, produce a **consequence-ranked
slate of ≥3 candidates**, each scored ONLY on **what becomes POSSIBLE or gets FALSIFIED if solved** — not
on a popularity signal ("widely studied", high-citation area). Importance and tractability are scored in
**that order**, and the tractability assessment is not allowed to contaminate the consequence one.

**The agent inversion — fluency is a crowdedness FLAG, not a decision rule.** A model's likelihood is
highest on the **median of its training distribution**; genuinely important problems are frequently OOD,
where its prior is weakest and it feels **least** fluent. So the agent's felt confidence is a poor
importance signal, and its instinct to go where output comes easiest points at crowded, incremental work.
TELL: a polished method appears within seconds; the approach reads like a recombination of three recent
papers; the problem statement could have been written before seeing THIS context (benchmark-shaped).
**Mechanism** (a weak flag, used carefully): when a full method appears without friction, treat it as a
**prompt to check crowding DIRECTLY** (how many groups are on this? is the low-hanging fruit picked? — §3
neglectedness), **not** as a standalone reason to downgrade importance — and *never* as a reason to
UPGRADE a direction merely because you cannot method-sketch it. Fluency also tracks *tractability and
well-posedness*, so "I can't produce a method" often means **ill-posed or impossible**, not "important" —
which is exactly what the consequence-first slate (§1) and the fresh-lever gate (§2) exist to separate.
Net: effortless fluency is weak evidence about importance; verify crowding and consequence directly
rather than letting felt fluency drive selection. (This premise is graded constructed / needs-verification
in `sources.md` — hold it as a flag, not a law.)

## §2 — The fresh lever / why-now (importance-gate)

An important problem is not important *for you* until you hold a **reasonable line of attack** — Hamming's
own moderation of his slogan. The gate is a **fresh lever**: a new instrument, dataset, method, or angle
that has just appeared and did not exist before. **Name the lever you hold that others don't** (the
why-now); **no lever → the problem is not soluble yet → shelve it with an explicit trigger** ("attack
when tool X matures"), neither abandoned nor ground on (full regime: `reconciliation.md` §1,
important-vs-soluble).

**Tools-limited ≠ intractable.** When an important problem is dismissed as "not ripe", ask whether
**building the missing tool IS the contribution** — the good tools' absence is often exactly why the
important problem looks intractable and stays neglected. New directions in science are launched by **new
tools more often than new concepts** (Dyson) — so treat *"a new capability/instrument just appeared"* as
an **importance-window signal**, and point it at the problems previously unattackable. (Inventing/building
the tool is `implementing-and-debugging` / `forging-novel-theses`; the SELECTION judgment that the
tool-gap is the choosable project is here.)

**Don't only swing the hammer you have.** When a problem doesn't fit your best-known method, change the
method — do not quietly reselect onto the problems your tools happen to fit (Maslow's law of the
instrument). The tell is that your problem choice tracks your toolkit rather than the field's importance
ranking.

## §3 — ITN and personalized neglectedness (the marginal-return correction)

"Work on the most important problem" fails because a hugely important but **crowded** field has had its
low-hanging fruit picked — your *marginal* contribution is small even though the topic matters. **ITN**
scores selection multiplicatively: value ≈ **Importance × Tractability × Neglectedness**, where
neglectedness is **marginal return** (fewer resources already flowing → higher return per added unit, via
diminishing returns). Score all three; **beware any factor near zero** (importance can't rescue zero
tractability or a saturated field). For an agent with cheap parallel search: **map worker-density /
crowding across sub-problems** and preferentially spend compute on **high-importance / low-density**
regions where marginal EV per unit compute is highest (units are loosely defined and double-counting-prone
— `sources.md`; use it to rank, not to compute a false number).

**E. O. Wilson — go where the crowd isn't** (paraphrase; the "march away from the sound of the guns"
slogan is graded needs-verification, `sources.md`). Personalize neglectedness into an action: pick a
subject with few workers where you can reach the frontier fast — rather than crowding the hot front as
one of thousands. Sometimes the winning move is to **relocate** your problem to
lead a thin frontier. (Moderator vs Hamming, who stays and attacks his field's central problem: importance
is necessary in both; **crowding is the tiebreaker.**)

## §4 — The selection matrices (Alon, Medawar)

**Alon's feasibility × interest matrix**: pick problems high on BOTH; the trap is the
high-feasibility-low-interest quadrant (easy, safe, forgettable). Precede commitment with a **nurturing /
exploration phase** — carry several candidate problems for weeks/months before locking one. The candidate
set lives near the **frontier of your own knowledge**, where interest and field-importance overlap. *For a
human*, Alon makes subjective interest/motivation a real input (it sustains you through the slow middle);
**for the agent — which has none — the mechanism-translation is to inject an explicit novelty/curiosity
term into the candidate generator** so the set is not pre-collapsed to the legible (`reconciliation.md`
§1, curiosity-vs-strategy). The virtue does not port; the generator term does.

**Medawar's tractability gate — "research is the art of the soluble."** Good scientists study the most
important problems they think they can **solve**; their business is to solve problems, not merely grapple
with them. No credit for engaging a great problem; it is well-chosen only if a soluble line of attack
exists NOW. Integrity corollary: **the intensity of your conviction that a hypothesis is true has no
bearing on whether it is.** The Hamming-vs-Medawar regime (attack-the-intractable vs stick-to-the-soluble)
is decided by the fresh lever (`reconciliation.md` §1): **tag each bet `soluble-now` (Medawar regime,
the portfolio's bread-and-butter) vs `tool-creating` (Hamming regime, the once-in-a-career bet where the
deliverable IS the new tool) and budget them separately.**

## §5 — Selection by vision, and by quadrant

**An alternate slate generator — vision back-chaining** (Bret Victor): the model's default is
**gap-driven** selection (find the hole in the literature); as a second generator, **back-chain from a
desired end-state** (a stated principle about how the world should be) to what must be true — it guards
against a portfolio of individually-publishable but collectively-aimless increments. Use it to *seed the
G1 slate* alongside gap-spotting, then score both by consequence (§1).

**Pasteur's Quadrant (Stokes)** — prefer problems where a concrete **use** and a **fundamental question**
coincide; the use-anchor keeps the work honest (un-gameable evaluation) and the fundamental angle keeps it
general (full argument: `reconciliation.md` §4).

## §6 — Bound the selection search (Simon's satisficing)

Searching the problem-space is itself costly and endless ranking is a trap. Under bounded rationality you
**satisfice, not optimize**: set an **aspiration level** for "a problem worth my time", take the **first
candidate that clears it**, and adjust the bar by how easily candidates appear. For an agent that could
score thousands of candidates: **cap problem-selection search with a satisficing threshold** instead of
exhaustively ranking every candidate — the meta-search must itself be bounded, or selection becomes its
own procrastination.

## §7 — Self-diagnosis: substitution traps (after Cajal)

Cajal's "diseases of the will" name failure-archetypes that map onto agent pathologies. The one
operational rule: **periodically check whether you are SUBSTITUTING reading, tooling, or theorizing for
the decisive experiment** — each is locally rewarding and self-perpetuating. If so, force the cut: set a
**stopping rule on reading** (endless literature synthesis → cut to the run), force the **minimal
experiment now** (endless tooling/scaffold-building → `formulating.md` §6), or require a
**falsification-bearing check** (elaborate ungrounded reasoning → `not-fooling-yourself.md` §6). Hold every
hypothesis loosely, ready to drop it — the ≥3-live-hypotheses discipline from the taste side
(`not-fooling-yourself.md` §7).
