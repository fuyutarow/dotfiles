# Project policy migration evidence — 2026-10-21

The proposition is that root `AGENTS.md` can be the maintained project policy and root
`CLAUDE.md` can be removed without losing current required rules. This patch is private;
publication remains conditional on the coordinator's actual Claude load-path readback.

## Migration traceability

| Old root CLAUDE section | Maintained destination |
| --- | --- |
| Introduction and README authority | AGENTS: authority; README: Architecture and Design rationale |
| Development Environment | AGENTS: portability and managed toolchains; README: Setup details |
| Architecture conventions 1–3 | AGENTS: topic ownership, registry, deployment and consumer ownership |
| Architecture conventions 4–7 | AGENTS: shell/runtime rules, toolchain scope, one-writer flow |
| Architecture convention 8 | AGENTS: skill naming and distribution |
| Setup / Tasks | AGENTS: task and verification rules; README: Setup and Tasks; mise declarations |
| Key Tools & Aliases | AGENTS: recoverable removal; README and zsh declarations for alias inventory |
| Git → jj | AGENTS: publication through jj/mise, English messages, alpha bookmark |
| Safety Rules | AGENTS: file safety, terminal repair, portable clipboard, workload ownership |
| Notes for Claude | AGENTS: portable edits, task discovery, language; topic declarations for UI details |

## Removed stale claims and retained boundaries

- Remove AGENTS' delegation to root CLAUDE and README's two project-policy authorities.
- Remove fixed dispatch-roster assumptions; use ordinary agx ticket/capability selection.
- Correct the old claim that shared jj policy links to tool-owned user `config.toml`:
  the declaration belongs at `conf.d/dotfiles.toml` beside that real file.
- Keep skills as installed copies through `skills:sync`; commands and Codex guidance are
  linked by `agents:link`. Do not restore retired task aliases or retired harness skills.
- Keep global `agents/claude/CLAUDE.md` and deployed `~/.claude/CLAUDE.md` separate from
  the removed repository-root policy. They are outside this migration's deletion scope.
- Do not copy machine status, dated measurements, alias inventories or installer histories
  into maintained policy. Their descriptive homes are README and declared configuration.

## Completion and remaining callers

Root AGENTS now owns the operational rules; README links to it as the single project
policy, and agents/README distinguishes that policy from global vendor deployment.
`rip CLAUDE.md` completed with exit 0 after migration. The foreground assertion
`test ! -e CLAUDE.md && test -f AGENTS.md` passed with exit 0.

The classified literal search `rr text 'CLAUDE.md' --hidden --limit 150` identified these
references outside the write set for coordinator triage. None was edited:

| Locator | Meaning and possible follow-up |
| --- | --- |
| `zsh/aliases.zsh:41` | Comment cites old project policy for disabled rm; repoint to AGENTS if maintained. |
| `scripts/wsl-wslconfig.ts:84` | Comment attributes portable-path rule to CLAUDE; repoint to AGENTS. |
| `scripts/wsl-winget.ts:110` | Same project-policy attribution in a comment. |
| `tools/agx-worker/src/state.ts:81` | Generic CLAUDE dispatch-resource attribution; coordinator should distinguish global policy. |
| `scripts/tests/deploy-characterization/inventory.path-line.txt:11–15` | Historical root CLAUDE line inventory; assess fixture ownership before updating. |
| `tools/agx-worker/docs/suite-callers.md:157,288,304` | Historical root CLAUDE caller inventory, not a runtime loader. |
| `tools/shared/GPU-SLOT-RACE-CPU-20261021.md:283` | Recorded worker prompt requests root CLAUDE; use AGENTS if reissuing. |
| `tools/shared/GPU-CHILD-REAP-CPU-20261021.md:58` | Recorded project-guidance read; preserve historical provenance. |
| `tools/shared/evidence/agents-guidance-distill-20261021.md:10,18–20` | Prior migration evidence describes the old authority; historical record. |

Global-template/render references, generic skill examples, archives and other-repository
records are not root-policy callers to rewrite wholesale. The search result is scoped
retrieval evidence, not proof of Claude's actual load path.

## Verification and integration status

- `rumdl check AGENTS.md tools/shared/evidence/agents-canonical-policy-migration-20261021.md`
  passed in the foreground with exit 0: no issues in two files. It is rerun after this
  evidence update.
- `rr regex 'CLAUDE\.md|AGENTS\.md' --path AGENTS.md --path README.md --path agents/README.md`
  passed with exit 0. The direct project-policy reference now names only AGENTS; remaining
  README CLAUDE mentions describe the separate global renderer/template.
- A follow-up `rr text 'CLAUDE.md'` across four explicit historical paths exited 2 because
  one transcribed path did not exist. The correction query
  `rr text 'CLAUDE.md, .claude/settings.json' --glob 'tools/shared/*.md'` passed with exit 0
  and supplied the corrected `GPU-CHILD-REAP-CPU-20261021.md:58` locator above.
- No broad gates, tests, runtime deployments, model probes, Git operations or publication
  were performed. This is a documentation/policy change; no tool release changeset,
  version bump or changelog entry is needed.
- Actual Claude project-policy loading remains unresolved pending the coordinator's
  independent loader readback. This patch is ready for root integration after that readback
  confirms or preserves loading of AGENTS; it does not assert that readback has happened.
