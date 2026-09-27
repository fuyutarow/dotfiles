# Registered benchmarks — EV0/EV1 sole home

This reference joins a benchmark's effective contract to the code and data
that produced a score. A registry, leaderboard, or written
question is not enough if the runner can bypass it.

## EV0 before launch: resolve, do not transcribe

| Condition | Action | Target check |
|---|---|---|
| Benchmark ID is registered | Call the registry's supported constructor or launcher. Resolve the effective stream, preprocessing, metric, scoring window, and permitted overrides from that ID. | One accepted invocation and one rejected forbidden override through the **actual launch path**. |
| Registry describes a contract but cannot construct a stream or launch this runner | Classify `INSTRUMENT_REPAIR`. Build the missing adapter before an official score. | A target call produces the registered stream; the ad hoc path cannot claim the registry ID. |
| Runner takes a copied parameter string or calls the underlying dataset directly | Keep its result as ad hoc/raw. It cannot inherit a registered benchmark ID from prose. | Recorded call stack or launcher receipt shows whether the registry path ran. |
| No registry is intended | Freeze one immutable local experiment specification and label the run `AD_HOC`. | Specification digest and exact invocation; no official leaderboard claim. |

If project policy names one launch entrypoint, use it even when lower-level tools appear equivalent.
Constructing the registered stream proves its identity; it does not prove launch authorization.
Combining a resource wrapper and record writer cannot substitute for the launcher's provenance checks.
Inspect that entrypoint's requirements for code, parameters, manifests, and hypothesis/cause bindings.
If it cannot launch the needed case, route instrument repair to its owner. Use a diagnostic path only
when project policy permits it; keep its scope explicit and do not bypass a denial.

Before relying on a repaired launcher, execute a small known fixture through its real path.
Check terminal status, effective binding, and read-back of the intended record identity.
Include rejected invalid input and failed execution: retain the failure record without success promotion.
Control-injection repairs also need the consumer observation specified by EV2 in `controls-and-information-flow.md`.
A novel scientific pilot is not independent proof that its new launcher is correct.
Keep infrastructure readiness and scientific-hypothesis evidence distinct.

The effective contract is the exact declaration the runtime consumed. If the
registry itself is executable configuration, route its authority to
`governing-configuration-systems`. Route its integrity design there too.
This skill consumes that
contract digest and verifies the target invocation used it. The target code owner
implements the adapter or rejection test.

The target check should reject a forbidden change to a load-bearing axis.
Parsing a configuration object is insufficient. If only seed and length may vary,
a different feature width, encoding, or split must fail before the run.
A valid but ad hoc run may inform design; it cannot fill the registered
benchmark row.

## EV1 after launch: attest the executed object

Record the following from the process that executed, not from the order form:

| Field | Required observation |
|---|---|
| Benchmark binding | ID, resolved contract digest, launch receipt, effective parameter digest |
| Implementation | intended revision/content digest and **observed loaded-code content digest** |
| Inputs | dataset/stream digest, split, encoding, preprocessing, seed |
| Scoring | realized generated length, chosen `n`, index base, final scored position, scored count |
| Runtime | exact command/call, environment, start/end, resource receipt where required |

Resolve any human-readable candidate/revision label against the observed implementation and parameter digests.
Missing identity stays unknown; never fill it from a similar score or nearby commit date.
A `promoted` flag is a claim to reconcile against EV0–EV4, not evidence that they passed.

Before promoting an exploratory number, keep its invocation, input, and effective
parameters in polysearch's run record. Keep the environment and raw output there too.
Recompute its digest independently. Retain two different self-checks for a numerical
executor. Add an independent oracle or recomputation that could reject a false claim.
A reproduction cites the canonical run and matches its discrete output exactly
or a predeclared numeric tolerance. An unreproduced or environment-blocked value
remains a scoped observation; it cannot become an unqualified achievement.

`git HEAD` names a commit; it does not prove the process loaded that code. A worktree
created before a commit, dirty imported file, precompiled image, or stale worker may run
different bytes. Record the loaded implementation's digest or immutable snapshot.
Compare it with the intended executable specification. If that proof is
unavailable, `EV1=UNKNOWN`. A mismatch is `EV1=FAIL` for a claim about the intended
revision. Preserve the raw result under its actual code identity.

The executed identity covers material imported modules, registry/config and shared primitives, not just the entry file.
If an unhashed dependency can change behavior, an unchanged top-file digest cannot certify the old revision.
Repair that binding through its owner before relying on queued official results; do not defer it until the queue ends.
Use the launcher's supported immutable snapshot and attest what the process loaded, including warm-worker state.
Isolation and write ownership belong to orchestration/Git; EV1 owns the evidence scope, not a project memory exception.

For a GPU claim, distinguish requested device, resident state, executed hot-path operations and host transfers.
A CuArray input alone proves neither GPU execution nor device-resident learning.
A sampled zero VRAM peak alone also proves neither CPU execution nor zero allocation; inspect process-linked evidence.
Accuracy and device/performance claims receive separate dispositions; preserve whichever claim is actually supported.

A clean worktree or commit SHA does not freeze external datasets, dependency environments, caches, or loaded workers.
Bind the material runtime dependencies and input content to this run; inspect their resolved locations.
Ensure required artifacts remain available for the run's lifetime through the resource/storage owner.
If an input disappears or changes, retain the failed/incomplete receipt; do not promote a partial score as success.
Do not assign deletion to a cleanup tool or another actor without an observed causal record.

For generated streams, obtain length and scoring positions from the generated
artifact. Assert the chosen evaluation window contains the last expected scored
event. When a hand-derived `n` disagrees, preserve the old declaration. Link the
correction and rerun; suspend comparisons to the truncated run.
For a tiny sample, report scored count and the minimum useful denominator
before interpreting a passed prediction.

Record these checks in the canonical polysearch run/finding. Its schema and target
launcher, not a skill-local file, must reject missing binding or a forbidden override.
If that gate is absent, mark the official claim `INSTRUMENT_REPAIR` and send the
implementation request to polysearch. Do not invent a second validator here.
