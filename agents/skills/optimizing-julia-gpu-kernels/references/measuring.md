# GK2 — Measuring before optimizing (CUDA.jl profiling & timing)

> Read when: BEFORE optimizing anything, and before ANY perf claim ("faster", "memory-bound",
> "compute-bound", "beats cuBLAS") — this is GK2 in SKILL.md.

## §1 THE SYNC LAW — async kernel launches lie to naive timers

CUDA kernel launches are asynchronous: `@cuda` (or any CuArray op) returns control to the host
the instant the launch is enqueued, before the GPU has done any work. A bare `@time`,
`Base.@elapsed`, or `@btime`/`@benchmark` measures only that enqueue — not execution.

```julia
# WRONG — measures launch overhead only, not GPU execution
Base.@elapsed sin.(a)   # 0.0087 s

# RIGHT — same call, CUDA-synchronized
CUDA.@elapsed sin.(a)   # 0.0516 s  — ~6x slower: the true device time
```

- **Single-shot timing** → `CUDA.@time expr` (idles the GPU first, syncs at the end).
- **Repeated statistical timing** → wrap the timed expression itself, not the whole call:
  `@benchmark CUDA.@sync sin.($a)` — never `@benchmark sin.($a)` alone.
- **Artifact**: grep the benchmark/test file for `@btime`/`@benchmark`/`Base.@time`/
  `Base.@elapsed` applied directly to a CuArray expression with no `CUDA.@sync`/
  `synchronize()` inside the timed block — that hit is the violation.

### §1.1 `blocking=true` for short/single-task benchmarks

`CUDA.@sync [blocking=false] expr` defaults to **non-blocking** synchronization — it yields
the current task to Julia's scheduler while waiting for the GPU. In a tight benchmarking loop
with no other task to run, that yield is overhead misattributed to the kernel. Pass
`blocking=true` explicitly — the macro's own docstring names exactly this case:

```julia
CUDA.@sync blocking=true sin.(a)   # skip the scheduler yield for tight micro-benchmarks
```

Comparing two kernel implementations under the default non-blocking wait can attribute
scheduler-yield latency to the kernel itself rather than to `@sync`'s own overhead.

### §1.2 Vendor vs. hand kernel — the SAME law, no exception

GK0 (SKILL.md §1) is only as good as the numbers behind it: when a hand-written kernel is
benchmarked against the vendor call it was meant to replace (or against a prior version, for a
regression check), that comparison ALWAYS goes under `CUDA.@sync` too — never a bare `@time`.
An unsynchronized comparison returns near-zero for BOTH sides and can make a hand kernel look
like it "beats cuBLAS" when the real GPU-side gap — visible only under sync — runs the other
way by orders of magnitude.

```julia
# WRONG — looks instantaneous, tells you nothing about who actually wins
@time my_kernel!(y, x)
@time mul!(y, A, x)

# RIGHT
CUDA.@sync @time my_kernel!(y, x)
@benchmark CUDA.@sync my_kernel!($y, $x)
@benchmark CUDA.@sync mul!($y, $A, $x)
```

## §2 Warm-up run before profiling — JIT is not the kernel

Run the kernel once, unmeasured, before profiling with `ncu`, `nsys`, or `CUDA.@profile`/
`CUDA.@time`. Skipping this profiles Julia's JIT compilation, not the kernel — hundreds of ms
of TTFX get misattributed to the kernel body, and a phantom bottleneck gets "optimized".

```julia
a = CUDA.rand(1024, 1024, 1024)
sin.(a)                    # warm-up / trigger compilation — NOT measured
CUDA.@profile sin.(a)      # now measures steady-state execution only
```

- Under `ncu --mode=launch julia`, ensure every involved CUDA.jl package is already
  precompiled BEFORE attaching — otherwise the profiler captures precompilation, not the run.
- Even after warm-up, the first call immediately after `nsys launch` can still read
  anomalously slow. For short kernels, call twice (separated by `CUDA.@sync`) and trust the
  second number, not the first post-launch measurement.

## §3 `CUDA.@profile` — the first measurement step

Reach for `CUDA.@profile expr` before nsys/ncu. Default output is two summarized tables
(host-side API time, device-side kernel time); pass `trace=true` for a chronological
per-event table instead:

```julia
julia> CUDA.@profile sin.(a)
Host-side activity: calling CUDA APIs took 437.26 µs (3.67% of the trace)
Device-side activity: GPU was busy for 11.48 ms (96.20% of the trace)
```

**Do not read the "GPU was busy for … %" line as SM occupancy.** It is wall-clock
GPU-busy-vs-idle time-share — a kernel can show 96% device activity while running at 20%
per-SM warp occupancy the entire time. Occupancy is an Nsight Compute metric
(`sm__warps_active...`, §9), not this line. Any report that re-labels "GPU was busy for X%"
as "occupancy is X%" is wrong.

## §4 `CUDA.@bprofile` — repeated sampling, not a hand-rolled loop

For statistically-repeated internal-profiler sampling, use `CUDA.@bprofile [time=1.0] expr`
instead of `for i in 1:N; CUDA.@profile ...; end`. The hand-rolled loop re-pays profiler
start/stop overhead every iteration, producing noisy per-call numbers instead of one
aggregated report.

```julia
CUDA.@bprofile sin.($a)           # benchmark for ~1s (default), report via @profile
CUDA.@bprofile time=3.0 sin.($a)  # benchmark for 3s
```

`@bprofile` does **not** accept `external=true` — that keyword is rejected outright with the
literal error `The \`external\` keyword argument is not supported by \`CUDA.@bprofile\`` — it
cannot drive nsys/ncu. For external-tool profiling, wrap plain `CUDA.@profile` (or the raw
call) with the external tool instead (§6). `[dated:2026-07]`

## §5 `ProfileResults` is NamedTuples-of-Vectors, NOT DataFrames `[dated:2026-07]`

`CUDA.@profile`'s return value has `host`/`device`/`nvtx` typed as plain `NamedTuple`s of
`Vector`s. Never `using DataFrames` or call DataFrame verbs on them.

```julia
# WRONG — assumes DataFrame, throws MethodError
using DataFrames
filter(:name => ==("kernel"), result.device)

# RIGHT — NamedTuple of vectors: index with findall/broadcasting
idx = findall(==("my_kernel"), result.device.name)
kernel_time = sum(result.device.stop[idx] .- result.device.start[idx])
```

In the `device` trace, the `size` (bytes) field is populated ONLY for `cuMemcpyAsync`/
`cuMemsetAsync` rows — it is separate from `grid`/`block`/`registers`/`shared_mem` on
kernel-launch rows. For a hand-written `@cuda` kernel that field is `missing`; do not
fabricate a bandwidth number or conclude "can't be measured" — compute it analytically:

```julia
n = length(a)
bytes = 2 * n * sizeof(eltype(a))    # e.g. 1 read + 1 write
t = CUDA.@elapsed my_kernel!(a)
gbps = bytes / 1e9 / t
```

## §6 nsys FIRST, then ncu — never the reverse

Run Nsight Systems for a whole-application timeline FIRST, to find the dominant kernel(s);
only THEN run Nsight Compute on that specific kernel for deep per-kernel metrics.

```
$ nsys launch julia          # step 1: system-wide overview, finds the hot kernel
$ ncu julia myscript.jl      # step 2: deep-dive on the kernel identified in step 1
```

Do not run `ncu --set full`/`detailed` broadly across a whole app by default — full-detail
`ncu` forces multiple kernel-replay passes per launch site across EVERY kernel in the program,
turning a 10-second targeted capture into a multi-hour run. Escalate the metric set only for
the kernel nsys already identified as hot.

## §7 Report file/tool names `[dated:2026-07]`

CUDA.jl's own `profiling.md` tutorial page shows a stale nsys example (`report.qdrep` /
`nsight-sys`). The current, actively-used Nsight Systems only produces `.nsys-rep` and ships
`nsys-ui` as the GUI binary — don't hardcode either of the tutorial's names:

```
$ ls *.nsys-rep *.qdrep 2>/dev/null   # only .nsys-rep exists on a current install
$ which nsys-ui                       # not nsight-sys
```

A post-processing script that globs `*.qdrep` silently matches zero files and "succeeds"
having processed nothing. Verify the actual extension/binary on the installed toolkit before
hardcoding either name.

## §8 The roofline verdict — the ONLY legitimate memory-vs-compute-bound call

Never eyeball memory-bound vs. compute-bound from `CUDA.@profile`'s time-share table (§3) — it
has no bandwidth or FLOP concept, so any classification from it has no quantitative basis. The
authoritative call is Nsight Compute's roofline section:

```
$ ncu --section SpeedOfLight_RooflineChart --kernel-name regex:"my_kernel" -- julia myscript.jl
```

Left of the Ridge Point on the chart = memory-bound; right = compute-bound; far below both
boundaries = a latency/occupancy problem, not a bandwidth or FLOP ceiling.

For a same-session, no-`ncu`-needed estimate, compute effective bandwidth analytically —
`(bytes_read+bytes_written)/1e9/measured_seconds` — against the device's OWN theoretical peak
(never a whitepaper number for a different GPU):

```julia
dev = CUDA.device()
clock_hz  = CUDA.attribute(dev, CUDA.CU_DEVICE_ATTRIBUTE_MEMORY_CLOCK_RATE) * 1000   # kHz -> Hz
bus_bytes = CUDA.attribute(dev, CUDA.CU_DEVICE_ATTRIBUTE_GLOBAL_MEMORY_BUS_WIDTH) / 8 # bits -> bytes
peak_gbps = clock_hz * bus_bytes * 2 / 1e9        # x2 for DDR
effective_gbps = (bytes_read + bytes_written) / 1e9 / measured_seconds
ratio = effective_gbps / peak_gbps                # near 1 => at the memory roofline
```

`CU_DEVICE_ATTRIBUTE_MEMORY_CLOCK_RATE` returns **kHz** and
`CU_DEVICE_ATTRIBUTE_GLOBAL_MEMORY_BUS_WIDTH` returns **bits** — skipping either conversion
makes the theoretical peak off by 1000x or 8x, so every kernel looks either impossibly
memory-bound or wildly underutilized. Pull both from the actual device via `CUDA.attribute`,
never copy a number from a whitepaper for a different GPU.

## §9 `ncu --query-metrics` BEFORE hardcoding a metric string

Verify a metric name exists for the installed `ncu`/GPU before putting it in `--metrics`:

```
$ ncu --chips a100 --query-metrics | grep -i dram   # NOTE: --chips, plural — NOT --chip
$ ncu --metrics sm__warps_active.avg.pct_of_peak_sustained_active,dram__throughput.avg.pct_of_peak_sustained_elapsed julia myscript.jl
```

`ncu --chip a100 ...` fails outright — the real flag is `--chips`. The two metric strings
above (occupancy, DRAM throughput) are corroborated by developer forums but were not confirmed
verbatim against the single official ProfilingGuide page checked for this skill — verify
locally with `--query-metrics` before trusting any remembered metric suffix, including these.

### §9.1 All-NaN metrics → version mismatch, not a code bug

If `ncu` reports NaN for every metric, the fix is matching `ncu` and the CUDA toolkit Julia is
using — not a code change:

```
$ ncu --version                                    # find ncu's CUDA toolkit version
julia> CUDA.set_runtime_version!(v"xx.x")           # match it, then re-profile
```

Rewriting the kernel or profiling flags in response to all-NaN output chases a phantom bug;
the real cause is almost always this toolkit-version mismatch.

## §10 NVTX.jl — scope the trace instead of eyeballing timestamps

To exclude warm-up/setup from an nsys/ncu trace and label the region under investigation, use
NVTX.jl ranges rather than manually correlating GUI timestamps against source lines:

```julia
using CUDA, NVTX
NVTX.@range "doing X" begin
    # ... code under investigation ...
end
NVTX.@mark "checkpoint"
NVTX.@annotate function foo() ... end
```

Ranges appear as labeled, filterable brackets in the Nsight Systems timeline and as a
filterable region in `CUDA.@profile`'s own `.nvtx` trace field (§5).
