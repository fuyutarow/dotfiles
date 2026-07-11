# Formulating — posing the problem so the answer is decisive and un-gameable (G2, 定式化)

> **Scope**: the SOLE home of G2 — turning a chosen problem into a well-posed one whose every answer
> settles something and whose metric cannot be gamed. This is a **load-bearing gate** alongside G3: the
> agent is a **superhuman optimizer of whatever is measured**, so a badly-posed metric is not a minor
> flaw — it is an invitation the agent WILL accept, driving the proxy to its degenerate shortcut without
> touching the real question. Provenance: `sources.md`. Cut: designing/running ONE experiment's test →
> `acting-on-hypotheses`; inspecting the data's actual contents → `raising-resolution`; here is the
> JUDGMENT of what shape the question takes and what makes a metric trustworthy.

## §1 — Name the cheap victory (the anti-Goodhart move)

A capable agent is exceptionally good at finding the **degenerate shortcut** (specification gaming /
reward hacking): given an optimizable proxy it will move the number without solving the problem. The
mechanism that catches this **before** it happens:

> **Before running, name at least one concrete way to score well WITHOUT solving the problem — the
> "cheap victory."** Then either **close it in the metric design** or **reject the metric.** Prefer a
> metric whose cheapest path to the score IS the intended solution. **If you cannot construct a cheap
> victory, you do not yet understand the metric.**

Tells that a metric is gameable: hitting the target would leave a domain skeptic **unconvinced the real
claim is true**; the metric and the method **share a failure mode** (e.g. an LLM-judge that shares the
generator's blind spot); the metric was chosen because it was **available/standard**, not because it is
the hardest test of the claim. Pre-mortem the reward channel — *an un-gamed proxy is one nobody tried to
game.*

## §2 — The optimize/trust firewall (a proxy has only a success direction; a measurement has a failure direction)

Agents pick a convenient benchmark that captures what is *measurable* rather than what is *asked*, then
report the same number they optimized — no independent check survives. **A metric with only a "good"
direction is a proxy; a genuine measurement must define what result would FALSIFY the claim.**

**Mechanism** (the SPEC's G2 firewall slot):
- **Two metrics with a firewall**: the metric you **OPTIMIZE**, and a **held-out WITNESS** you **never**
  optimize against or select on. Optimize on one; adjudicate on the other; the number optimized is never
  the number trusted.
- **The witness divergence is the Goodhart stop signal.** Optimize the proxy hard *only* inside its
  **validated regime** (where proxy↔goal correlation was actually measured, on the distribution you are
  now on); the moment the un-optimized witness and the optimized metric **diverge**, the proxy has
  decoupled — stop (full argument: `reconciliation.md` §3, optimize-vs-Goodhart). Never optimize a single
  metric to saturation; always retain an un-optimized guardrail.
- **Pre-declare the losing outcome.** The adjudication metric must name the result that would
  **disconfirm** the thesis; an eval where every possible result is spun as partial support is theater
  (composes with `not-fooling-yourself.md` §1, §6). Ground the metric in a **real downstream use** when you
  can — a real task can't be Goodharted as easily as a synthetic one (Pasteur's quadrant, `reconciliation.md` §4).

**The witness lifecycle (repeated peeking contaminates even WITHOUT direct optimization).** A witness you
can look at freely is not held out — it is being hill-climbed one judgment call at a time between looks.
Treat it as a budgeted, logged resource, not a free oracle:
- **Budgeted peeks**: pre-declare HOW MANY TIMES the witness may be consulted before the first look; every
  access is LOGGED (who, when, what was seen).
- **Frozen analysis plan**: write the analysis you will run on the witness BEFORE the first peek — a plan
  chosen after seeing the data is not a plan, it is the leak.
- **Witness-is-SPENT criteria**: once the peek budget is exhausted, OR any decision (model choice, stopping
  rule, hyperparameter) was conditioned on what the witness showed, it is no longer a witness — it has
  joined the optimize side whether or not you meant to optimize against it.
- **Replacement**: retire a spent witness to the optimize side and stand up a FRESH witness (new split /
  new data / new task) before continuing to adjudicate.
- **The adaptive-data-analysis caveat**: each look leaks bits — model-selection pressure contaminates a
  held-out set even with no explicit optimization step, purely from the analyst adapting to what was seen.

## §3 — The representation is the crux (Pólya + Simon)

**Simon**: "solving a problem simply means representing it so as to make the solution transparent." The
first move of 定式化 is finding the **representation that collapses the search space** — a good encoding
turns an intractable search into a trivial lookup. Pair with **near-decomposability**: break the problem at
the natural seams of the system's modular/hierarchical structure.

**Pólya's two non-obvious moves for an agent** (the full four-phase heuristic list is canonical and the
model already has it — these two change what it does): **specialize-then-generalize** (solve the smallest
special case first, then lift), and **work BACKWARDS from the goal** to design the decisive experiment
(deciding what evidence would settle the question is formulation, here; committing to run it is
`acting-on-hypotheses`). Analogy that maps a problem onto a solved class is formulation here; *inventing*
a novel thesis by structure-transfer is `forging-novel-theses`.

## §4 — Frame the right problem (design-thinking, Type III error)

Pólya assumes the problem is given and asks how to solve it; **framing asks whether it is the RIGHT
problem.** The failure this discriminates is the **Type III error** — a rigorous, metric-optimal answer to
the **wrong question**, invisible to every metric. **Before optimizing any metric, interrogate the frame**:
"is this the problem worth solving, or an artifact of how it was handed to me?" A leaderboard number cannot
detect that the whole task is mis-framed.

- **Wicked vs. tame** (Rittel & Webber): a *wicked* problem has no definitive formulation (the formulation
  IS the problem, no stopping rule) — recognize it and **iterate framing and solution together** instead
  of over-investing in one up-front formalization; a *tame* problem can be formalized once and solved.
- **Reframe for leverage** (Dorst): the leverage is often in **re-framing** so a different, more solvable
  problem appears, rather than solving the stated one.
- **State what the formalization throws away** (the SPEC's G2 slot). The agent's failure is **premature
  over-formalization**: it converts a rich, messy question into a clean optimizable objective too early,
  discarding the residual ambiguity that carried the scientific content **because it is not optimizable.**
  Require an **exploratory pass on the real artifact before committing the formal task**, and force an
  explicit statement of what the formalization discards + an argument the residue is non-essential. **If
  the discarded part is where the difficulty lived, the formulation is wrong.**

## §5 — Choose the hypothesis and the test by severity (Popper, past the slogan)

Beyond "falsifiability": a better theory **FORBIDS more** — higher empirical content = more potential
falsifiers; a claim compatible with every outcome carries no information. **Prefer the conjecture that
sticks its neck out furthest** (prohibits the most, makes the riskiest prediction) — it is cheapest to kill
and most informative if it survives. And **severity**: a test is worth running only if the hypothesis had
a **real chance of FAILING** it — *a test the theory was always going to pass corroborates nothing.*

**AI4S mechanism**: design evals with a **high prior probability of failure conditional on the hypothesis
being wrong** — an eval your model was always going to pass is theater; among competing hypotheses,
prioritize the **most prohibitive** one. This sharpens "formulate so the answer is decisive" into a
concrete rule: **maximize potential-falsifiers and test-severity.**

**Design experiment SUITES that jointly constrain ONE model, not scattershot ablations** (Newell, "You
Can't Play 20 Questions with Nature and Win"): a pile of isolated binary results (does X affect Y? yes/no)
never converges on understanding — only experiments that *together* pin down a single explicit model do.
This is the sharpest warning for an agent that can spray thousands of cheap ablations: **volume of
ablation results is NOT progress** — before running a battery, state the one model whose structure the
suite will jointly identify, or you are playing 20 questions. (Single-test falsification governs one
hypothesis; do not use it to condemn a whole programme — that is the progressive/degenerating ledger,
`steering.md` §1.)

## §6 — Minimal model, and inject only theorems (complexity gates)

**The minimal model** (physics "spherical cow"; Karpathy nanoGPT ethos): build the **smallest working
version / simplest experiment** that would decide the question, from first principles, before adding
complexity. It is the antidote to the instrument-addict pathology (`selecting.md` §7).

Two complexity gates, both a one-line computable test (the tension + the agent's default bias are argued
in `reconciliation.md` §2 — here is only the gate you run):
- **Theorem, not hunch**: inject a prior only if it is an *exactly-true, cheap invariant* (symmetry,
  conservation law, exact constraint) — **theorem → inject; hunch → drop**.
- **Does it change the hypothesis ranking?**: add complexity only if it *changes which hypothesis
  survives* — otherwise it is decoration that invites overfitting and Goodhart.

## §7 — When to freeze the metric (formulate-early vs. explore-open)

Formalization is a **one-way ratchet**. Stay deliberately unformalized (Alon's nurturing phase,
`selecting.md` §4) while you are still learning what the real question is; **freeze the metric HARD only
when the formulation stops drifting across your last few probes** (full regime + the agent's
premature-formalization bias: `reconciliation.md` §2). Premature formalization freezes the WRONG question
and starts optimizing a crisp proxy before you know what matters — a clean number for a problem nobody
needed solved.
