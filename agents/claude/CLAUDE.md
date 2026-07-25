# User-global policy

- **Spawned agents run on Sonnet; the one escalation is declared.** In Workflow scripts, pass
  `{model: 'sonnet'}` literally on EVERY `agent()` call (a PreToolUse hook denies the
  Workflow otherwise) — fan-out is Sonnet-only, no escalation clause. For Agent-tool calls,
  omit `model` or pass `'sonnet'`; `'fable'` is allowed on a SINGLE call that carries
  `ESCALATION(fable): <target> | <why sonnet is insufficient> | <cost estimate>` in the
  prompt. Every other model is denied. Named workflows and child `workflow()` calls prompt.
- **Roster (覆せる既定 2026-07-25・追認待ち).** Opus 5 directs, Sonnet 5 works, Fable 5 is the
  declared escalation for work Sonnet cannot reach. This follows Anthropic's own guidance:
  default to Opus, reserve the Fable tier for the highest-capability workloads. Fable also
  forces 30-day data retention (Covered Model) — never point it at a secret-bearing repo.
- **ccc-registered repos: semantic search BEFORE new implementations and absence claims.**
  (覆せる既定 2026-07-24・追認待ち) In a repo with `.cocoindex_code/settings.yml`, do not
  conclude "not implemented / doesn't exist" from grep alone, and do not start implementing
  new functionality without a ccc battery first: `ccc search` with ≥3 paraphrases (JA/EN),
  `--refresh` when files changed. Grep stays correct for literal tokens (driving-cocoindex
  CC3); the invalid move is grep-only ABSENCE. Duplicate implementations are the measured
  failure mode this rule closes.
