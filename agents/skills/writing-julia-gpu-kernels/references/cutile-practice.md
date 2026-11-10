# cuTile.jl practice — verified field facts and work patterns

Read when writing or debugging a cuTile.jl tile kernel with integer lanes, scatter, per-lane
gathers, or a GK3 harness. Facts are `[dated:2026-11]`, verified on RTX 3060 (sm_86), cuTile.jl
fork ed1e483 (JuliaGPU/cuTile.jl#350; firedancer `envs/pkg-2611`), tile 128, by probe kernels and
by the firedancer modules cm_gln/2 (commit 9452734d) and cm_dgn/1. Re-probe after a cuTile change;
the SKILL.md cuTile model holds the source-cited facts.

## Integer conversions and arithmetic

| Operation on a tile | Result | Use instead |
|---|---|---|
| `Int32.(t)` for an `Int8` or `Int16` tile (sign extension) | works | — |
| `reinterpret(Int32, UInt32.(t))` for a `UInt8`/`UInt16` tile (zero extension) | works | — |
| `Int32` tile `*`, `+`, `-`, `div.`, `rem.`, `min.`, `max.`, compares | works; `div`/`rem` truncate like Julia | — |
| `Int32` → `UInt8`/`Int8` direct truncation (`% UInt8`, `trunc`) | rejected (`trunc_int` has no Tile IR equivalent) | `(reinterpret(UInt32, x) .% UInt16) .% UInt8`, then `reinterpret(Int8, ·)` if signed |
| `Int32` → `Int16` | via `reinterpret(Int16, reinterpret(UInt32, x) .% UInt16)` | — |
| A 0-d scalar load `arr[1]` of `UInt8`, widened to `Int32` | rejected | Keep scalars that drive loops or `if` as `Int32` arrays; or gather the value into a lane |
| `Int8` gather from and scatter to a `CuArray{Int8}` | works | — |
| `.~` on an integer tile | rejected | `xor.(u, typemax(T))` |
| A scalar-only subexpression inside a tile broadcast: `Int32(2) * j .+ Int32(1) .- t` | rejected (`_promote_to_tile` with `Broadcasted{DefaultArrayStyle{0}}`) | compute the scalar first: `(Int32(2) * j + Int32(1)) .- t` |
| A literal mixed with a narrow tile (`t .+ 0x0100`) | converts to the tile type, never widens | `convert(Tile{T}, t)` first |

An unlisted conversion is unverified: probe it with a 20-line kernel against a host result before
building on it.

## Value widths: the spec first, then a proven bound

When the design spec or a project constraint fixes value widths (a width table such as "Int8
values, UInt16 byte products, sign + 3/4 UInt8 limbs for sums"), implement exactly those widths
for every value: gathered operands, products, accumulators, division inputs, table builders and
persistent counters. Int32 lanes then carry addresses, lane indices and shapes only. A proof that
an `Int32` accumulator is exact does not make a wider value lane conformant, and a value oracle
(GK3) cannot detect the violation, so compare each value op's lane type with the width table
before GK3. Field record (2026-11-11): cm_dgn/1 at 3d5a40eb used `Int32` sums and `rne32` under
a spec that fixed UInt8 limbs; GK3 matched bit for bit, the preregistration was admitted and a
registered run had started when the design owner sent it back; the run was stopped and the
module rewritten to sign + limb sums (positive and negative magnitudes, then `s_diff`).

Only where no spec or project rule fixes the width, choose it from a proven bound: write the
accumulator bound before the kernel (GKB); below 2^31 `Int32` lanes are shorter and quicker to
compile than limbs. Record the bound in the module comment and capacity file.

A symmetric round-half-even division of an `Int32` lane by a positive divisor (unconstrained
widths only):

```julia
@inline b32(c) = reinterpret(Int32, UInt32.(UInt8.(c)))
@inline function rne32(n, d)                 # d > 0, scalar or lane
    neg = n .< Int32(0)
    m = ifelse.(neg, Int32(0) .- n, n)
    q = div.(m, d); r = m .- q .* d
    up = (r .* Int32(2) .> d) .| ((r .* Int32(2) .== d) .& ((q .& Int32(1)) .!= Int32(0)))
    q = q .+ b32(up)
    return ifelse.(neg, Int32(0) .- q, q)
end
```

## Lanes, padding and one writer per element

The usual lane setup clamps the padding lanes of the last tile onto the last valid lane:

```julia
pid = ct.bid(1)
raw = (Int32(pid) - Int32(1)) * Int32(tile) .+ ct.arange(tile; dtype = Int32)
l0 = min.(raw, n) .- Int32(1)                # padding lanes alias lane n - 1
live = raw .<= n                             # lanes that own an element
first = ct.arange(tile; dtype = Int32) .== Int32(1)
```

- `ct.store(arr; index = pid, tile = v)` on an array of exactly `n` elements drops out-of-range
  lanes; it needs no mask.
- `ct.scatter(arr, idx, v)` through clamped indices writes the same element from several lanes:
  pass `mask = live`. A value the whole tile shares (a count, a flag) is scattered with
  `mask = first`, from one block only (`if pid == 1`).
- A scatter at an offset into a larger array (a per-block slice) uses explicit indices plus `live`;
  `ct.store` with `index = pid` cannot offset.
- A value oracle cannot detect duplicate writers: lanes that write the same value pass every
  equality check. Review every scatter for ownership, and say when no writer-ownership check ran.

## Compile cost and the GK3 harness

- Each distinct kernel set compiled in minutes (one cm_gln/2 GK3 case: 434 s wall, mostly
  compilation). `TileArray` specializes on argument divisibility (`ArraySpec`), so B = 128 and a
  tail of B = 96 compile separately; different test shapes multiply compilations.
- Fix compile errors on the smallest case alone, then run every case in one process
  (`julia harness.jl small,controls,frozen,...`) so compiled kernels are shared.
- Include the production batch and its tail in the case list; small shapes alone leave the
  production specializations uncompiled until the first registered run.
- Keep the host oracle exact (Int64/Int128) and compare the whole mutable state after every batch,
  plus every trace a kernel writes.
- Add wrong controls the comparison must detect: sequential per-sample commits where the rule is
  one batch commit, a missing or extra divisor, a credit read from the new instead of the old
  state, a dropped mask. A control that is not detected means the harness cannot see that defect.
- A mismatch in a small case can be the oracle's: check that oracle constants follow the same
  parameters as the device (a denominator hard-coded for `bits = 4` broke a `bits = 2` case).

## Measurement

- Take a cost number only with the GPU to yourself: obtain admission (`agent-resource-run`) and do
  not overlap another GPU job. Two dry runs overlapping inflated 74.7 ms per batch to 193–199 ms;
  the correctness results of that run stayed valid, the cost did not.
- Report kernel-only time and public-path (Launcher loop body) time separately; at batch 1 the
  fixed per-step cost (5.2 ms of 8.6 ms) dominated the kernels (3.4 ms).
