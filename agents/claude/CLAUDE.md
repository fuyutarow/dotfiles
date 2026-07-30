# User-global policy

- **Spawned agents run on Sonnet; the one escalation is declared.** In Workflow scripts, pass
  `{model: 'sonnet'}` literally on EVERY `agent()` call (a PreToolUse hook denies the
  Workflow otherwise) — fan-out is Sonnet-only, no escalation clause. For Agent-tool calls,
  omit `model` or pass `'sonnet'`; `'fable'` is allowed on a SINGLE call that carries
  `ESCALATION(fable): <target> | <why sonnet is insufficient> | <cost estimate>` in the
  prompt. Every other model is denied. Named workflows and child `workflow()` calls prompt.
- **Effort belongs to the role, not the session.** Leave `effort` off an `agent()` call to
  inherit the default. The same hook denies a Workflow `agent()` that passes a literal
  `effort: 'low'` unless that same call declares `LOW-EFFORT(<stage>): <why this stage is not
  intelligence-sensitive>`. Raising effort needs no declaration — only lowering does, because
  Anthropic documents Sonnet 5's `low` as reserved for work that is *not* intelligence-sensitive,
  and almost everything we fan out is.
- **Roster (覆せる既定 2026-07-25・追認待ち).** Opus 5 directs, Sonnet 5 works, Fable 5 is the
  declared escalation for work Sonnet cannot reach. This follows Anthropic's own guidance:
  default to Opus, reserve the Fable tier for the highest-capability workloads. Fable also
  forces 30-day data retention (Covered Model) — never point it at a secret-bearing repo.
- **ccc-registered repos: raw search is banned; declare QUERY-SHAPE through `repo-search`.**
  (覆せる既定 2026-07-30) When ccc is installed and `.cocoindex_code/settings.yml` exists,
  a PreToolUse hook denies raw Grep/rg/grep/find/fd/tree, direct ccc search/grep, and obvious
  inline-runtime search reimplementations. Use `repo-search concept` for unknown-name meaning,
  `battery` (≥3 JA/EN paraphrases) before absence/new implementation claims, `literal` for exact text,
  `exhaustive` for regex enumeration, `files` for path inventory, and `structural` for ccc
  by-example grep; known symbols go to Serena. The guaranteed entrypoint is
  `bun ~/.claude/hooks/repo-search.ts`; the PATH command is only a convenience symlink. If the
  guaranteed file is missing, STOP and repair the harness — never bypass the gate with Python,
  Node, shell loops, or another search implementation. Empty ccc output is NO_MATCH, never PASS.
  The router deliberately uses rg for lexical routes; the ban is unclassified search.
