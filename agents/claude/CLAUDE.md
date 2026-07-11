# User-global policy

- **Every spawned agent runs on Sonnet — no exceptions.** In Workflow scripts, pass
  `{model: 'sonnet'}` literally on EVERY `agent()` call (a PreToolUse hook denies the
  Workflow otherwise). For Agent-tool calls, omit `model` or pass `'sonnet'` — anything
  else is denied. Named workflows and child `workflow()` calls trigger a user prompt.
