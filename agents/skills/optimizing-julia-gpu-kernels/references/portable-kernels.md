# Portable kernels — KernelAbstractions 0.9.42 `[dated:2026-07]`

> Read when: portability (CPU oracle / AMD/Intel future) is in play, or a KA (`@kernel`)
> syntax question comes up — SKILL.md's reference-index row for this file.

KernelAbstractions (KA) is the write-once-run-on-`CPU()`/`CUDABackend()`/`ROCBackend()`/
`oneAPIBackend()`/`MetalBackend()` layer. It does not replace GK0–GK4 — a KA kernel still needs
a GK0 deny-gate check, still hits GK1's compile errors, still needs a GK2 synchronized
measurement and a GK3 oracle. This file owns what changes when the launch target is a `Backend`
instead of a bare `@cuda` call: the macro surface, the async-launch + synchronize idiom, and
the traps specific to KA's dual CPU/GPU lowering.

## §1 Verified kernel-body API

| Construct | Verified behavior | Note |
|---|---|---|
| `@kernel function f(...) ... end` | defines a portable kernel; KA generates the CPU path itself | dispatch on the concrete `Backend` from `get_backend`, never on a `cpu=` kwarg (§7) |
| `@index(Global, Linear)` / `@index(Local, Linear)` / `@index(Group, Linear)` | per-workitem / per-workgroup-local / per-workgroup index | the Linear form is what is verified in this pass; use consistently across a kernel |
| `@localmem T (dims...)` | allocates a workgroup-shared buffer | size `dims` from `@groupsize()`, never a literal (§5) |
| `@uniform expr` | hoists `expr`'s VALUE once per workgroup so it survives a `@synchronize` barrier | mandatory for any local read after `@synchronize` (§3); current, working 0.9.x API `[dated:2026-07]` — installed 0.9.42 docstring carries NO deprecation note |
| `@private` | per-workitem storage construct | current 0.9.x API; no deprecation note in the installed 0.9.42 docstring — semantics beyond that not verified in this pass |
| `@synchronize` | workgroup barrier | bare form ONLY — `@synchronize(cond)` is deprecated and lowers unconditionally regardless of `cond` since v0.9.34 (§7) |
| `@groupsize()` | returns the workgroupsize; wrap in `@uniform` if read after a barrier | feeds `@localmem` sizing (§5) |
| `get_backend(A)` | returns the concrete `Backend` for an existing array | prefer over hardcoding `CUDABackend()` (§2) |
| `ndrange` (call kwarg or 3rd construction arg) | required whenever the body uses `@index(Global, ...)` | omission throws `"Can not partition kernel!"` verbatim (§2) |

`CUDABackend()` tuning kwargs are not verified in this file's source material — check
`references/api-changes.md` or the installed source before asserting one.

## §2 The launch idiom — `get_backend` + `ndrange` + `synchronize`

Three independent failure modes, each with its own artifact — check all three on every KA
launch wrapper.

**(a) Hardcoding the backend locks the "portable" kernel to one vendor.**

```julia
# WRONG — locks the function to one vendor
backend = CUDA.CUDABackend()
kernel!(backend)(A, B; ndrange = size(A))

# RIGHT — works for CPU(), CUDABackend(), ROCBackend(), oneAPIBackend(), MetalBackend()
backend = get_backend(A)
kernel!(backend)(A, B; ndrange = size(A))
```

Artifact: grep launch wrapper functions for `CUDABackend()` or `isa(.*CuArray)` used as the
backend source instead of `get_backend(`. New backend-native arrays: allocate with
`KernelAbstractions.allocate(backend, T, dims...)` / `zeros(backend, T, dims...)` /
`ones(backend, T, dims...)`, not `CUDA.zeros` or a plain `Array`, if the function must stay
portable.

**(b) A dynamically-sized kernel launched with no `ndrange` fails at runtime, not compile time.**

```julia
# WRONG — forgot ndrange for a dynamically-sized kernel
kernel! = mykernel(backend)
kernel!(A, B)     # throws: Can not partition kernel! ...

# RIGHT
kernel! = mykernel(backend)
kernel!(A, B; ndrange = size(A))
```

Artifact: the literal string `"Can not partition kernel!"` — grep call sites for a launch with
no `ndrange=` and no static ndrange baked in at construction (`mykernel(backend, wgsize,
ndrange)` is the alternative, construction-time form).

**(c) KA launches are asynchronous on GPU backends exactly like raw `@cuda` — reading back or
timing without a synchronize races the kernel.**

```julia
# WRONG
backend = get_backend(A)
kernel! = mykernel(backend)
kernel!(A, B; ndrange = size(A))
return Array(A)   # may race the kernel on GPU backends

# RIGHT
backend = get_backend(A)
kernel! = mykernel(backend)
kernel!(A, B; ndrange = size(A))
KernelAbstractions.synchronize(backend)   # blocks host until kernel completes
return Array(A)
```

Artifact: grep for a launch line (`kernel!(...; ndrange=`) not followed, in the same function,
by `KernelAbstractions.synchronize(backend)` or `synchronize(backend)`. This is GK2's KA-side
form — `synchronize(backend)` is what a KA launch needs before timing/readback; the general
`CUDA.@sync`/`@profile` discipline is owned by `measuring.md`, not restated here.

## §3 The `@uniform`-before-`@synchronize` trap

A plain local computed before a `@synchronize` and read after it is only guaranteed correct on
real-parallel GPU backends. On `CPU()`, KA lowers each `@kernel` body into per-segment loops
split at each `@synchronize`, and a non-`@uniform` variable is not guaranteed to survive into
the segment after the barrier — a backend-dependent WRONG answer, not a crash. This is exactly
the failure mode GK3's "KA kernels use `CPU()` as the oracle" bullet exists to catch — GPU-only
testing will never surface it.

```julia
# WRONG — breaks on the CPU backend after @synchronize
@kernel function broken(A)
    N = prod(@groupsize())          # plain local, not @uniform
    I = @index(Global, Linear); i = @index(Local, Linear)
    lmem = @localmem Int (N,)
    lmem[i] = i
    @synchronize
    A[I] = lmem[N - i + 1]          # N may be lost on CPU backend here
end

# RIGHT
@kernel function fixed(A)
    N = @uniform prod(@groupsize())  # hoisted once per workgroup, survives the barrier
    I = @index(Global, Linear); i = @index(Local, Linear)
    lmem = @localmem Int (N,)
    lmem[i] = i
    @synchronize
    A[I] = lmem[N - i + 1]
end
```

Artifact: in any `@kernel` body, grep for an assignment appearing BEFORE `@synchronize` whose
name is also read AFTER `@synchronize` but not prefixed with `@uniform` on its defining line.
Loop-invariant sizes, `prod(@groupsize())`, and precomputed offsets are the recurring culprits.

## §4 `unsafe_indices` + unguarded `@index` footgun

`@kernel unsafe_indices=true` disables KA's automatic bounds check that normally protects the
last, partial workgroup when `ndrange` does not evenly divide the workgroupsize. Once opted
out, `@index(Global, ...)`'s old implicit safety is gone — derive the global index yourself
from `@index(Group)`/`@index(Local)` and add an explicit guard (GK1's bounds-guard discipline,
KA-side).

```julia
# WRONG — unsafe_indices=true but no manual guard
@kernel unsafe_indices=true function k(A)
    I = @index(Global, Linear)
    A[I] = 2 * A[I]
end

# RIGHT — manual index + explicit bounds check
@kernel unsafe_indices=true function k(A)
    N  = @uniform prod(@groupsize())
    gI = @index(Group, Linear); i = @index(Local, Linear)
    I  = (gI - 1) * N + i
    if I <= length(A)
        A[I] = 2 * A[I]
    end
end
```

Artifact: grep `@kernel` definitions for `unsafe_indices=true` co-occurring with
`@index(Global` and no manual `if I <= length(...)` bounds check in the body. Setting this flag
for a perceived speedup while still trusting `@index(Global)` produces out-of-bounds
reads/writes on the last workgroup whenever `size(A)` is not an exact multiple of the
workgroupsize — memory corruption/crash on GPU, not just a wrong number.

## §5 `@localmem` sized from `@groupsize()`, never a literal

```julia
# WRONG — decoupled from the actual launch workgroupsize
@kernel function k(A)
    lmem = @localmem Float32 (256,)
    ...
end

# RIGHT — always matches however the kernel is launched
@kernel function k(A)
    n = @uniform @groupsize()[1]
    lmem = @localmem Float32 (n,)
    ...
end
```

A hardcoded `@localmem Float32 (256,)` silently desyncs from the real launch configuration the
moment the same kernel is later constructed with a different workgroupsize (e.g. `mykernel(
backend, 128)`), causing out-of-bounds local-memory indexing on that path. Artifact: grep
`@localmem` declarations for a bare integer literal dimension instead of an expression derived
from `@groupsize()`.

## §6 DECISION RULE — KernelAbstractions vs raw CUDA.jl

Default to KA (`@kernel`/`@index`/`@localmem`/`@synchronize`) whenever the kernel must run on
`CPU()` for correctness tests/CI (GK3), or must ship on more than one GPU vendor. Drop to raw
`@cuda` only for an intrinsic KA does not expose portably: warp shuffles
(`CUDA.shfl_sync`/`shfl_up_sync`/`shfl_down_sync`/`shfl_xor_sync`), Cooperative Groups
(`CG.this_grid` — requires `@cuda cooperative=true`, `CG.this_thread_block`, `CG.sync`),
dynamic parallelism (`@cuda dynamic=true`), or `@cuprintf`/`@cushow`.

The trap: these CUDA.jl calls still COMPILE inside a `@kernel` body under `CUDABackend` — KA's
CUDA backend lowers straight to `CUDA.@cuda`, `__synchronize` maps to `sync_threads` — so
nothing stops you writing them, silently converting a "portable" kernel to CUDA-only:

```julia
# Looks portable, isn't — compiles only under CUDABackend
@kernel function reduce_kernel(A)
    i = @index(Local, Linear)
    val = CUDA.shfl_down_sync(0xffffffff, A[i], 1)
    ...
end
# reduce_kernel(KernelAbstractions.CPU())(A; ndrange=size(A))  # MethodError: not defined for CPU
```

Artifact: grep the body of any `@kernel function ...` for `CUDA.`/`CG.`-prefixed calls (shfl*,
cuprintf, cushow) — their presence means the kernel is CUDA-only despite the `@kernel` wrapper.
Confirm by instantiating the same kernel with `KernelAbstractions.CPU()` — a
`MethodError`/`UndefVarError` there is the tell. If a warp intrinsic is genuinely required,
write it in raw `@cuda`, not inside a `@kernel` that only pretends to be portable.

## §7 Deprecations & unstable constructs `[dated:2026-07]`

Verified against the installed 0.9.42 source — a package-wide `grep -n "deprecat" src/*.jl`
returns exactly ONE hit. Do not invent more:

- **`@synchronize(cond)`** (the conditional form) — the ONE real deprecation: deprecated since
  v0.9.34, and its macro body now unconditionally lowers to `$__synchronize()` regardless of
  `cond`. Never rely on `cond` gating the barrier; use bare `@synchronize` and put the
  condition outside it if branching around the barrier is genuinely needed.
- **`@kernel cpu={true,false}`** — NOT deprecated; marked "an experimental feature" in the
  installed docstring. Still avoid it for new code: write plain `@kernel function ...` (KA
  generates the CPU path itself) and dispatch on the concrete `Backend` value from
  `get_backend`.
- **`KernelAbstractions.GPU`** — NOT deprecated in 0.9.42: its installed docstring says new
  backend implementations **must** subtype it. Prefer dispatching user code on `Backend` /
  `get_backend` values; subtype `GPU` only when implementing a backend.

```julia
# AVOID — experimental branching construct
@kernel cpu=false function k(A)
    ...
end

# RIGHT — plain @kernel, dispatch on the concrete Backend value
@kernel function k(A)
    ...
end
backend = get_backend(A)
k(backend)(A; ndrange = size(A))
```

Artifact: the single installed deprecation site is `@synchronize(cond)`'s docstring
(`src/KernelAbstractions.jl:317` in 0.9.42) — cite that, nothing else, as "deprecated".
Re-verify this section when a 0.10/1.0 KernelAbstractions ships.

## §8 NEGATIVE — KernelIntrinsics is not in the shipped 0.9.42

Not shipped in the installed 0.9.42 despite release-note attribution — the verified account,
provenance, and the do-not-cite rule live in `references/api-changes.md` §6 (one home). If
warp-level portability is genuinely needed today, apply §6's decision rule here and drop to
raw CUDA.jl.

## §9 Checklist

- [ ] Backend obtained via `get_backend(A)`, not a hardcoded `CUDABackend()`
- [ ] `ndrange` supplied (kwarg or construction-time) for every dynamically-sized launch
- [ ] `KernelAbstractions.synchronize(backend)` called before any host readback or timing
- [ ] Every local read after a `@synchronize` is `@uniform`-hoisted before the barrier
- [ ] `unsafe_indices=true` never appears without a manual `@index(Group)`/`@index(Local)` +
      explicit bounds guard
- [ ] `@localmem` dimensions derive from `@groupsize()`, never a bare integer literal
- [ ] No `CUDA.`/`CG.`-prefixed intrinsic inside a `@kernel` meant to stay portable (§6)
- [ ] No new code on `@synchronize(cond)` (deprecated) or `@kernel cpu=` (experimental); user
      code dispatches on `Backend` values, not the `KernelAbstractions.GPU` abstract type
- [ ] No claim about a "KernelIntrinsics" module — api-changes.md §6 owns that negative
