---
description: Rename this session to "<project>-<role>_<suffix>" and join the fleet as <role> (e.g. `/assign obs`, `/assign dtr`, `/assign pi`). A role-specific charter, when one is configured, arrives as additional context alongside this message.
argument-hint: "<role> — a short lowercase token (e.g. obs, dtr, pi)"
---

<!--
The rename is a SIDE EFFECT of agents/claude/hooks/assign-command.ts (a UserPromptSubmit hook,
fired before this template even expands) — this body does not do it. This body is only what
reaches the model: the role-announcement instruction. If assign-command.ts found a charter entry
for $0 in agents/claude/hooks/assign-roles.toml, that text rides alongside this as additional
context; if not, this generic instruction is all the model gets.
-->

You have just been assigned the **$0** role for this project (this session was renamed
accordingly).

Read any role-specific instructions delivered as additional context alongside this message. If
none arrived, the role has no charter yet: introduce yourself to the project's Director (find
one via `ListAgents` — look for a `dtr_` name) as the $0 role, ask what's expected of you, and
wait for orders rather than guessing.
