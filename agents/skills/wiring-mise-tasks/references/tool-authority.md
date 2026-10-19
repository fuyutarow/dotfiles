# Split tasks and literal tool authority

Read when adopting split tasks or designing a repository-owned tool checker.
Version v2610.6.0 records the checker's copy-out contract: consumers keep the checker source under
their own `tools/` and update that copy only by an explicit pull.

Task names and aliases still come from the actual `mise tasks ls --json` result.
Bodies come from parsed TOML: root `[tasks.*]`, `mise/tasks/**/*.toml`, and files,
directories or globs in `task_config.includes`. Split files use `[task-name]` tables.
String and array `run` values both count. The existing body-length/control-flow rules
and runtime census apply to all these bodies, including overridden definitions.
The census counts run entries per runtime; array entries count separately.

Default mode preserves the existing verb, body and house-pin policy. Its runtime
census now includes Go, Python/pip, Ruby/gem/bundle, Java/javac, Elixir/mix, dotnet,
PHP, Perl, Lua, Zig and Rscript as well as the original six runtime families.
For arbitrary command names and commands spawned inside scripts, enable `--tools`.
Dotfiles uses the default mode: its host tooling has separate Brewfile authority.

```sh
bun tools/mise-contract.ts --tools .
```

Tool mode audits root/split task run bodies, split task Tera `exec(command=...)`,
root package scripts and JS/TS source files throughout the repository, including tests.
It skips `node_modules`, `.git`, `.jj`, `.state` and symlink traversal.
It does not run any task or source body. Root task discovery invokes mise's listing API;
use `checkTools(root, policy)` for a tool-only audit without that subprocess.

Authority comes from `[tools]` names (backend prefixes reduce to the final basename),
plus cargo/rustc for Rust, python3 for Python, uvx for uv and bunx for Bun.
Root package dependencies and devDependencies contribute their declared bin names only
when an exact version matches both the root workspace and package entry in `bun.lock`.
The text lock is read as JSONC. A duplicate bin authority fails.
The built-in OS exemption is deliberately small: sh, env, cd, exit, echo, printf,
true, false, mkdir, rm, cp, test and `:`. Mise itself is always allowed.
`bun x`/`bunx` must use `--no-install` and name an authorized bin.

Each optional policy flag enables tool mode. These are choices for the consuming
repository, not global house requirements:

| Flag / `ToolPolicy` field | Requirement |
|---|---|
| `--task-directory mise/tasks` / `taskDirectory` | No root tasks; includes must be exactly this one directory |
| `--require-pinned` / `requirePinned` | Tool versions must be numeric major.minor or major.minor.patch |
| `--require-npm-lock` / `requireNpmLock` | All root npm dependencies must have exact matching locks; npm-backed mise tools fail |
| `--require-aggressive` / `requireAggressive` | `settings.activate_aggressive = true` |
| `--require-min-version` / `requireMinVersion` | A YYYY.M.D-shaped `min_version` |

Coralbase wave-a's tool policy maps to:

```sh
bun tools/mise-contract.ts --tools --task-directory mise/tasks --require-pinned \
  --require-npm-lock --require-aggressive --require-min-version .
```

The importable `checkTools(root, policy)` returns finding strings. CLI mode prints
one hard finding per returned string; the final count includes existing contract
failures too. Exit codes remain 0 clean (warnings allowed), 1 violations, 2 environment.
Add a consumer-specific forbidden-package policy when aliases are part of its contract; inspect
both `package.json` and the lockfile so a stale lock cannot preserve a removed alias.

## Static coverage and reference differences

The generic shell inspection is ported from coralbase's `scripts/tools-contract.ts`.
It handles command substitutions, pipelines, assignments, env/fnox wrappers, shell
`-c` bodies, and literal npm runners. Quoted JavaScript/JSON stays argument data.
This is a bounded static audit, not a complete shell interpreter.

JS/TS inspection uses a dependency-free lexer to recognize literal spawn/which,
child_process exec/execFile calls, Bun cmd objects and shell tagged templates.
Comments, strings and regex literals are data. Like the reference, aliases,
function arguments and imported/computed command names are outside coverage.
Unlike its TypeScript AST, the lexer does not inspect commands nested inside
JavaScript template interpolations; regex-versus-division recognition is lexical,
and binding/type information is not resolved. It also does not inspect Python,
Rust or other language source, executable task files, or nested package manifests.
For those surfaces use the consuming language's checks. Do not interpret a clean
result as proof about dynamic commands.

Intentional generalizations: root task run bodies and arbitrary TOML includes are
inspected even without the directory restriction; locked runtime dependencies are
accepted alongside devDependencies; common runtime executable aliases are accepted.
The full CLI retains verb/body/house-pin rules that coralbase's tool-only audit lacks.
Invalid npm locks deliberately grant no bin authority: coralbase reports the lock error but still adds its bin names, while this checker also reports each use of the unauthorized bin. The verdict is FAIL in both; finding counts can therefore differ.
Malformed input can be an environment failure at the CLI boundary rather than a
coralbase finding string. Compare the tool-only APIs when comparing finding counts.

Regression fixtures live in `tests/mise-contract-tools.test.ts`; they create all
repository data under the OS temporary directory. The release comparison uses a
read-only-source copy of wave-a under `/tmp`, with mutations confined to that copy.
