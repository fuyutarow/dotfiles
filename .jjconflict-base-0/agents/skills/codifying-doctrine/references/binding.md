# Binding — what makes a rule cost something (pipeline steps 6–9)

> **Scope**: SOLE home of the BINDING SURFACE taxonomy, precedence and tie-break, the delegation
> boundary and default-on-silence, and the deviation machinery. Where rules come from is
> `references/deriving.md`; how a draft is probed is `references/testing.md`; sources and grades
> are `references/canon.md`.

## 1. BINDING SURFACE — the four types that were actually observed

A stated rule is not a control. The binding surface is **whatever makes deviating costly, slow, or
visible other than the sentence itself.** Four types recur across the source record; a fifth slot
exists for the harness case. Every rule names one, or carries the literal token ADVISORY.

| Type | Shape | Worked instance | What it sacrifices |
|---|---|---|---|
| **NUMBER-TRANSFERS-RIGHT** | a measured quantity crosses a threshold and the decision right moves automatically, with no one invoking authority | error budget exhausted → all releases except P0 and security halt until the service is back inside its objective | feature velocity |
| **STOP-AT-DETECTION** | the halt right sits with whoever detects the defect, not a supervisor, and using it is an obligation rather than a permission | the andon cord: pulling it IS the stop, not a request routed upward | throughput |
| **CAP-PLUS-INCENTIVE-CUT** | a hard ceiling, PAIRED with severing the reward from growth past the ceiling | headcount capped at 10–25% of a normal program, plus pay explicitly not based on the number of people supervised | raw capacity and redundancy |
| **DEFAULT-NON-EXTENSION** | the default consequence of missing the bound is termination, and extension requires an active decision | the six-week bet that does not get extended by default | completeness and scope |
| *(harness)* **PROGRAM-DENIES** | a hook, gate, or type refuses the action before it takes effect | a PreToolUse hook denying an unclassified search | flexibility, and false denials |

Three properties are load-bearing and are where drafts fail:

1. **Pairing.** The cap type only works in the pair. A ceiling alone is eroded by whatever still
   rewards growth. Ask, for every cap: *what still pays for exceeding it?*
2. **Symmetry.** Both sides of the trade must answer to the SAME quantity, or the rule becomes one
   party's leverage rather than a neutral arbiter. A metric owned by one side is not a binding
   surface — it is a weapon.
3. **Load-bearing halt.** A stop-right that halts nothing costly is decoration. Name the concrete
   thing that stops: a line, a release, a deploy, a merge. "Raise a concern" is not a stop-right.

**Precommitment needs friction, not sincerity.** A rule meant to bind against future temptation
must make deviating *obvious*, *slow*, or *difficult* — a published deviation, an external
sign-off, a mandatory delay. Absent a named friction mechanism, relabel the clause 願望.

**Prose is not enforcement under adversarial pressure.** For any rule that must hold against an
actor who wants it not to, the sentence is a request. Pair it with a control outside the
contestable text: a program that denies, an isolated channel for untrusted input, least privilege.
Route the installation to `operating-the-harness`; the requirement that a surface exist is D5 here.

## 2. Precedence and the same-rank tie-break

A flat list of rules is a conflict generator. Two mechanisms close it, and both must be written:

**Cross-rank.** Order the layers and state, per layer, who may override it and how.

```text
LAYER    who issues it        override
-----    ------------------   -----------------------------------------
1        <non-overridable>    none
2        <owner>              explicit override required, logged
3        <owner>              implicit override allowed from context
```

Per clause, tag RULE (non-overridable) or DEFAULT (overridable, and **by whom** — an unnamed
override actor produces two parties who each believe they hold the right). A conflict across
layers resolves by layer; a lower-layer instruction that conflicts with a higher one loses.

**Same-rank.** Two rules at the same layer WILL point opposite ways. Pre-commit to the fallback:

- *later supersedes earlier* — when the rules arrive as a stream of instructions, or
- *a named default action* — the strongest published example commits to **inaction** when two
  top-level principles conflict.

Also decide and DECLARE whether the ordering is applied strictly (lexicographic: the higher always
wins) or holistically (weighted, with named ceilings). Leaving this to inference produces the
characteristic pathology: ad hoc exceptions bolted onto the top rule because strict application
produced an absurd result nobody anticipated.

**Spirit-over-letter escape.** Where a specific lower-layer rule would, in a genuine conflict,
force violating a higher-layer commitment, write the escape clause explicitly. Without it, actors
choose between rule-following and doing the right thing with no cover from the document.

## 3. Delegation boundary and the default on silence

Two artifacts, both short, both mandatory for any doctrine that must survive a partition.

**The boundary.** Route by consequence, not by rank. The strongest observed form is a single
severity test: an action that could sink the enterprise requires consultation first; everything
else is taken unilaterally and reported. A reversibility test does the same job on a different
axis: irreversible decisions get slow, consultative process; reversible ones get a light one.
Either way the routing property is stated once and applied everywhere — not re-argued per case.

**The default on silence.** For every decision class that can be caught mid-partition:

```text
IF <named condition, e.g. no contact for T> THEN <named action>
```

And declare which failure mode you are choosing:

| Fallback | Preserves | Accepts |
|---|---|---|
| **FREEZE** | agreement | delay, and a stall that may be worse than either choice |
| **ACT-ON-LAST-INTENT** | tempo | divergence risk |

Declining to choose is itself a choice, and different actors will resolve it inconsistently under
real pressure. The declaration is the artifact.

**Intent must be redundant to survive a lossy channel.** State purpose, key tasks, and end state
as separate fields rather than collapsing them into one sentence. A partially received transmission
still reconstructs the same decision. And of task and intent, **intent is predominant** — the task
goes obsolete when the situation changes; the intent is what remains actionable.

**A document claiming decentralization is not evidence of it.** Audit which decisions were
actually taken at which level, and how long people waited for permission. The recurring finding is
organizations that publish delegation doctrine while centralizing through better telemetry.

## 4. Deviation machinery — print it, bound it, log it

A doctrine with no legitimate deviation path is deviated from silently. The observed practice in
mature doctrine is the opposite of prohibition:

1. **Print the exception clause in the document.** The canonical wording is that the guidance
   *will be followed except when, in the judgment of the responsible actor, exceptional
   circumstances dictate otherwise.*
2. **Close it with a report duty, not a ban.** Acting without orders when orders no longer fit the
   situation is legitimate; failing to inform afterwards is the violation.
3. **Keep the DEVIATION LOG.** One row per deviation: `date / rule / what was done instead / why /
   disposition`. Disposition is one of `escalated` · `rule formally revised` · `accepted as
   tolerable crudeness`. The third value is required — without it, every misfire becomes a rule
   edit and the rule dissolves into a standard.
4. **Write the ADVANCE NON-COMPLIANCE section.** This is the least-copied and most valuable
   instrument in the source record: a section stating, **before** the work starts, which
   otherwise-applicable standards will knowingly not be complied with, and why. It is a different
   instrument from the after-the-fact log, and most organizations have only the latter.

The single-exception register is the same machinery at rule level: one entry per case a bright-line
rule is known to get wrong. Its existence is what lets the rule's text stay entrenched.

## 5. Anti-patterns (TELL → fix)

| Anti-pattern | TELL | Fix |
|---|---|---|
| **Wall art** | the principle is recitable, but no process, form, meeting, metric, or program enforces it | §1 — name a surface or relabel ADVISORY |
| **Unpaired cap** | a ceiling exists and something still rewards exceeding it | §1.1 — sever the reward |
| **Weaponized metric** | only one side is accountable to the number | §1.2 — make it shared |
| **Ungraded veto sprawl** | many actors may "raise concerns"; nothing halts | §1.3 — name what stops |
| **Fake precommitment** | deviating is no slower, harder, or more visible than complying | §1 — add friction or relabel 願望 |
| **Prose-as-enforcement** | the only control for an adversarial-facing rule is that the reader complies | §1 — pair with a program that denies |
| **Unnamed override actor** | two parties both believe they hold the override right | §2 — bind every override to a named role |
| **Ordering theater** | exceptions keep getting bolted onto the top rule | §2 — declare strict vs holistic deliberately |
| **Silent partition** | no clause for "haven't heard from X by T" | §3 — write FREEZE or ACT-ON-LAST-INTENT |
| **Deviation invisible** | no log, or a log with no `accepted as tolerable` disposition | §4 — add the log and the third disposition |
| **No advance declaration** | only after-the-fact deviation records exist | §4.4 — write the ADVANCE NON-COMPLIANCE section |
