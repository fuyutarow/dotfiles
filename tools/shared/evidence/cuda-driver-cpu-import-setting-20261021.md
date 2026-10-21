# CUDA driver inspection during a CPU-stage import

## Verdict

`JULIA_CUDA_USE_COMPAT=false` is the exact supported setting for the installed
`CUDA_Driver_jll` automatic forward-compatibility-driver inspection. It makes
that JLL return before it spawns `cuda_inspect_driver`; that helper `dlopen`s a
driver and calls `cuInit`. Therefore it is a supported way to avoid *that
specific* inspection and its `dxg` touch.

It is **not** a supported guarantee that importing a CUDA-dependent package is
CPU-only or performs no CUDA-driver call. The immediately dependent installed
`CUDACore.__init__` loads `CUDA_Driver_jll.libcuda`, then `dlopen`s it, obtains
the driver version, and calls `cuInit(0)`. Thus a CPU configuration stage that
still imports `CUDA`/`CUDACore` can touch `dxg` after the JLL's early return.
No supported environment variable found in the inspected installed source and
official CUDA.jl documentation provides an all-driver-calls/no-`dxg` import
guarantee.

## Exact installed provenance and scope

The relevant environment is `/home/fuyu/Workspace/firedancer/envs/gpu`:

| Item | Evidence |
| --- | --- |
| CUDA dependency | `envs/gpu/Project.toml:1-24` declares CUDA `6.4`; `Manifest.toml:184-220` resolves CUDA/CUDACore `6.4.2` and `CUDA_Driver_jll` `13.3.5+0`. |
| Driver JLL identity | UUID `4ee394cb-3365-5eb0-8335-949819d2adfc`, tree `e1545697ad04e71fc9d2d95b8f5f54c1244fb607`, version `13.3.5+0` (`envs/gpu/Manifest.toml:215-220`). |
| Installed cache | `/home/fuyu/.julia/packages/CUDA_Driver_jll/NQ7aY/Project.toml:1-16` confirms `13.3.5+0`; this is the source read below, not a guessed current release. |
| Platform artifact | Its `Artifacts.toml:1-10` selects x86_64 Linux `tegra=none`, artifact tree `5bf47e8b1f0daf3dafb58ff7f319899fecdd4372`. |

## Initialization order and effect

1. `CUDACore` imports `CUDA_Driver_jll` before including its initialization
   implementation (`.../CUDACore/6N8AA/src/CUDACore.jl:32-42,81-85`). Julia
   consequently runs the JLL initializer before `CUDACore.__init__`.
2. `CUDA_Driver_jll` sets the default `libcuda` name in top-level code
   (`.../CUDA_Driver_jll/NQ7aY/src/CUDA_Driver_jll.jl:11-23`).
3. Its generated wrapper reads the `compat` preference first, then
   `ENV["JULIA_CUDA_USE_COMPAT"]` (`.../src/wrappers/x86_64-linux-gnu-tegra+none.jl:57-83`).
   A pre-existing `CUDA_Driver_jll.compat` preference takes precedence over the
   environment variable.
4. With `JULIA_CUDA_USE_COMPAT=false`, `compat_preference` is false and lines
   98-104 return before `Libdl.dlopen`, before both inspection tasks, and before
   either helper spawn (lines 106-143).
5. The helper's source says it is a subprocess specifically so it can inspect
   drivers; it verifies the driver by calling `cuInit` (`.../src/CUDA_Driver_jll.jl:25-46`).
   This supports the narrow no-inspection conclusion.
6. The subsequent CUDACore initializer is independent: it `dlopen`s `libcuda`
   (lines 60-67), reads driver version (69-75), then invokes `cuInit(0)`
   (134-140) in `.../CUDACore/6N8AA/src/initialization.jl`. This refutes any
   claim that the setting makes an ordinary CUDA import no-driver/no-`dxg`.

## Recommendation and limitations

Use this only for the observed JLL inspection stall:

```text
JULIA_CUDA_USE_COMPAT=false
```

It selects the system driver instead of the bundled forward-compatible driver;
it is neither device masking nor toolkit/artifact selection. The official
installation guide gives the same value for disabling the compatibility driver,
and warns that it does not invalidate a previously selected toolkit
([source](https://cuda.juliagpu.org/stable/installation/overview/)). The
troubleshooting guide likewise scopes it to a forward-compatible-driver issue
([source](https://cuda.juliagpu.org/stable/installation/troubleshooting/)).

Do **not** recommend `CUDA_VISIBLE_DEVICES` as a no-`dxg` control. The official
guide says a hidden-GPU session still selects a toolkit based on the driver; it
does not document a pre-import driver-call bypass
([source](https://cuda.juliagpu.org/stable/installation/overview/)). Likewise,
`JULIA_CUDA_USE_COMPAT=false` is unrelated to `CUDA_Runtime_jll`/
`CUDA_Compiler_jll` runtime/toolkit selection, and no `JULIA_CUDA_USE_COMPAT`
source branch skips CUDACore's `dlopen`/`cuInit`.

The supported CPU-stage boundary is therefore architectural: do not load the
CUDA-dependent package at the CPU configuration/import stage; choose the CPU
path first and load the CUDA backend only in an explicit GPU stage. CUDA.jl's
own conditional-use guidance confirms that CUDA always loads when depended on
and makes `CUDA.functional()` a post-load capability check, not an import
avoidance mechanism ([source](https://cuda.juliagpu.org/stable/installation/conditional/)).
This report identifies no existing Firedancer CPU-only entrypoint that proves
that boundary; it proposes no source edit.

## Primary-source provenance

| Primary source | What it establishes |
| --- | --- |
| [Exact JLL tag](https://github.com/JuliaBinaryWrappers/CUDA_Driver_jll.jl/tree/CUDA_Driver-v13.3.5%2B0) and [generated main source](https://github.com/JuliaBinaryWrappers/CUDA_Driver_jll.jl/blob/CUDA_Driver-v13.3.5%2B0/src/CUDA_Driver_jll.jl) | Versioned generated source corresponding to the installed JLL. |
| [Exact generated x86_64 wrapper](https://github.com/JuliaBinaryWrappers/CUDA_Driver_jll.jl/blob/CUDA_Driver-v13.3.5%2B0/src/wrappers/x86_64-linux-gnu-tegra%2Bnone.jl) | Preference branch and automatic inspection order. |
| [Yggdrasil build commit `13d2256e08414c90468b180b1f5e9c50580601ac`](https://github.com/JuliaPackaging/Yggdrasil/blob/13d2256e08414c90468b180b1f5e9c50580601ac/C/CUDA/CUDA_Driver/build_tarballs.jl) | The installed JLL README's recorded upstream build source. |
| [CUDA.jl installation overview](https://cuda.juliagpu.org/stable/installation/overview/) and [conditional-use documentation](https://cuda.juliagpu.org/stable/installation/conditional/) | Supported setting semantics, GPU masking limitation, and optional-backend boundary. |

## MECE source status

| Class | Result |
| --- | --- |
| Known: installed package provenance | Exact manifest version/tree, cache source, platform wrapper, and local line loci are recorded above. |
| Known: JLL automatic inspection | `JULIA_CUDA_USE_COMPAT=false` returns before helper inspection; preference may override env. |
| Known: full CUDA import | CUDACore subsequently `dlopen`s and calls `cuInit`; no all-no-touch setting was found in scope. |
| Uncertain | Whether this host's `dxg` driver call succeeds after the narrow mitigation; runtime was intentionally not run. |
| Missing | A proven existing Firedancer CPU-only loader boundary that does not import CUDA. |

## SOKS distillation packet (not SOKS retention)

```text
kind: primary-source-distillation
topic: CUDA-CPU-IMPORT-SETTING
claim: For CUDA_Driver_jll 13.3.5+0, JULIA_CUDA_USE_COMPAT=false skips only
  automatic forward-compat driver inspection; it cannot guarantee that a
  CUDA/CUDACore import avoids the CUDA driver or dxg.
installed_provenance:
  manifest: /home/fuyu/Workspace/firedancer/envs/gpu/Manifest.toml:215-220
  package_tree: e1545697ad04e71fc9d2d95b8f5f54c1244fb607
  package_cache: /home/fuyu/.julia/packages/CUDA_Driver_jll/NQ7aY
evidence:
  - JLL wrapper lines 76-104: env is parsed; false returns before inspection.
  - JLL main lines 25-46: inspection helper calls cuInit.
  - CUDACore initialization lines 60-75,134-140: later dlopen/version/cuInit.
  - CUDA.jl official overview/conditional-use pages linked above.
negative_result: No documented all-CUDA-driver-call/no-dxg import setting found
  in the exact JLL, installed CUDACore, or official CUDA.jl documents inspected.
boundary: Skip CUDA-dependent import in CPU stage; CUDA.functional() is post-load,
  so it does not establish no-touch import behavior.
status: source-validated; runtime-not-run; requires normal SOKS README-compliant retention.
```

## Not verified

No Julia process, CUDA import, helper execution, GPU query, `dxg` probe, or
runtime test was run. The conclusion is source-order and documented-semantics
only; it is not a GPU trial or an assertion that host `dxg` is healthy.
