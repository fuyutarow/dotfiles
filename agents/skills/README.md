# Agent Skills

Operating manuals for AI coding agents, deployed to Claude Code (and Codex) by `mise run link:skills`.
Each skill is a durable rule-set the agent loads on demand — open any `SKILL.md` for the full spec.

**40 authored** here, plus **11 vendored** upstream (Cloudflare/Workers). This page is the human map;
the canonical trigger definitions live in each skill's `SKILL.md` frontmatter.

## Collection design invariant

MECE is a property of the **whole collection**, not a reason to maximize the number of skills. Decompose
work first as **function × state transition × artifact**; only then assign each artifact one owner.
Neighboring descriptions carry reciprocal typed cuts, and a broad entrypoint composes stage owners
without reimplementing them. Create a new skill only for a demonstrated ownership void. MECE applies
to declared responsibilities and artifacts; open-world content keeps an explicit `OPEN` residual rather
than pretending unknown unknowns are exhaustively enumerable.

## Authored

### Writing & communication

- [`linting-prose`](linting-prose/) — Catch word/sentence tics, jargon, and buried conclusions in reader-facing prose before shipping.
- [`structuring-documents`](structuring-documents/) — Reorganize a document so every fact has one home and references point backward.
- [`designing-presentations`](designing-presentations/) — Plan or critique talks and decks to change what the audience decides, not just inform.
- [`prompting-llms`](prompting-llms/) — Write and audit Claude/Anthropic prompts, system prompts, and evals as testable contracts.
- [`compiling-latex`](compiling-latex/) — Modern repo-native LaTeX/Beamer: mise, latexmk, tex-fmt, chktex for building and linting papers.
- [`writing-technical-japanese`](writing-technical-japanese/) — Entrypoint for 木下『理科系の作文技術』: dispatches to structuring-documents → linting-prose (→ designing-presentations). `/koreo` is its alias.

### Design & interfaces

- [`designing-interactions`](designing-interactions/) — Design or audit any interaction surface (GUI, CLI, voice, agent-facing): modes, undo vs confirmation, hidden state, delegability.

### Research & thinking

- [`raising-resolution`](raising-resolution/) — Inspect the actual code/data/source before asserting a fact — reach for it when tempted to guess.
- [`surfacing-blind-spots`](surfacing-blind-spots/) — Expose hidden premises and human tacit constraints in an existing plan/frame; emit a bounded blind-spot packet, not solutions.
- [`acting-on-hypotheses`](acting-on-hypotheses/) — Test and commit an expensive/irreversible forward bet under uncertainty via Map-Loop-Leap; cheap deterministic reversible probes use the domain/plain executor.
- [`forging-novel-theses`](forging-novel-theses/) — Generate traceable, testable thesis candidates for a selected problem; every output remains a candidate.
- [`systematizing-knowledge`](systematizing-knowledge/) — Turn a source corpus into a traceable, method-fit position without forcing taxonomies, grades, or explanations.
- [`growing-oss-adoption`](growing-oss-adoption/) — Make a developer OSS tool actually spread — for naming, launching, or diagnosing adoption.
- [`directing-research`](directing-research/) — Entrypoint for creative research: diagnose the stage, construct/select/formulate problems, admit candidate batches, and steer a portfolio.
- [`arguing-research-papers`](arguing-research-papers/) — Build a paper's argument: claim = evidence, novelty positioning, reviewer-proof framing.

Research routing spine:

```text
corpus ─ systematizing-knowledge ────────────────┐
present artifact ─ raising-resolution ───────────┤
existing plan/frame ─ surfacing-blind-spots ─────┤
                                                 ▼
directing-research: construct/select/formulate/steer
                                                 │
                                                 ▼
forging-novel-theses: generate candidate packets
                                                 │
                                                 ▼
directing-research: freeze/deduplicate/admit
                                                 │
                                                 ▼
[acting-on-hypotheses if expensive/irreversible; domain executor if cheap/reversible]: act on ONE tree
                                                 │
                            ┌────────────────────┴───────────────────┐
                            ▼                                        ▼
directing-research: update/reopen portfolio         arguing-research-papers: finished claim
```

| Function | State transition | Owned artifact | Skill |
|---|---|---|---|
| PRESENT-GROUND | uncited present claim → cited observation | observation with locus | `raising-resolution` |
| CORPUS-GROUND | unsystematized corpus → evidence state | claim/evidence ledger | `systematizing-knowledge` |
| EXPOSE | implicit plan/frame → explicit premise surface | Blind-spot packet | `surfacing-blind-spots` |
| FRAME / STEER | exposed premises/evidence → selected problem/program state | RESEARCH JUDGMENT SPEC | `directing-research` |
| FORGE | selected frame → thesis batch | Candidate packets + coverage matrix | `forging-novel-theses` |
| TEST / COMMIT | one expensive/irreversible selected tree → confidence/commit decision | Map / Loop table / Leap decision | `acting-on-hypotheses` |
| RUN CHEAP PROBE | one deterministic/reversible selected tree → observed result | result with locus | domain/plain executor |
| ARGUE | completed evidence → defensible paper claim | CLAIM SPEC | `arguing-research-papers` |

`orchestrating-agents` is orthogonal: it owns who/when/visibility/veto/acceptance around this spine, not
the research judgments themselves.

### Agent harness

- [`forging-skills`](forging-skills/) — Create and reforge Agent Skills to the house bar: triggers, gates, sibling cuts, verification.
- [`operating-the-harness`](operating-the-harness/) — Configure Claude Code itself: lean CLAUDE.md, hooks, permissions, verification loops, MCP, subagents.
- [`continuing-long-running-tasks`](continuing-long-running-tasks/) — Keep one evidence-linked task record trustworthy across compact, resume, and Codex/Claude handoff.
- [`recovering-poisoned-context`](recovering-poisoned-context/) — Rescue a session broken by a leaked/malformed tool call by rewinding, not retrying.
- [`driving-codex`](driving-codex/) — Drive the OpenAI Codex CLI (`codex exec`) as a headless worker: sonnet-wrapper pattern, sandbox flags, availability by probe, spend accounting.
- [`driving-claude`](driving-claude/) — **Codex-only**: drive Claude Code (`claude -p`) as a headless worker with trusted-CWD, least-privilege, JSON relay, and model-probe gates.
- [`driving-antigravity`](driving-antigravity/) — Drive the Antigravity CLI (`agy`) as a headless worker: multi-vendor roster on one subscription, no per-call meter, unconfined by default.
- [`driving-grok`](driving-grok/) — Drive xAI's Grok Build CLI (`grok`) as a headless worker: metered + real sandbox, but an EXFIL-RISK data-minimize law, catalog by probe.
- [`driving-cocoindex`](driving-cocoindex/) — Route declared query shapes through `repo-search`: ccc for concepts/structure, rg for lexical enumeration.
- [`driving-serena`](driving-serena/) — Drive Serena MCP with live-contract, project/language capability, memory-freshness, and FD/process resource gates.
- [`orchestrating-agents`](orchestrating-agents/) — 委任体制を運転する監督の規律: 宣言制・委任契約・検収の試験・pacing の12門(旧 acting-as-director)。

### Coding & proofs

- [`implementing-and-debugging`](implementing-and-debugging/) — Discipline for writing or fixing non-trivial code: understand intent, fix the root cause, avoid flailing.
- [`refactoring-code`](refactoring-code/) — Behavior-preserving structural change toward 責務分界/局所化; harshly refuses 場当たり churn; enforces the two hats and name-your-oracle.
- [`writing-julia`](writing-julia/) — Write correct, fast Julia for research — reach for it before any Julia coding or numerics.
- [`optimizing-julia-gpu-kernels`](optimizing-julia-gpu-kernels/) — Write and optimize CUDA.jl GPU kernels — or prove you shouldn't (vendor libs and fusion beat hand kernels).
- [`writing-rust`](writing-rust/) — Write modern (2025/2026) Rust with crate selection as the spine: right crate for the job, sync-before-async, ownership-before-clone, verify-before-recommend; performance is measured, not automatic.
- [`writing-python`](writing-python/) — Modern (2026) Python with library SELECTION as the spine: uv owns env/deps, ruff owns lint+format, typed surfaces, pydantic v2 at boundaries.
- [`writing-typescript`](writing-typescript/) — House TypeScript idioms (`satisfies` over `as`, `??` over `||`, ts-pattern, zod) when writing or reviewing `.ts`.
- [`writing-bun-scripts`](writing-bun-scripts/) — Local automation in Bun TypeScript: zero-config single-file scripts, Bun.$/spawn+timeout, pinned bunx, and the bash→TS refactor map.
- [`proving-theorems`](proving-theorems/) — Formalize and machine-check math proofs, with AI drafting and human-owned statement faithfulness.
- [`linting-sui-move`](linting-sui-move/) — Review Sui Move 2024 code for style, gas, and security the compiler can't catch.
- [`running-python-tools`](running-python-tools/) — Run every Python tool via uv/uvx instead of pip, keeping environments isolated and reproducible.
- [`wiring-mise-tasks`](wiring-mise-tasks/) — One mise verb contract for every repo (fmt/f, lint, test, up, check…): naming grammar, per-language templates, and a resolution gate that catches drift.

### Systems & security

- [`securing-remote-access`](securing-remote-access/) — Pick and harden the right remote-shell architecture: SSH keys, certs, hardware tokens, or zero-trust mesh.

### People & media

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
