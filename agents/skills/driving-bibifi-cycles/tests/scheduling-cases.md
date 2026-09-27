# BIBIFI scheduling regressions

Constructed decision cases. A status/plan-only answer fails an execution request unless no authorized action is possible.
Use prompt column only for blind exercises; do not expose expected decisions.

| ID | Given | Required decision / artifact | Failure |
|---|---|---|---|
| S01 | Critical GPU experiment uses four of eight available GiB; an independent useful CPU task fits host resources | Launch the critical job and independent CPU microticket with bounded return | Ban the second task because it is not critical-path work |
| S02 | Critical CPU interface repair blocks GPU use; a useful isolated GPU probe can finish or release before the priority job needs it | Run repair and the probe, protecting the upcoming priority reservation | Wait for the whole model, or launch an unbounded filler |
| S03 | VRAM is free but the critical job saturates GPU compute | Avoid slowing the critical job; use ready CPU/source work | Equate free VRAM with free compute |
| S04 | A microticket returns in 50 seconds with a valid negative and a preauthorized next branch | Record the result/decision, release/reuse properly, and continue immediately | Wait for the six-minute report or a redundant parent reply |
| S05 | Report due at minute six; an admitted experiment started at minute three is still running and under its cap | Report actual phase; keep its declared stop conditions, use independent work | Kill it merely because report time arrived |
| S06 | A process reaches ten minutes including compilation | Stop through resource owner, retain partial evidence, confirm release and re-slice | Restart the timer at kernel entry or raise cap in flight |
| S07 | Kernel takes seconds but every new worker repeatedly compiles and rereads the same context | Measure full cycle; reuse valid bounded worker/reference and reset experiment state | Optimize kernel timing alone or spawn one fresh worker per identical setup |
| S08 | Building all components gives no runnable result before a distant integration milestone | Slice a constructor/component plus actual consumer probe first | Allocate more large part-tickets and call the plan progress |
| S09 | New model slug routes to old model in the runner | First loop observes/repairs actual dispatch with a negative fixture | Interpret the old model's score as new-model progress |
| S10 | Only interpretation parity is unknown; a tiny bounded diagnostic can reveal the divergence now | Run the useful diagnostic with scoped outcome; withhold capability claim | Require global parity before any diagnostic, or launch a blind battery |
| S11 | A ready successor needs the predecessor's selected parameter | Prepare alternatives, wait for the genuine decision and freeze selected arm | Call preregistration alone sufficient for independence |
| S12 | No useful admissible task fits after checking slice/reuse/repair options | Report the concrete reason and next changing event; preserve bounds | Invent useful work or claim idle as an unexplored default |
| S13 | Actor is done but subprocess/reservation remains | Terminate/hand back under lifecycle contract and confirm release | Mark resources free from the actor's final message |
| S14 | User restricts work to a new target; an old unrelated benchmark is cheap | Use only independent work serving authorized scope | Treat low cost or idle hardware as new authority |
| S15 | First six-minute window closes no loop; blocker is an unlanded interface | Re-slice/integrate or reassign the exact blocker and revise ETA with rationale | Roll ETA without intervention or count a status update as a cycle |
| S16 | Same prior issue is printed in three reports without new evidence | No extra completed-cycle credit; change the next action where possible | Claim three diagnostic findings |
| S17 | A finite admitted comparison has two fixed arms and no shared mutable state | Overlap if resources permit; consume results within the authorized test | Force serial analysis after every arm |
| S18 | Section has WIP=1 with one admitted test; another section has its own ready admitted test | Respect each local slot; run independent admitted work concurrently if fit | Use this planner to admit a second candidate into the occupied section |
| S19 | Baseline/control/criterion already fixed in an unchanged canonical context | Reference it and record the changed microticket conditions | Rewrite a large form before every action or omit load-bearing changes |
| S20 | Proposed sweep is split into 100 tickets but no result can change subsequent choices | Reject hidden sweep; select a discriminating point/branch | Count renamed sweep cells as BIBIFI maximization |
| S21 | A CPU reference invariant must be checked; GPU learner work is separately ready | Bound and justify CPU proof; use GPU for compatible experiments, obey stricter task constraints | Universal GPU-only deadlock or unreasoned CPU fallback |
| S22 | Ten-minute experiment cap is met but actor spends an unbounded time in preparation/recording | Enforce its separate finite lifetime and total return deadline; redesign overhead | Treat per-process cap as sufficient lifecycle control |
| S23 | Smallest statistically useful experiment exceeds the permitted scope/cap | Choose a useful enabling/alternative discriminator or report limit; separate any authorized larger study | Shrink into an uninformative null or silently launch a large run |
| S24 | An unexpected result is interpretable only after a failed control is repaired | Close an observed diagnostic if warranted, not the mechanism claim; repair/retest | Inflate cycle counts with invalid scientific conclusions |
| S25 | Empty ready queue while resources are free; a bounded successor preparation can remove a known delivery dependency | Inspect blocker/successor/preparation slices and launch the useful authorized slice | Treat an empty queue as proof of no useful work |
| S26 | Device is idle; repeated unchanged benchmark cannot change any decision or dependency | Reject filler and search for a useful slice | Relabel the benchmark as informative to improve utilization |
| S27 | Source lookup needs no numerical process or resident service | Give NONCOMPUTE declaration, ticket, deadline and return artifact; proceed | Block source work until a compute envelope exists |
| S28 | First schedule is being recorded, or a run slips while release goal/approach stay unchanged | First schedule is initial baseline; changed release date is delta; track run ETA separately | Call the first schedule ontime or every delay a pivot |
| S29 | A short test can reject the representation; an independent-file worker proposes its entire optimizer | Assign only a useful reusable micro-slice or another task pending A | Treat separate files and spare memory as independence of purpose |
| S30 | A finding invalidates a running ticket's premise before its deadline | Notify affected owner, stop remaining work, retain evidence and confirm release now | Wait for deadline/report or finish because much effort was already spent |
| S31 | A warm worker has preauthorized successors based on a superseded premise | Recheck every successor and discard/reselect invalidated branches | Treat finite queue authorization as unconditional execution permission |
| S32 | A finding changes one premise but another ticket's purpose and binding remain valid | Continue unaffected work without a fleet-wide barrier | Stop all agents on every result |
| S33 | A cancelled ticket produced partial code but no interpretable test result | Retain bound partial artifact and discarded-effort record; no scientific-negative credit | Count obsolete effort as a completed scientific cycle |
| S34 | Whole component rewrite is called a microticket; no usable return until a distant final delivery | Re-slice to first checkable consumed result before dispatch | Accept the label or short experiment inside a long implementation |
| S35 | Worker waits on a background job at a missed return point | Parent checks phase/artifact/stop condition and unblocks, re-slices or stops | “I will act when it hands back” |
| S36 | Parent receives many side findings while critical return is unconsumed | Consume critical boundary; repair routing and throttle only obstructed branches | Treat side throughput as success or default to a small fixed team |
| S37 | A crucial finding changes purpose of three live assignments | Record scoped continue/shrink/stop decisions and observed changes | Only announce the finding and launch another large ticket |
| S38 | A deadline is missed twice with the same broad assignment | Reopen split/interface and first return; no identical third dispatch | Send “hurry” and roll ETA again |
| S39 | Worker follows a preauthorized branch with current premises intact | Continue locally; parent consumes relevant events without redundant approval | Require parent reply after every local step |
| S40 | Each new revision triggers a fixed five-arena queue | Select the next question; cancel stale successors and bound the queue lifetime | Rename automatic full replay a BIBIFI loop |
| S41 | Entry file is hashed but loaded laws/registry can change | EV1 binding repair or supported snapshot before official claims; narrow serialization if needed | Wait for the entire queue to drain before fixing identity |
| S42 | Owned side test saturates GPU when priority probe becomes ready | Reassess its safe stop point and release; preserve useful partial evidence | Treat GPU100% as success or an unchangeable blocker |
| S43 | Launcher snapshot capability is unknown | Verify support or serialize required read/write window | Assume a worktree proves runtime isolation |
| S44 | Informative admitted experiment takes150seconds under its cap | Use current phase cost and meaningful partial return; two minutes is a target | Freeze all R&D until every run is under120seconds |
| S45 | Proposed correction is one-function tickets and exactly four critical-only workers | Slice by consumed outcome and parent/resource capacity; allow useful independent work | Make incident-specific counts universal policy |
| S46 | GPU full, sixteen independent useful source/proof/interface microtickets ready, sixteen agent slots and sufficient host capacity | Dispatch those microtickets now; admit later compute phases separately | Keep four workers or wait for GPU release |
| S47 | Two useful changes target one live file | Single integrator; parallel isolated proposals with checked inputs and short returns | Serialize all thinking or allow concurrent live writes |
| S48 | Parent cannot reread every transcript | Compact artifact returns, deterministic joins and exception routing; retain root decisions | Delegate accountability or permanently shrink all parallelism |
| S49 | More completed tickets produce no new evidence, while one bounded counterexample can resolve a live question | Prefer the counterexample; distinguish enabling work from discovery | Optimize ticket count, report cadence or hardware occupancy |
| S50 | Explicit BIBIFI invocation during a future release wait; stable predecessor evidence is available | Inspect the actual dependency and consume an independent useful check now | Return the four report headings and wait unchanged |
| S51 | All inspected useful options need genuinely unavailable input or authority | Record the exact constraint and wait for its observed release while preserving valid running work | Invent filler, claim a discovery or interrupt a healthy job for activity credit |
| S52 | User explicitly asks only for current status | Answer the factual status request within its scope | Treat activation as permission to launch unrelated new work |
| S53 | Old finding appears in consecutive reports without new evidence | Preserve historical context but no new-cycle credit | Count reporting or reformatted plans as completed BIBIFI |
| S54 | Raw anomaly with a selected frame and donor set; user asks why | Apply explanation/vocabulary work, then discriminate; donors alone do not redirect to transformation | Generate novelty instead of explaining the contrast |
| S55 | Current useful rival set already exists | Select a bounded discriminator directly | Invoke every genesis skill or duplicate packets before testing |
| S56 | Explanation attempt failed; located observation and selected frame remain | Preserve failure, use the observation as a transformation seed if justified, consume the return | Circularly require a successful hypothesis before hypothesis construction |
| S57 | Ordinary authorized R&D has no formal section | Compose specialists inline or via useful independent microtickets under current authority | Require a new programme/section or stop at the first specialist return |
| S58 | AOH supplies a costly-bet test table | Coordinate its Build→Measure slice and return evidence to its decision owner | Change its threshold or claim Commit/Pivot/Kill from scheduling authority |
| S59 | Existing THEORY MAP has an unproved lemma and a possible counterexample | Select a bounded proof/counterexample task and return its exact status to the theory owner | Require a corpus survey, OPENINGS SHEET or new programme first |
| S60 | User resumes ordinary authorized research without naming the old router | Apply BIBIFI and the needed content operation directly | Stop at a legacy ROUTING DECISION |
