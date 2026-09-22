# NN stack and compiled array execution

**SOLE owner:** model API, NN primitives, execution mode, device, and AD selection at their intersection.
General host-function differentiation belongs to `autodiff.md`; dependency declarations to `packaging.md`.
Device-kernel implementation belongs to `optimizing-julia-gpu-kernels`.

## Select the execution contract first

Before adding dependencies, record these choices in the task's existing plan or implementation notes.
No separate contract file is required.

| Input | Record |
|---|---|
| Computation | ordinary function, direct NN primitive, or composed NN model |
| Model API | existing/user-selected framework, house default, or none |
| Execution | eager Julia or Reactant/XLA |
| Target | device, array type, dtype, and relevant shape constraints |
| Differentiation | none or chosen backend; mutation and required derivative order |
| Acceptance | numerical/gradient checks; baseline, speed target, and startup budget if performance motivates the choice |

Respect an existing working stack and explicit user choices before applying defaults.
Treat an unsupported combination as unresolved; do not silently switch framework or execution mode.

## Role selection

| Required operation | Select | Boundary |
|---|---|---|
| New composed NN model, no framework specified | Lux as **HOUSE DEFAULT** | Local convention; the role survey does not establish superiority over Flux. |
| Existing or explicitly selected Flux model, including new work | Flux | Preserve the requested framework; one integration bug does not justify a general migration. |
| Direct softmax, convolution, attention, or batched operation | NNlib's documented API | No model framework is required merely to call a primitive. |
| Lux layer or primitive customization | Lux API first; documented LuxLib API where the operation requires it | NNlib and LuxLib coexist; do not replace Lux internals wholesale with NNlib. |
| Ordinary Julia array function requiring XLA execution | Reactant | A model framework is unnecessary unless the computation actually contains a model. |
| Lux model requiring XLA execution | Lux with Reactant integration | Check backend/device compatibility before committing to this execution mode. |
| Custom device kernel | `optimizing-julia-gpu-kernels` | Existing NNlib/LuxLib operations are candidates before authoring a kernel. |

When directly importing a package, declare it as a direct dependency under `packaging.md` PK3.
For example, direct `NNlib.softmax` calls require NNlib even if a framework also depends on it.
Use explicit imports and qualified calls under the namespace contract.

## AD and execution selection

The eager Lux defaults below are inherited **HOUSE DEFAULTS**, not results of the NNlib role survey.
Their older source attribution is recorded in the verification ledger (2026-08-17).
Recheck the installed versions' support before implementation; measure before claiming a speed ranking.

| Context | Initial path | Escalation or stop |
|---|---|---|
| Inference or primitive evaluation without derivatives | No AD backend | Do not add a training backend merely because Lux or NNlib is present. |
| Ordinary eager host function | `autodiff.md` | Its DI policy and problem-shape table own this choice. |
| Eager Lux training, supported device/operations, no known Zygote blocker | Start with Zygote | Explicitly install/load the backend; Lux's weak dependency declaration does not do this. |
| Eager Lux training with mutation or a Zygote failure | Check standalone Enzyme support for the failing operation/device | Verify primal and gradients; mutation alone does not require XLA. |
| Reactant-compiled differentiation, including Lux | Check the selected version's supported Enzyme integration entrypoint | The captured EnzymeMLIR role does not prove a particular training API or derivative order works. |
| Device/operation unsupported by the initial path | Review supported alternatives for that concrete combination | If none passes primal/gradient checks, report an unresolved contract and the needed change; stop the training run. |

Use the selected framework/compiler's supported training or differentiation entrypoint.
The ordinary-function DI default does not require wrapping every Lux or Reactant training call in DI.
NNlib's ChainRules rules do not establish compatibility with every AD backend or derivative order.

Consider Reactant when XLA/TPU execution is required or when a measured CPU/GPU bottleneck warrants a trial.
Before a performance trial, state the workload, baseline, speed target, and compilation/startup budget.
Keep compilation/startup cost separate from warmed throughput; retain the path only when both criteria pass.
There is no universal Enzyme-over-Zygote or Reactant-is-fastest ordering in this decision table.

Before compiling, identify data-dependent control flow and mutation in the function.
The captured Reactant README describes tracing that specializes the observed control-flow pattern (evidence below).
Verify the selected version's supported control-flow mechanism and test inputs exercising different paths.
Do not treat tracing as a general cure for dynamic dispatch or data-dependent branches.

## Evidence and policy boundary

The role facts are distilled from **Julia NN package roles**, position
`urn:uuid:01a0c8c6-29bb-77fd-8aa8-ccca9694cd2c` and ledger
`urn:uuid:01a0c8c6-29bb-77fd-8aa8-ccc9c7db0e81` in the soks corpus.
Resolve them by ID; filenames are `sok-julia_nnlib_package_roles.md` and `led-julia_nnlib_package_roles.md`.
The captured Reactant/ChainRulesCore README evidence is
`urn:uuid:01a0c8c6-29bb-77fd-8aa8-ccc777fd3840` (`evi-julia_nnlib_package_roles_ad_runtime.md`).
Its `sok_locator` includes Reactant README lines 21–23 and 45–63 at the frozen revision.
The control-flow caveat is retained from the previous toolchain reference; the NNlib survey did not test it at runtime.

| Evidence | Permitted consequence |
|---|---|
| JNNR-001–002: NNlib supplies reusable primitives and both surveyed frameworks depend on it | Distinguish a primitive call from a model-framework choice. |
| JNNR-003–004: AD rules/extensions and LuxLib have distinct roles | Verify each integration; NNlib is neither an AD engine nor Lux's sole primitive implementation. |
| JNNR-005–006: dependencies and execution responsibilities cross a single vertical stack | Select by the contract above rather than a universal package hierarchy. |

Coverage `[dated:2026-09-22]`: fixed revisions carrying NNlib 0.9.45, Lux 1.31.4,
LuxLib 1.15.9, Flux 0.16.12, plus Reactant and ChainRulesCore documentation.
The survey does not establish popularity, framework superiority, complete device support, or backend speed rankings.
Revisit the relevant row when a dependency, documented API, execution contract, or measured workload changes.
