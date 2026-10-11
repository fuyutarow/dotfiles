---
description: >-
  Quote this session's recent responses with their source attached — `from <session name> | <MM-DD HH:MM> | turns: <n> | <bytes>B | <user>@<host>` then the bodies. `/quote N` takes the last N turns (a quantity — unlike /copy N, which is an index). Requests of 1-50 turns copy the text to the clipboard; 51-1024 turns create a UTF-8 text file and copy an scp download command to the local clipboard, including in Herdr remote sessions. Codex legacy prompts execute an adapter with one inference turn.
argument-hint: "[N] — recent turns, 1-50 copy; 51-1024 scp download (default 1)"
disable-model-invocation: true
---

Codex legacy prompts are prompt text, so this invocation uses a normal inference turn. They cannot run Claude's `UserPromptExpansion` hook or make this action zero-inference. Perform the copy by running the executable below; do not quote, rewrite, summarize, or echo assistant replies.

Use only this Codex thread's `CODEX_THREAD_ID`. First require that environment variable to be non-empty. If it is absent, stop and ask for this thread's explicit ID; never select the newest session, infer an ID from the working directory, or inspect another thread. Run:

```sh
bun "$HOME/.codex/hooks/quote-command.ts" --thread "$CODEX_THREAD_ID" [--count "$ARGUMENTS"]
```

When no argument was supplied, omit `--count` (the adapter defaults to 1). Otherwise pass the complete raw argument as one quoted value to `--count`; let the adapter reject malformed or out-of-range values. Report only its status line or error. The adapter includes only completed assistant `final_answer` messages from this exact rollout, with the existing quote provenance header and clipboard routes.
