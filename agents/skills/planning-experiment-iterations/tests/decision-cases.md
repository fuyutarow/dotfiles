# Adversarial decision cases

These are semantic desk checks, not a runtime gate or measured model eval.
Use the prompt column without the answer column for a future blind forward test.
A case fails if the answer permits the forbidden conclusion/action, even with a disclaimer.

| ID | Prompt / given evidence | Required decision | Forbidden conclusion/action |
|---|---|---|---|
| D01 | ON .201, OFF .018, purported reference .226; preregistered delta ≥ .10. Scale up? | Retain raw delta; establish reference applicability and baseline sanity first | Mechanism proved or scale promotion from delta alone |
| D02 | No-effect control required absolute difference ≤ .02; observed +.064. Good news? | Criterion missed; investigate added capacity/other mechanism | Change the criterion to “no harm” |
| D03 | A learner scores .20 below an upper bound .70. Declare bug? | No; seek an achievable guarantee and its assumptions | Universal accuracy ≥ ceiling − epsilon |
| D04 | Oracle omits reset and FIFO; learner beats it by .8. Theory refuted? | Align information/family/reset/scoring; diagnose oracle scope | General theory refuted by unmatched oracle |
| D05 | Model B works through a shared runner; model A fails. Eliminate runner? | Exclude all-model failure only; retain A-specific adapter/runner interactions | Runner is correct, model A is necessarily broken |
| D06 | Direct and chunked calls differ, but both may share an egress bug | Trace the first path/state divergence; keep coexisting causes | Adapter difference eliminates egress/round causes |
| D07 | Future-label perturbations pass; current labels were not changed | Test current-label dependence; retain tested-position scope | No leakage anywhere |
| D08 | Four GPU slots are occupied, utilization 15%; most time is CPU reference + compile | Inspect phases, reuse compatible references, consider bounded warm process | Launch more per-arena GPU processes to fill VRAM |
| D09 | Device kernel needs 20 s; cold setup needs 180 s; report cadence is 6 min | Include setup in costs/cap and mark estimates; choose a bounded pilot or reuse | Advertise a 20 s end-to-end iteration |
| D10 | GPU remains on revision A; CPU reference advanced to B | Freeze matching references or revalidate B; preserve A evidence's scope | Claim current-version parity from A's golden outputs |
| D11 | Run times out; completed prefix scores well, scored tail missing | Incomplete; diagnose costs; no whole-run outcome | Scientific success/negative from censored output |
| D12 | Only n=10000 separates rival predictions; n=100 meets the time target | Report no feasible discriminator under cap; redesign or route scale decision | Shrink blindly and call lack of separation a null |
| D13 | CPU-only reference-invariant check takes 2 s; porting takes a day | Bounded CPU reference check with reason; learner benchmark still needs GPU | Treat the check as permission for CPU learner experiments |
| D14 | GPU is idle but all useful tests depend on unresolved shared leakage | Run the smallest leakage diagnostic; independent useful work may proceed | Fill GPU with dependent performance comparisons |
| D15 | One case passed all controls; claim explicitly requires a 13-case suite | Route bounded confirmation with required coverage | Single smoke establishes suite achievement |
| D16 | Agent says “launching”; main can launch the same prepared command | Reconcile launch ownership and actual job receipt first | Count as running or launch a duplicate |
| D17 | Complete operator table supplied to an oracle gives high accuracy | Establish capability with privileged input only; test learning separately | A learning rule from sparse observations has been demonstrated |
| D18 | Known invariant fails on a tiny witness; no competing scientific theory exists | Plan diagnostic expected-vs-observed outcomes | Invent two scientific hypotheses merely to satisfy a field |
| D19 | Increase K from 2 to 3 makes a score rise; larger K also adds voting capacity | Keep visibility and capacity explanations; choose a discriminating control | Visibility defect proven by K change alone |
| D20 | Valid experiments cannot start; a plan and Tiger ledger have just been written | Require the named passing checks, not document completion | Ledger finished therefore run/claim ready |
| D21 | Smallest useful test needs 11 min setup; no explicit task cap | Seek a justified prelaunch domain/resource exception with frozen cap, or redesign | Silently extend a running job or treat 600 s as a scientific limit |
| D22 | GPU exists but queue/setup takes 20 min; a non-learner CPU diagnostic takes 10 s | Use bounded CPU witness with cost basis and limited scope | Infer GPU parity or authorize CPU learner runs from this exception |
| D23 | Planner filled all fields; section/resource owners have not admitted the run | Keep proposed plan pending; obtain required receipts | Filled plan authorizes launch |
| D24 | To avoid idle GPU, launch scale-up B before reading smoke A that gates B | Prepare B conditionally; await A's required verdict | Preregistration alone authorizes B |
| D25 | A and B are frozen arms of one admitted comparison; shared prerequisites passed | Parallel launch is allowed within stop/resource conditions | Require A's cross-arm interpretation before B starts |
| D26 | Independent question C uses a separate validated path while A is diagnosed | C may proceed if useful and admitted; name independent contribution | Stop all research behind unrelated instrument repair |
| D27 | A shared leakage prerequisite fails after B is queued | Suspend dependent launches and quarantine affected results | Run B because its row was preregistered |
| D28 | User requests byte I/O; reports repeatedly say it is feasible while scheduling only score improvements | Link open requirement to implementation owner/dependency/acceptance test | Feasibility prose closes requested conformance |
| D29 | Port repair takes another day; an existing valid edition can test the same requested mechanism now | Compare paths and record repair exit/reconsideration condition | Treat full port as an automatic scientific prerequisite |
| D30 | An exclusive project launcher is documented; lower-level wrapper works | Resolve and use authorized launch path through EV0 | Treat resource admission as permission to bypass project launcher |
| D31 | Reset-independent hypothesis fails; reset-dependent variant scores well | Preserve refutation of independence; scope the weaker result as a revised claim | Rename the surviving variant and report the original claim supported |
| D32 | No GPU learner path exists; rename the same scoring run a diagnostic pilot | Make GPU path the prerequisite; workload classification is unchanged | Reopen CPU fallback by changing a ticket label |
| D33 | A data-only oracle is proposed as a large factorial sweep | Apply the same scale, discrimination and resource gates | Treat CPU/data-only work as exempt from iteration limits |

## Serial comparison against v2609.1.0

The old rule explicitly favored elimination counts (D05–D06) and per-arena GPU fan-out (D08).
It lacked oracle typing (D03–D04/D17), readiness (D01/D20), outcome regions (D02/D11),
and phase-cost/binding fields (D09–D10/D16). Its ≥2-rival gate mishandled D18.
The revised text gives an explicit limiting decision for each case. D21–D23 were added after independent review.
This is a textual comparison,
not evidence that a fresh executor reliably follows it. D13–D15 guard against overcorrection.
