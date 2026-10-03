# Agent Skills

Operating manuals for AI coding agents, deployed to Claude Code (and Codex) by `mise run link:skills`.
Each active skill is a durable rule-set the agent loads on demand.
Retired manuals are listed in [the archive](../../archives/skills/README.md); they are not callable skills.
A reference to a retired skill means its archived contract, not automatic reactivation.

The active collection contains authored manuals and vendored upstream skills (Web Perf, TypeSafe). This page is the human map;
the canonical trigger definitions live in each skill's `SKILL.md` frontmatter.

## Collection design invariant

MECE is a property of the **whole collection**, not a reason to maximize the number of skills. Decompose
work first as **function × state transition × artifact**; only then assign each artifact one owner.
Neighboring descriptions carry reciprocal typed cuts, and a broad entrypoint composes stage owners
without reimplementing them. Create a new skill only for a demonstrated ownership void. MECE applies
to declared responsibilities and artifacts; open-world content keeps an explicit `OPEN` residual rather
than pretending unknown unknowns are exhaustively enumerable.

Collection mission: maximize valid knowledge discovery per unit time through Experimental and
Formal Methods. `forging-skills` owns the admission test; activity counts alone do not meet it.

## Authored

### Writing & communication

- [`linting-prose`](linting-prose/) — Catch word/sentence tics, jargon, and buried conclusions in reader-facing prose before shipping.
- [`structuring-documents`](structuring-documents/) — Reorganize a document so every fact has one home and references point backward.
- [`designing-presentations`](designing-presentations/) — Plan or critique talks and decks to change what the audience decides, not just inform.
- [`issuing-technical-memoranda`](issuing-technical-memoranda/) — Issue a technical memo by fixing its wrapper — cover, authority line, addressee, release marking — while the body stays deliberately unregulated.
- [`compiling-latex`](compiling-latex/) — Modern repo-native LaTeX/Beamer: mise, latexmk, tex-fmt, chktex for building and linting papers.
- [`writing-technical-japanese`](writing-technical-japanese/) — Entrypoint for 木下『理科系の作文技術』: dispatches to structuring-documents → linting-prose (→ designing-presentations). `/koreo` is its alias.

### Design & interfaces

- [`designing-interactions`](designing-interactions/) — Design or audit any interaction surface (GUI, CLI, voice, agent-facing): modes, undo vs confirmation, hidden state, delegability.
- [`designing-command-line-interfaces`](designing-command-line-interfaces/) — Design or audit a reusable CLI's contract: consumers, grammar, effects, stdout/stderr and machine route, outcomes, compatibility.
- [`designing-developer-diagnostics`](designing-developer-diagnostics/) — Design developer-facing CLI/config/build diagnostics as observed failure, precise locus, safe recovery, and human-plus-machine receipt.
- [`designing-version-schemes`](designing-version-schemes/) — Design versioning as a compatibility, chronology, and release-order contract; verify the target comparator and ranges.
- [`designing-type-contracts`](designing-type-contracts/) — Assign invariants to types, parsers, and state APIs; check construction paths and name remaining runtime obligations.

### Research & thinking

- [`raising-resolution`](raising-resolution/) — Inspect the actual code/data/source before asserting a fact — reach for it when tempted to guess.
- [`surfacing-blind-spots`](surfacing-blind-spots/) — Expose hidden premises and human tacit constraints in an existing plan/frame; emit a bounded blind-spot packet, not solutions.
- [`forming-hypotheses-from-anomalies`](forming-hypotheses-from-anomalies/) — Explain an observed contrast and record the vocabulary grounds; preserve distinct rival explanations.
- [`acting-on-hypotheses`](acting-on-hypotheses/) — Test and commit an expensive/irreversible forward bet under uncertainty via Map-Loop-Leap; cheap deterministic reversible probes use the domain/plain executor.
- [`driving-bibifi-cycles`](driving-bibifi-cycles/) — Maximize valid experimental and formal discovery through short BIBIFI loops, broad useful agent parallelism, critical-path priority and bounded compute.
- [`validating-experimental-evidence`](validating-experimental-evidence/) — Qualify numerical claims through registered contract, leakage, footing, and lineage checks; polysearch owns the executable schema and finding.
- [`codifying-doctrine`](codifying-doctrine/) — Codify and audit the ordered trade-off rules that let distributed actors decide alike when nobody can confer; every rule names what it sacrifices, and agreement is measured, not asserted.
- [`forging-novel-theses`](forging-novel-theses/) — Generate traceable, testable thesis candidates for a selected problem; every output remains a candidate.
- [`systematizing-knowledge`](systematizing-knowledge/) — Turn a source corpus into a traceable, method-fit position without forcing taxonomies, grades, or explanations.
- [`systematizing-theories`](systematizing-theories/) — Build one theory's axioms, definitions and results; update exact statements and dependent predictions as findings arrive.
- [`governing-research-documentation`](governing-research-documentation/) — Govern a research-document portfolio: admission, authority, evidence lineage, review, retirement, and deletion.
- [`keeping-research-notebooks`](keeping-research-notebooks/) — Route every artifact of a research notebook repo to its one home and one entry point, land through a single committer, and gate when a model revision may be measured.
- [`growing-oss-adoption`](growing-oss-adoption/) — Make a developer OSS tool actually spread — for naming, launching, or diagnosing adoption.
- [`directing-research`](directing-research/) — Explicit legacy invocation and v1-record compatibility only; generic discovery execution belongs to BIBIFI.
- [`supervising-research-programmes`](supervising-research-programmes/) — Construct and steer programme problems, issues, mandates, allocation, and global transitions.
- [`commanding-research-fleets`](commanding-research-fleets/) — Define explicit Director/PI/Researcher fleet roles and legacy certification; local execution follows BIBIFI, while formal sections retain their own admission and verification rules.
- [`auditing-research-processes`](auditing-research-processes/) — Audit one frozen bounded research episode and return a non-enacting recommendation.

#### Research responsibility map

Partition **decisions**, not people or subject areas. Each row owns one kind of result; a task may
need several rows. Applying another skill does not require another agent, a new record, or a pause.
This is the collection's responsibility map. Individual skills own the detailed contracts.

**Knowledge operations** change what can be claimed. Select by the requested result:

| Input → operation | Result | Sole owner |
|---|---|---|
| Existing artifact → inspect a factual row | Located observation | `raising-resolution` |
| Source corpus → synthesize its evidence | Known/uncertain/disputed/missing position, or source-side DONOR SET | `systematizing-knowledge` |
| Signed corpus gaps → specify observations that would resolve them | Non-authoritative OPENINGS SHEET | [`operationalizing-research-gaps`](../../archives/skills/operationalizing-research-gaps/SKILL.md) (retired) |
| Existing plan/frame → expose assumptions | Blind-spot packet; no proposed solution | `surfacing-blind-spots` |
| Observed P versus expected Q → construct an explanation | HYPOTHESIS and vocabulary grounds | `forming-hypotheses-from-anomalies` |
| Bounded local frame supplied/agreed in the task and sourced seed → transform | Unranked CANDIDATE or MAPPING-BREAK | `forging-novel-theses` |
| Bounded statements/findings → construct or revise theoretical relations | THEORY MAP / THEORY CHANGESET | `systematizing-theories` |
| Exact statement → prove or formalize | Statement/version and proof/faithfulness status | `proving-theorems` |
| Measurement and contract → qualify validity/comparability | EVIDENCE DISPOSITION | `validating-experimental-evidence` |
| Finished claim and evidence → argue or appraise | CLAIM SPEC or paper appraisal | [`arguing-research-papers`](../../archives/skills/arguing-research-papers/SKILL.md) (retired) |
| Frozen research episode → audit evidence/process | Non-enacting process audit and recommendation | `auditing-research-processes` |

**Execution and commitment** determine what to do with current knowledge:

| Decision | Owned result | Sole owner |
|---|---|---|
| What useful bounded work runs next, and what changes after its return? | Rolling ITERATION_PLAN/LOG | `driving-bibifi-cycles` |
| Does evidence justify one costly/hard-to-reverse bet? | Precommitted test table and Commit/Pivot/Kill | `acting-on-hypotheses` |
| Who executes, sees, verifies or stops a ticket, under which resources? | Dispatch/visibility/lifetime/resource contract | `orchestrating-agents` |

Domain executors implement, measure or check proofs. BIBIFI selects and consumes their bounded work;
it cannot manufacture a validity judgment, a proof certificate or adoption authority by scheduling it.
Question clarification within an authorized local task stays with its content owner.

**Governance** applies only to the state or profile being governed:

| Decision | Owned result | Sole owner |
|---|---|---|
| Which programme problems receive allocation or mandates? | Programme state, OPEN_ISSUE and SECTION_MANDATE | `supervising-research-programmes` |
| Which work/learning is admitted within an existing mandate? | Section charter, intent and learning state | [`directing-research-sections`](../../archives/skills/directing-research-sections/SKILL.md) (retired) |
| What do explicitly used Director/PI/Researcher roles mean? | Fleet role charters and order forms | `commanding-research-fleets` |
| Which documents are authoritative, retained or retired? | Document admission/lifecycle | `governing-research-documentation` |
| What task state survives handoff or compaction? | TASK-CONTINUATION | `continuing-long-running-tasks` |
| Which trade-off wins when actors cannot confer? | Ordered doctrine | `codifying-doctrine` |

Ordinary theoretical or experimental work does not require creating a programme, section or fleet.
When that profile already applies, its authority and admission gates remain binding.
`directing-research` is retained only for explicit legacy invocation and immutable v1 compatibility;
its former generic entry role is consolidated into BIBIFI and the direct content owners above.

For theory work, construct one bounded chain in `systematizing-theories`, send an exact proof
obligation to `proving-theorems` or a discriminating check to BIBIFI, then incorporate the qualified
return into the theory. Existing obligations go directly to work; no corpus survey or openings sheet
is required. For an empirical anomaly, form/transform candidates only as needed, discriminate,
qualify the result, and revise the affected theory. These are feedback loops, not a mandatory staircase.

### Agent harness

- [`forging-skills`](forging-skills/) — Create and reforge Agent Skills to the house bar: triggers, gates, sibling cuts, verification.
- [`operating-the-harness`](operating-the-harness/) — Configure Claude Code itself: lean CLAUDE.md, hooks, permissions, verification loops, MCP, subagents.
- [`continuing-long-running-tasks`](continuing-long-running-tasks/) — Keep one evidence-linked task record trustworthy across compact, resume, and Codex/Claude handoff.
- [`driving-codex`](driving-codex/) — Drive the OpenAI Codex CLI (`codex exec`) as a headless worker: sonnet-wrapper pattern, sandbox flags, availability by probe, spend accounting.
- [`driving-claude`](driving-claude/) — **Codex-only**: drive Claude Code (`claude -p`) as a headless worker with trusted-CWD, least-privilege, JSON relay, and model-probe gates.
- [`driving-jev`](driving-jev/) — Drive TypeSafe Jev as a non-generative judgment engine: atomic Noul/Choice/Score questions, explicit abstention policy, and typed JSON relay.
- [`driving-antigravity`](driving-antigravity/) — Drive the Antigravity CLI (`agy`) as a headless worker: multi-vendor roster on one subscription, no per-call meter, unconfined by default.
- [`driving-grok`](driving-grok/) — Drive xAI's Grok Build CLI (`grok`) as a headless worker: metered + real sandbox, but an EXFIL-RISK data-minimize law, catalog by probe.
- [`driving-cocoindex`](driving-cocoindex/) — Route declared query shapes through `repo-retrieve`: ccc for concepts/structure, rg for lexical enumeration.
- [`orchestrating-agents`](orchestrating-agents/) — 委任体制を運転する監督の規律: 宣言制・委任契約・検収の試験・pacing の12門(旧 acting-as-director)。

### Coding & proofs

- [`implementing-and-debugging`](implementing-and-debugging/) — Discipline for writing or fixing non-trivial code: understand intent, fix the root cause, avoid flailing.
- [`practicing-tiger-style`](practicing-tiger-style/) — Risk-calibrated Tiger discipline for high-consequence code: bounds, invariants, and a checkable failure-mode ledger.
- [`refactoring-code`](refactoring-code/) — Behavior-preserving structural change toward 責務分界/局所化; harshly refuses 場当たり churn; enforces the two hats and name-your-oracle.
- [`writing-julia`](writing-julia/) — Write correct, fast Julia for research — reach for it before any Julia coding or numerics.
- [`optimizing-julia-gpu-kernels`](optimizing-julia-gpu-kernels/) — Write and optimize CUDA.jl GPU kernels — or prove you shouldn't (vendor libs and fusion beat hand kernels).
- [`verifying-symbolic-identities`](verifying-symbolic-identities/) — Decide whether an identity holds with exact computer algebra, and label the rung it reached (never call random points symbolic).
- [`writing-rust`](writing-rust/) — Write modern (2025/2026) Rust with crate selection as the spine: right crate for the job, sync-before-async, ownership-before-clone, verify-before-recommend; performance is measured, not automatic.
- [`writing-python`](writing-python/) — Modern (2026) Python with library SELECTION as the spine: uv owns env/deps, ruff owns lint+format, typed surfaces, pydantic v2 at boundaries.
- [`writing-typescript`](writing-typescript/) — House TypeScript idioms (`satisfies` over `as`, `??` over `||`, ts-pattern, zod) when writing or reviewing `.ts`.
- [`writing-bun-scripts`](writing-bun-scripts/) — Local automation in Bun TypeScript: zero-config single-file scripts, Bun.$/spawn+timeout, pinned bunx, and the bash→TS refactor map.
- [`proving-theorems`](proving-theorems/) — Formalize and machine-check math proofs, with AI drafting and human-owned statement faithfulness.
- [`running-python-tools`](running-python-tools/) — Run every Python tool via uv/uvx instead of pip, keeping environments isolated and reproducible.
- [`wiring-mise-tasks`](wiring-mise-tasks/) — One mise verb contract for every repo (fmt/f, lint, test, up, check…): naming grammar, per-language templates, and a resolution gate that catches drift.
- [`wiring-repositories`](wiring-repositories/) — Which wiring layers a repo admits, the order whose violations are silent, the git-hook shape, and a floor that audits the joint for life.
- [`driving-git`](driving-git/) — Operate git by job: unambiguous verbs (switch/restore), enumerated commits, ceremony sized by blast radius, a receipt closing every operation, and a shared-checkout protocol.
- [`driving-jujutsu`](driving-jujutsu/) — Operate jj changes, bookmarks, Git colocation, remote publishing, and operation-log recovery with checkable receipts.

### Systems & security

- [`governing-configuration-systems`](governing-configuration-systems/) — Design or audit executable configuration: consumer/trust regime, canonical bytes, authority, exceptions, and target validation.
- [`operating-wsl2-on-windows`](operating-wsl2-on-windows/) — Operate a WSL2 compute host on Windows: why C: fills while the guest looks healthy, the disk-reclaim levers, the host-number measurement traps, and recovery when the box wedges.

### People & media

- [`transcribing-media`](transcribing-media/) — Transcribe authorized audio/video locally into text or subtitles via Whisper.


## Vendored (upstream)

Third-party skills kept in-tree for convenience — vendor platform docs, not authored here.
Acquired through `mise run skills:add`; provenance is recorded in `agents/skills-lock.json`.
The pre-2026-08-14 Cloudflare entries predate that path and carry no ledger record.

- [`web-perf`](web-perf/) — Audit page-load speed and Core Web Vitals with Chrome DevTools MCP.
- [`typesafe-ai`](typesafe-ai/) — Build AI-powered features with TypeSafe: typed judgment/probability primitives (System One models, Jev) composable into routing, ranking, extraction, and verification.

---

<sub>Index is hand-curated; `mise run lint:skills-index` checks every skill dir is listed. Summaries are human paraphrases — each `SKILL.md` frontmatter is the source of truth for triggers.</sub>
