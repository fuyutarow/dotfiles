# Claude Code CLI catalog — verified 2026-07-23

> This snapshot is perishable. Re-run `claude --version`, `claude -p --help`, and the official
> pages before making a load-bearing claim. Durable operating rules live in `../SKILL.md`.

## This installation

| Fact | Observed value | Grade |
|---|---|---|
| binary | `/home/fuyu/.bun/bin/claude` | local command |
| version | `2.1.218` | local command |
| print entrypoint | `claude -p` / `claude --print` | local help + official docs |
| model argument | `--model <alias-or-full-name>`; help examples include `fable`, `opus`, `sonnet` | local help; aliases are not availability proof |

Do not turn this into an account catalog. Claude Code exposes no authoritative static account roster
through the observed CLI surface; exact availability is **PROBE-OVER-ALIAS**.

## Headless contract

| Need | Flags / field | Source of truth |
|---|---|---|
| one prompt then exit | `-p` / `--print` | [headless docs](https://code.claude.com/docs/en/headless) |
| plain answer | `--output-format text` (default) | local help |
| bounded result + metadata | `--output-format json`; answer is `.result` | official headless docs |
| schema-constrained value | `--output-format json --json-schema "$SCHEMA"`; parsed value is `.structured_output` | official headless docs |
| streaming | `--output-format stream-json`; use `--verbose --include-partial-messages` for deltas | official headless docs |
| session correlation | JSON `.session_id`; resume with `--resume` only when continuity is intentional | local help + official headless docs |
| bounded work | `--max-turns N`, `--max-budget-usd AMOUNT`, and a host timeout | local help |
| leave no reusable session | `--no-session-persistence` | local help |

The JSON envelope also reports usage and `total_cost_usd` when available. Preserve fields rather
than assuming every version/account emits the same nested shape; use `jq '{result, session_id,
total_cost_usd, usage}'` for a bounded relay.

## Authority and configuration facts

- `-p` skips the workspace-trust dialog. Only invoke it in a directory whose Claude configuration,
  hooks, and MCP setup are trusted. [CLI reference](https://code.claude.com/docs/en/cli-usage)
- `plan` permits reads and planning; it is the review default. `dontAsk` denies anything outside
  its allow rules/read-only set; `acceptEdits` allows file edits; `auto` uses a classifier;
  `bypassPermissions` approves everything and is isolated-container/VM-only. These are permission
  modes, not an OS sandbox. [permission modes](https://code.claude.com/docs/en/permission-modes)
- `--safe-mode` disables customizations, including project CLAUDE.md, skills, hooks, MCP, plugins,
  commands, and custom agents; use it for clean probes. It retains normal auth/model selection.
  [local help, 2026-07-23]
- `--bare` additionally skips auto-discovery, auto-memory, and OAuth/keychain reads. It is suited
  to reproducible CI, but needs API-key/helper or supported provider authentication and all needed
  context/settings passed explicitly. [local help, 2026-07-23]
- Piped stdin is capped at 10 MB. For larger inputs, place content in a file and reference its path
  in a trusted prompt. [headless docs](https://code.claude.com/docs/en/headless)

## Probe semantics

`bun scripts/probe-models.ts <exact-model-id>` makes one short, paid/quota-consuming call from an
empty temporary CWD with `--safe-mode --permission-mode plan --max-turns 1
--no-session-persistence`. It returns:

| Result | Meaning |
|---|---|
| `AVAILABLE` | exit 0 and a parseable JSON envelope: this account ran that exact identifier now |
| `INCONCLUSIVE` | no availability conclusion — wrong name, auth, account policy, quota/budget, network, CLI error, or malformed output remain possible |
| `FATAL` | local setup error before a model call |

The Bun script uses a small default `--max-budget-usd`; set `CLAUDE_PROBE_MAX_BUDGET_USD` explicitly
when the account's limits differ. A successful probe is a floor, not a recommendation.

## Provenance

| Claim family | Grade |
|---|---|
| installed binary, version, flags, mode choices, safe/bare descriptions | local `claude --version` and `claude -p --help`, 2026-07-23 |
| headless output, schema, stdin-cap behavior | official Claude Code headless documentation, fetched 2026-07-23 |
| permission-mode behavior | official Claude Code permission-mode documentation, fetched 2026-07-23 |
| account model availability, actual cost, output shape on this account | deliberately unasserted until a dated probe is run |
