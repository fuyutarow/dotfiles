# Forge verification ledger — writing-python (F3 artifact)

Append on reforge; never overwrite. The fire/no-fire desk-check set is `tests/trigger-set.md` —
re-run it after any description edit.

## 2026-07-12 forge (v2607.1.0) — creation from a source-graded, adversarially-planned harvest

### 1. Forge provenance

**Editor**: a frontier model (Fable 5, 2026-07) — solo for design/selection/gate-adjudication per
house convention; drafting and verification delegated to a fleet per user instruction.

**Harvest fleet — 11 agents total** (`harvest/agentCount.md`):

| Agent | Role | Output |
|---|---|---|
| sonnet ×9 (read-only) | per-domain landscape harvest | `harvest/{uv,language,host,libs-core,libs-data,validation,typecheck,ruff,llm-failures}.md` |
| sonnet ×1 (read-only) | sibling-skill cut audit (existence gate + reciprocal-edit scope) | `harvest/siblings.md` |
| codex ×1 (cross-vendor) | independent 2026 stack opinion, second model family | `codex-python-stack.md` (see caveat below) |

**Codex call — retried after a version-gate failure**: first attempt targeted `gpt-5.6-sol` and
failed (RC=1, no usage line) — `harvest/codex-xvendor.md` records the raw failure: CLI `OpenAI Codex
v0.141.0` rejected the model server-side ("`gpt-5.6-sol` model requires a newer version of Codex"),
after also emitting 17 unrelated skill-YAML load warnings on the same run (informational only, not
attributable to this forge). Per the signed spec, the retry ran `gpt-5.5` at `xhigh` effort and
produced the stack opinion filed at `codex-python-stack.md`.

**Provenance paths are SCRATCHPAD-ONLY, not shipped**: every `harvest/*.md`,
`codex-python-stack.md`, and `writing-python-design.md` path in this section names an ephemeral
session-scratchpad artifact — none exist in the repo; do not try to resolve them here. They are
recorded as prose provenance (what was harvested, by whom, when), same function as
writing-rust's ledger prose.

**Second harvest sweep (research/ML layer, same day)**: 6 more read-only agents —
exp-config (the hydra deep-dive incl. the instantiate() CVE trail), ml-frameworks-gpu (uv+CUDA
indexes), sci-validation (jaxtyping/beartype, dataframe contracts), tracking-repro (wandb/
mlflow; Neptune-shutdown and Aim-stall discoveries), notebooks-viz (marimo/CoreWeave;
japanize-matplotlib death), perf-parallel (profiler/acceleration ladders; the 3.14 forkserver
correction). Their output fed `references/research.md` (SPEC D9) + the D3-EXT/D7-EXT
extensions. A second codex cross-vendor call (hostile audit, gpt-5.5 xhigh, read-only) ran at
VERIFY: its P0 findings (Windows-CUDA marker, cu-index overclaim, torch-family routing
overreach) were adjudicated REAL and fixed — see §4.

**D1-EXT (retroactive editor sign-off)**: SKILL.md's research-layer rows in §1a, the five §1b
research kill rows, the research.md index/staleness/build-verify entries, and the Research-code
checklist block were applied directly by the editor (the description and SKILL.md surface are
editor-owned); §1a/§1b are declared summary SEAMS of `selection.md`/`research.md`/`idioms.md` —
sync deliberately, do not diff for byte-identity.

**harvest/summary.md**: one-line fan-out description ("Fan-out harvest of the 2026 modern Python
ecosystem to forge the writing-python skill") — not a content file, filed for completeness.

### 2. Source-grade table

Grades per `forging-skills/references/distilling.md` §3 (author-confirmed / needs-verification /
skill-supplied / third-party / constructed).

| Claim class | Grade | Notes |
|---|---|---|
| Official docs fetched live 2026-07-12 (docs.python.org, PyPI project pages, ruff/uv changelogs) | **author-confirmed** | Fetched directly by the harvest agents, not relayed secondhand |
| PyPI version snapshot table (uv/ruff/pydantic/httpx/pytest/pyright/… pinned versions) | **author-confirmed** | Live-checked 2026-07-12; every fast-moving fact carries `[dated:2026-07]` downstream |
| Consensus verdicts — polars-default-for-new-pipelines, boundary-validation-once cut, pyright-strict-default | **CONSENSUS** (multiple credible sources, named in `libs-data.md` / `validation.md` / `typecheck.md`) | Not an official decree from any single vendor — the reference files say so explicitly, not laundered as fact |
| Vendor benchmarks (msgspec 6–85x range, Litestar/msgspec throughput claims) | **third-party, interested party** | Attributed to the vendor in the referencing file; never restated as independent fact (global constraint) |
| LLM-failure ranked kill-list (frequency×damage ordering in `llm-failures.md` / `idioms.md`) | **constructed** | Engineered from ruff-rule existence + cross-referenced surveys; NO exact AI-vs-human defect percentages carried forward, per global constraint |
| Codex cross-vendor stack opinion (`codex-python-stack.md`) | **third-party model opinion** | A second model family's (GPT, gpt-5.5 xhigh) independent stack pick, used only as a cross-check against the sonnet fleet's consensus — not an authority, not blended silently into "the" recommendation |

Reflexive corollary (distilling.md §3): this skill demands verified-not-guessed library facts of its
own executor (PG1); this table holds the skill's OWN claims to that same bar rather than laundering
harvest-fleet output into unqualified prose.

### 3. Calibration inversion (distilling.md §4 template, filled)

| | Source's audience | This skill's agent consumer |
|---|---|---|
| dominant error | humans clinging to legacy tooling (pip/venv/setup.py, poetry-avoidance-by-habit, naive datetimes, pydantic v1 muscle memory) | **SAME direction** — a model's training-corpus recency skew reproduces the identical stale reflexes (`pip install`, `typing.List`/`Optional`, `os.path`, `datetime.utcnow()`, pydantic v1 `@validator`/`.dict()`), not the inverse |
| corrective bias | "adopt the modern tool, stop clinging to legacy" | same push — but a bare recommendation loses to corpus-frequency bias, so the skill enforces it mechanically via deny-gates (PG0–PG4), not persuasion alone |
| what to make prominent | the legacy→modern supersession/migration table | the **same** supersession table, promoted **first-class INLINE** in SKILL.md §1 (not an appendix) — because the failure axis matches the source's, prominence does NOT flip to a MUST-NOT-FIRE-first posture the way raising-resolution's inverted case does |

Argued: this is a **same-axis** inversion, the mirror case to raising-resolution's inverted one and
the same shape as growing-oss-adoption's ("author optimism → SAME axis, new form"). The orthogonal
over-firing risk this skill still carries (ad-hoc tool-invocation asks, concept questions with no
code) is a PURPOSE/MUST-NOT-FIRE concern, not this calibration axis — both are addressed, but they
are not the same knob and must not be conflated when reforging either one.

### 4. VERIFICATION FINDINGS — 2026-07-12 fleet, resolutions signed by the editor

Fleet: 8 sonnet lenses (self-contradiction, architecture, sibling-cuts, bloat/drift,
spec-fidelity, trigger desk-check, live fact-recheck, comparative judge) + 1 codex hostile
audit (gpt-5.5 xhigh, read-only; the fleet's own codex wrapper violated C3 by backgrounding the
call and returning early — re-run solo by the editor). 41 sonnet findings + 12 codex findings.

**Headline results**: comparative judge 5/5 wins vs the incumbent (running-python-tools alone),
zero ties; live fact-recheck 12/12 PASS on substance (3 quotation-precision nits, fixed).

**Fixed (editor-signed)** — the load-bearing ones:
- Gate coherence (HIGH, self-contradiction): SKILL.md/idioms cited ruff codes the house strict
  select never enabled → select now includes BLE, S, G, TRY400, ASYNC, NPY; T20 rows carry the
  opt-in caveat; per-file-ignores annotated live-vs-conditional.
- Sibling seam truthfulness (HIGH, sibling-cuts + architecture + comparative): "mirrored there"
  was asserted before the reciprocal edits existed → reciprocal cuts LANDED in
  running-python-tools (description + body), writing-rust, writing-julia,
  implementing-and-debugging, refactoring-code — the claim is now true.
- codex P0s: uv+CUDA marker excluded Windows (CUDA IS supported on win32 — marker now
  `linux or win32`); "cu128/129 removed" softened to new-wheel default vs still-serving older
  indexes; torch-family routing scoped to download.pytorch.org packages only (never lightning's
  generic deps).
- POST-SPEC DELTAS 4/7/8/9 landed (collections.abc + ignore-diagnostic naming; app-vs-library
  requires-python floor split; sync-before-async in selection.md; this convergence note: the
  cross-vendor gpt-5.5 opinion independently converged on every spine pick — uv / ruff /
  pyright-strict with ty-as-side-check / pydantic-at-boundaries / pytest / httpx / typer /
  polars-with-pandas-niche / structlog / zoneinfo-aware; disagreements: none material).
- pydantic-v3 line restored WITH its real source (libs-data harvest: v3 scoped small,
  pydantic#10033); weakly-verified torch.load-safetensors claim DELETED; hydra quote corrected
  to issue #3258's verbatim "cannot be a complete security boundary"; marimo pledge quote to
  future tense; conformance-run date to 2026-03-11; 139-vs-141 denominator explained;
  final-gate ruff invocation switched to project-pinned `uv run` (uvx = latest = drift);
  conda ban scoped to Python-dep management (native-toolchain niche = research.md §2's declared
  exception); pytest gate scoped to new suites; library lockfile nuance + supply-chain floor +
  free-threading runtime checks + pytest.raises idiom added; host-specific bootstrap/EOL notes
  generalized; environment.md header now declares the PG0★ one-home exception; idioms meta
  section cut to a pointer; trigger-set gained the uvx+httpx / wandb-dashboard / docstring
  near-misses, the hydra-OOM co-fire row, and honest re-classification of the two
  co-fire-shaped FIRES rows.

**Adjudicated, NOT changed (recorded so a re-verify doesn't re-litigate)**:
- No writing-julia cut in the description (budget 1017/1024) — writing-julia's own description
  claims the FROM-Julia ask and dominates its tokens; body Routing row + trigger-set note carry it.
- research.md keeps FILE-LEVEL dating (header now says so explicitly) — selection.md convention.
- SKILL.md §1a research rows stay — declared summary seam (D1-EXT above).
- quick_validate flags `paths:` frontmatter — known divergence: Claude Code supports it
  (writing-rust/typescript precedent); the plugin validator tracks the platform-API allowlist.
