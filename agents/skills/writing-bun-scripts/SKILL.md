---
name: writing-bun-scripts
description: >-
  Writes Bun TypeScript scripts, hooks and CLIs; migrates Bash. PATH commands use package bin and bun link; hooks have no npm deps; resolve files via import.meta.dir. Pin one-shots with bunx package@version, permanent deps in the lockfile; freeze CLI, output and exits before migration. Use for skill scripts. CLI protocol → designing-cli-contracts; TypeScript idiom → writing-typescript; task graph → wiring-mise-tasks.
---

# Writing Bun scripts

> **Version**: v2610.2.0 (2026-10-30) — principle-first distillation.

PATH commands use package bin and `bun link`; hooks have no npm dependencies. Resolve script-owned
files via `import.meta.dir`. Pin one-shot tools with `bunx package@version` and permanent
dependencies in the lockfile. Freeze CLI, output and exit contracts before shell migration.
Use bounded Bun primitives and evidence suited to the behavior claimed; a successful run alone
does not prove type safety.

## Runtime and distribution

New local scripts are Bun TypeScript, invoked as `bun <path>`; resolve script-owned paths from
`import.meta.dir`, not cwd. Keep Bash only for bootstrap before Bun exists, hook entry, an exec
wrapper of at most ten lines, or externally regenerated vendor shell. A conditional, loop or
JSON access signals migration to TypeScript. Check bootstrap callers for actual ordering;
identify vendor shell by its own vendor header, which survives regeneration. Mark other shims
`# shim: <bootstrap|hook-entry|exec-wrapper>`.

Scripts have no shebang. A PATH binary is a package `bin` entry linked by `bun link`, with
shebang and executable mode; test fixture binaries may also have shebangs. Do not create manual
`.ts` PATH symlinks. Freeze a shell script's CLI, output and exit contract before migration.
Repo tool release intent belongs to the changeset task in the repository instructions.
Guard a dual-use script's entry with `import.meta.main`. Keep skill packages self-contained:
do not import helpers across skill directories; reduce duplication with native options.

## Dependencies and argv

Prefer builtins and Bun globals, then a lockfile-backed project with exact dependencies; use
`bunx package@version` for a pinned one-shot JS tool. In dotfiles the graduation project is
root `package.json` and `bun.lock`. Inline version imports are only for throwaway invocations
from a known clean cwd: ancestor `node_modules` changes resolution. Pin a tool and its plugins
together in a project when isolated bunx cannot find those plugins. Distributed zero-dep trees
and hooks stay independent of npm; in zero-dep scripts use local narrowing instead of adding
zod or ts-pattern, until graduation. See `writing-typescript` for TS idiom.

For ordinary argv boundaries use Cleye `cli` and `command`, with the exact Cleye version in the
root manifest and lockfile. Use framework help and `parameters`; do not hand-parse argv or use
`parseArgs`. Each `cli` and `command` declares `strictFlags: true`, `parameters`, and
`ignoreArgv: rejectPrototypeFlag`; the latter is not inherited by commands. A direct `typeFlag`
call is only for `// argv-forwarding: <consumer>`: parse a copy, preserve its `unknownFlags`
invariant, and relay the original tokens in order including `--`.

The existing house consumer contract distinguishes Cleye usage exit 1 from local fatal exit 2
by stderr; declare whether the script emits a single-line machine JSON envelope or human/agent
verdict lines. For reusable CLI protocol, defaults, compatibility, and interaction decisions use
`designing-cli-contracts`. Parser use is the conditional default for ordinary CLI
arguments ([CLIG basics](https://clig.dev/#the-basics)).
Preserve the existing domain exits 0/1/2; report caught fatal errors on stderr with exit 2,
and set process exit state at the entry boundary. An error envelope must exit nonzero.

## Processes and hooks

For Bun Shell interpolation use escaped values; use `{ raw: ... }` only when raw shell syntax
is intended. Await side-effecting operations separately. Use `Bun.$` only when the child cannot
hang; otherwise use `Bun.spawn` with native timeout/killSignal and an
`AbortSignal.timeout(ms)`. Determine timeout from the signal's `aborted` state, not `proc.killed`
or `signalCode`. Drain stdout, stderr and `exited` concurrently in one `Promise.all`; bound
relayed output. See [Bun facts](references/bun-facts.md) for the measured failure modes.
Prefer Bun's native primitives to a hand-rolled equivalent when they meet the need.

Hook bodies use synchronous main and `spawnSync`, with only `node:`/`bun:` imports and Bun
globals; declare fail-open or fail-closed in the header. Hook event and matcher configuration
belongs to its declared owner. Avoid hand-drawn carriage-return progress bars: they wrapped in
narrow panes. When interactive behavior is needed, follow the CLI owner's conditional defaults
([CLIG interactivity](https://clig.dev/#interactivity)).

## Workspace boundaries and verification

For Bun workspaces enforce package boundaries and cycles, including devDependencies, on the
dependency graph. Ancestor `node_modules` can invalidate a boundary test based on resolution
alone. In coralbase, package `imports` targets outside their owning package and workspace cycles
were observed as hazards; these observations are not confirmed Bun documentation.

Run `script-check <file.ts ...>` on changed
scripts. This floor is structural, not proof of behavior. Test relevant behavior with `bun test`;
for child-process failures use a real fixture executable. Check that a new gate rejects bad input.
For structure-only refactors also use `refactoring-code`; task graph changes belong to
`wiring-mise-tasks`. Preserve contracts and use evidence specific to the claim.
For a verification verdict, record the command and its output.

## Selection cases

| Ask | Route |
|---|---|
| Convert a local Bash script to Bun TS | Here; check bootstrap callers |
| Refactor existing skill scripts | Here and `refactoring-code` |
| Add a hook detector | Here for the body; inspect the event/matcher owner |
| Add a mise task | `wiring-mise-tasks`; here if writing its script |
| Design a reusable CLI protocol | `designing-cli-contracts` |

These are desk-review cases, not measured selection accuracy. Historical evidence and triage
mapping are in `tests/forge-verification-ledger.md`.
