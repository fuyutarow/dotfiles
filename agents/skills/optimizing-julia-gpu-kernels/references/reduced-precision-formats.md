# Reduced-precision formats — representation-to-execution contract

> **Version**: v2609.1.0 (2026-09-12). Fast-moving support facts are marked `[dated:2026-09]`.
> **SOLE owner**: reduced-precision storage, scale, decode, target, and accumulator decisions.

`host-performance.md` §12 owns Float32/Float16/BFloat16 literals and ordinary wide-type choices.
This file owns FP8/FP6/FP4, MXFP, NVFP4, packed storage, and block-scaled execution.

## LAW — a format label never licenses an execution claim

Treat these as separate propositions:

```text
payload -> scale/block -> physical storage -> quantization policy
        -> software representation -> target-valid compute -> accumulator/output
        -> measured numerical and system outcome
```

Matching one stage does not clear the next. `E2M1`, `Float4_E2M1FN`, or `MXFP4` alone proves
neither packed bytes nor a native Tensor Core path.

The evidence home is SoK `urn:uuid:01a0946e-e4ee-71da-a275-8438973dfb4b`.
Use its claim fragments below; do not reproduce its paper narrative here.

## GK4 artifact — `PRECISION CONTRACT`

Complete this before changing a tensor below 16 bits or making a memory, speed, or portability claim.

| Field | Record | Evidence that clears it |
|---|---|---|
| target | GPU model, compute capability/ISA, driver, compiler, package versions | current capability and package/source loci |
| tensor role | weight, activation, gradient, KV cache, checkpoint, communication | named producer and consumer |
| payload | element code and non-finite semantics | normative spec or bit-exact oracle |
| scale | type, hierarchy, encode/decode direction | spec plus reference conversion |
| block | size and tensor axis for every scale | shape contract and edge handling |
| nominal storage | payload + amortized scale/metadata bits | explicit arithmetic |
| physical storage | container type, shape, packing order, padding, allocator bytes | byte count and round-trip test |
| quantization | scale selection, calibration, rounding, saturation, outlier treatment | versioned algorithm and reference output |
| decode | where unpack and widening occur | compiled path or explicit unverified marker |
| compute | vendor/library/kernel and target-valid input type | source/ISA gate plus compilation receipt |
| accumulator/output | internal accumulator, public output, post-scale | API/ISA contract plus numerical oracle |
| outcomes | error, allocated bytes, bandwidth, latency, throughput, task quality | one measurement per claimed outcome |

Unknown is a valid value. An unknown load-bearing row blocks only the dependent claim.

## Representation matrix

| Contract axis | OCP MXFP4 | NVIDIA NVFP4 |
|---|---|---|
| payload | E2M1 | E2M1 |
| block scale | E8M0, power of two | E4M3, fractional |
| block size | 32 | 16 |
| tensor scale | not required by OCP MX v1.0 | one FP32 tensor scale |
| block payload + scale | `4 + 8/32 = 4.25` bits/value | `4 + 8/16 = 4.5` bits/value |
| extra accounting | layout is not prescribed | amortize the FP32 tensor scale separately |
| format identity | OCP MX contract | distinct NVIDIA contract |

The shared E2M1 payload does not make these formats compatible or ordered.
Sources: `#RPF-S02`, `#RPF-S03`, `#RPF-S05`, and `#RPF-Y01` in the SoK.

Never convert nominal bits directly into a VRAM claim. Record at least three numbers:

1. format bits from the contract;
2. container bytes from actual element type, shape, metadata, and padding;
3. allocator/device footprint under the measured runtime state.

Microfloats.jl deliberately stores sub-byte scalar values in one-byte primitive types in ordinary
arrays. That is compatible with OCP's nominal encoding: the two statements concern different layers.
The canonical package-state claim is `urn:uuid:01a03932-6182-7422-83bd-925b0ed5591b#HAC-021`.

## Target support `[dated:2026-09]`

| Target | Source-supported narrow path | Decision |
|---|---|---|
| NVIDIA CC 8.6, including RTX 3060 | Tensor Core FP16/BF16/TF32/INT8/INT4; no listed FP8/FP6/FP4 input | packed bytes may exist, but no native FP4/MX MMA claim |
| NVIDIA Hopper | FP8 Tensor Core input; Tile IR marks E8M0/FP4 not native and may diagnose or emulate | use FP8 directly; require a compile receipt for typed E8M0/FP4 |
| NVIDIA Blackwell targets | current PTX lists target-specific MXFP4/NVFP4 block-scaled paths | compile for the exact/family target and inspect the emitted path |
| AMD CDNA4/gfx950 | OCP MXFP8/6/4 scaled MFMA is documented | require a matching ROCm/library path and layout |

Sources: SoK `#RPF-S06` through `#RPF-S09`, plus `#RPF-Y02` and `#RPF-Y03`.

### RTX 3060 boundary

These four states are not interchangeable:

| State | Current verdict |
|---|---|
| store nibbles in `UInt8` buffers | supported as opaque integer storage |
| emit cuTile FP4 reinterpret/FToF bytecode | frontend source exists |
| execute that typed source on sm_86 | unresolved: Tile IR may diagnose or emulate |
| use FP4/MX as native Tensor Core MMA input | unsupported by the current CC 8.6 table |

cuTile's FP4 device tests run only on Blackwell in the pinned source. Tile IR marks FP4 as not
Ampere-native. For unsupported features, it permits either a diagnostic or semantics-preserving
emulation. Do not turn either fact into a runtime verdict without a compile/run receipt.

For a 3060 experiment, explicit integer unpack plus widening is a candidate. It is not a library
guarantee. It owes a bit-exact decode oracle, a full-result oracle, and GK2 measurement of decode
cost. Native compute remains the supported wide-type path.

## Julia component roles

| Component | Use it for | Do not infer |
|---|---|---|
| Microfloats.jl | scalar semantics, rounding, conversion, host reference | packed arrays, block policy, native GPU arithmetic |
| cuTile.jl | tile frontend, pack/unpack/FToF emission, scaled MMA on supported targets | package minimum CC means every element type works there |
| CUDA.jl + vendor libraries | supported wide/native compute and measurement | a stored custom type selects a Tensor Core path |
| `CuArray{UInt8}` or equivalent | physical packed payload container | its bytes already include scale/metadata or decode correctly |

Host-only Microfloats type/package work stays with `writing-julia`.
Device storage, decode, compilation, profiling, and kernel work stay here.

## Format-policy decision table

| Decision need | Action |
|---|---|
| OCP semantics or AMD/NVIDIA format portability | choose an OCP MX contract, then verify each target independently |
| NVIDIA-only Blackwell FP4 | compare MXFP4 and NVFP4 under one frozen policy and budget |
| legacy GPU memory experiment | separate opaque packing from software decode and wide compute |
| accuracy-sensitive tensor | compare tensor-role-specific policies; retain a wider fallback arm |
| adaptive or mixed microscaling | freeze effective bits, metadata, decode cost, and backend before comparison |

There is no universal `fixed MXFP4 < NVFP4 < adaptive microscaling` order.

- One training recipe favored NVFP4 over MXFP4.
- One RTN+Hadamard intervention moved two format-plus-group configurations in opposite directions.
- M2XFP won an aggregate at matched 4.5 effective bits but lost one reported task to NVFP4.
- OAS/MBS narrowed a gap with changed block, policy, and metadata; its effective bits were unreported.

These are stop signs against transitive ranking, not recipes. Source: SoK `#RPF-S10`–`#RPF-S13`
and synthesis `#RPF-Y05`.

## Validation ladder — one rung never substitutes for another

| Rung | Oracle | Claim it permits |
|---|---|---|
| semantics | exhaustive small-codebook or trusted Q/DQ reference | payload/scale conversion correctness |
| storage | byte round-trip plus actual container/metadata byte count | physical representation claim |
| target | compile and inspect target-specific IR/PTX/SASS or backend trace | selected lowering exists |
| compute | full GPU result against the same-algorithm CPU/wide reference | kernel/GEMM correctness |
| system | warm, synchronized profile with decode and transfer visible | latency/throughput/bandwidth claim |
| model | frozen task/quality evaluation with matched policy and budget | downstream quality claim |

If only memory residency is the goal, a faster GEMM is not required. It still owes the storage and
decode rungs. If speed is the goal, nominal compression is not evidence; GK2 measures the full path.

## Terminology

| Phrase | Use |
|---|---|
| reduced-precision AI formats | broad umbrella including BF16, FP8/6/4, and block-scaled variants |
| narrow floating-point formats | scalar FP8/6/4 payload families |
| microscaling or block-scaled formats | shared fine-grained scale is part of the representation |
| mixed-precision-native | different tensor roles or operations intentionally use different precisions |
| FP-friendly | avoid for a contract; it does not name precision, scale, storage, or compute support |

For a design centered on MX/block scales, say `microscaling-aware mixed-precision architecture`.

## Staleness checks

Re-open the cited SoK claim and current primary source before relying on a dated row:

- NVIDIA PTX ISA and CUDA compute-capability tables.

- NVIDIA Tile IR hardware-support matrix and emulation contract.

- AMD CDNA4/ROCm support tables.

- Microfloats.jl and cuTile.jl pinned version, source, and device tests.

A package update or new target row reopens the affected contract rows. So does a changed device-test
gate or merged restricted-float change. None invalidates the layer separation.
