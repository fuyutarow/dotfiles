# Forge verification ledger — writing-julia (F3 artifact)

Append on reforge; never overwrite. The fire/no-fire desk-check set is `tests/trigger-set.md` —
re-run it after any description edit.

## 2026-08-03: match-time Tiger seam

Description now gives `practicing-tiger-style` the cross-language phase/risk/ledger choice and
retains Julia mechanisms HERE. PyYAML count: 1558 (down from 1637); generic floor exit 0 with
existing WARNs: description 1558, prose 52, version block 86, table cells 5.

## CURRENT STATE

**LAW (live, since v2607.2.0):** method before speed, types before tuning, architecture before
growth. §2.0 + §1 read first and outrank references/. JG3 (architecture) fires the moment a
package outgrows one file — not on request.

**Gates:** JG0 methodology (deny-gate; exception = mandatory in-code comment) · JG1 pitfalls ·
JG2 type discipline (JET artifact) · JG3 architecture (Aqua + boss-file include order artifact) ·
JG4 reproducibility.

**Invariants (live):**
- **Co-fire ORDER with the discipline skills** (reciprocal rows landed both sides 2026-07-05):
  Julia feature/bugfix → `implementing-and-debugging` gates first, this skill for idiom; Julia
  behavior-preserving restructure → `refactoring-code` governs (two hats / oracle / deny-gate),
  this skill supplies the Julia oracle components (JET/Aqua) + JG3-safe transforms.
- PURPOSE cut vs `proving-theorems` (proof vs numerics); LANGUAGE cut vs `running-python-tools`
  (PythonCall/SymPyPythonCall from Julia stays HERE — a Julia dep-architecture decision).
- **Data axes stay separate** (since v2608.2.0): persistence (`JLD2` → HDF5/Arrow, escalate by who
  reads it back) vs interchange (`JSON.jl` v1 — never JSON3 `[dated:2026-08]`, one exception:
  `@generatetypes`). The interchange parse names its target type, so the boundary IS the §2.1.3
  function barrier. packages.md is the sole home; setup.md §7 routes to it and never copies.
- **Staleness registry**: fast-moving facts carry a grep-able `[dated:YYYY-MM]` tag IN PLACE
  (locality > physical isolation); the registry of what to re-verify lives in the SKILL.md header.
  Current tagged facts: 1.12.6 baseline · `--trim` experimental · JETLS-replaces-LS · no-native-
  traits/roadmap.

**Open defects:** none recorded.

**Retired decisions (do not resurrect):**
- Far-language no-fire rows (Rust/TS/C++/JS asks) as the F3 near-miss set — RETIRED 2026-07-05:
  they are far-misses that test nothing; a near-miss must share vocabulary with the fire set and
  differ only in owner. Do not re-add "not Julia — plain task" rows as evidence of trigger health.
- Physically isolating dated facts into a separate snapshot file — REJECTED 2026-07-05 (external
  reviewer proposed it): the fact is the decision input where it sits (e.g. trim status IS the
  §3.5.1 route-table row); isolation breaks Locality of Behaviour. The accepted mechanism is the
  in-place `[dated:]` tag + header registry (one grep audits all).

## 2026-07-05 reforge (v2607.2.0) — house-bar reforge from external review

**Trigger**: external independent review (user-run) of v2607.1.1. Adjudication (アウフヘーベン):

| Finding | Verdict | Outcome |
|---|---|---|
| P1 "routing/MUST-NOT-FIRE がない" | **Partially refuted**: cuts existed but ASYMMETRICALLY — `implementing-and-debugging` and `refactoring-code` routing tables already carried the language-skill co-fire rows (landed 2026-07-04/05), and trigger-set routed Lean/Python asks; missing was THIS side's reciprocal (an F2 defect, but "no cut exists" overstated) | Routing table + MUST-NOT-FIRE added to SKILL.md; co-fire ORDER made explicit (i&d/refactoring-code first, this inside); description gained the compact cut clause |
| P1 "F3 trigger set が甘い" | **Accepted in full**: fire set had ZERO architecture asks despite the description triggering on include-order/weakdeps/piracy/public-API; no-fire set was far-misses (Rust/TS) | trigger-set overhauled: +9 architecture FIRES, 8 true near-misses, +3 co-fire order checks |
| P1 "architecture が第一級 gate でない" | **Accepted**: §9 checklist ≠ gate; checklist-at-the-end has no runtime precedence | JG3 promoted to a named first-class gate — fires at one-file-outgrown/dep-added/API-defined, "not when someone asks about architecture"; artifacts = Aqua clean + boss-file include order |
| P2 "fast-moving facts 散在" | **アウフヘーベン**: concern accepted, proposed fix (physical isolation into a dated snapshot) rejected — it would break Locality of Behaviour (trim status IS the route-table input) | in-place `[dated:2026-07]` tags + SKILL.md header staleness registry; one `grep -rn '\[dated:'` audits every fast-moving claim |
| P2 "LAW/gates 形でない" | **Partially refuted**: §2.0 was already a deny-gate in substance (FORBIDDEN-by-default + MANDATORY exception comment = a grep-able artifact) with explicit precedence ("read §1/§2.0 first"); missing was the house FORM | THE LAW block + JG0–JG4 gate map added, naming existing sections as gates (no content rewrite) — form brought to bar, substance preserved |
| (self-reported, reviewer missed) no forge ledger | F3 was incomplete: trigger set existed, findings ledger did not | this file |

**Floor status at freeze**: `skill-check.ts` pass, strict-YAML parse OK, description ≤1500 chars
(recorded in forge-session shell log, 2026-07-05).

## 2026-08-03 resource seam (v2608.1.0)

Incident input: a Julia Krylov pilot was safe at the current rank but had no rank ceiling; retained
left/right bases grow linearly in host memory while reorthogonalization grows quadratically in work.
The host was already at the RAM/swap edge while a compatible GPU was idle. This skill now routes every
recordable/pilot/benchmark/parallel Julia run to sibling P7 before execution, removes agent/CI
`-t auto`, and binds OhMyThreads to the admitted aggregate affinity instead of agent-level fanout.

One-home decision: Julia syntax/threading stays here; envelope schema, GPU exception, reservations,
and stop thresholds stay only in `orchestrating-agents/references/measurement-and-resources.md` P7.
Trigger desk-check added the orchestrated rank-search co-fire row; existing Julia tokens still fire
this skill and explicit GPU tokens still co-fire `optimizing-julia-gpu-kernels`. Targeted skill floor:
no FAIL; the pre-existing description/prose/version/table warnings remain disclosed.

## 2026-08-03: PROSE-DEBT waiver — practicing-tiger-style reciprocal cut
Observed floor: description 1637 chars, 52 long prose sentences, 86-line version block, and 5 long table cells; exit 0.
This change is the reciprocal cut only; no unrelated prose rewrite was authorized.
Queue: next Julia reforge; retire this waiver when the description and recorded classes meet the floor.
**PARTIALLY RETIRED 2026-08-14 (v2608.2.0)**: the description class is retired (1498 ≤ 1500, WARN
gone). Prose 52 (unchanged) / version block 90 (was 86; +4 from the appended changelog entry) /
table cells 5 remain waived and re-queued to the next reforge.

## 2026-08-14 data-axis void (v2608.2.0)

**Trigger**: the user brought an external LLM thread that recommended JSON3.jl for new Julia code
and asked what this skill says about it. The answer was: nothing. A case-insensitive sweep for
`JSON` over the whole skill returned three incidental hits — `.ipynb` is JSON (setup.md §7-adjacent
note), TOML/JSON as a `Val` instability source (performance.md §2.1.4), and JLD2 as the DrWatson
result-serialization anchor (packages.md) — and zero package guidance.

**The void was an AXIS conflation, not a missing catalog row.** packages.md's Data section carried
only the persistence ladder (JLD2 → HDF5 → Arrow), whose escalation question is *who reads it back*.
Interchange is a different question with a different hazard: persistence round-trips Julia types,
interchange does not, so the target type is named at the boundary or every value arrives `Any`.
That hazard is already this skill's §2.1.3 function-barrier rule with no interchange-side statement.
Fixing it as a bare "use JSON.jl" bullet would have left the conflation in place.

**Source grades** (captured at build time from primary sources, 2026-08-14):

| Claim | Grade | Source |
|---|---|---|
| JSON3.jl deprecated → "migrate to JSON.jl v1" | author-confirmed (verbatim banner) | JSON3.jl README |
| v1.0.0 = 2025-10-03; 1.7.0 = 2026-08-06; 1.7.1 registered | author-confirmed | GitHub releases API + General registry |
| migration mapping; `allownan` now false-by-default; BigInt/BigFloat; `JSON.Object` key order; truly-lazy `JSON.lazy` | author-confirmed | `JSON.jl/docs/src/migrate.md`, fetched raw |
| struct generation has no v1 equivalent — keep JSON3 for that alone | author-confirmed | same migrate.md, "Features unique to each library" |
| the API name is `JSON3.@generatetypes` / `writetypes` | author-confirmed | JSON3 `docs/src/index.md`. The migration guide's `JSON3.generate_struct` example is INEXACT — do not copy it |
| "JSON.jl is ~10× slower on struct materialization" | third-party, UNRESOLVED | one 2026-05 Discourse thread; its own minimal repro was ≈1.3× (2.604ms vs 3.499ms); maintainer asked for an issue; no cause, no fix |
| parse-to-a-type-at-the-boundary as the rule | skill-supplied | §2.1.3 applied to the interchange axis; not a JSON.jl doc claim |

**Calibration inversion**: the JSON.jl docs correct a *human* still sitting on an old package. The
model's failure is inverse-shaped and worse — JSON3 was genuinely the right answer for years, so
habit and any pre-late-2025 model memory actively recommend the now-deprecated package. The
observed external thread did exactly that before self-correcting. Prominence therefore went to the
INVERSION statement ("this row exists because the default answer is inverted") rather than a
neutral catalog line, and the performance rumor carries an explicit UNVERIFIED guard so it cannot
be spent as a reason to adopt the deprecated dep.

**One-home decision**: the verdict, the traps table, and the migration URL live ONLY in
packages.md "Data — Interchange". setup.md §7 (output files by data shape) gains a ROUTING row, not
a copy. performance.md §2.1.3 is cross-referenced, never restated. SKILL.md carries one §9
checklist row, the reference-index row, and the `[dated:]` staleness-registry entry.

**Floor at freeze**: `skill-check.ts` exit 0; strict-YAML parse OK (PyYAML; keys name/description).
**Description WARN retired**: 1558 → 1498 chars *while adding* the `JSON/JSON3/TOML interchange`
trigger — trimmed the explanatory parentheticals in the co-fire clause, `Lean/`, the duplicate
`SymPyPythonCall` inside the PythonCall parenthetical, and `CuArray perf` → `CuArray`. Trigger set
desk-checked after the description edit (F3): +6 fire rows for the data axes, +4 near-miss no-fire
rows sharing JSON vocabulary but owned elsewhere (Python/TypeScript/API-design/jq).

**Deliberately NOT done**: relocating the 86-line changelog into this ledger, which would retire
the version-block WARN. It is a structural edit outside this change's scope; re-queued above.

## 2026-08-17 — Lux is the default NN library, and it never needed Reactant

**Trigger.** A user asked whether NN work in Julia should now recommend Lux, quoting an assertion
from another assistant. The assertion was treated as untrusted and tested against primary sources
rather than adopted. Two of its four claims did not survive.

**What was wrong in this skill.** One sentence, mirrored in three places, encoded a false binary:
"`Lux.jl` is the explicit-parameter NN library that pairs with [Reactant] (`Flux.jl` remains valid
for non-Reactant work)" — toolchain.md §2.9.3 (authority), packages.md NN header + entry, and the
heavy-deps checklist in SKILL.md, which grouped `Reactant`/`Lux` as one XLA unit. An executor
writing an ordinary CPU neural network read this and was routed to Flux.

**Primary sources, fetched directly (not via an agent relay).**
- `raw.githubusercontent.com/LuxDL/Lux.jl/main/Project.toml`, Lux **v1.31.4**: `Reactant`, `Enzyme`
  and `Zygote` appear under `[weakdeps]`; NONE is in `[deps]`. `ReactantExt` requires Reactant AND
  Enzyme. So installing Lux does not take on the XLA toolchain — the coupling the old text implied
  does not exist in the package.
- `lux.csail.mit.edu/stable/manual/autodiff`, support table: Reactant+Enzyme, ChainRules, Enzyme,
  Zygote, ForwardDiff are ALL **Tier I**; Mooncake **Tier III** (GPU ❌); ReverseDiff, Tracker,
  Diffractor **Tier IV**. CPU recommendation order, verbatim: (1) Reactant+Enzyme, (2) "Use
  `Zygote.jl` for the best performance without `Reactant.jl`", (3) "Use `Enzyme.jl`, if there are
  mutations in the code and/or `Zygote.jl` fails", (4) ReverseDiff.

**Claims REFUTED — recorded so they are not re-adopted.**
- "Lux's docs rank Reactant+Enzyme 1st and Zygote/standalone-Enzyme tied 2nd." False twice over:
  there is no first/second class (five backends share Tier I), and Zygote ranks ABOVE standalone
  Enzyme for CPU without Reactant, not level with it.
- "Flux is effectively legacy." Overstated. Flux ships near-weekly and grew its own
  Reactant/Enzyme compilation path in 2026. What IS sourced: DiffEqFlux.jl (SciML) documents a
  `Flux.destructure` bug silently downgrading `Float64` parameters to `Float32`, recommends Lux, and
  offers an OPT-IN `FromFluxAdaptor()` — not the "internal automatic conversion" the claim asserted.
- "Zygote is no longer modern." No source says this; Zygote v0.7.12 shipped 2026-07-22 with ordinary
  maintenance. The accurate statement is that it is Tier I and not the fastest.

**The rule this produced — the reason the edit is worth its lines.** Backend rank is not global.
autodiff.md §2.7.3 governs plain host-side functions and puts Enzyme ahead of Zygote. Lux's own
manual INVERTS that inside a Lux loop without Reactant, because standalone Enzyme may fail against
Lux when Reactant is absent. Both are correct in their own domain, so autodiff.md was left untouched
and the Lux-specific order lives with the Lux section (one home). An executor that learns only one
of the two orders will pick wrong in the other domain.

**Preserved deliberately.** The Reactant trace-time control-flow caveat in §2.9.3 survives verbatim:
a compiled function fixes the traced branch and ignores the condition on later calls. It was
re-checked against Reactant's own control-flow documentation and still holds. Deleting a correct
warning while modernizing around it is the failure mode this entry exists to prevent. The
Enzyme-over-Zygote row in §2.9.5 and autodiff.md §2.7.3's shape-based table also survive unchanged.

**Not done.** Mooncake gets one hedged line only (Tier III, GPU ❌, and a note that Lux's own row was
last touched 2025-12 so it must be re-verified, not cited). No transformer/layer inventory was added
even though `Lux.Embedding` and `Lux.MultiHeadAttention` were confirmed to exist — nothing in this
skill contradicted that, so adding it would be scope creep. No code was executed: every claim here
is documentation- or manifest-sourced, which is why each added clause carries `[dated:2026-08]`.

**PROSE-DEBT.** Floor before and after this change: unchanged classes (long prose sentences, version
header, long table cells) — the added text is body prose in an existing section, and the recorded
counts move with it. Re-measure at the next substantive reforge; this entry claims no improvement.
