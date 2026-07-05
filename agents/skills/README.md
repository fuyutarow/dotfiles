# Agent Skills

Operating manuals for AI coding agents, deployed to Claude Code (and Codex) by `mise run link:skills`.
Each skill is a durable rule-set the agent loads on demand — open any `SKILL.md` for the full spec.

**23 authored** here, plus **11 vendored** upstream (Cloudflare/Workers). This page is the human map;
the canonical trigger definitions live in each skill's `SKILL.md` frontmatter.

## Authored

### Writing & communication

- [`linting-prose`](linting-prose/) — Catch word/sentence tics, jargon, and buried conclusions in reader-facing prose before shipping.
- [`structuring-documents`](structuring-documents/) — Reorganize a document so every fact has one home and references point backward.
- [`designing-presentations`](designing-presentations/) — Plan or critique talks and decks to change what the audience decides, not just inform.
- [`prompting-llms`](prompting-llms/) — Write and audit Claude/Anthropic prompts, system prompts, and evals as testable contracts.
- [`compiling-latex`](compiling-latex/) — Modern repo-native LaTeX/Beamer: mise, latexmk, tex-fmt, chktex for building and linting papers.

### Research & thinking

- [`raising-resolution`](raising-resolution/) — Inspect the actual code/data/source before asserting a fact — reach for it when tempted to guess.
- [`acting-on-hypotheses`](acting-on-hypotheses/) — Test and commit a forward bet under uncertainty via Map-Loop-Leap — to de-risk or size a bet.
- [`forging-novel-theses`](forging-novel-theses/) — Invent and battle-test a brand-new venture/research thesis, then design the experiment that could kill it.
- [`systematizing-knowledge`](systematizing-knowledge/) — Turn a corpus of papers into one defensible position: synthesis, taxonomy, contradiction reconciliation.
- [`growing-oss-adoption`](growing-oss-adoption/) — Make a developer OSS tool actually spread — for naming, launching, or diagnosing adoption.

### Agent harness

- [`forging-skills`](forging-skills/) — Create and reforge Agent Skills to the house bar: triggers, gates, sibling cuts, verification.
- [`operating-the-harness`](operating-the-harness/) — Configure Claude Code itself: lean CLAUDE.md, hooks, permissions, verification loops, MCP, subagents.
- [`recovering-poisoned-context`](recovering-poisoned-context/) — Rescue a session broken by a leaked/malformed tool call by rewinding, not retrying.

### Coding & proofs

- [`implementing-and-debugging`](implementing-and-debugging/) — Discipline for writing or fixing non-trivial code: understand intent, fix the root cause, avoid flailing.
- [`refactoring-code`](refactoring-code/) — Behavior-preserving structural change toward 責務分界/局所化; harshly refuses 場当たり churn; enforces the two hats and name-your-oracle.
- [`writing-julia`](writing-julia/) — Write correct, fast Julia for research — reach for it before any Julia coding or numerics.
- [`writing-typescript`](writing-typescript/) — House TypeScript idioms (`satisfies` over `as`, `??` over `||`, ts-pattern, zod) when writing or reviewing `.ts`.
- [`proving-theorems`](proving-theorems/) — Formalize and machine-check math proofs, with AI drafting and human-owned statement faithfulness.
- [`linting-sui-move`](linting-sui-move/) — Review Sui Move 2024 code for style, gas, and security the compiler can't catch.
- [`running-python-tools`](running-python-tools/) — Run every Python tool via uv/uvx instead of pip, keeping environments isolated and reproducible.

### Systems & security

- [`securing-remote-access`](securing-remote-access/) — Pick and harden the right remote-shell architecture: SSH keys, certs, hardware tokens, or zero-trust mesh.

### People & media

- [`profiling-personality`](profiling-personality/) — Build a careful, provisional personality or compatibility read of someone from their text and behavior.
- [`transcribing-media`](transcribing-media/) — Transcribe or subtitle audio/video with Whisper via uv — for 文字起こし and captions.

## Vendored (upstream)

Third-party skills kept in-tree for convenience — Cloudflare/Workers platform docs, not authored here.

- [`cloudflare`](cloudflare/) — Umbrella guide to the whole Cloudflare platform: Workers, storage, AI, networking, security.
- [`workers-best-practices`](workers-best-practices/) — Write and review Cloudflare Workers code against production best practices and anti-patterns.
- [`wrangler`](wrangler/) — Correct syntax and best practices for the Wrangler CLI that deploys and manages Workers.
- [`agents-sdk`](agents-sdk/) — Build stateful, durable AI agents on Cloudflare Workers with the Agents SDK.
- [`durable-objects`](durable-objects/) — Build and review Cloudflare Durable Objects for stateful edge coordination.
- [`sandbox-sdk`](sandbox-sdk/) — Run untrusted or AI-generated code in isolated Cloudflare sandboxes — for code interpreters.
- [`cloudflare-one`](cloudflare-one/) — Design and configure Cloudflare One Zero Trust / SASE: Access, Gateway, WARP, Tunnel, DLP.
- [`cloudflare-one-migrations`](cloudflare-one-migrations/) — Plan migrations from Zscaler, Palo Alto, or legacy VPN/SASE to Cloudflare One.
- [`cloudflare-email-service`](cloudflare-email-service/) — Send and receive transactional email via Cloudflare Email Sending and Routing.
- [`turnstile-spin`](turnstile-spin/) — Wire Cloudflare Turnstile CAPTCHA into a project end-to-end — to bot-protect a form.
- [`web-perf`](web-perf/) — Audit page-load speed and Core Web Vitals with Chrome DevTools MCP.

---

<sub>Index is hand-curated; `mise run lint:skills-index` checks every skill dir is listed. Summaries are human paraphrases — each `SKILL.md` frontmatter is the source of truth for triggers.</sub>
