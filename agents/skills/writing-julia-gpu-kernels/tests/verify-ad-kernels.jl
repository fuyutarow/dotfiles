# verify-ad-kernels.jl — GK3-AD live verification script (forge artifact, 2026-07-22)
#
# Ran at forge time on an RTX 3060 (CUDA.jl 6.2.1 / Zygote 0.7.11 / ChainRulesCore 1.26.1 /
# Julia 1.12.6): all parts passed. Backs differentiating-kernels.md §1/§3/§5/§6/§8 and
# forge-verification-ledger.md provenance step 3.
#
# Run in any project env providing: CUDA, ChainRulesCore, Zygote, ForwardDiff, Test
#   julia --project=<env> verify-ad-kernels.jl
# Parts: 0 failure-mode claims · A elementwise kernel+rrule vs Zygote-CPU oracle ·
#        B SSM scan kernel+rrule vs ForwardDiff-CPU oracle · C accumulate/cumsum AD-gap claims

using CUDA, ChainRulesCore, Zygote, Test, Random, ForwardDiff
Random.seed!(0)

println("="^60)
println("PART 0: confirm the FAILURE MODE claims")
println("="^60)

# 0a. Zygote cannot differentiate a mutating in-place CuArray op
function mutate_bad!(x)
    x .= 2 .* x
    return x
end
try
    Zygote.gradient(x -> sum(mutate_bad!(x)), CUDA.rand(Float32, 8))
    println("0a: UNEXPECTED - no error thrown")
catch e
    println("0a: got error of type ", typeof(e))
    println("    message: ", sprint(showerror, e)[1:min(200,end)])
end

# 0b. scalar getindex on CuArray (forward pass, not even AD yet)
try
    x = CUDA.rand(Float32, 8)
    x[1]
    println("0b: UNEXPECTED - no error thrown for scalar getindex")
catch e
    println("0b: got error of type ", typeof(e))
    println("    message: ", sprint(showerror, e)[1:min(200,end)])
end

# 0a2: direct setindex! mutation on CuArray (not broadcast-fused) -- the "textbook" path
function mutate_bad2!(x)
    for i in eachindex(x)
        x[i] = 2 * x[i]
    end
    return x
end
try
    Zygote.gradient(x -> sum(mutate_bad2!(x)), CUDA.rand(Float32, 8))
    println("0a2: UNEXPECTED - no error thrown")
catch e
    println("0a2: got error of type ", typeof(e))
    println("    message: ", sprint(showerror, e)[1:min(300,end)])
end

println()
println("="^60)
println("PART A: fused elementwise kernel  y = a .* x.^2  + rrule")
println("="^60)

function _scaled_square_kernel!(y, a, x)
    i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    if i <= length(y)
        @inbounds y[i] = a[i] * x[i]^2
    end
    return nothing
end

function scaled_square(a::CuArray{T}, x::CuArray{T}) where {T}
    y = similar(x)
    n = length(x)
    kernel = @cuda launch=false _scaled_square_kernel!(y, a, x)
    config = launch_configuration(kernel.fun)
    threads = min(n, config.threads)
    blocks = cld(n, threads)
    kernel(y, a, x; threads=threads, blocks=blocks)
    return y
end

function _scaled_square_grad_kernel!(da, dx, dy, a, x)
    i = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    if i <= length(dy)
        @inbounds begin
            xi = x[i]
            da[i] = dy[i] * xi^2
            dx[i] = dy[i] * 2 * a[i] * xi
        end
    end
    return nothing
end

function scaled_square_grad(dy::CuArray{T}, a::CuArray{T}, x::CuArray{T}) where {T}
    da = similar(a)
    dx = similar(x)
    n = length(x)
    kernel = @cuda launch=false _scaled_square_grad_kernel!(da, dx, dy, a, x)
    config = launch_configuration(kernel.fun)
    threads = min(n, config.threads)
    blocks = cld(n, threads)
    kernel(da, dx, dy, a, x; threads=threads, blocks=blocks)
    return da, dx
end

function ChainRulesCore.rrule(::typeof(scaled_square), a::CuArray, x::CuArray)
    y = scaled_square(a, x)
    project_a = ProjectTo(a)
    project_x = ProjectTo(x)
    function scaled_square_pullback(ybar)
        dy = unthunk(ybar)
        da, dx = scaled_square_grad(dy, a, x)
        return (NoTangent(), project_a(da), project_x(dx))
    end
    return y, scaled_square_pullback
end

# forward correctness
a_cpu = rand(Float32, 100)
x_cpu = rand(Float32, 100) .+ 0.1f0
a_gpu = CuArray(a_cpu); x_gpu = CuArray(x_cpu)
y_gpu = scaled_square(a_gpu, x_gpu)
y_ref = a_cpu .* x_cpu .^ 2
println("A forward max abs err: ", maximum(abs.(Array(y_gpu) .- y_ref)))

# gradient correctness: compare against Zygote on an equivalent PURE JULIA (no custom rrule)
# CPU reference function -- this is independently differentiated by Zygote's normal IR AD,
# so it is a trustworthy oracle for the hand-written rrule's math.
ref_fn(a, x) = sum(a .* x .^ 2)
gref_a, gref_x = Zygote.gradient(ref_fn, a_cpu, x_cpu)

gpu_fn(a, x) = sum(scaled_square(a, x))
ggpu_a, ggpu_x = Zygote.gradient(gpu_fn, a_gpu, x_gpu)

println("A grad da max abs err: ", maximum(abs.(Array(ggpu_a) .- gref_a)))
println("A grad dx max abs err: ", maximum(abs.(Array(ggpu_x) .- gref_x)))
@test maximum(abs.(Array(ggpu_a) .- gref_a)) < 1f-4
@test maximum(abs.(Array(ggpu_x) .- gref_x)) < 1f-4
println("PART A: PASSED")

println()
println("="^60)
println("PART B: diagonal-recurrence SSM scan kernel h_t = a.*h_{t-1} + x_t")
println("="^60)

function _ssm_forward_kernel!(h, a, x, Tlen, F, B)
    f = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    b = blockIdx().y
    if f <= F && b <= B
        @inbounds begin
            hprev = zero(eltype(h))
            af = a[f]
            for t in 1:Tlen
                hprev = af * hprev + x[f, t, b]
                h[f, t, b] = hprev
            end
        end
    end
    return nothing
end

function ssm_forward(a::CuVector{T}, x::CuArray{T,3}) where {T}
    F, Tlen, B = size(x)
    h = similar(x)
    threads = min(F, 256)
    blocks = (cld(F, threads), B)
    @cuda threads=threads blocks=blocks _ssm_forward_kernel!(h, a, x, Tlen, F, B)
    return h
end

function _ssm_backward_kernel!(dx, da_partial, a, h, x, dy, Tlen, F, B)
    f = (blockIdx().x - 1) * blockDim().x + threadIdx().x
    b = blockIdx().y
    if f <= F && b <= B
        @inbounds begin
            af = a[f]
            dhnext = zero(eltype(dx))
            dacc = zero(eltype(dx))
            for t in Tlen:-1:1
                dh = dy[f, t, b] + af * dhnext
                hprev = t == 1 ? zero(eltype(h)) : h[f, t-1, b]
                dacc += dh * hprev
                dx[f, t, b] = dh
                dhnext = dh
            end
            da_partial[f, b] = dacc
        end
    end
    return nothing
end

function ssm_backward(dy::CuArray{T,3}, a::CuVector{T}, h::CuArray{T,3}, x::CuArray{T,3}) where {T}
    F, Tlen, B = size(x)
    dx = similar(x)
    da_partial = CUDA.zeros(T, F, B)
    threads = min(F, 256)
    blocks = (cld(F, threads), B)
    @cuda threads=threads blocks=blocks _ssm_backward_kernel!(dx, da_partial, a, h, x, dy, Tlen, F, B)
    da = vec(sum(da_partial; dims=2))
    return da, dx
end

function ChainRulesCore.rrule(::typeof(ssm_forward), a::CuVector, x::CuArray{<:Any,3})
    h = ssm_forward(a, x)
    project_a = ProjectTo(a)
    project_x = ProjectTo(x)
    function ssm_forward_pullback(hbar)
        dy = unthunk(hbar)
        da, dx = ssm_backward(dy, a, h, x)
        return (NoTangent(), project_a(da), project_x(dx))
    end
    return h, ssm_forward_pullback
end

F, Tlen, B = 16, 12, 4
a_cpu2 = 0.5f0 .* rand(Float32, F) .+ 0.1f0   # keep |a|<1ish
x_cpu2 = rand(Float32, F, Tlen, B)
a_gpu2 = CuArray(a_cpu2); x_gpu2 = CuArray(x_cpu2)

# forward correctness vs a plain Julia recurrence
function ssm_forward_ref(a, x)
    F, Tlen, B = size(x)
    T = promote_type(eltype(a), eltype(x))   # ForwardDiff.Dual-safe: never hardcode Float32
    h = similar(x, T)
    for b in 1:B, f in 1:F
        hprev = zero(T)
        for t in 1:Tlen
            hprev = a[f] * hprev + x[f, t, b]
            h[f, t, b] = hprev
        end
    end
    return h
end

h_gpu = ssm_forward(a_gpu2, x_gpu2)
h_ref = ssm_forward_ref(a_cpu2, x_cpu2)
println("B forward max abs err: ", maximum(abs.(Array(h_gpu) .- h_ref)))

lossref(a, x) = sum(ssm_forward_ref(a, x))
# NOTE: Zygote itself cannot differentiate ssm_forward_ref (it mutates `h` in place --
# this IS the textbook "Mutating arrays is not supported" case). Use ForwardDiff
# (operator-overloading AD, immune to the mutation restriction) as the independent CPU
# oracle instead -- exactly the workaround Zygote's own docs recommend.
gref_a2 = ForwardDiff.gradient(a -> lossref(a, x_cpu2), a_cpu2)
gref_x2 = ForwardDiff.gradient(xvec -> lossref(a_cpu2, reshape(xvec, size(x_cpu2))), vec(x_cpu2))
gref_x2 = reshape(gref_x2, size(x_cpu2))

lossgpu(a, x) = sum(ssm_forward(a, x))
ggpu_a2, ggpu_x2 = Zygote.gradient(lossgpu, a_gpu2, x_gpu2)

println("B grad da max abs err: ", maximum(abs.(Array(ggpu_a2) .- gref_a2)))
println("B grad dx max abs err: ", maximum(abs.(Array(ggpu_x2) .- gref_x2)))
@test maximum(abs.(Array(ggpu_a2) .- gref_a2)) < 1f-3
@test maximum(abs.(Array(ggpu_x2) .- gref_x2)) < 1f-3
println("PART B: PASSED")

println()
println("="^60)
println("PART C: confirm accumulate(op, ::CuArray; dims) AD gap claim")
println("="^60)
try
    xg = CUDA.rand(Float32, 4, 5)
    Zygote.gradient(z -> sum(accumulate(+, z; dims=2)), xg)
    println("C: accumulate(+, CuArray; dims=2) DID differentiate (no error)")
catch e
    println("C: got error of type ", typeof(e))
    println("    message: ", sprint(showerror, e)[1:min(300,end)])
end

try
    xg = CUDA.rand(Float32, 4, 5)
    Zygote.gradient(z -> sum(accumulate(*, z; dims=2)), xg)
    println("C2: accumulate(*, CuArray; dims=2) DID differentiate (no error)")
catch e
    println("C2: got error of type ", typeof(e))
    println("    message: ", sprint(showerror, e)[1:min(300,end)])
end

try
    xg = CUDA.rand(Float32, 4, 5)
    Zygote.gradient(z -> sum(cumsum(z; dims=2)), xg)
    println("C3: cumsum(CuArray; dims=2) DID differentiate (no error) -- expected to work")
catch e
    println("C3: got error of type ", typeof(e))
    println("    message: ", sprint(showerror, e)[1:min(300,end)])
end

println("DONE")
