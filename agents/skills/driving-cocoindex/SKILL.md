---
name: driving-cocoindex
description: >-
  Drives cocoindex-code (ccc) — daemon-backed SEMANTIC search over code AND markdown/notes
  corpora — from setup to daily driving. Use when a search names a CONCEPT rather than a
  literal string (「どこで実装されてる？識別子不明」, "find the code that handles X", 意味検索 /
  セマンティック検索 / コード検索, markdown・ノート・メモ・ナレッジベースの意味検索;
  PDF・バイナリは非対応→要変換, 「どこかに書いたはずだが言葉を思い出せない」想起検索, ccc, cocoindex, コードインデックス
  作成/更新, ccc search が古い・ヒットしない, 日本語クエリだけヒットしない, ccc の embedding
  モデル変更, multi-line/formatter-wrapped signature の構造検索 → ccc grep), or any
  ccc/daemon/index operation. LAW: PROJECT-BY-CWD — every verb except ccc grep needs a
  ccc init-ed cwd: verify registration FIRST (CC1); PULL-BASED — no file watcher;
  un-refreshed results are silently stale (CC2); ROUTE-BY-QUERY-SHAPE — semantic top-k is
  never exhaustive (CC3); LANGUAGE-WALL — the default embedding model's topical signal is
  EN-only: 純和文の意味検索はモデル交換が前提, JA/EN 混在ノートは英語トークンで code-switch
  検索. Cuts: literal string/regex or every-call-site → Grep/rg (but multi-line STRUCTURAL
  patterns → ccc grep here); known-symbol defs/refs/rename → serena;
  open-ended repo tour → Explore agent; install/upgrade the binary → running-python-tools;
  MCP-server-dead diagnostics → operating-the-harness FIRST (co-fire). Workflow-native:
  searches fan out under the CC4 relay; routing + freshness stay SOLO. English skill;
  respond in the user's language (default Japanese).
---

# Driving CocoIndex Code — semantic code search as a disciplined subprocess

> **Version**: v2607.4.0 (2026-07-14 — PDF/binary non-support distilled as a boundary: silent-skip
> Gotcha + FIRES convert-first routing, 3-agent+codex-verified; prior v2607.3.0 2026-07-13 =
> LANGUAGE-WALL model swap to granite-97m-multilingual-r2, markdown-corpus trial folded in)
> **Scope**: operating `ccc` (cocoindex-code) — setup → project lifecycle → search/grep over
> code AND markdown/notes corpora (NOT PDF/binary — §Gotchas) → daemon → MCP surface → embedding in Workflow scripts;
> host-agnostic, with a note on this repo's dotfiles-declarative global-settings wiring.
> **Out of scope**: authoring `cocoindex` (the framework) pipelines yourself — that's plain
> data-engineering, no skill needed; contributing to `cocoindex-code`'s own Python source →
> `writing-python`.
> **Durability contract**: this body asserts NO version numbers, latencies, DB sizes, star
> counts, or model scores as FACTS — every fast-moving number lives in `references/catalog.md`
> under its dated header, and one asserted as fact in this body is a bug. Two declared
> exemptions, both dated bait re-verified on reforge: the description's trigger tokens, and
> the F3 table's quoted example asks (realistic queries need real names).
> **Build order (atomic)**: `for f in catalog operations; do test -f references/$f.md || echo MISSING $f; done; test -f tests/forge-verification-ledger.md || echo MISSING ledger`
> Durable operating guidance from a frontier model (Fable 5, 2026-07) to whatever model
> executes this later — encodes failures observed in a live trial. If a constraint here
> feels unnecessary, that feeling is the failure mode — follow the map.

## Language

Stable tokens even inside Japanese prose: **PROJECT-BY-CWD**, **PROJECT-REGISTER** (adding a
repo: init + first index) vs **RE-INDEX** (refreshing an already-registered one) — 'index'
alone is ambiguous, never use it bare; **PULL-BASED**, **ROUTE-BY-QUERY-SHAPE**,
**LANGUAGE-WALL** (the default embedding model discriminates topics in English only),
**RELAY**, **fire / no-fire**.

## THE LAW

> `ccc` is a cwd-bound, daemon-backed subprocess whose value is concept-to-code search.
> (a) **PROJECT-BY-CWD**: every capability except `ccc grep` gates on the cwd being inside an
> initialized project — the cwd is the ONLY project selector (verified: `ccc mcp` has zero
> flags); a search promised on an unregistered repo is a promise about a tool that will exit 1.
> (b) **PULL-BASED**: there is NO file watcher — an index is stale the moment a file is
> edited, `ccc status` shows NO timestamp, and nothing warns; freshness is an action
> (`ccc index` / `--refresh`), never an assumption. (c) **ROUTE-BY-QUERY-SHAPE**: embedding
> top-k is not exhaustive and carries a measured doc-over-code bias — exact identifiers,
> call-site enumeration, and structural patterns belong to rg / serena / `ccc grep`; semantic
> search earns queries whose vocabulary does NOT match the corpus (code OR prose — markdown
> corpora are in-scope, §Markdown). (d) **LANGUAGE-WALL**: the default embedding model's
> topical signal is English-only in practice — pure-JA queries and notes get topic-blind
> noise; JA/EN-mixed notes are reachable only through their English tokens (code-switch the
> query onto them — measured craft fix); never promise a 日本語 semantic search without
> checking the model first (single-corpus trial; evidence → `references/catalog.md`).
> Precedence: registered before searched · refreshed before trusted · query-shape before
> tool · language before promise · verbatim relay before verdict.

## Gates CC1–CC4

| Gate | Rule | Artifact |
|---|---|---|
| **CC1 REGISTERED** | Before any semantic-search claim, cite live registration evidence (`ccc status` in the target, or the daemon's project list). Unregistered target → the first move is PROJECT-REGISTER (`ccc init && ccc index`; cost table → `references/catalog.md`) or an explicit fallback to Grep/Explore — never a blind `ccc search` | the probe output |
| **CC2 FRESH** | Any load-bearing search AFTER edits carries refresh evidence — an `ccc index` run (CLI default does NOT refresh) or `--refresh` / MCP `refresh_index:true` (MCP DEFAULT refreshes; CLI does not — asymmetry stated) | the refresh line adjacent to the hits |
| **CC3 ROUTE** | Name the query shape before choosing the tool (the QUERY-SHAPE ladder — §Routing, `Grep`/`Explore` row). Wrong shape (e.g. semantic top-k for "every call site of X") is a gate violation even if results look plausible — the live trial measured both missed call sites AND false positives on exactly that shape (numbers → `references/catalog.md`) | the named shape |
| **CC4 RELAY** | A worker that searched relays VERBATIM {query, tool, hits as file:line + snippet, registration+freshness evidence}; "found it" without locus is quarantined | the relay tuple |

## The daily loop — invocation recipes (LOW freedom)

```bash
# PROJECT-REGISTER — once per repo
cd <repo> && ccc init && ccc index
# .gitignore gets ccc's own data-dir entry appended; only settings.yml stays committed
```

| Verb | Form | Notes |
|---|---|---|
| search | `ccc search "concept query" --limit N [--path 'src/**'] [--refresh]` | `--path` narrows to source and is ALSO the doc-over-code bias mitigation (argued in `references/operations.md`) |
| grep | `ccc grep 'PATTERN' [PATH]` | the ONLY project-independent verb — works in an uninitialized cwd, BUT outside a project it scans EVERYTHING unfiltered (no include/exclude, no .gitignore): cd to the intended subtree or pass PATH; metavariables `\NAME`, `\(ARGS*\)`; return-type gotcha: typed signatures need `-> \RET:` or drop the trailing-colon expectation |
| status | `ccc status` / `ccc daemon status` | probe verbs — read before you search or claim registration |
| index | `ccc index` | RE-INDEX — the only way to clear staleness after an edit |
| reset | `ccc reset` [`--all`] [`--force`] | DBs only by default; `--all` also drops `settings.yml`; prompts `Proceed? [y/N]` and ABORTS without `--force` — non-interactive shells (agents) must pass it. Model change → ALWAYS `ccc reset && ccc index`, even same-dimension — the same-dim mixing case is silently unguarded (mechanism → `references/operations.md`) |

## Gotchas (2026-07)

| Symptom | Cause | Fix |
|---|---|---|
| MCP shows "Failed to connect" for cocoindex-code in a repo | cwd is not `ccc init`-ed — the process exits before the MCP handshake even starts (every logged connection attempt on this host failed with the identical error; counts → `references/catalog.md`) | `ccc init` in that cwd, or accept CLI-only until you do |
| search hits look stale after an edit | PULL-BASED — no file watcher exists; `ccc status` carries no timestamp/dirty field | `ccc index` or `--refresh` before trusting a load-bearing hit |
| `ccc grep` returns zero matches on a `def`-shaped pattern clearly in the file | bare trailing `):` doesn't match a return-type-annotated signature | wildcard the return type — `-> \RET:` — or drop the trailing colon |
| top hits are all markdown/docs, real implementation missing or buried | embedding model has a measured doc-over-code/prose bias | `--path` filter to the source tree; re-run before trusting the global top-k |
| PDF (or any binary) file silently missing from the index — `ccc index` lists FEWER files than the dir holds, with no error and no count for it | ccc's include-allowlist (`DEFAULT_INCLUDED_PATTERNS`) has no `.pdf`, and the reader is `read_text()` which drops non-UTF-8 input on `UnicodeDecodeError` — a PDF is pre-filtered and never even attempted, so nothing warns (verified end-to-end + codex cross-check, ledger 2026-07-14) | ccc indexes code + markdown/text ONLY. Convert PDF→Markdown/text FIRST (`docling` / `markitdown` / `pdftotext`), then PROJECT-REGISTER the `.md` output — no flag or config makes ccc read a raw PDF |
| daemon "Uptime" looks lower than the process's real age | uptime is a monotonic-awake clock — it does not advance across machine sleep | `ps -o lstart -p $(cat ~/.cocoindex_code/daemon.pid)` for true age |
| edited `global_settings.yml`, expected to need a manual daemon restart | NOT needed — the next `ccc`/MCP call's handshake detects the settings-mtime mismatch and auto-restarts | just re-invoke; no `ccc daemon restart` required |
| "offline" local embedding still shows HF Hub traffic in `daemon.log` | model LOAD still pings the Hub for cache-freshness/revision resolution even with cached weights | set `HF_HUB_OFFLINE=1` (and `TRANSFORMERS_OFFLINE=1`) for a true air-gap |
| `ccc reset` followed by an unexpected auto-rebuild you never triggered | observed once; the daemon mechanism behind it is UNVERIFIED | don't rely on it — always run `ccc index` yourself after a reset |
| `ccc index` killed/interrupted mid-build (Ctrl-C, timeout) — is the index broken? | the CLI is a thin client watching a daemon-side job; the daemon keeps indexing after the client dies (verified live, §operations 3) | poll `ccc daemon status` until `[indexing]`→`[idle]`, then `ccc status` — don't blindly re-run, don't trust a mid-build search |
| Japanese (or any non-EN) query returns plausible-looking but topic-blind hits | LANGUAGE-WALL — an EN-only embedding model (ccc's SHIPPED default arctic-xs is one; this host swapped it out 2026-07-13); measured at ccc AND raw-model level incl. a symmetric-encode control, so not a ccc bug (evidence → `references/catalog.md`) | check the ACTUAL model first (`cat ~/.cocoindex_code/global_settings.yml`). EN-only model + JA/EN-mixed notes: code-switch the query onto the note's EN tokens (measured first aid). Pure-JA corpora: multilingual model swap — end-to-end verified fix (`granite-…-97m-multilingual-r2`, catalog) — but the model is GLOBAL (no per-project override) and the verified candidate is SAME-DIM: `ccc reset --force && ccc index` in EVERY registered project, no error will warn (§operations 4b/6) |

## Markdown / prose corpora — in-scope, behind the LANGUAGE-WALL

A notes vault / docs tree is a valid PROJECT-REGISTER target: on a pure-markdown corpus the
doc-over-code bias has no code to outrank, and EN→EN concept recall measured usable — treat
top-k as a candidate set (`--limit 10`, then read), never stop at #1 (ranks/bands →
`references/catalog.md`; argued → `references/operations.md` §4b.1). Md-specific deltas,
argued in §4b: (1) notes churn faster than code — PULL-BASED staleness bites harder,
`--refresh` every load-bearing lookup; (2) the LANGUAGE-WALL and its code-switch first aid —
a pure-Japanese vault needs a multilingual model BEFORE any promise (the swap is an
end-to-end-verified fix that also left EN search better, → §4b.3; rg covers literal lookups
on unswapped hosts); (3) heading-echo and exact-token queries still belong to rg — in BOTH
languages (controls → catalog).

## MCP surface — one tool, and when to prefer the CLI

MCP exposes exactly ONE tool, `search` (full input/output schema → `references/catalog.md`);
its project binding is cwd-derived with zero override flags — an un-init-ed cwd produces the
"registered-but-dead" state: the server exits before the handshake and nothing in the tool
list says why (mechanism argued in `references/operations.md` §7 — one home, this is the
pointer).

Verdict: the CLI is the daily-driving surface — not because it escapes PROJECT-BY-CWD (it
does not; only `ccc grep` does), but because a Bash call makes the cwd EXPLICIT and
controllable per invocation (`cd <repo> && ccc …`), while MCP freezes it at server spawn.
MCP earns its place only per-project, where `ccc init` has already run and a caller wants
`search`'s typed JSON output over CLI text-scraping.

MCP-server-dead diagnostics (is the process even starting, trust prompt, restart) are
`operating-the-harness` territory — co-fire, run that FIRST; this skill supplies the
ccc-specific expected surface and the CLI fallback once harness-liveness is confirmed or
ruled out.

## Embedding in Workflow scripts

Every `agent()` passes `{model: 'sonnet'}` — the user-global PreToolUse hook denies the
Workflow otherwise (policy owned by `~/.claude/CLAUDE.md`, not here). A worker's prompt
embeds the CC1 registration probe and CC2 freshness probe verbatim before it searches, plus
the CC4 RELAY demand — paraphrase drifts.

```js
const cccSearch = (project, query) => agent(
  `cd "${project}" && ccc status  # CC1: confirm registration before searching
   ccc search '${query}' --limit 8 --refresh  # CC2: --refresh, never assume freshness
   Relay VERBATIM: the registration probe output, the refresh confirmation, and every
   hit as file:line + snippet. No hit without its locus.`,
  {model: 'sonnet', phase: 'Search', label: `ccc:${query}`})
// Shell safety: quote the path; queries containing quotes/$()/backticks must be
// sanitized or passed via a file — an ops manual that injects is worse than none.
```

- Fan out one worker per QUERY-SHAPE-homogeneous batch — mixing "find every call site"
  queries with "how does X work" queries in one fan-out defeats CC3 routing, since each
  shape wants a different tool.
- Recommended composition: ccc LOCATES the semantically relevant region by concept → serena
  NAVIGATES/EDITS the exact symbol once found. Not a collision — a pipeline.

## Execution model

| Step | Mode | Why |
|---|---|---|
| route / freshness / registration decisions | SOLO | the judgment spine — query shape, staleness risk, and registration state must sit in one context |
| a single search | SOLO (main-loop Bash) | spawn overhead exceeds the work |
| parallel searches (query-shape-homogeneous) | FAN-OUT — one sonnet worker per query (CC4 relay) | independent; workers relay observables, not opinions |
| adjudicating conflicting hits across workers | SOLO | the verdict braids evidence from more than one search |

Evidence type: **CITATION-RELAY** — a hit is an observable (file:line, Read-verifiable); a
relayed conclusion without its locus is zero. Generic agent contract by pointer: the
`systematizing-knowledge` orchestration reference. No harness → same map, serial Bash calls.

## MUST-NOT-FIRE — and the fire/no-fire set (F3)

FIRES:

| Ask | Why |
|---|---|
| 「レートリミットってこのサービスのどこで掛けてる？該当コードが見つからない」 | concept, not literal string — CC1 first move: confirm registration |
| "set up semantic search for this repo" | PROJECT-REGISTER is exactly this skill's territory |
| 「qoed で『境界条件の正規化』に相当するコード探して」 | named project, concept query — core case |
| "ccc search returning stale/no results" | CC2 freshness gotcha |
| 「ccc の embedding モデル変えたい」 | model-change procedure (`ccc reset && ccc index`, always); a bare 「embedding モデル選定」 with no ccc/code-index context is writing-python's ML-selection territory instead |
| a multi-line/formatter-wrapped signature structural hunt | `ccc grep`'s AST-invariant matching is the answer, not naive regex |
| 「markdown のメモ/ノート群も意味検索できる？『どこかに書いたはず』を概念で探したい」 | markdown corpora are in-scope — PROJECT-REGISTER the vault; 日本語ノートなら LANGUAGE-WALL gate first (§Markdown) |
| 「日本語で ccc search してもまともな結果が出ない」 | LANGUAGE-WALL gotcha — code-switch first aid for JA/EN-mixed notes; pure-JA needs the model swap, not query massaging |
| 「PDF/論文(ドキュメント)を ccc で意味検索したい」 | ccc は PDF 非対応 — 生 PDF は無言スキップ(§Gotchas)。境界を示し PDF→Markdown 変換 → 変換後 `.md` を PROJECT-REGISTER へ誘導するのがこのスキルの責務(cocoindex フレームワークの docling PDF→MD example は別層・スコープ外) |

MUST NOT fire (route):

| Ask | Route |
|---|---|
| "grep for every TODO comment" | `Grep` — literal string, zero setup |
| 「ノートのあの見出し、どこだっけ」(フレーズをほぼ覚えている) / 「'deploy' を含むノートを全部列挙」(全文検索) | `Grep`/rg — literal recall & exhaustive listing on markdown; top-k adds nothing a grep doesn't |
| "rename this function safely, show me its callers" | `serena` — exact symbol, not concept |
| 「このリポジトリを俯瞰したい、どこから読めばいい？」 | `Explore` agent — open-ended tour, no search term |
| "install/upgrade the ccc binary" | `running-python-tools` — uv-tool territory, before this skill's scope starts |
| "what is cocoindex / cocoindex-code?" | trivial — plain answer, no skill |
| editing `cocoindex-code`'s own Python source, contributing upstream | `implementing-and-debugging` co-fires FIRST (feature/bugfix change-safety, per writing-python's own cut) + `writing-python` for the Python idiom — not this skill |

CO-FIRE, ORDERED SECOND (fires, but not first):

| Ask | Order |
|---|---|
| "cocoindex MCP tools aren't showing up" (bare) | `operating-the-harness` diagnoses server liveness FIRST (MCP lifecycle); only once confirmed or ruled out does THIS skill supply the ccc-specific expected tool list and the CLI fallback |

## Routing — sibling cuts (reciprocal)

| Sibling | Cut |
|---|---|
| `running-python-tools` | INSTALL-vs-DRIVE — getting `ccc` onto PATH, pinning, upgrading (`uv tool install/upgrade cocoindex-code`) → there; everything you do once it's there → here. |
| `operating-the-harness` | MCP-LIFECYCLE-FIRST — is the `cocoindex-code` MCP server even starting (`.mcp.json`, trust prompt, `claude mcp list`, restart)? → there, co-fire, FIRST; what `ccc` itself does (search/daemon/project semantics), reached via MCP or direct Bash → here. |
| `serena` (MCP toolset, not a Skill) | SYMBOL-vs-CONCEPT, decisive — know the exact identifier and want its definition/callers/a safe rename/an outline? → serena. Know only the CONCEPT, not the literal string? → here. Recommended pipeline: ccc LOCATES by concept → serena NAVIGATES/EDITS the symbol. |
| `Grep` / `Explore` (non-skill) | QUERY-SHAPE ladder — literal string/regex/every-call-site → Grep; open-ended "tour this repo" with no search term → Explore; a CONCEPT query against an INDEXED project → here (CC1 first). |
| `raising-resolution` | Silent sub-step, LOWEST precedence: inspect the actual ccc state (`ccc status`, `ccc daemon status`, `cat ~/.cocoindex_code/global_settings.yml`, `claude mcp list`) before asserting a version/uptime/registration/MCP-liveness fact — never recall one from training; cocoindex-code is plausibly absent from training data entirely. |
| `writing-python` | Contributing to `cocoindex-code`'s OWN Python source (upstream) → there; operating the already-built binary → here. No collision in normal driving usage. |
| `systematizing-knowledge` / `structuring-documents` | SEARCH-vs-SYNTHESIS, decisive — 「ノートから探す/想起する」 (LOCATE passages in a corpus) → here; 「メモをまとめる/統合する/再構成する」 (SYNTHESIZE or reorganize what's found) → those skills. Shared 「メモ/ノート」 vocabulary, disjoint verbs; ccc can still serve as their locate step (pipeline, like serena). |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/catalog.md` | DATED snapshot: versions, MCP `search` schema, measured search/index numbers, head-to-head verdicts, the markdown-corpus + LANGUAGE-WALL trial (cosine matrices, measured multilingual fix), embedding-model tables (project-curated + wider landscape), known-issues provenance | any version, latency, size, star-count, or model-name/score question |
| `references/operations.md` | setup, per-project lifecycle, daemon internals, search craft (incl. §4b markdown/prose corpora + the language wall), `ccc grep` craft, embedding-model-change procedure, MCP wiring per-project | setting up a repo or notes vault, diagnosing daemon/search behavior, or changing the embedding model |
| `tests/forge-verification-ledger.md` | forge provenance, source-grade table, calibration, verification results | reforging this skill |
