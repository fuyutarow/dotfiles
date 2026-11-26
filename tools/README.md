# Tools

Each directory here is one tool. A tool may **opt in** to a declaration, `tools/<name>/tool.toml`;
every hand-written list about it elsewhere is then compared with that file by
`mise run lint:tool-declarations` (part of `lint`, so `gate:land`). Only `smart-copy` is migrated;
the other tools keep working unchanged and are counted by a ratchet.

## `tool.toml` fields

| Field | Meaning | Read by |
|---|---|---|
| `name` | Directory name; key of the tool's README row | check |
| `kind` | `A` or `B` — README "Kind" column | check: row Kind equals it |
| `purpose` | One line — README "Reason" column | check: row Reason equals it |
| `bins` | PATH command → entry file, relative to the tool | check: root and tool `package.json` `bin` carry exactly these; every bin has a README row |
| `shell` | Optional zsh fragment, relative to the tool | check: file exists and is in `config/zsh/aliases.zsh` `TOOL_SHELL_FRAGMENTS`; `lint:zsh` parses it |
| `consumers` | Repo files that call the tool | check: each exists and mentions a bin or a function the fragment defines |
| `probes.<p>.file`, `.task` | A live probe and the mise task that runs it | check: file exists, task runs `scripts/tool-probe.ts <name> <p>`; `tool-probe` and `doctor` find the probe here |

Unknown fields are rejected: a field exists only because some check or generator reads it.

## Derived and checked

- **Derived** (nobody writes the fact twice): the fragment files `lint:zsh` parses; the probe file
  `mise run doctor:clipboard` runs (through `scripts/tool-probe.ts`); the bins and probe tasks
  `mise run doctor` names for `smart-copy`.
- **Checked** (written by hand elsewhere, compared with the declaration): root `package.json` `bin`,
  the tool's `package.json` `bin`, the README tool-table row, `scripts/config-registry.ts` sources,
  the `TOOL_SHELL_FRAGMENTS` list, the mise probe task, and `consumers`.
- **Undeclared files:** a `*.zsh` file or `src/doctor-*.ts` under the tool that `tool.toml` does not
  name fails the check.
- **Not covered** (per-tool coverage lists owned by their linters, outside this slice): the
  `scripts/lint-bun.ts` patterns and the Cleye CLI list in `writing-bun-scripts` tests; README
  prose (architecture tree, setup text) is human-facing and not a list. `consumers` is checked one
  way: a declared caller must exist, but callers nobody declared are not discovered.

## Ratchet

`scripts/lint/tool-declarations-baseline.txt` lists the tools without `tool.toml` (20 now). A tool outside
the list without a declaration fails; a listed tool that has declared itself fails until its line is
deleted, so the count only shrinks. To migrate a tool: add its `tool.toml`, delete its baseline line,
and fix whatever the check names.
