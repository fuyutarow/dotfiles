+++
schema = 2
name = "hookws"
outcome = "the agx-workspace-add PreToolUse hook denies only when it can prove the command adds a jj workspace in a repo whose declared policy forbids it; a command it cannot parse (for example containing case … esac) is allowed with a one-line warning, never denied; its message names a workflow that exists (`agx ws add` once it lands, otherwise plain `jj workspace add` for repos without .agx.toml)"
writes = ["tools/storage-headroom/src/decision.ts", "tools/storage-headroom/tests/**", "agents/hooks/enforce-agx-workspace-add.ts", "agents/hooks/tests/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/storage-headroom", "bun test agents/hooks", "mise run gate:land"]
timeout_s = 1200
premises = ["file:tools/storage-headroom/src/decision.ts"]

[proposition]
id = "HOOK-WS-NO-FALSE-DENY"
claim = "a jj workspace add inside a case … esac statement in a repo without .agx.toml is allowed; a provably forbidden add is still denied with an existing workflow named"
refuted_by = "the case-esac fixture is denied, or the deny message names 'sparse workspace workflow' without a runnable command"
+++

Reported by coralbase-agt_6n0x (2026-10-15): tools/storage-headroom/src/decision.ts:811 agxWorkspaceAddReason (used by
agents/hooks/enforce-agx-workspace-add.ts) denies "cannot resolve this jj workspace add; use the sparse workspace
workflow" whenever it cannot parse the shell statement (seen with `case … esac`), although coralbase has no .agx.toml
and a plain add was allowed; and the "sparse workspace workflow" it names could not be found as a usable procedure.
Do: unparsable → allow with a warning line; deny only on a proven violation; replace the message with a runnable
command (find what sparse workflow exists with rr; if none, say `agx ws add <ticket>` once available, and plain
`jj workspace add` otherwise). Fixture tests for both. Do not commit or push.
