# Trigger Set - prompting-llms

Desk-check these rows after changing `name:` or `description:`. Use only the name and description,
plus likely sibling descriptions.

## Should fire

| Query | Expected | Why |
|---|---|---|
| "Anthropic 推奨のプロンプトエンジニアリングを Claude Fable 5 向けにまとめて" | fire | Anthropic + prompt engineering + Fable 5 |
| "Can you rewrite this system prompt for Claude Opus 4.8 and explain the migration risks?" | fire | Claude prompt + named model migration |
| "Sonnet 5 で tool use が弱いので system prompt を調整したい" | fire | Sonnet 5 + tool-use prompting |
| "Build an eval rubric for my Claude customer-support prompt" | fire | evals for Claude prompt |
| "Our agent keeps hallucinating progress during long runs; tune the prompt" | fire | agent prompt + hallucination/progress grounding |
| "We ingest emails and web pages into Claude; how should the prompt defend against injection?" | fire | untrusted content / prompt injection for Claude |
| "Prompt template for structured extraction with XML tags and examples" | fire | prompt template + Anthropic-style XML/examples |

## Should not fire

| Query | Expected | Route |
|---|---|---|
| "Responses API の system prompt の最新仕様を調べて" | no-fire | `openai-docs` |
| "CLAUDE.md に hooks のルールを書きたい" | no-fire | `operating-the-harness` |
| "この SKILL.md の description を改善して" | no-fire | `forging-skills` |
| "この文章をもっと自然な日本語に直して" | no-fire | direct answer or `linting-prose` if high-stakes prose audit |
| "React app のバグを直して" | no-fire | coding/debugging workflow |
| "Cloudflare Workers AI の binding 設定を教えて" | no-fire | Cloudflare / Workers skill |
| "one-line prompt: make this shorter" | no-fire | direct answer unless model-specific/high-risk context is present |

## Co-fire / ordered rows

| Query | Expected | Order |
|---|---|---|
| "Claude Code の CLAUDE.md に入れるプロンプト方針を整理したい" | co-fire | `operating-the-harness` first for memory/harness placement, then this skill only for prompt wording |
| "Anthropic docs に沿って prompt engineering skill を作って" | co-fire | `forging-skills` owns skill creation; this skill supplies subject matter after source gate |
| "OpenAI と Claude 両方の system prompt を比較して移行案を作って" | co-fire | `openai-docs` for OpenAI facts, this skill for Claude/Anthropic facts; keep source sections separate |
