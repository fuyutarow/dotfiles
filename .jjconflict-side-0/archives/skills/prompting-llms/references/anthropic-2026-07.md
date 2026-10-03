# Anthropic Prompting Snapshot - 2026-07-03

This dated reference quarantines model-specific and API-specific facts. Re-fetch official docs on
every reforge or whenever the user asks for "latest", "current", "today", a named model, migration,
or API parameters.

## Source-grade table

| Claim class | Grade | Handling |
|---|---|---|
| Claude Prompting best practices, model prompting pages, migration guide, extended thinking, evals, hallucination, consistency, and injection pages | official-docs, fetched 2026-07-03 | Use for current factual claims; re-fetch before "latest" claims |
| Anthropic Engineering posts on context engineering, multi-agent research, tool design, and think tool | official-engineering, fetched 2026-07-03 | Use as operational guidance, not API contract |
| This skill's PROMPT CONTRACT, routing, skeleton, and eval loop synthesis | skill-supplied | Present as this skill's operationalization, not as Anthropic wording |

## Official source map

- Prompting best practices:
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices
- Prompting Claude Fable 5:
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-fable-5
- Prompting Claude Opus 4.8:
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-4-8
- Prompting Claude Sonnet 5:
  https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-sonnet-5
- Migration guide:
  https://platform.claude.com/docs/en/about-claude/models/migration-guide
- Extended thinking:
  https://platform.claude.com/docs/en/build-with-claude/extended-thinking
- Define success criteria and build evaluations:
  https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
- Reduce hallucinations:
  https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations
- Increase output consistency:
  https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency
- Mitigate jailbreaks and prompt injections:
  https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks
- Effective context engineering for AI agents:
  https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Multi-agent research system:
  https://www.anthropic.com/engineering/multi-agent-research-system
- Think tool:
  https://www.anthropic.com/engineering/claude-think-tool

## Durable best-practice distillation

Use these patterns across current Claude-family prompts unless a newer official source contradicts
them.

| Pattern | Operational rule |
|---|---|
| Clear/direct instruction | State the goal, constraints, output shape, and sequencing. If a minimally briefed human could not follow it, the model probably cannot follow it reliably either. |
| Context with motivation | Tell the model why a behavior matters when that helps it generalize beyond one example. |
| Examples | Use examples for style, output format, edge cases, and hard distinctions; prefer diverse examples over many near-duplicates. |
| XML structure | Use XML tags to separate instructions, context, examples, inputs, and outputs in complex prompts. Do not add tags to simple prompts that are already unambiguous. |
| Output consistency | For guaranteed JSON schema conformance, use Structured Outputs when supported. Otherwise specify a concrete template and examples. |
| Long context | Put long documents/data in clearly delimited blocks, then place the task and final instructions where they are easy to find. Ask for quote/source extraction before synthesis when factual grounding matters. |
| Hallucination reduction | Permit "I don't know"; require citations/quotes for factual claims; restrict external knowledge when the answer must come only from supplied material. |
| Prompt injection | Treat third-party content as untrusted data; keep instructions outside tool results; label source/trust; JSON-encode untrusted strings where possible; use least privilege and red-team examples. |
| Evals | Define success criteria first, build task-specific evals including edge cases, automate grading where possible, and prefer many useful cases over a tiny hand-graded set. |
| Prompt iteration | Run representative and adversarial cases; change one thing at a time; keep the prompt, model, effort, and tools fixed while testing a variant. |

## Model deltas - verified 2026-07-03

### Claude Fable 5 / Mythos 5

- Best fit: very complex, long-running, ambiguous, multi-day or end-to-end work. Do not test only
  on simple tasks if judging capability.
- Runs can be long at higher effort. Design timeouts, streaming, async orchestration, and progress
  handling before migrating.
- Effort is a primary control. Use `high` as the general default, `xhigh` for the most
  capability-sensitive work, and `medium`/`low` for routine interactive work.
- Strong instruction following means brief behavior guidance often works better than enumerating
  every failure mode. Keep the instruction positive and concrete.
- Add progress-grounding language for long runs: progress claims should be audited against tool
  results from the session.
- State boundaries: when the user asks a question or describes a problem, the deliverable may be an
  assessment, not an unrequested fix.
- Fable 5 is more dependable with parallel subagents. Give delegation criteria and let the
  orchestrator keep working while independent subtasks run.
- Consider a persistent memory note system for repeated workflows; store durable lessons, not
  duplicates of repo/chat facts.
- Do not ask the model to reproduce hidden reasoning in response text. If reasoning visibility is
  needed, use supported thinking surfaces and user-facing progress mechanisms.
- For long asynchronous products, a send-to-user style tool can deliver verbatim progress or partial
  deliverables without ending the agent's turn.

### Claude Opus 4.8

- Strong areas include long-horizon agentic work, knowledge work, vision, and memory tasks.
- Response length is calibrated to task complexity. If a product needs fixed verbosity or style,
  specify it and provide positive examples.
- Effort default is `high`; for coding and high-autonomy work, set `xhigh` explicitly when the
  budget supports it.
- Opus 4.8 uses the 1M context window by default, and the 4.7 migration changes still matter for
  clients upgrading from 4.6 or earlier.
- Non-default sampling parameters remain rejected. Guide tone/variety with prompt instructions,
  examples, or option proposal, not `temperature`.
- It may reason more and use tools less than some earlier prompts expected. Raise effort and state
  tool-use conditions when tool use is necessary.
- It tends to spawn fewer subagents by default than some previous scaffolds. Prompt explicitly when
  parallel delegation is desired.
- Literal instruction following can reduce recall if a review prompt says "only report high
  severity" or "be conservative". For finding stages, ask for coverage first and filter later.
- Frontend/design prompts need less anti-generic scaffolding than older models, but concrete visual
  alternatives or "propose options first" still improve variety.

### Claude Sonnet 5

- Strong fit for coding, agentic search, and interactive products where speed/cost matter more than
  maximum capability.
- Adaptive thinking is on by default. `high`/`xhigh`/`max` effort needs enough `max_tokens`
  headroom for thinking and answer content.
- The tokenizer may produce materially more tokens than Sonnet 4.6 for the same text; re-check
  `max_tokens` and truncation.
- More agentic/tool-using than Sonnet 4.6 by default, but with thinking disabled it is less likely
  to search or use tools. Add an explicit tool nudge when needed.
- More literal at lower effort. If an instruction must apply globally, state the scope explicitly.
- Non-default `temperature`, `top_p`, and `top_k` are rejected. Use prompts and examples for tone
  or variety.
- For design briefs, generic "make it clean" guidance tends to create another fixed style. Use a
  concrete visual direction or ask for several distinct options before implementation.
- Code-review harnesses may show lower reported recall if prompts over-filter. Separate discovery
  from ranking/filtering when recall matters.

## Migration gotchas

- Do not use assistant prefill on Fable 5, Mythos 5, Opus 4.8, Opus 4.7, Opus 4.6, or Sonnet 4.6.
  Use Structured Outputs where supported, or system prompt instructions.
- For Opus 4.7+ and newer model families, manual extended-thinking budgets are not the right path.
  Use adaptive thinking and effort controls according to current docs.
- If old prompts force anti-laziness, excessive tool use, or periodic progress updates, re-test
  without them. Newer models may already perform those behaviors or may over-trigger when pushed.
- Re-baseline evals after model migration. A better model can look worse if the harness filters
  findings differently, truncates outputs, or uses stale token budgets.

## Prompt audit checklist

| Check | Pass condition |
|---|---|
| Task | The prompt says who the user is, what the task is, and what is out of scope. |
| Context | Instructions, context, examples, variables, and untrusted content are separated. |
| Output | The exact format, schema, tone, length, and refusal/uncertainty behavior are specified. |
| Tools | Tool-use triggers, evidence requirements, and stop conditions are explicit. |
| Trust | Third-party content cannot override system/user instructions. |
| Model delta | Named-model guidance is sourced and dated. |
| Evals | Success criteria and representative/adversarial test cases exist. |
| Cost/latency | Effort/thinking/max-token choices match the product budget. |

## Forward-test recipe

For a prompt artifact, test at least:

1. Happy path: ordinary real user input.
2. Boundary path: ambiguous or partially missing information.
3. Format path: adversarial input that tempts the model to violate output schema.
4. Factuality path: missing-source or contradictory-source input.
5. Injection path: third-party content telling the model to ignore prior instructions.
6. Migration path: same case on old and new model/effort settings, with output length and tool use
   compared.
