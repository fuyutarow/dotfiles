# Memory & warps — the optimization ladder

> Read when: a kernel already compiles (GK1) and passes its CPU-reference oracle (GK3) — now
> it must get FAST. THE LAW's clause "the memory hierarchy dominates the arithmetic — coalesce
> before you tune" is this file's territory: coalescing, shared memory + barriers, bank
> conflicts, register pressure, the read-only cache, warp shuffles, atomics, divergence. Climb
> in this order — a lower rung still broken wastes effort on the ones above it.

## §1 Coalescing — Julia is COLUMN-MAJOR, `threadIdx().x` is the FIRST dimension

Julia arrays are column-major (dim 1 contiguous) — the mirror image of the row-major C/CUDA
tutorials most training data comes from, where `threadIdx.x` conventionally maps to the LAST
(contiguous) dimension. Map `threadIdx().x` (the fastest-varying lane in a warp) to the FIRST
dimension of every `CuArray`/`CuDeviceArray` — never the last. Porting `A[row][col]`,
`col=threadIdx.x`, literally into `A[row, col]` (dim 2, not 1) turns one coalesced transaction
into 32 uncoalesced ones — a 10-30x slowdown with **no error and no wrong output**, invisible
until profiled.

```julia
# WRONG — ported straight from a C row-major tutorial
i = threadIdx().x; j = threadIdx().y
@inbounds A[j, i] += 1f0   # indexes dim-2: stride = size(A,1), NOT coalesced

# RIGHT — dim-1 (contiguous in column-major Julia) gets threadIdx().x
@inbounds A[i, j] += 1f0   # stride-1 across the warp: coalesced
```

**Artifact**: grep every `CuDeviceArray` index driven by `threadIdx().x` — must be leftmost.
Confirm with Nsight Compute Memory Workload Analysis: `sectors per request` near 1 (coalesced)
vs near 32 (`measuring.md` owns the general profiling workflow; this metric is the readout).

## §2 Shared memory — allocation + the unconditional-barrier rule

Allocate with the `CuStaticSharedArray(T, dims)` / `CuDynamicSharedArray(T, dims, offset=0)`
**functions**. The `@cuStaticSharedMem`/`@cuDynamicSharedMem` macros still work but are
deprecated `[dated:2026-07]`, printing `Base.depwarn`'s message verbatim on every compile:
`"@cuStaticSharedMem is deprecated, please use the CuStaticSharedArray function"`.

```julia
b = CuStaticSharedArray(Float32, 64)          # not @cuStaticSharedMem(Float32, 64)
b2 = CuDynamicSharedArray(Float32, n)         # requires shmem=n*sizeof(Float32) on @cuda
c2 = CuDynamicSharedArray(Int32, m, n*sizeof(Float32))   # 2nd buffer: explicit byte offset
```

Every cross-thread shared-memory read needs a `sync_threads()` since the write, reached
**unconditionally by every thread** — never inside a divergent `if` some threads skip. In a
block-reduction loop the barrier goes BEFORE **each round's** read, not just once after the
initial write. Skipping this is a silent race — a WRONG result varying run-to-run and across
architectures, not a crash — exactly what GK3's `compute-sanitizer` (`debugging.md`) catches.

```julia
# WRONG — barrier missing before each round's cross-thread read
s[tid] = data[tid]
# no sync_threads() here — some threads read stale/uninitialized s[]
step = blockDim().x ÷ Int32(2)
while step != Int32(0)
    tid <= step && (s[tid] += s[tid + step])   # RACE: writer may not have run yet
    step ÷= Int32(2)
end

# RIGHT — barrier after the write AND before every round's read
s[tid] = data[tid]
sync_threads()
step = blockDim().x ÷ Int32(2)
while step != Int32(0)
    sync_threads()
    tid <= step && (s[tid] += s[tid + step])
    step ÷= Int32(2)
end
```

**Artifact**: for any kernel using shared memory, count read/write phases with cross-thread
dependence and confirm one `sync_threads()` per phase transition, reached unconditionally.

## §3 Bank-conflict padding — pad the FIRST dimension `[medium confidence]`

To avoid shared-memory bank conflicts on a tiled kernel (blocked matmul/transpose), pad the
FIRST dimension of a tile by +1 element — NOT the last dimension as C/C++ tutorials do. In
column-major Julia, dim-1 sets the column-to-column stride; padding it to `TILE+1` breaks the
stride-32 bank collision when `TILE` is a multiple of 32 and a warp strides across the second
index. Copying `tile[TILE][TILE+1]` verbatim into `(TILE, TILE+1)` pads the dim already
contiguous and does **nothing** — no correctness signal reveals it, only a profiler counter.

```julia
tile = CuStaticSharedArray(Float32, (TILE, TILE + 1))   # WRONG — transplants the C idiom (pads last dim)
tile = CuStaticSharedArray(Float32, (TILE + 1, TILE))   # RIGHT — pad the FIRST dim instead
```

`[medium confidence]`: SYNTHESIZED, not directly documented in CUDA.jl's own docs — combines
the confirmed column-major layout with general hardware bank-conflict facts. Verify with the
`l1tex` bank-conflict metric before relying on it in production, unlike §1/§2.

## §4 Register pressure — Int32 index arithmetic, `maxregs`, `always_inline`

Two compounding sources to remove together: (1) Julia integer literals default `Int64` while
`blockIdx()`/`threadIdx()` are 32-bit, so `blockIdx().x - 1` silently promotes — write
`Int32(1)` or `1i32` (`using CUDA: i32`); this is the register-count rationale, `host-
performance.md`'s GK4 grep owns the separate precision one for the same habit. (2) Replace
`for i = index:stride:n` (`StepRange`) with a manual `while` loop — a device-side `StepRange`
carries error-throwing/bounds overhead a `while` skips. CUDA.jl's own tutorial applies both and
measures register count falling **29 → 28 → 12** — the StepRange alone cost more registers
than everything else combined, capping occupancy and risking silent spills.

```julia
# 29 registers: Int64 literal + StepRange for-loop
index = (blockIdx().x - 1) * blockDim().x + threadIdx().x
for i = index:stride:length(y); @inbounds y[i] += x[i]; end

# 12 registers: Int32 literal + manual while loop
index = (blockIdx().x - Int32(1)) * blockDim().x + threadIdx().x
i = index
while i <= length(y)
    @inbounds y[i] += x[i]
    i += stride
end
```

Trade registers for occupancy at launch level: `@cuda maxregs=N` caps registers per thread;
`@cuda always_inline=true` forces full inlining, which typically REDUCES register usage.
**Never guess a `maxregs` value** — capping too aggressively forces excess live values into
per-thread local memory (slow global-memory traffic), which can make wall-clock time WORSE
despite higher theoretical occupancy.

```julia
k = @cuda launch=false maxregs=32 my_kernel(args...)
CUDA.registers(k)          # register count after capping
CUDA.memory(k).local       # nonzero ⇒ spilling, not just "fewer registers"
```

**Artifact**: `CUDA.registers(k)` / `CUDA.memory(k)` on `k = @cuda launch=false ...`
`[dated:2026-07 API]` — `CUDA.memory(k)` returns a `NamedTuple` with `local`/`shared`/`constant`
bytes; `.local` dot-access works despite `local` being a reserved keyword. Nonzero `.local` is
the unambiguous spill signal — don't blame coalescing when the real cause is spilling.

## §5 `Const()` — the read-only cache

Wrap a read-only kernel argument in `CUDA.Const(A)` (device-side, compute capability ≥ 3.5) to
route loads through the GPU's read-only/texture cache — CUDA.jl's equivalent of CUDA C++'s
`const __restrict__`/`__ldg()`. Like `atomic_add!` (§7), `Const` is `@public`, NOT exported
`[dated:2026-07]` — bare `Const(in)` after `using CUDA` throws
`` UndefVarError: `Const` not defined in `Main` `` (verified live); qualify as `CUDA.Const`
or `using CUDA: Const`. CUDA.jl has **no public `__constant__`-equivalent** — no
`@cuconstant` macro exists (`[dated:2026-07]`, zero hits searching JuliaGPU/CUDA.jl); do not
invent one. Omitting `Const()` on a genuinely read-only array is not a correctness bug — it's a
silently missed cache hint visible only as a profiler difference.

```julia
function kernel!(out, in)
    ro = CUDA.Const(in)          # loads route through the read-only cache on cc >= 3.5
    i = threadIdx().x
    @inbounds out[i] = ro[i] * 2f0
    return
end
```

**Artifact**: grep for `CUDA.Const(` wrapping read-only `CuDeviceArray` kernel args; a bare
`Const(` with no qualifying import is the §7-class visibility bug.

## §6 Warp-level primitives — naming, mask discipline, 1-based lanes, shuffle reduction

**Vote intrinsics carry the `vote_` prefix** (`vote_all_sync`, `vote_any_sync`,
`vote_ballot_sync`, `vote_uni_sync`) — never bare `all_sync`/`any_sync`/`ballot_sync`, an LLM's
guess from CUDA C++'s `__all_sync` minus the underscores; `all_sync(mask, pred)` throws
`UndefVarError: all_sync not defined`. **Every vote/shuffle call takes the mask as an explicit
first `UInt32` argument** — `shfl_sync`/`shfl_up_sync`/`shfl_down_sync`/`shfl_xor_sync` included;
none default it except `sync_warp(mask=FULL_MASK)`. `shfl_down_sync(val, offset)` (mask omitted)
throws `MethodError: no method matching shfl_down_sync(::Float32, ::Int64)`.

```julia
if all_sync(CUDA.FULL_MASK, pred); ...; end        # WRONG → UndefVarError: all_sync not defined
if vote_all_sync(CUDA.FULL_MASK, pred); ...; end   # RIGHT
val = shfl_down_sync(val, 1)                        # WRONG → MethodError (mask omitted)
val = shfl_down_sync(CUDA.FULL_MASK, val, 1)        # RIGHT
```

**Lane numbers are 1-based**: `laneid() ∈ 1:32` (source: `laneid() = ccall(...) + 1i32`).
Broadcasting from an absolute lane with `shfl_sync(mask, val, srcLane)` (not `_up`/`_down`/
`_xor`, which use relative deltas), "first lane" is `srcLane = 1`, not `0`. Gate per-warp
writes with `lane == 1`, not `lane == 0` — CUDA.jl's own `reduce_block` (`mapreduce.jl`) does
exactly this.

```julia
if lane == 0; @inbounds shared[wid] = val; end   # WRONG (0-based CUDA C++ habit) — never fires
if lane == 1; @inbounds shared[wid] = val; end   # RIGHT (CUDA.jl lanes are 1-based)
```

**Warp-confined reduction**: a `shfl_down_sync` doubling-offset loop against the full mask — do
NOT reach for shared memory + `sync_threads()` for a value already confined to one warp. This
is CUDA.jl's own `reduce_warp` (`CUDACore/src/mapreduce.jl:7-16`, matched to installed source;
`0xffffffff == CUDA.FULL_MASK`):

```julia
@inline function reduce_warp(op, val)
    assume(warpsize() == 32)           # compiler hint from the original source
    offset = 0x00000001
    while offset < warpsize()          # 32 on every current NVIDIA GPU
        val = op(val, shfl_down_sync(0xffffffff, val, offset))
        offset <<= 1
    end
    return val
end

# Crossing warp boundaries DOES need shared memory + sync_threads (§2's barrier rule applies):
wid, lane = fldmod1(threadIdx().x, warpsize())   # both 1-based
val = reduce_warp(+, val)
shared = CuStaticSharedArray(eltype(val), 32)
lane == 1 && (@inbounds shared[wid] = val)
sync_threads()   # crosses warps — the shuffle loop above needed no barrier at all
```

**No implicit warp-synchronous execution.** Since Volta (sm_70+) lanes of a warp are NOT
guaranteed lockstep (independent thread scheduling). Don't assume it for shared/global-memory
exchange outside `shfl_*_sync`/`vote_*_sync` (whose `_sync` already synchronizes) — call
`sync_warp(CUDA.FULL_MASK)` explicitly first. A manual exchange that "worked" pre-Volta can
read stale/torn values on Volta+ because the writer lane isn't guaranteed to finish first.

```julia
shared[lane] = val; x = shared[other_lane]                        # WRONG — assumes lockstep
shared[lane] = val; sync_warp(CUDA.FULL_MASK); x = shared[other_lane]  # RIGHT — explicit barrier
```

## §7 Atomics — pointer-based API, reduce-before-atomic, float nondeterminism

`using CUDA` does **not** export `atomic_add!`/`atomic_sub!`/`@atomic`/etc. — CUDA.jl declares
them `@public` (Julia's `public` keyword, ≥1.11 `[dated:2026-07]`), discoverability-only, not
export. Bare `atomic_add!(...)` throws `UndefVarError: atomic_add! not defined`. Bare
`@atomic a[1] += 1` is worse and silent: Base's own `@atomic` (atomic struct fields) is already
visible without any `using`, so it resolves to Base's macro and fails on the array-ref with an
unrelated macro-expansion error. Always `CUDA.atomic_add!(...)` / `CUDA.@atomic ...`, or
`using CUDA: atomic_add!` explicitly.

The low-level API takes a **raw `LLVMPtr`** via `pointer(a, i)` — never a dereferenced element.
`CUDA.atomic_add!(a[i], val)` throws
`MethodError: no method matching atomic_add!(::Float32, ::Float32)`.

```julia
atomic_add!(pointer(a, 1), 1f0)       # WRONG → UndefVarError: atomic_add! not defined
CUDA.atomic_add!(a[1], 1f0)           # WRONG → MethodError (element, not a pointer)
CUDA.atomic_add!(pointer(a, 1), 1f0)  # RIGHT
```

**Reduce within the block before the atomic.** Never issue one atomic per thread — reduce with
`reduce_warp` (§6) then a shared-memory combine across the block's warps, and issue exactly ONE
atomic per block, guarded by `threadIdx().x == 1i32`. CUDA.jl's own `LinearAlgebra.dot` kernel
(`lib/cublas/src/linalg.jl`) does this, commenting "about 10% speed-up compared to a simple
mapreduce"; a naive per-thread atomic serializes almost the entire kernel on one address.

```julia
# WRONG — one atomic per thread, heavy contention
i <= length(x) && (CUDA.@atomic res[] += x[i])

# RIGHT — reduce within block (reduce_warp + shared-memory combine), one atomic per block
val = reduce_warp(+, val)
# ... shared-memory combine across the block's warps (§2/§6 barrier pattern) ...
threadIdx().x == 1i32 && (CUDA.@atomic res[] += val)   # ONE atomic per block
```

**Float atomic reductions are non-deterministic across runs** — block completion order varies,
so summation order and rounding vary. CUDA.jl's own atomic `dot` kernel marks this
(`# NOTE: introduces nondeterminism`) and gates the fast path with
`math_mode() == PEDANTIC_MATH || !atomic; return mapreduce(...)`. If bit-reproducibility is
required (GPU-vs-CPU numerical tests), force the deterministic fallback:

```julia
CUDA.math_mode!(CUDA.PEDANTIC_MATH)
result = LinearAlgebra.dot(x, y)   # falls back to mapreduce, bypassing the atomic kernel
```

**Artifact**: `grep -n '@public @atomic, AtomicError, atomic_add!'` for the export mechanism;
`grep -n 'introduces nondeterminism\|PEDANTIC_MATH'` to confirm the fallback gate before
shipping an atomic reduction on a correctness-sensitive path.

## §8 Divergence — restructure to uniform branches, prefer branchless `ifelse`

Divergent branches serialize taken/not-taken paths across all 32 lanes of a warp regardless of
language. Restructure so the condition is uniform across a warp (branch on `blockIdx`/coarse
tile index, not fine-grained per-element predicates), and prefer `ifelse(cond, a, b)` over
`if...else` for cheap per-element scalar choices in hot loops. `[medium confidence: hardware-
level guidance, not CUDA.jl-specific; the ifelse-lowers-to-a-predicated-select claim was not
traced through generated PTX for this exact case.]`

```julia
if x[i] > 0; y[i] = x[i]; else; y[i] = zero(eltype(x)); end        # WRONG — data-dependent divergence
@inbounds y[i] = ifelse(x[i] > 0, x[i], zero(eltype(x)))           # RIGHT — branchless
```

**Artifact**: `ncu --metrics smsp__thread_inst_executed_per_inst_executed.ratio ./binary` — a
ratio well below 1.0 indicates active divergence.

## §9 Production tiled GEMM, and the KA equivalents

§1–§3 (coalesced tiling, shared-memory staging, bank-conflict padding) are exactly what a
hand-written tiled-matmul tutorial teaches — and per GK0 (SKILL.md §1), a hand kernel still
loses to cuBLAS for plain GEMM. When a project genuinely needs a custom tiled GEMM (fused
epilogue, mixed precision, a type cuBLAS doesn't cover), the production answer is
**JuliaGPU/GemmKernels.jl**, not a from-scratch tiling kernel — hand-tiling stays the
pedagogical path, not the shipped one.

KernelAbstractions equivalents of this file's raw-CUDA constructs (`@localmem` for
`CuStaticSharedArray`, `@synchronize` for `sync_threads`, `@private` for per-item scratch) are
covered in `references/portable-kernels.md` — do not mix CUDA.jl-only intrinsics into a
`@kernel function ... end` body; those symbols are undefined on non-CUDA KA backends.
