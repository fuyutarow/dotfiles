# DEVICE-OWNERSHIP package-test template (architecture.md §10.10). Floor only, not a semantic check:
# it cannot see a device chosen through an indirection it does not name, nor a transfer hidden in a
# dependency. Review the §10.10 table for those.
#
# Before including this file, define:
#   DEVICE_OWNERSHIP_STATES::AbstractVector   built owning states, one per device the tests construct
#   DEVICE_OWNERSHIP_FILES::AbstractVector{<:AbstractString}   source files on the device path
#   DEVICE_TRANSFER_BOUNDARIES::Dict{Symbol,Int}   boundary function name => max calls per warmed step
#   DEVICE_BOUNDARY_CALLS::Function   zero-arg; runs ONE warmed hot-path step, returns Dict{Symbol,Int}
#                                     of the boundary calls the package's counters saw in that step
#   DEVICE_OWNERSHIP_RECEIPTS::AbstractVector   run receipts and registered rows (Dict or NamedTuple)

using Test: @test, @testset
import KernelAbstractions as KA

const _TRANSFER_CALLEES = Set{Symbol}((
    :Array, :Vector, :Matrix, :collect, :cu, :CuArray, :CuVector, :CuMatrix, Symbol("@allowscalar"),
))
# Name segments, not substrings: `select_exec`, `GPUExec`, `pick_device` match; `execute_step` does not.
const _DEVICE_CALLEE = r"((^|_)(exec|device|backend)(_|$))|((Exec|Device|Backend)$)"
const _BUDGET_NAME = r"(vram|budget|mem_bytes)"i
const _LOOP_HEADS = (:for, :while, :generator)
const _MAX_STATE_DEPTH = 16

_callee_name(f::Symbol) = f
_callee_name(f::Expr) =
    f.head === :curly ? _callee_name(f.args[1]) :
    f.head === :. && f.args[end] isa QuoteNode ? f.args[end].value : nothing
_callee_name(f::GlobalRef) = f.name
_callee_name(_) = nothing

function _mentions_budget(node)
    node isa Symbol && return occursin(_BUDGET_NAME, String(node))
    node isa QuoteNode && return _mentions_budget(node.value)
    node isa AbstractString && return occursin(_BUDGET_NAME, node)
    node isa Expr || return false
    return any(_mentions_budget, node.args)
end

# `collect(1:n)` / `collect(a:s:b)` builds a host range, not a cross-device copy.
_is_range_collect(node::Expr) =
    length(node.args) == 2 && node.args[2] isa Expr && node.args[2].head === :call &&
    node.args[2].args[1] === :(:)

function _function_name(node::Expr)
    node.head in (:function, :(=)) || return nothing
    signature = node.args[1]
    while signature isa Expr && signature.head in (:where, :(::))
        signature = signature.args[1]
    end
    signature isa Expr && signature.head === :call || return nothing
    return _callee_name(signature.args[1])
end

function _collect_device_violations!(violations, node, path, line, enclosing, in_loop, boundaries)
    node isa Expr || return nothing
    name = _function_name(node)
    inner = name === nothing ? enclosing : name
    loop = name === nothing ? (in_loop || node.head in _LOOP_HEADS) : false

    if node.head in (:call, :macrocall)
        callee = _callee_name(node.args[1])
        where_ = something(inner, :toplevel)
        if callee in _TRANSFER_CALLEES && !(callee === :collect && _is_range_collect(node))
            if !haskey(boundaries, inner)
                push!(violations, "$path:$line: $callee outside a transfer boundary (in $where_)")
            elseif loop
                push!(violations, "$path:$line: $callee inside a loop of boundary $where_ (a boundary is not a loop body)")
            end
        end
        if callee isa Symbol && occursin(_DEVICE_CALLEE, String(callee)) &&
                any(_mentions_budget, node.args[2:end])
            push!(violations, "$path:$line: device selected from a budget value via $callee (in $where_)")
        end
    end

    for child in node.args
        child isa LineNumberNode && (line = child.line; continue)
        _collect_device_violations!(violations, child, path, line, inner, loop, boundaries)
    end
    return nothing
end

function device_source_violations(files, boundaries::AbstractDict{Symbol, <:Integer})
    violations = String[]
    for path in files
        syntax = Meta.parseall(read(path, String); filename = path)
        _collect_device_violations!(violations, syntax, path, 0, nothing, false, boundaries)
    end
    return sort!(unique(violations))
end

function device_count_violations(observed::AbstractDict, declared::AbstractDict{Symbol, <:Integer})
    problems = String[]
    for (name, count) in observed
        limit = get(declared, name, nothing)
        limit === nothing && (push!(problems, "boundary $name was called but is not declared"); continue)
        count <= limit || push!(problems, "boundary $name: $count calls in one warmed step, declared max $limit")
    end
    return problems
end

function _array_leaves!(leaves, problems, x, path, depth)
    if depth > _MAX_STATE_DEPTH
        push!(problems, "$path: deeper than $_MAX_STATE_DEPTH levels, not checked")
        return leaves
    end
    if x isa AbstractArray
        if isbitstype(eltype(x))
            push!(leaves, path => x)
        else
            for (i, element) in enumerate(x)
                _array_leaves!(leaves, problems, element, "$path[$i]", depth + 1)
            end
        end
    elseif x isa Union{Tuple, NamedTuple}
        for (key, value) in pairs(x)
            _array_leaves!(leaves, problems, value, "$path.$key", depth + 1)
        end
    elseif !(x isa Union{Module, Function, Type, AbstractString, Symbol, Number}) &&
            isstructtype(typeof(x)) && fieldcount(typeof(x)) > 0
        for field in fieldnames(typeof(x))
            field === :device && continue
            isdefined(x, field) || continue
            _array_leaves!(leaves, problems, getfield(x, field), "$path.$field", depth + 1)
        end
    end
    return leaves
end

function device_state_violations(state)
    T = typeof(state)
    hasfield(T, :device) || return ["$T: no `device` field"]
    D = fieldtype(T, :device)
    problems = String[]
    isconcretetype(D) && D <: KA.Backend || push!(problems, "$T: device field type $D is not a concrete KA.Backend")
    D in T.parameters || push!(problems, "$T: device type $D is not a type parameter of the state")
    for (path, array) in _array_leaves!(Pair{String, Any}[], problems, state, "state", 0)
        actual = typeof(KA.get_backend(array))
        actual === typeof(state.device) || push!(problems, "$T: $path lives on $actual, state.device is $D")
    end
    return problems
end

function device_receipt_violations(rows)
    problems = String[]
    for (i, row) in enumerate(rows)
        value = row isa NamedTuple ? get(row, :device, nothing) :
            get(row, "device", get(row, :device, nothing))
        value isa Union{AbstractString, Symbol} && !isempty(string(value)) ||
            push!(problems, "receipt $i: no non-empty device field")
    end
    return problems
end

@testset "device ownership (architecture.md §10.10)" begin
    @test !isempty(DEVICE_OWNERSHIP_STATES)
    for state in DEVICE_OWNERSHIP_STATES
        problems = device_state_violations(state)
        isempty(problems) || @error "device state" problems
        @test isempty(problems)
    end
    source = device_source_violations(DEVICE_OWNERSHIP_FILES, DEVICE_TRANSFER_BOUNDARIES)
    isempty(source) || @error "device source" source
    @test isempty(source)
    counts = device_count_violations(DEVICE_BOUNDARY_CALLS(), DEVICE_TRANSFER_BOUNDARIES)
    isempty(counts) || @error "device boundary counts" counts
    @test isempty(counts)
    @test !isempty(DEVICE_OWNERSHIP_RECEIPTS)
    receipts = device_receipt_violations(DEVICE_OWNERSHIP_RECEIPTS)
    isempty(receipts) || @error "device receipts" receipts
    @test isempty(receipts)
end
