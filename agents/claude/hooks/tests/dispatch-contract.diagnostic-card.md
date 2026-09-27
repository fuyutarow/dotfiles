# DIAGNOSTIC CARD

Surface: tool API (Claude Code PreToolUse hook on Agent/Task/Workflow)
Severity: error
Machine contract: exit=0; channel=stdout; hookSpecificOutput.permissionDecision="deny"
Renderer: agent transcript (the deny reason is read by the dispatching model)

Observed condition: the dispatch does not name one of the two allowed pairs — Agent/Task subagent_type and model are not ("sonnet-high","sonnet") or ("opus-medium","opus"); a Workflow agent() call lacks a literal model/effort or pairs them otherwise than sonnet+high / opus+medium
Evidence / locus: Agent/Task tool_input.subagent_type and tool_input.model, both echoed as observed ("missing" or the value); Workflow: "line N:" of the agent() call in the script
Cause confidence: proven

Primary message: dispatch-contract: no allowed dispatch pair (subagent_type 'Explore', model missing) — use exactly one of: subagent_type:"sonnet-high", model:"sonnet" or subagent_type:"opus-medium", model:"opus". Choose by the task: sonnet-high when the brief fully specifies the result (mechanical edits, a named test run, bulk probes); opus-medium for multi-file refactors, root-cause debugging, long unattended coding, or an ambiguous spec.
Related loci: none

Recovery mode: exact
Validated recovery: re-invoke with one of the two printed pairs; when one half already fixes the pair, the message names the single edit (add model:"sonnet"; set subagent_type:"opus-medium"; keep model:'opus' and set effort:'medium')
Preconditions: the RESOURCE-CLASS / RESOURCE-ENVELOPE declaration is present (a separate, independently reported finding)
Next observation: none

Positive case: Agent {subagent_type:"Explore"} with no model; Agent {subagent_type:"sonnet-high", model:"opus"}; Workflow agent('x', {model:'opus', effort:'high'})
Negative case: Agent {subagent_type:"opus-medium", model:"opus"} and Workflow agent('x', {model:'sonnet', effort:'high'}) are allowed
Receipt: bun test agents/claude/hooks/tests/enforce-dispatch-contract.test.ts (65 pass), including "deny text names the minimal exact repair"; live smoke via sh ~/.claude/hooks/run.sh --fail-closed enforce-dispatch-contract.ts
