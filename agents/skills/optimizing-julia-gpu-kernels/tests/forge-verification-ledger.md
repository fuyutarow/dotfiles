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
