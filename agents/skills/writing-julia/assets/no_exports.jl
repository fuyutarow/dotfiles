# ZERO-EXPORTS package-test template.
#
# Before including this file, define:
#   ZERO_EXPORTS_PACKAGE::Module
#   ZERO_EXPORTS_PUBLIC_APIS::AbstractDict{Module, Set{Symbol}}
#   ZERO_EXPORTS_EXTENSIONS::Tuple{Vararg{Symbol}}
#
# Load every extension trigger first. Each named extension must then exist; absence is a failure.

using Test: @test, @testset
import ExplicitImports
import TOML

function _contains_reexport(node)
    node === Symbol("@reexport") && return true
    node isa QuoteNode && return _contains_reexport(node.value)
    node isa GlobalRef && return node.name === Symbol("@reexport")
    node isa Expr || return false
    return any(_contains_reexport, node.args)
end

function _collect_source_violations!(violations, node, path)
    node isa Expr || return nothing

    if node.head === :export
        push!(violations, "$path: export")
    elseif node.head === :macrocall && _contains_reexport(node.args[1])
        push!(violations, "$path: @reexport")
    elseif node.head === :using
        for imported in node.args
            imported isa Expr && imported.head === Symbol(":") && continue
            push!(violations, "$path: bare using")
        end
    end

    foreach(child -> _collect_source_violations!(violations, child, path), node.args)
    return nothing
end

function _source_violations(package::Module)
    violations = String[]
    root = pkgdir(package)

    for source_dir in (joinpath(root, "src"), joinpath(root, "ext"))
        isdir(source_dir) || continue
        for (dir, _, files) in walkdir(source_dir)
            for file in sort!(filter(name -> endswith(name, ".jl"), files))
                path = joinpath(dir, file)
                source = "begin\n" * read(path, String) * "\nend"
                syntax = Meta.parse(source)
                _collect_source_violations!(violations, syntax, path)
            end
        end
    end

    return sort!(unique(violations))
end

function _owned_child_modules(mod::Module)
    children = Module[]

    for name in unique(names(mod; all=true, imported=false))
        isdefined(mod, name) || continue
        value = getfield(mod, name)
        value isa Module || continue
        parentmodule(value) === mod || continue
        push!(children, value)
    end

    return children
end

function _assert_zero_exports(roots::Module...)
    seen = IdDict{Module, Nothing}()

    function visit(mod::Module)
        haskey(seen, mod) && return nothing
        seen[mod] = nothing

        exported = sort!(
            unique(filter(
                name -> name != nameof(mod) && Base.isexported(mod, name),
                names(mod; all=true, imported=true),
            ));
            by=String,
        )
        if !isempty(exported)
            @error "forbidden exports" module_name=fullname(mod) symbols=exported
        end
        @test isempty(exported)

        foreach(visit, _owned_child_modules(mod))
        return nothing
    end

    foreach(visit, roots)
    return collect(keys(seen))
end

function _declared_public_names(mod::Module)
    return Set(
        name for name in unique(names(mod; all=true, imported=false))
        if name != nameof(mod) && Base.ispublic(mod, name)
    )
end

@testset "ZERO EXPORTS" begin
    source_violations = _source_violations(ZERO_EXPORTS_PACKAGE)
    if !isempty(source_violations)
        @error "forbidden namespace syntax" violations=source_violations
    end
    @test isempty(source_violations)

    project = TOML.parsefile(joinpath(pkgdir(ZERO_EXPORTS_PACKAGE), "Project.toml"))
    compatibility = get(project, "compat", Dict{String, Any}())
    @test get(compatibility, "julia", nothing) == "1.11"

    for section in ("deps", "weakdeps", "extras")
        dependencies = get(project, section, Dict{String, Any}())
        @test !haskey(dependencies, "Reexport")
        @test !haskey(dependencies, "Requires")
    end

    declared_extensions = Set(Symbol.(keys(get(
        project, "extensions", Dict{String, Any}(),
    ))))
    @test Set{Symbol}(ZERO_EXPORTS_EXTENSIONS) == declared_extensions

    roots = Module[ZERO_EXPORTS_PACKAGE]

    for extension_name in ZERO_EXPORTS_EXTENSIONS
        extension = Base.get_extension(ZERO_EXPORTS_PACKAGE, extension_name)
        @test extension !== nothing
        extension === nothing || push!(roots, extension)
    end

    authored_modules = _assert_zero_exports(roots...)
    @test all(module_key -> module_key in authored_modules, keys(ZERO_EXPORTS_PUBLIC_APIS))

    for mod in authored_modules
        declared_public = _declared_public_names(mod)
        undefined_public = filter(
            name -> !isdefined(mod, name),
            collect(declared_public),
        )
        @test isempty(undefined_public)
        @test declared_public == get(ZERO_EXPORTS_PUBLIC_APIS, mod, Set{Symbol}())
    end
end

@testset "strict explicit imports" begin
    ExplicitImports.test_no_implicit_imports(
        ZERO_EXPORTS_PACKAGE; skip=(Base, Core),
    )
    ExplicitImports.test_no_stale_explicit_imports(ZERO_EXPORTS_PACKAGE)
    ExplicitImports.test_all_explicit_imports_via_owners(
        ZERO_EXPORTS_PACKAGE;
        skip=(),
        allow_internal_imports=false,
        require_submodule_import=true,
    )
    ExplicitImports.test_all_explicit_imports_are_public(
        ZERO_EXPORTS_PACKAGE; skip=(), allow_internal_imports=false,
    )
    ExplicitImports.test_all_qualified_accesses_via_owners(
        ZERO_EXPORTS_PACKAGE;
        skip=(),
        allow_internal_accesses=false,
        require_submodule_access=true,
    )
    ExplicitImports.test_all_qualified_accesses_are_public(
        ZERO_EXPORTS_PACKAGE; skip=(), allow_internal_accesses=false,
    )
    ExplicitImports.test_no_self_qualified_accesses(ZERO_EXPORTS_PACKAGE)
end
