# driving-claude — forge & verification ledger

> Initial forge, 2026-07-23. This is the F3 record: what was verified, what was intentionally
> not spent, and the scope decisions signed into the source tree.

## Source and calibration

| Source | Class | Grade | Retained effect |
|---|---|---|---|
| `claude --version` and `claude -p --help` on this host | live local command | author-confirmed | exact supported flags, version, safe/bare behavior go to the dated catalog |
| Claude Code headless, CLI, and permission-mode docs | official documentation, fetched 2026-07-23 | primary | D1/D2/D3 rules and JSON semantics |
| existing `driving-codex`, `driving-antigravity`, `driving-grok` | house production skills | author-confirmed local source | subprocess framing, probe asymmetry, bounded relay, reciprocal cuts |
| existing `operating-the-harness` | house source | author-confirmed local source | configuration-vs-invocation PURPOSE cut |

**Calibration:** the default failure is to treat a familiar interactive CLI as a harmless child
process. The skill therefore leads with `-p` trust skipping and
**PERMISSIONS-NOT-CONTAINMENT**, rather than a happy-path command.

## F2 placement

- New skill owns Codex → `claude -p` invocation, permission choice, bounded JSON relay, and model
  probe.
- `operating-the-harness` owns configuration/CI topology and has a reciprocal pointer in its
  description, scope, and headless reference.
- The three sibling drivers have reciprocal binary cuts in both routing and no-fire tables.
- `driving-claude` is the intentional naming exception: it remains in `agents/skills` for Codex's
  whole-tree link, while `mise run link:skills` explicitly excludes only its Claude destination.

## Verification results

| Check | Result |
|---|---|
| build-order command | **PASS** — all three required artifacts present |
| `bun test tests` | **PASS** — runner envelope, host timeout, probe classification, and absent optional schema fields |
| CLI option schema | **PASS** — `node:util.parseArgs` rejects an unknown flag and the fixture-backed `run-claude.ts` invocation returns a bounded JSON relay |
| `skill-check.ts driving-claude` | **PASS**; the special name is accepted and all structural checks pass |
| strict YAML parse (`quick_validate.py`) | **PASS** |
| probe script non-billed paths | superseded by the Bun test fixture after this migration |
| reserved-name regression fixture | **PASS** — temporary `accidental-claude` fixture failed with the reserved-name error; fixture removed |
| `mise run link:skills` destination checks | **PASS** — `~/.agents/skills` → source tree and contains `driving-claude`; `~/.claude/skills/driving-claude` is absent |
| Markdown and TypeScript checks | **PASS** — `mise run lint:md`, Biome formatting, and `bun build` over every skill script |
| Skills index | **BLOCKED by pre-existing debt** — current index omits `acting-as-director` and `optimizing-julia-gpu-kernels`; the new `driving-claude` entry is present |
| trigger desk-check | **PASS** — rows below were checked against the updated sibling descriptions and cuts |

### Live probe waiver

No live `claude -p` model probe is run during this forge: it consumes account quota / may incur
API-equivalent spend, while the implementation can be tested structurally without doing so. The
skill makes no account-availability, cost, or live-envelope claim. Run
`bun scripts/probe-models.ts <exact-id>` when that spend is authorized; append its raw `RESULT:` line
on the next reforge.

## Trigger desk-check

| Ask | Expected owner |
|---|---|
| 「Codexから claude -p を実行してレビューして」 | driving-claude |
| "How should Codex parse Claude's JSON response?" | driving-claude |
| 「この Claude モデルが今使えるか probe して」 | driving-claude |
| "Claude headless permission prompt aborted" | driving-claude |
| "Run a Sonnet cross-model audit from Codex" | driving-claude |
| 「CLAUDE.md と hooks を設定して」 | operating-the-harness |
| "Use codex exec for a GPT review" | driving-codex |
| "Use agy -p to ask Gemini" | driving-antigravity |
| "Use grok -p as an xAI reviewer" | driving-grok |
| "Which Anthropic API model is cheapest?" | claude-api / model-native |
| "Improve this Claude prompt" | prompting-llms |
| "What is Claude Code?" | no skill |

## Adversarial audit checklist

- **Safety:** examples use `plan`; no example smuggles a bypass flag or assumes a permission mode
  is containment.
- **Injection:** task text is bound through a file/quoted argument; relay labels model text as
  data.
- **Durability:** account model names and prices are absent from SKILL.md; fast facts have one home
  in the dated catalog.
- **Packaging:** only the named driver is excluded from Claude's per-skill symlink loop; plugins
  and ordinary house skills remain untouched.
