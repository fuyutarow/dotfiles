# DIAGNOSTIC CARD

Surface: Claude Code PreToolUse hook on Agent/Task/Workflow
Severity: error
Machine contract: exit=0; channel=stdout; hookSpecificOutput.permissionDecision="deny"
Renderer: agent transcript

Observed condition: a coordinator tried to dispatch with Agent, Task, or Workflow. Those tools do
not dispatch workers in this harness.
Evidence / locus: the input `tool_name` identifies the denied tool.
Cause confidence: proven

Primary message: dispatch-contract: the tool dispatches nothing — every worker starts with
`agx run <ticket>`. Use `agx check <ticket>`, `agx ls`, `agx judge <run> accept|reject`, and
`agx stats` for the other run operations. Durable runs use
`systemd-run --user --unit=agx-<name> --collect -- agx run …`.

Recovery mode: exact
Validated recovery: invoke `agx run <ticket>`; continue a vendor session with
`agx run <ticket> --continue <run>`.
Preconditions: the ticket file and run workspace are available to the CLI.
Next observation: `agx ls --json` reports the run and its judgment.

Receipt: `bun test agents/claude/hooks/tests/enforce-dispatch-contract.test.ts`
