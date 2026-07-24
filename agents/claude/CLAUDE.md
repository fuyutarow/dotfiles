# User-global policy

- **Every spawned agent runs on Sonnet — no exceptions.** In Workflow scripts, pass
  `{model: 'sonnet'}` literally on EVERY `agent()` call (a PreToolUse hook denies the
  Workflow otherwise). For Agent-tool calls, omit `model` or pass `'sonnet'` — anything
  else is denied. Named workflows and child `workflow()` calls trigger a user prompt.
- **ccc-registered repos: semantic search BEFORE new implementations and absence claims.**
  (覆せる既定 2026-07-24・追認待ち) In a repo with `.cocoindex_code/settings.yml`, do not
  conclude "not implemented / doesn't exist" from grep alone, and do not start implementing
  new functionality without a ccc battery first: `ccc search` with ≥3 paraphrases (JA/EN),
  `--refresh` when files changed. Grep stays correct for literal tokens (driving-cocoindex
  CC3); the invalid move is grep-only ABSENCE. Duplicate implementations are the measured
  failure mode this rule closes.
