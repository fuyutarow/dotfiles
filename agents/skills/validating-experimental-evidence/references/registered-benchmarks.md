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
