# Compiler modes — a launch flag is a hypothesis, not a performance result

**SOLE owner** of Julia launch-time compiler-mode selection.
It covers `-O`, `--compile`, debug/bounds flags, CPU target, and package-image effects.
This file decides flags and the required evidence.

`performance.md` owns hot-loop code and in-process benchmarking.
`setup.md` owns environments, TTFX remedies, and deployment/AOT.
Do not duplicate their rules here.

## Decision map [dated:2026-09]

| Input state | Do | Receipt | Do not conclude |
|---|---|---|---|
| Need ordinary execution and no measured compiler-mode problem | Keep the default `-O2`. | Full invocation and Julia version. | That `-O3` is the production default. |
| CPU-bound hot path, type checks already clean | Compare `-O2` and `-O3` on the same warmed representative input. Retain `-O3` only if the declared steady-state metric wins. | Workload, warmup, metric, both results, chosen flag. | That `-O3` guarantees SIMD or a material speedup. |
| Slow first useful result | Measure whole-process TTFX in fresh processes, separately labeling cold versus reusable-cache state. Then route the persistent problem to `setup.md` §3.5. | Command, cache state, elapsed wall time, result boundary. | That a warm `@b` result measures startup or compilation latency. |
| Bounds fault or suspected misuse of `@inbounds` | Run the reproducer with `--check-bounds=yes`; fix the index invariant before restoring normal mode. | Reproducer and bounds-enabled result. | That `-O0` re-enables bounds checks. |
| Need less compiler work during disposable interactive exploration | Try `-O0`, but keep it out of speed claims and release/benchmark receipts. | Goal and observed edit-run latency. | That it is a correctness, debugger, or final-performance setting. |
| Need source-debug information or different compilation breadth | Select `-g`, `--inline`, or `--compile` for that debugging question and record it separately from `-O`. | Debugger/reproducer result and complete flags. | That these flags are aliases for optimization level. |
| Ship or run on a defined CPU fleet | Choose `-C`/`--cpu-target` from the deployment compatibility target; measure on that target. | Target contract, flags, host CPU, result. | That a local `-O3` result proves performance or compatibility elsewhere. |

The CLI exposes `-O`/`--optimize={0|1|2|3}`; `2` is the default and bare `-O` means level `3`.
The official interface does not promise a stable per-level inventory of passes.
Do not invent one. In particular, do not equate `-O3` with guaranteed SIMD.

## Measurement protocol — separate the four questions

1. **Steady-state throughput/latency:** warm the representative call first.
   Use the in-process benchmark discipline in `performance.md` §2.6.
   Compare only one flag axis at a time.
2. **TTFX:** start a fresh Julia process for every trial.
   Include loading, compilation, and the first useful result in the boundary.
   Label whether package images already existed.
3. **Debuggability/correctness:** use the flag that exposes the suspected fault.
   `--check-bounds=yes` overrides `@inbounds`.
   An optimization level does not replace that check.
4. **Deployment compatibility:** decide the CPU target before optimizing.
   `-C` affects JIT code in the active session.
   `JULIA_CPU_TARGET` instead controls system/package-image generation.

For a recordable benchmark, pilot, or parallel run, P7 in `orchestrating-agents` admits resources.
A one-off flag probe is not evidence for a broader workload.

## Guardrails that prevent false explanations

| Tempting explanation | Required correction |
|---|---|
| “Julia is JIT, so every first call is the same compilation cost.” | Specialization, loading, package images, invalidation, and the exercised path differ. State the measured boundary instead. |
| “`-O3` made it SIMD.” | Inspect emitted code only if that claim matters. Automatic vectorization is conditional; loop structure, aliasing, target information, and profitability all matter. |
| “`@simd` is needed for SIMD.” | `performance.md` §2.5 owns the loop contract. Julia can often vectorize without `@simd`; the macro is a semantic promise about reordering, not a speed spell. |
| “The first `-O3` run was slower, so steady state regressed.” | First separate cache/precompile and JIT work from warmed execution. |
| “`--compile=min` and `-O0` are equivalent.” | They control different CLI dimensions. Treat each as a separately justified debugging or latency experiment. |
| “Changing `-O` only changes generated code.” | It also affects package-image selection. A package image made at a lower optimization level is rejected by a higher-level run; a higher-level image may be reused by a lower-level run. |
| “Use `@fastmath` to get the rest of `-O3`.” | `@fastmath` changes floating-point semantics. It requires its own numerical-acceptance decision and is not an `-O` substitute. |

## Minimal evidence record

Record these fields beside any retained non-default compiler mode:

```text
goal: steady-state | TTFX | debugging | CPU compatibility
julia: <julia --version>
command: <full invocation, including --project and every non-default flag>
workload: <representative input and success boundary>
cache-state: cold | reusable package images | explicitly controlled
metric/result: <units and observed value>
decision: <retain default | retain flag | revert flag>
```

`--min-optlevel`, `--inline`, `--compile`, `--pkgimages`, and `--compiled-modules` are not routine
tuning knobs. Change one only when its documented dimension is the stated question.
Retain the same receipt. For cache diagnosis, include `-O`, `-g`, `--check-bounds`, `--inline`,
and `--pkgimages` in the package-image state.

## Primary sources audited [dated:2026-09]

- Julia, [Command-line Interface](https://docs.julialang.org/en/v1/manual/command-line-interface/).
- Julia, [Package Images](https://docs.julialang.org/en/v1/devdocs/pkgimg/).
- Julia, [Performance Tips](https://docs.julialang.org/en/v1/manual/performance-tips/).
- Julia, [JIT Design and Implementation](https://docs.julialang.org/en/v1/devdocs/jit/).
- Julia, [Environment Variables](https://docs.julialang.org/en/v1/manual/environment-variables/).
