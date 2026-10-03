# optimizing-julia-gpu-kernels — forge verification ledger (F3 artifact)

Forge: 2026-07-22, v2607.1.0 (initial). Editor: Opus 4.8 (solo design/fixes); fleets on Sonnet.

## Provenance chain

1. **Harvest**: 10-surface parallel fan-out (kernel-legality, launch-config, memory-hierarchy,
   warp-level, host-array-semantics, profiling-measurement, kernelabstractions,
   vendor-libs-vs-handwritten, numerics-precision, debugging-correctness) → per-surface
   operationality filter (F1): 102 rules survived.
2. **API ground truth**: dedicated agent source-diffed CUDA.jl v5.11.3→v6.2.1 (git tags +
   installed source) — corrected the harvest brief's stale "v5.x" premise; produced
   api-changes.md's verified signature table.
3. **AD study**: dedicated agent ran all example code LIVE on this machine's RTX 3060
   (CUDA.jl 6.2.1 / Zygote 0.7.11 / Julia 1.12.6); gradients checked against an independent
   ForwardDiff CPU oracle (0.0 err elementwise, ~1e-6 SSM). Script preserved in this repo:
   `tests/verify-ad-kernels.jl` (all parts passing at forge time).
4. **Drafting**: 8 reference files, one drafter each, disjoint file ownership, editor-signed
   specs; every line then read and signed by the editor.
5. **Verification fleet**: 11 auditors — 8 per-file fact-checks (draft vs pre-verified source,
   installed `~/.julia/packages` as overriding ground truth), 1 cross-consistency/one-home,
   1 trigger desk-check (vs writing-julia + adjacent skills), 1 LIVE GPU smoke test (launch
   idiom, error-class provocation, API existence, cumsum/accumulate gradient claims).

## Findings & verdicts (all resolved — no pending)

| # | Auditor | Severity | Finding | Verdict / fix |
|---|---|---|---|---|
| 1 | editor read | fabrication | debugging.md §10 claimed KA `CPU()` = `POCLBackend` (OpenCL) | REFUTED against installed 0.9.42 (`struct CPU <: Backend`, zero POCL hits) — rewritten with source-verified fact |
| 2 | factcheck:memory-and-warps | distortion | §5 showed bare `Const(in)` as working code; `Const` is `@public`, not exported — bare use throws `UndefVarError` (auditor verified live) | fixed → `CUDA.Const(in)` + visibility note mirroring §7's atomics rule |
| 3 | factcheck:memory-and-warps | minor | §6 `reduce_warp` labeled "verbatim" but dropped `assume(warpsize() == 32)` and substituted `CUDA.FULL_MASK` for `0xffffffff` | fixed → restored actual source form, cited `mapreduce.jl:7-16` |
| 4 | factcheck:portable-kernels | fabrication | "`KernelAbstractions.GPU` will be removed in 1.0" — installed docstring says the OPPOSITE (new backends must subtype it); repo-wide grep shows ONE deprecation total | fixed → §7 rewritten: only `@synchronize(cond)` is deprecated; `cpu=` is "experimental"; `GPU` is load-bearing |
| 5 | factcheck:portable-kernels | fabrication | `@uniform`/`@private` "deprecated for 1.0" docstring tags — no such language in installed source | fixed → tags removed, replaced with "no deprecation note in installed 0.9.42" |
| 6 | factcheck:portable-kernels | minor | §1 table's five internal §-references each off by one | fixed → renumbered (§8→§7 ×2, §6→§5 ×2, §4→§3) |
| 7 | factcheck:portable-kernels | unsupported | "macro-free" descriptor on KernelIntrinsics invented | fixed → §8 reduced to a pointer at api-changes.md §6 (also resolves cross-check contradiction #12) |
| 8 | factcheck:differentiating | unsupported | "installed Enzyme FAQ" provenance — Enzyme.jl is NOT installed (only EnzymeCore) | fixed → attributed to Enzyme's public FAQ (fetched), non-installation noted |
| 9 | factcheck:differentiating | unsupported | "(usually zero)" gradient-failure value unsourced | fixed → removed |
| 10 | factcheck:differentiating | distortion | Zygote docs framed as endorsing the independent-AD test methodology; they only recommend another AD as a mutation workaround | fixed → attribution split: workaround = Zygote docs, test-oracle discipline = this skill |
| 11 | factcheck:api-changes | distortion | `lib/cudnn` claimed to have a `[sources]` entry — installed Project.toml has 7 entries, cudnn only under `[workspace] projects` | fixed → exact 7-entry statement, consistent with §5 |
| 12 | cross-consistency | distortion | KernelIntrinsics provenance told two incompatible stories (api-changes: real PR #635 on main; portable-kernels: unverifiable arXiv attribution) | fixed → api-changes.md §6 sole home (PR #635 account, verified via git by the API agent); portable-kernels pointers |
| 13 | cross-consistency | minor ×3 | one-home duplications: atomic nondeterminism (host-perf §12.7 vs mem&warps §7), allowscalar discipline (host-perf §1 vs debugging §5), bottom-up error reading (writing-kernels §1.2 vs debugging §1) | fixed → single owner each (mem&warps §7 / host-perf §1 / debugging §1), others shrunk to pointers |
| 14 | cross-consistency | minor | api-changes index row omitted vendor naming; KernelIntrinsics home ambiguous in index | fixed → SKILL.md index row updated, sole-home noted |
| 15 | trigger desk-check | unsupported ×2 | two FIRES rows (`accumulate` gradient error; Zygote mutation error) carry no GPU token — writing-julia's AD keywords legitimately win first | fixed → both moved to co-fire-with-ORDER rows with explicit precedence |
| 16 | trigger desk-check | minor | "Mamba"/"selective scan" not literal in description though a FIRES row uses them | fixed → tokens added to description (length re-checked ≤1500) |
| 17 | trigger desk-check | distortion | desk-check log claimed to have checked writing-julia's *description* for tokens that only exist in its body | fixed → log corrected to name the actual artifacts; Reactant no-fire row added |
| 18 | trigger desk-check | minor | AMDGPU no-fire row's rationale read like fire-behavior instructions | fixed → clean no-fire wording, scope line cited |
| 19 | live GPU smoke | minor ×2 | two quoted error strings lacked the backtick-quoting the real runtime emits (KernelError type name; UndefVarError module suffix on Julia ≥1.11) | fixed → literal strings corrected with grep guidance |
| 20 | live GPU smoke | — | launch idiom, bounds-guard kernel, `CUDA.maxthreads`/`registers`, `pool_status` vs `memory_status`, cumsum-grad-works, accumulate-grad-throws: ALL verified live, no divergence | no action — positive confirmation |

Clean files (zero findings): writing-kernels.md (pre-fix), host-performance.md (pre-fix),
measuring.md, debugging.md (post-editor-fix #1).

## Mechanical floor

- `skill-check.ts`: PASS (0 FAIL, 0 WARN) — name regex/length/reserved-words, description
  present + ≤1500 folded, no dangling reference files, body <500 lines.
- Strict YAML parse of frontmatter: PASS.
- Trigger set: 14 FIRES + 5 co-fire + 9 no-fire rows, desk-checked (see log in trigger-set.md).

## Known deferrals (not defects)

- AMDGPU/Metal/oneAPI: out of scope (NVIDIA-first); the KA layer is the portability story.
- Multi-GPU / distributed: deferred until real demand.
- `#1482` struct-op scan regression on v6.2.1, KernelForge.jl claims, `test_rrule` tolerance
  defaults, DI+AutoEnzyme-on-GPU robustness: carried as explicit UNVERIFIED in
  differentiating-kernels.md §9 — do not promote without re-verification.

## Reforge v2607.2.0 (2026-07-23) — firedancer fd_evaluate graph-cache postmortem

**敗因 (source failure, 検収4)**: `fd_evaluate`'s GPU path cached a captured CUDA graph +
scratch buffers keyed on the evaluation input `Xte`'s identity ALONE. A captured graph binds
to the device addresses of every array its closure touched at capture time, but the caller
passed a fresh per-cell state (`st.h` etc.) each cell; the cache key never saw that array, so
from the 2nd cell onward the graph silently replayed the 1st cell's weights — 5 of 6 cells'
primary metric locked to cell 1's value. The smoke test stayed green: it read "primary metric
differs from `min(best,final)`" as evidence of a fix, but that observation is compatible with
a broken cache too. A third-party audit (検収4) that diffed saved artifacts numerically found
it, not the passing test.

**Distilled into this skill** (this session, editor solo — no fleet; scope: 3 rules on top of
an existing forged skill, below the fleet threshold in `forging-skills` references/verifying.md §7):

1. **CAPTURE-PINS-ADDRESSES** (SKILL.md §1, law-level) — cache captured graphs on the
   `objectid` fingerprint of EVERY closed-over device array, never the primary input alone;
   symptom signature named (same output, different inputs, no error).
2. **Cached-path acceptance pattern** (`debugging.md` §11, new) — a difference-only
   observation between two cached-path outputs is not a correctness check; state-separation
   test (2 states, same path, each independently reference-matched) + a permanent in-body
   consistency assert (not test-only) are both required for cache/capture paths.
3. **Pre-merge GPU-parity checklist line** (SKILL.md §9) — a GPU-path change merges only
   after an actual GPU run, CPU-only green does not clear the box.

**Grafted, not duplicated**: all three land on already-existing lines/sections — the CUDA
Graphs paragraph SKILL.md §1 already added in v2607.1.1 (extends its "graphs require stable
shapes/addresses" sentence rather than re-explaining graph capture), the GK3 oracle gate
(table row + §9 checklist item already existed), and debugging.md §8's oracle discipline (new
§11 built as a specialization of it, pointing back rather than restating the whole-array
compare rule).

**Not verified by a fleet this round**: this reforge is 3 rules on an already-audited skill
(F3 fleet-scale calibration in `forging-skills` references/verifying.md §7 reserves fleets for forges/
reforge-of-N; a small procedural addition runs editor-solo). No live GPU re-run was performed
against this session's `objectid`-fingerprint wording — it is stated as a rule, not
demonstrated against a running `fd_evaluate`-shaped repro in this repo. Flagged here as the
honest gap rather than claimed as re-verified.

## 2026-07-30 — hypothesis-action seam

Cheap benchmarks now stay with GK2/domain execution; only costly downstream exposure can invoke
`acting-on-hypotheses`. The description was distilled below the Codex limit.

**PROSE-DEBT waiver (2026-07-30).** `skill-check.ts` exits 0 with 24 long prose sentences, a 36-line
version block, and three long table cells. Queue position: before the next feature reforge; move
version history here first, then split prose without weakening GPU safety gates.

## 2026-08-03 pre-warmup resource seam (v2608.1.0)

The host incident showed the inverse of the usual kernel-only optimization problem: main RAM/swap
was exhausted while a compatible GPU was idle, and the dominant reorthogonalization was a bandwidth
bound long-vector operation. P7 admission now precedes allocation, warmup, profiling, and GK2. This
skill still decides vendor primitive/fusion/hand-kernel choices only after admission.

Host-performance §9 now bounds task-per-stream concurrency by the one admitted GPU reservation and
the aggregate live host/VRAM buffers; task-per-cell plus agent-level GPU fanout is forbidden. Trigger
desk-check added the CPU-RAM/GPU-idle Krylov row; existing `CuArray`/GPU tokens fire this skill and P7
co-fires without taking kernel-craft ownership. No live GPU kernel was run for this documentation-only
seam; resource admission and hook tests were machine-run separately (`80 pass / 0 fail`).

## Reforge v2609.1.0 — reduced-precision representation-to-execution contract

### Function and existence gate

```text
Julia GPU workload + target + reduced-precision intent
  -- specify and verify --> PRECISION CONTRACT
  -- optimizing-julia-gpu-kernels GK4 --> implementation/measurement-ready device path
```

`writing-julia` retains host-only scalar/type/package work. Generic terminology remains a plain
answer. A new format- or package-named skill was rejected: Microfloats and cuTile are component roles
inside GK4, not distinct artifacts. The collection measured 64 skills / 60,228 listing characters at
baseline; no new member and no budget raise were admitted.

### Source grades

| Rule family | Grade | Locus and handling |
|---|---|---|
| OCP MX payload/scale/block and layout boundary | author-confirmed | stable SoK `urn:uuid:01a0946e-e4ee-71da-a275-8438973dfb4b#RPF-S01`–`S04` |
| NVFP4 representation and NVIDIA target support | author-confirmed, dated | same SoK `#RPF-S05`, `#RPF-S06`, `#RPF-S08` |
| AMD CDNA4 OCP MX support | author-confirmed, dated | same SoK `#RPF-S07` |
| Microfloats/cuTile software state | author-confirmed, dated | canonical HAC claims plus same SoK `#RPF-S09`, `#RPF-Y03`, `#RPF-Y04` |
| conditional format-policy evidence | primary-study, scope-limited | same SoK `#RPF-S10`–`S13`, synthesis `#RPF-Y05` |
| `PRECISION CONTRACT` and validation ladder | skill-supplied | operationalization of SoK `#RPF-Y06`; never attribute the table to OCP or a vendor |
| terminology table | constructed | disambiguation for executor decisions, not a standards claim |

The SoK is a bounded critical review, not a systematic literature review. Its source, method,
doctrine, and technical refutation passes are recorded in local commit `2aa3c4d`.

### Calibration

The source and model fail in the same direction: element names become packed-storage claims, public
frontends become target support, and structural precision becomes universal accuracy. GK4 therefore
puts the contract and deny-gates before package examples. Package-name-only asks remain outside the
device trigger.

### Corrected RTX 3060 / cuTile claim

The inherited claim “cuTile supports CC 8.0+, so its FP4 reinterpret and widening path is supported
on sm_86” was refuted. Package admission, frontend emission, target lowering, and native MMA are
different gates. Current evidence supports opaque `UInt8` storage on CC 8.6 and no native FP4 Tensor
Core input. Tile IR may diagnose or emulate the typed source; no sm_86 compile/run receipt was taken.
The durable rule is the four-state table in `references/reduced-precision-formats.md`, sourced from
SoK `#RPF-S08`, `#RPF-S09`, and `#RPF-Y03`.

### Header-history relocation

- v2607.1.1 added the latency-bound `CuRef`/CUDA Graph distinction after a measured small-GEMM
  regression.
- v2607.2.0 added CAPTURE-PINS-ADDRESSES and the cached-path state-separation oracle.
- v2608.1.0 moved P7 admission before warmup/allocation and bounded streams.
- v2609.1.0 moved this history out of the invocation header and added the GK4 contract.

### Verification record

Status: PASS. Preflight: quick validator PASS; reference-existence check PASS;
`git diff --check` PASS; collection floor exits 0 at 64 skills / 60,221 listing characters, below
the unchanged 60,228 ratchet. The target floor has no structural failure or SKILL.md prose warning.

| Lens | First finding | Resolution | Final |
|---|---|---|---|
| source fidelity | Hopper row blurred bytecode availability with target support; 3060 correction lacked a receipt | cited Tile IR's not-native plus diagnose/emulate contract; added the four-state correction record | PASS |
| architecture / sibling cuts | compression dropped writing-julia JG0 forwarding; hash manifest mixed metadata with digest rows | restored JG0 and JG2→GK1; made baseline metadata a manifest comment | PASS |
| trigger / bloat | five near misses had only body cuts; two positives lacked Julia scope; Japanese doublets were missing | added stage-1 device predicate, negative routes, scoped positive rows, and Japanese surfaces | PASS |
| comparative old vs new | no material regression found | three reduced-precision asks improved; ordinary kernel legality preserved; terminology now no-fires | PASS |

No GPU run was performed. This reforge changes operating guidance, not a kernel or a performance
result. Future runtime claims remain gated by P7, GK2, and the contract's target/system rungs.

**PROSE-DEBT waiver (2026-09-12).** The 2026-07-30 waiver promised cleanup before the next feature
reforge; that queue was missed. This edit pays down SKILL.md debt from 25 to 0 long sentences,
41 to 0 version-header lines beyond the limit, and 3 to 0 oversized cells. The new reference adds
0 long prose sentences. Untouched legacy references still contain 208 long sentences; queue them
for a dedicated prose reforge before another feature addition. This waiver does not excuse new debt.

## Reforge v2609.2.0 (2026-09-24) — firedancer FireOps work-budget incident

**Incident.** A superposed-rounds learner's GPU path passed every correctness gate (prediction
equality, CPU/GPU bit identity, value bound, causality) while running about four orders of
magnitude below its derived device bound. Paper count: ≈4e4 integer ops and 6–8 KB per token on an
RTX 3060 (360 GB/s) → ceiling ≈4.5e7 tokens/s; measured 6.8e3 (T-GPU3, finding2609_2420xz798).
Three consecutive tickets optimized symptoms. One of them fused launches 130× with no speedup,
because the cause had been named by analogy to an old launch-overhead record.

**Root causes → rules.**

| Cause | Rule |
|---|---|
| No ops/bytes budget before code or dispatch; targets anchored to the slow predecessor (10× CPU, then ≥1e4 tokens/s) | GKB §0 block and its "if… then" table |
| GK0's broadcast preference produced an O(L²) pairwise mask with Int64 `[L,L,B,I]` intermediates where an O(L) last-occurrence scan answers the question (`FireOps.causal_latest`, firedancer `packages/FireOps.jl/src/FireOps.jl:704-764`) | COMPLEXITY-PRESERVING predicate in §1 |
| The conceptual unit (1,312 instances) was the computation unit; the match depends on ~72 distinct (Q, K, δ, ε) tuples | GKB "dependency factoring" row |
| Named broadcast temporaries, Int64 small indices, `similar` inside the chunk loop | existing `host-performance.md` §2, plus rows in the §1 predicate table |
| "launch-overhead-bound" asserted without counting launches | `measuring.md` §11 |
| No cost assertion in tests; shared-library function published without a complexity contract | GKB gate artifact and the shared-library row |

**Recurrence during this reforge.** The successor ticket (T-CANON, finding2609_2421sw21h) reached
16.7k tokens/s and failed its budget gate at 97 ms per 1,600-token batch. Its report again called
the cause "kernel-launch count" without a launch count: the 16-instance round-1 accumulate took
55 ms. §11 exists for exactly that sentence.

**Calibration.** The model and the source fail in the same direction: they accept green
correctness tests as completion and read relative speedups ("14× faster") as progress. The budget
therefore sits in THE LAW and as the first gate, ahead of GK0.

**Verification.** Editor solo; a rule-level reforge of an audited skill, below the fleet threshold
(`forging-skills` references/verifying.md §7). Floor: see the skill-check receipt in the commit
message. No GPU run was performed for this documentation change. The rules come from the incident's
arithmetic and code, not from a benchmark of the rules themselves.

## 2026-09-25 — GKR: step-level device residency (v2609.3.0)

**Incident.** firedancer's firefly edition block
(`ModelRegistry.Firefly_SuperposedRounds`, revisions 3–9) ran an online learning step at
1,703 tokens/s: 0.049% of its 3.46M tokens/s paper bound (finding2609_2521bj7rk, run2609_2521z63qp).
The per-stage profile:
- egress decode, host: 67.6%
- field decode, host: 19.7%
- residual add, host: 4.4%
- channel_mix match and insert: 0.26%, the only stage on the GPU.

FireOps' GPU kernels for decode and residual add existed and were not called. The same day, SSM
comparators given an explicit performance contract reached 213× (Mamba-2 SSD) and 20× (GDN)
speedups, so neither the Julia GPU ecosystem nor the kernel craft was the limit.

**Root causes → rules.**

| Cause | Rule |
|---|---|
| The skill fired on `@cuda`/`@kernel`/CuArray edits. A model step written as host Julia on `Array`s never looked like GPU work, so no gate ran. | Description and §0b: the gate fires on a GPU-first STEP, with or without a kernel. |
| A GPU scalar-indexing failure was "fixed" by `Array(FB)`, moving the stage to the host. | §0b if/then: host-pull fixes are rejected. |
| The CPU reference was the base of every revision; "CPU-only" was carried as a known violation for eight revisions. | §0b if/then: the reference is an oracle only, and a CPU-only violation blocks the next functional revision. |
| The egress decoded all ~500 candidates per token when one ranked walk suffices. | §0b if/then: complexity first (GKB), then placement. |
| Tickets stated correctness and theme conformance only. | GKR artifact: STAGE MAP plus a zero-transfer test. |

**Calibration.** The model's default direction matches the failure: it keeps correctness green by
taking the cheapest change, and moving work to the host is cheapest. The rule therefore sits in
THE LAW and in the gates table, not only in a reference.

**Verification.** Editor solo, a rule-level reforge, below the fleet threshold. The floor receipt is
in the commit message. No GPU run was performed for this documentation change.

## Reforge v2609.4.0 (2026-09-25) — selected work and the whole-step boundary

**Source grade.** The user supplied a dated Firefly status/postmortem transcript. Its
revision 11 follow-up reports that top-K outputs were selected with a mask after all
candidate outputs had been computed, so the write work still scaled with candidate count.
This is a source report, not a GPU run independently reproduced in this dotfiles checkout.
The K-of-C accounting rule is skill-supplied generalization; it does not fix K=3 or any
Firefly-specific throughput target as a universal threshold.

**Additional primary-source check (2026-09-25).** The
[CUDA.jl workflow](https://cuda.juliagpu.org/stable/usage/workflow/) describes generic CPU
development followed by CuArray porting and a scalar-indexing check. It does not claim that
generic array syntax alone guarantees GPU execution. The
[Nsight Systems guide](https://docs.nvidia.com/nsight-systems/UserGuide/) states that CUDA
workload traces include host/device memory operations and kernel activity. Neither source
establishes that a copy-free trace proves every stage ran on the device; the joined GKR
stage/output check is skill-supplied.

| Observed failure or audit finding | Operational correction | Owner |
|---|---|---|
| All C outputs materialized, then K kept by a mask | Count materialized/written outputs; gather selected work before the expensive stage or charge its C-cost | GKB/GKR in this skill |
| Zero-copy check could pass while CPU-resident stages execute entirely on host | Join the trace to stage execution and output residency, within a declared warmed inner-step boundary | GKR; transfer technique in `host-performance.md` §4 |
| `Array(...)` ban appeared to forbid the CPU oracle too | Ban host pulls only on the production hot path; retain CPU oracle comparison | GKR/GK3 |
| A generic `AbstractArray` path was described as a GPU guarantee | Require a demonstrated device production path before promotion under a device-resident contract | GKR |
| Stock-layer choice and a GPU-first step were conflated in a no-fire row | Keep layer selection in `writing-julia`; route whole-step device performance here | description cut and trigger set |
| P7 placement and whole-step device residency used the same GPU-first phrase | P7 chooses resources; a model-step GPU performance objective triggers GKR and its stage-map contract | reciprocal scope cut in this skill |

The test is a future target-repo profile and complexity check. No speedup, parity, or
installed-skill triggering is claimed from this documentation edit.

**PROSE-DEBT waiver (2026-09-25).** This reforge clears all SKILL.md sentence warnings
and adds no net warning to references. The 208 long sentences in nine older technical
references remain queued for a dedicated prose reforge, after semantic verification of
this incident's rules. The previous 2026-09-12 queue date was missed; do not treat this
waiver as a claim that those references were reorganized.

**Adversarial verification amendment.** Two read-only verifiers found that requiring a
predeclared residency contract would reproduce the original no-fire failure. GKR now
fires on the GPU performance objective and creates that contract. They also found a
necessary C-wide ranking exception: all-candidate matching/scoring may be required,
while downstream output materialization can still be K-only. The final predicate
charges C where required and compacts before the downstream expensive stage where possible.

**Comparative judge.** Against HEAD, the old skill already caught host loops and
all-candidate decode. The new skill additionally counts C/K/materialized writes and
rejects a mask that leaves C-wide downstream work intact. It also rejects a copy-free
trace as sufficient when a host stage remains. No regression was found for the
GPU-first Firefly-shaped ask; the P7-only no-fire row protects the placement seam.

**Verification receipt.** `quick_validate.py`: PASS. Target `skill-check.ts`: exit 0,
0 structural FAIL, 0 SKILL.md prose warnings, 208 legacy reference sentence warnings
(unchanged from pre-edit). `git diff --check`: PASS. Collection floor:
72 skills, 64,564 listing characters, within the declared budget. `mise run
link:skills` passed; the Codex skill link resolves to this source directory.

## 2026-09-27 — scope the performance problem, v2609.4.1

Root-signed delta consumes EV2 update semantics and EV3 workload/timing footing. GKB is an
optimistic lower time bound, not a measured/guaranteed whole-run rate. GK2 selects recoverable
whole-run cost, distinguishes device-share from wall-share and separates kernel/warm/cold gains.
Historical primitive reuse is checked at current shapes and state lifetime. Global next-functional-
revision freezes are replaced by affected-path performance acceptance plus BIBIFI work selection.
Short targeted oracles do not waive required GK3 acceptance; broad tests still need finite budgets.
Both prior and raised target numbers need justification. No current CUDA API facts or kernel code
were changed. Source/audit and review findings live in sibling BIBIFI performance postmortem/ledger§11.
Static review found and fixed GK3 ambiguity. A clarified fresh target event marked both unsupported
thresholds pending; no actual performance gain is claimed. Archived804ac2c and current target
floor each report208existing reference prose warnings, no core warnings; scoped debt waived with
unchanged baseline. Collection and diff checks pass; no runtime instrumentation was introduced.

## 2026-09-30 — parallel design and measurement contracts, v2609.5.0

Source, primary/corpus locators and structural owner map: `tests/postmortem-2026-09-30-design.md`.
Baseline6774b7b. GKD occupies the previously missing work/span→execution-map step inside the existing
stage map. It neither creates another skill nor treats all single-thread work as forbidden.
GKB now separates optimistic bounds, complete-path forecasts and justified frozen acceptance criteria.
GK3 covers the actual required output/state relation; GK3-AD applies only to differentiated operations.
GK2 fixes the outer-sync/inner-timer example, separates warmup/profile/timing, preserves sample/state
conditions and replaces roofline/occupancy shortcuts with counters and timeline-based interpretation.
EV3 owns normalized comparisons; Julia owns host language discipline; BIBIFI selects useful bounded slices.

Two bounded Terra audits harvested the episode and GPU contracts. Root rejected a suggested
all-training-state-updates→rrule rule as precisely the category error being repaired.
Final semantic review found exact versus tolerance/stochastic oracle ambiguity; root bound the
oracle relation to the target contract and prohibited post-hoc weakening.

**File-backed OLD/NEW review.** Fresh workers inspected the same constructed workload/profile/proposal
and wrote actual review artifacts under /tmp/kernel-skill-reforge.QU9BKW. Neither saw the root criteria.
Both retained all20ms of stage accounting, rejected4x training gain from forward-only10x, rejected
invalid static top-k, and kept skipped GPU verification unverified. Both correctly waived irrelevant AD.
OLD incorrectly said the outer CUDA.@sync made the inner @time adequate. NEW identified and fixed
that ordering. This is one observed review distinction, not a speed or general reasoning improvement.
NEW also over-blocked a known score-update repair on fully attributing an independent8ms host interval
and on preexisting compilation evidence. Root marked that sequencing wrong, separated pre-code
design from post-code validation, then requested a targeted informed repeat with unchanged inputs.
The repeat permits the local repair while retaining8ms as unknown; root read the actual corrected artifact.

Artifacts (SHA256): OLD085f4732396d6436b2cbe32b8c7db6e9a3924dfc33caa6222be5e4878f05634d;
NEW-first686be92512528a99d74045fa2ee060260882f348008cd5181e4e4894f587bcf1;
NEW-repeat84c72c5e4260922f8442f7d67e6de1c9f99d16d268a963a9bbc838a90199af5b.
The repeat is not a fresh blind success. No CUDA code was executed, no performance gain measured,
and no Firedancer implementation/launch policy changed. Documentation snippets are not GPU-runtime receipts.

PROSE-DEBT waiver,2026-09-30: core warnings zero; reference long-sentence count208→204 over the
scoped edit, including the new design reference. Retain older detailed reference prose and dated
API caveats outside this repair; the revision does not claim a full current-toolchain revalidation.
`design-cases.md` covers serial bookkeeping, dependent selection, non-AD learning, timer placement,
missing stages, normalized comparisons, GPU skip, state tolerances and greenfield/local-repair sequencing.

Final description desk-check routes all six boundary prompts to GPU craft, host Julia or EV3 as intended.
It exposed a weak EV3 trigger for normalized-only comparisons; MFU/η/無次元効率 terms were added there.
This is description consistency, not measured automatic activation. Broad references keep their dated
limits; this revision does not assert every inherited API/example was re-executed on today's toolchain.

## 2026-10-01 — reciprocal pointer for device ownership, v2610.1.0

writing-julia v2610.3.0 took the state/API device-ownership rule (JG8, `architecture.md` §10.10) from
firefly-stream-mp's `select_exec(vram_bytes)` and run2610_0121sqxbq's device-less receipts. This skill keeps
launch-time `get_backend(x)` and GKR and copies none of the rule. Edits: routing row (cut + pointer),
one §0b If-row routing budget-chosen devices and device-less rows to JG8, two design cases, two seam rows
in `tests/trigger-set.md`, version header. No description edit.

## 2026-10-01 — review objections on the device-ownership seam, v2610.1.0 (pre-commit)

The design case "`Array(x)` inside the round loop" allowed "a named counted boundary per JG8", which
contradicted §0b's in-loop transfer target 0. It now reads: device-side reduction only; JG8's per-step
boundary count fails a boundary called per round. Open, owner here: incident 4 of the JG8 forge
(Int32 value atomics in a kernel) has no rule in `memory-and-warps.md` §7; writing-julia's near-miss row
now says so instead of claiming the rule exists.

## 2026-10-02 — launch contract: typed shape, in-loop transfer budget, typed stage outcome, v2610.2.0

Incidents (firedancer, RTX 3060, 2026-10-02): (1) finding2610_0201z2dy4: a per-pass decide kernel launched
with `ndrange = 1` (`_one(be)`) in the learning-pass loop scanned frontier cells x live names x coordinates
serially, ~1e9 ops at ~100 ns = 92% of a train call; no code declared a work bound, so no test caught it.
(2) finding2610_02010tndj: a blocking `copyto!` of a device flag every 4 rounds cost 16-23% of round time,
and CUDA.jl's default synchronize adds worker-thread wake-up latency; a typed device contract with a counted
host-transfer budget existed but was not wired. (3) finding2610_0201z2dy4: a fill stage whose capacity
constant was exceeded did nothing and was reported as 0 fills, not as skipped.
EXTEND, not a new skill: GKD already allowed a one-thread kernel for "bounded serial bookkeeping" but gave no
way to check the bound. Homes: `execution-design.md` § Launch contract (shape type + stage outcome),
`host-performance.md` §4.1 (in-loop transfer budget), SKILL.md §0b If-rows and §9 checklist, three design
cases. No description edit, no new reference file. The skill's script floor owns no check of these rules; they
are enforced by the consumer's tests (bound/time/transfer-count/outcome), not by skill-check.
Not verified here: no CUDA code was run and no speedup is claimed; the three incidents are cited from the
firedancer records, not re-measured.
skill-check 2026-10-02: 0 FAIL, 2 WARN (references long-sentence debt 205; 4 long sentences in core). PROSE-DEBT waiver 2026-10-02: reference count was 204 at 2026-09-30 and later edits were not re-baselined; the new rules are tables plus short paragraphs. Whether the 4 core long sentences predate this edit was not checked against HEAD. Older reference prose stays out of scope.
