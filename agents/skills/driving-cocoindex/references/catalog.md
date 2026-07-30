# catalog.md — dated perishables, ccc (cocoindex-code) & the cocoindex framework

> Everything below rots. Verified 2026-07-12/13 via live-trial (starlette corpus, this host's
> `qoed` project) + raw API calls (`gh api`, `curl pypi.org/pypi/.../json`, local `--help`/
> `ccc doctor`) — deliberately NOT WebFetch-summarized pages (one caught a 2026→2025 date
> hallucination, see Provenance hygiene at bottom). On reforge, re-run the same raw-API/
> `--help`/`ccc doctor` probes instead of trusting this snapshot. Durable rules (PROJECT-BY-CWD,
> PULL-BASED, ROUTE-BY-QUERY-SHAPE) live in SKILL.md — this file holds only the perishable
> numbers/tables those rules cite.

## Versions

| Package | Version | Cadence | Source |
|---|---|---|---|
| `cocoindex-code` (ccc) | row measured at **0.2.37**; installed is **0.2.39** as of 2026-07-30 — verify with `ls ~/.local/share/uv/tools/cocoindex-code/lib/python*/site-packages/cocoindex_code-*.dist-info`, and read source ONLY from that path: a stale 0.1.10 tree under `~/.cache/uv/archive-v0/` produced two false findings on 2026-07-30 | ~weekly now — 43 PyPI releases / 44 GitHub tags across a ~5mo life (first upload 2026-02-08, repo created 2026-02-01), initial burst (4/day, 2026-04-14) tapering to ~1/week; verify-fleet corrected an unpaginated first count | raw PyPI JSON `pypi.org/pypi/cocoindex-code/json` (`.releases \| keys \| length`) + `gh api --paginate repos/cocoindex-io/cocoindex-code/releases` |
| `cocoindex` (framework, upstream) | **1.0.16** | v1.0.9→1.0.16 in 24 days (2026-06-12→07-06), ~3–4 days/release | PyPI JSON + `gh api .../releases` |

Both `requires-python >=3.11`. Relationship: same org (`cocoindex-io`), same lead author
(`georgeh0`, top committer on both) — ccc's `requires_dist` hard-pins
`cocoindex[litellm]<1.1.0,>=1.0.13`; framework repo's own description calls ccc its "flagship
MCP server for AI coding agents." ccc is a product BUILT ON the framework, not a fork/sibling.
Scale: framework 10,715 stars / Rust 51.9% / Python 47.8% / Production-Stable classifier; ccc
2,498 stars.

`[full]` → torch chain (FACT, 3 chained PyPI JSON fetches): `cocoindex-code[full]` →
`cocoindex[sentence-transformers]` → `sentence-transformers>=3.3.1` → unconditionally requires
`torch>=1.11.0` + transformers/huggingface-hub/scikit-learn/scipy, none gated behind a further
extra. Base install (no `[full]`) is LiteLLM-only — cloud embedding, needs an API key, no torch.
uv install on this host is **UNPINNED** (`uv-receipt.toml`: `{name:"cocoindex-code",
extras:["full"]}`, no version bound) — a future `uv tool upgrade cocoindex-code` floats straight
to whatever PyPI publishes next; `uv tool upgrade --help` has no `--dry-run` (confirmed: exit 2
on the flag). Consider pinning if drift risk matters more than staying current.

## MCP `search` tool — schema verbatim + a version trap

`initialize` response (only reachable from an ALREADY-initialized project — CC1 in SKILL.md):
`serverInfo: {"name":"cocoindex-code","version":"1.28.0"}`. **This "1.28.0" is NOT the ccc
package version (0.2.37)** — almost certainly the MCP protocol-framework's own version leaking
through [UNVERIFIED which library]. Never cite MCP `serverInfo.version` as ccc's version.

`initialize.instructions` (verbatim, the model-facing hook text): "Code search and codebase
understanding tools. Use when you need to find code, understand how something works, locate
implementations, or explore an unfamiliar codebase. Provides semantic search that understands
meaning -- unlike grep or text matching, it finds relevant code even when exact keywords are
unknown."

`tools/list` — exactly ONE tool, `search`, verbatim shape:
```json
{"query": "string, required — NL or code snippet",
 "limit": "int 1-100, default 5  ← NOTE: CLI's own `ccc search` defaults to 10, not 5",
 "offset": "int, default 0",
 "refresh_index": "bool, default TRUE  ← NOTE: CLI's `--refresh` defaults to FALSE — asymmetry",
 "languages": "string[] | null", "paths": "string[] glob | null, e.g. ['src/utils/*','*.py']"}
```
Returns `SearchResultModel{success, results:[{file_path, language, content, start_line, end_line,
score}], total_returned, offset, message}`. Startup timing (warm daemon, from an initialized
project): `initialize` 0.250s, `tools/list` +0.002s after — MCP startup itself is never the
bottleneck; the CC1 registration gate is (unregistered cwd exits before any of this).

## Measured numbers — starlette trial corpus (100 files, 1205–1206 chunks, dim-384, this host)

| Metric | Value | Note |
|---|---|---|
| `ccc search` latency | ~0.1–0.4s wall | dominated by `uvx` process startup (user+sys time only 0.06–0.08s), not model inference |
| `rg` latency, same queries | 0.006–0.02s | for comparison only — different tool, different job |
| Incremental reindex (1 file changed / 102 listed) | 0.428s | |
| Incremental reindex (9 files changed) | 1.022s | |
| Full from-scratch rebuild | ~5–8s / 100 files | |
| DB size, starlette trial | 13MB (`target_sqlite.db`, 100 files/1205 chunks) | dir total 18M |
| DB size, `qoed` (real project) | 88M total — `cocoindex.db/` 44M + `target_sqlite.db` 45M (46,071,808 B) | 853 files / 11,962 chunks |

**Head-to-head, 6 queries, `ccc search` vs `rg`** (starlette corpus, clean HEAD, verdicts are
this trial's, not a general law — re-run for other corpora):

| # | Query shape | Winner | Why |
|---|---|---|---|
| a | "where are HTTP redirect responses implemented" (concept, vocabulary mismatch) | **ccc** | `rg redirect` buried the real class in 30+ noisy hits; ccc ranked it #3 |
| b | "how does middleware wrap the application" (concept, code doesn't say "wrap") | **ccc**, with caveat | `rg -i wrap` → zero hits; but ccc's own top-4 buried the real mechanism below markdown docs until `--path`-filtered |
| c | "websocket disconnect handling" (query word = the actual identifier) | **rg** | `rg disconnect` hit `on_disconnect` directly in 0.006s; ccc's top-6 were all tests/docs |
| d | "background tasks run after response" (same doc-ranking-bias pattern as b) | **rg** | ccc buried the 3 real call sites below docs/tests entirely off top-6 |
| e | "test client cookie persistence across requests" | **ccc**, marginally | neither tool found the true root cause (inherited from httpx); ccc's set was more actionable |
| f (adversarial) | exhaustive call-site enumeration of `get_route_path(` | **rg, decisively** | `rg` = 5/5 exact call sites, 0.017s; ccc top-8 missed 2/5 real sites AND 5/8 hits had zero literal match (pure false positives) |

Pattern across b/d/e: this embedding model has a measured **doc-over-code ranking bias** —
markdown restating the query's vocabulary systematically outranks the correct implementation.
`--path` filtered to the source tree recovers it (this is the mitigation, argued in
`operations.md`).

**`ccc grep` vs naive line-regex, multi-line signatures** (`starlette/responses.py`, pattern
`def __init__(\(ARGS*\)) -> None:`): ccc grep found **all 9** `__init__` defs incl. 7 spanning
multiple (black-formatted) lines; a naive `rg '^\s*def __init__\(.*\) -> None:'` caught only
**2 of 9** — a 7-of-9 miss for line-based regex on real formatter-wrapped code. This is the
concrete case for ccc grep's AST/structural, whitespace-invariant matching.

## Markdown-corpus trial (2026-07-13, this host) — prose recall + the LANGUAGE-WALL

Corpus: md-only mirror of the house `agents/skills/` tree (526 files / 5,432 chunks; 4.6MB
per `du -sh`, this session) + 1 planted JA note (`nukadoko.md`, authored for the trial —
unique topic by construction) = 527 files / 5,434 chunks. Model: shipped default
`Snowflake/snowflake-arctic-embed-xs` (dim-384). All grades **HIGH** (direct measurement)
unless noted. Caveat: one corpus, single-digit probe count (2 EN→EN concept + 4 wall +
3 rephrase + 1 EN token control) — indicative, not a benchmark.

| Metric | Value |
|---|---|
| Full first index | 93.5s wall (526 files / 5,432 chunks) |
| Incremental re-index, 1 md file added | 0.97s |

**EN→EN concept queries** (vocabulary-mismatch, ground truth known):

| Query | Truth rank / top-10 score band |
|---|---|
| "why do search results become outdated after editing files" → driving-cocoindex stale-row | **#3** (0.648; band 0.664–0.636) |
| "prevent two skills from both activating on the same request" → forging-skills F2 | **#4** (0.617; band 0.631–0.597) — also #8 |

`rg` controls: Q1 `outdated` hit 5 files, none the truth (it says "stale"); Q2 `activating`
(vendor dirs excluded) hit 2 files, none the truth (it says "trigger"/"collision").
Truth-in-top-5 but flat bands → top-k is a candidate set, not an oracle (operational form →
`operations.md` §4b).

**Wall probes** (3 of 4 failed; the one success carries an anomaly):

| Probe | Result |
|---|---|
| JA→JA, real doc ("おかしな形式のツール出力が会話履歴に紛れ込むのを止めたい" → recovering-poisoned-context) | truth absent from top-8; **#1 = the unrelated nukadoko plant @ 0.595** |
| JA→JA, plant ("野菜を漬ける発酵床の日々の手入れ" → nukadoko) | ranking SUCCESS — #1 @ 0.545. Anomaly: the unrelated query above scored this same doc HIGHER (0.595 > 0.545); cross-query score comparison is suggestive, not conclusive — the raw-model matrix below is the cleaner evidence |
| EN→JA ("daily care routine for a fermented rice bran pickling bed" → nukadoko) | absent from top-8 — no cross-lingual bridging |
| JA exact-token (「ぬか床」 → the only file containing it) | missed entirely; top-8 = random JA-ish files @ ~0.65 — but see the EN token control below: NOT language-specific evidence |

**Rephrase probes** (run during adversarial verification; truth =
`recovering-poisoned-context/reference.md`, a JA/EN-MIXED technical doc):

| Paraphrase | Result |
|---|---|
| 「壊れたツールコールが履歴を汚染しないようにする方法」 (pure JA, closer vocab) | truth recovered at #3/#4/#8 — below the nukadoko attractor (#1 @ 0.587) |
| 「malformed な tool call を context に入れない対策」 (code-switched — reuses the doc's own EN technical tokens) | **truth #1 @ 0.763 and its chunks sweep the entire top-8** — strongest retrieval of the whole trial |
| 「ツール呼び出しの失敗出力を検出して透過的に除去する仕組み」 (pure JA, different vocab) | truth absent from top-8 |

Rephrase verdict: topical signal flows through ENGLISH tokens. Pure-JA phrasing is
unreliable (1 of 2 extra paraphrases recovered, never to #1); code-switching onto the
note's EN vocabulary is a real, measured craft fix for JA/EN-mixed notes (`operations.md`
§4b owns the rule).

**EN exact-token control**: `CoRNStack` (rg-confirmed unique to 1 file) — `ccc search`
missed it entirely (top-8 noise @ 0.55–0.58). Exact-token misses are the GENERAL
embedding-top-k limitation (CC3), in BOTH languages — the JA exact-token miss above is
consistent with it and does not distinguish the language wall.

**Raw-model cosine matrices** (query-side, normalized, via the ccc uvx env — isolates the
model from ccc plumbing):

| Pair | arctic-embed-xs | granite-107m-multilingual |
|---|---|---|
| JA query ↔ correct JA doc (tool-output topic) | 0.545 | **0.676** |
| same JA query ↔ WRONG JA doc (nukadoko) | 0.593 (**wrong beats right**) | 0.483 |
| JA query ↔ correct JA doc (nukadoko topic) | 0.556 | **0.670** |
| reverse pair: nukadoko query ↔ tool doc | 0.471 | 0.458 |
| EN query ↔ JA doc, same topic (cross-lingual) | 0.465 | **0.639** |
| JA query ↔ EN doc, same topic (cross-lingual) | 0.342 | **0.686** |
| EN query ↔ correct EN doc (control) | 0.756 | 0.792 |

Verdict, citing only tabled values: arctic's JA↔JA pairs land at 0.471–0.593 with
wrong-beats-right on the tool topic, while its EN control separates cleanly (0.756 on-topic
vs 0.342–0.465 for everything cross-lingual). A symmetric-encode counter-probe (no
`prompt_name: query`, doc-side encoding of both JA queries against `JAdoc_nuka`) reproduced
the blindness — 0.633 for the WRONG query vs 0.635 for the right one — so ccc's asymmetric
prompt config is not the cause; this is the model. granite restores JA discrimination
(0.670/0.676 on-topic vs 0.458/0.483 off-topic) and EN↔JA bridging (0.639/0.686) at the
raw-model pairwise level. The current house model is `granite-311m-multilingual-r2`; see
§Active model for the JA-notes + code A/B pilot that chose it and the reindex-on-swap rule.

## Embedding models — landscape by pointer, specs by probe

Two hand-copied tables used to live here: a snapshot of ccc's own curated `EMBEDDINGS.md`
(dated 2026-06-15 in the doc itself) and a "wider landscape" params/dims/notes table. Both rot
the same way — model cards and leaderboards update continuously, this file does not — and the
snapshot already had visibly stale entries by the time it was checked. Neither table survives a
reforge; use the pointers and recipe below instead.

**Landscape** (externally maintained, read live — do not re-snapshot into this file):
[MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard) for general/multilingual
retrieval ranking across candidate embedding models; [JMTEB](https://huggingface.co/datasets/sbintuitions/JMTEB)
for the Japanese-specific benchmark — directly relevant given this house's LANGUAGE-WALL
constraint (SKILL.md).

**Probe recipe** — before trusting any remembered spec for a candidate `<id>`, fetch it:

```bash
curl -sS https://huggingface.co/<id>/raw/main/config.json
# → hidden_size, num_hidden_layers, max_position_embeddings
curl -sS https://huggingface.co/<id>/raw/main/config_sentence_transformers.json
# → prompts (query/document — present but empty, or absent), default_prompt_name
```

`config.json` is the params/dim/context-length ground truth. `config_sentence_transformers.json`
shows whether the model needs asymmetric query-vs-document prompting — relevant before wiring
`query_params`/`indexing_params` for it in `global_settings.yml` (procedure → `operations.md`).

**Active model — `granite-embedding-311m-multilingual-r2` (dim 768), swapped 2026-07-17.**
Chosen by a local A/B pilot on the house JA-notes + code corpus (278 chunks, 28 vocabulary-
mismatched concept queries, candidate local models on this host). nDCG@10:

| Model (dim) | notes | code | all | vs prior |
|---|---|---|---|---|
| `granite-97m-r2` (384) — prior active | 0.341 | 0.300 | 0.322 | — |
| **`granite-311m-r2` (768) — chosen** | **0.595** | **0.493** | **0.548** | **+70%** |
| `cl-nagoya/ruri-v3-70m` (384) | 0.584 | 0.124 | 0.370 | notes win, code collapse |
| `cl-nagoya/ruri-v3-310m` (768) | 0.555 | 0.281 | 0.428 | dominated by 311m-r2 |

311m-r2 is the only candidate that beats the prior model on BOTH halves. ruri-v3 (JA-prose
specialist, no code training) wins Japanese notes but collapses on code — its tmux / editor /
symlink-prune queries land at ranks 23–244 — so it cannot serve as ccc's GLOBAL single model.
NVIDIA Nemotron-3-Embed rejected upstream: 1B/8B decoder-embedders, GPU-required, no CPU
backend, no isolated JA evidence.

Reindex under ccc's daemon: ~100 chunks/s — qoed 16,090 / 159s, beateater 12,551 / 161s,
min-sys-dpp-mvp 3,649 / 32s.

**End-to-end smoke anchor (qoed), current**: the JA query 「境界条件の正規化」 returns
`docs/records/R2607_038-three_master_theorems_program.md:159-165` at rank 1 / **0.900** on the
current (incumbent) index — verified live this session via `repo-search concept`. This replaces
the prior anchor (`\section{適用境界}` in `papers/P2606_003-sok_randomized_metrology/main.tex`,
last recorded at 0.90): that document was excluded from qoed's index by commit `7d915ed`
("fix: 降格済み文書を意味検索の索引から外し、漏れを gate で止める"), dated **2026-07-28** — two
days before the exclusion's effect was misread as a 2026-07-30 model regression during the
bekko trial (§ below). A smoke anchor's target document is a corpus-scoping dependency, not a
fixed constant — re-verify the anchor still resolves under the CURRENT index before trusting any
"smoke passed/failed" verdict measured against it (see the Known issues row on oracle rot).

Lineage: 311m-r2 supersedes granite-97m-r2 (active 2026-07-13→07-17), which replaced the
EN-only `snowflake-arctic-embed-xs` to fix the Japanese language-wall. Both granite tiers
define an empty "query" prompt, so `query_params.prompt_name: query` stays valid. Swap
procedure and the reset-on-change rule: `operations.md` (owner).

### Tried and reverted on a confounded smoke — `hotchpotch/bekko-embedding-v1-a25m` (dim 384), 2026-07-30 — status: UNDECIDED

Source: secon.dev 2026-07-29. MIT, 100+ languages, **24.93M active params** (123M total),
Matryoshka 384→256/128/64, 190 MiB, sentence-transformers-native. Both `query` and `document`
prompts are declared but EMPTY (probed via `config_sentence_transformers.json`, recipe above) —
same as the incumbent, so prompt-vs-no-prompt was not a factor either way. **Context length is
NOT an advantage over the incumbent**: probed `max_position_embeddings` is 8,192 for a25m vs
**32,768 for `granite-embedding-311m-multilingual-r2`** (same recipe) — the incumbent's context
window is 4x larger; an earlier draft of this entry implied 8,192 tokens was a selling point over
the incumbent, which was backwards. Vendor benchmark is MMTEB Multilingual v2 only (a25m 57.5 on
18 retrieval tasks) — no JMTEB and no code-retrieval evidence, which is why it was measured
locally rather than adopted on the strength of an aggregate.

Local A/B on a FRESH corpus (the 2026-07-17 pilot's 278 chunks / 28 queries did not survive, so
the incumbent was re-measured in the same run — these numbers are **not comparable to the
Active-model table above**, P8 FOOTING). 489 chunks (424 JA-notes sections + 65 code
declarations) from this repo; gold is auto-generated, never hand-written (markdown heading → its
body with the heading text deleted; a declaration's comment block → its code body with comments
stripped), so vocabulary mismatch is structural. The notes half doubles as the distractor set for
code queries, which reproduces the documented doc-over-code bias. nDCG@10, `all` = **macro** mean
of the halves:

| Model (dim) | notes | code | all | vs incumbent |
|---|---|---|---|---|
| `granite-311m-r2` (768) — incumbent | 0.382 | **0.854** | 0.618 | — |
| `bekko-v1-a8m` (384) | 0.401 | 0.814 | 0.608 | notes +5%, code −4.7% |
| **`bekko-v1-a25m`** (384) | **0.426** | 0.852 | **0.639** | **notes +11.5%, code −0.3%** |

a25m won Japanese notes and was statistically indistinguishable on code (Δ −0.0024 on n=65, far
below what 65 queries can resolve) — it did not repeat the ruri-v3 failure above (ruri lost 43%
of code; a8m is dominated by a25m on both halves). Threshold was pre-registered before the run —
adopt-candidate if code degrades ≤5%, reject at >10% — and a25m passed it. Three items were
flagged as unmeasured before adoption: (1) confirmation on a second registered corpus (qoed /
beateater are different material — LaTeX and prose, not this repo's JA-notes+code mix), (2) the
code half's ceiling was suspiciously high (0.85 for both models — identifier leakage from
comment into code may have been compressing the difference), (3) reindex throughput and
Matryoshka truncation under ccc's daemon were untested. The pre-registered threshold and this
table both said adopt-candidate; the swap went ahead the same day.

**What happened next, and why it does NOT settle the question.**
`ccc reset --force && ccc index` ran across registered projects, and the recorded qoed
end-to-end smoke — 「境界条件の正規化」 → `\section{適用境界}` — was read as FAILED: the target
string no longer appeared anywhere in the top 30 (incumbent, recorded earlier: rank 1 @ 0.90),
and the top-10 score spread had collapsed to 0.519–0.480. bekko was reverted the same day on
this basis. Evidence for the observation itself: `cocoindex/global_settings.yml`'s model-history
comment (this repo, dated entries — the qoed numbers above are copied from it verbatim, not
re-measured here).

That basis was **CONFOUNDED and does not support any verdict about bekko.**
`\section{適用境界}` lives in `papers/P2606_003-sok_randomized_metrology/main.tex:397` (this
repo — confirmed via `repo-search literal`). qoed's own `.cocoindex_code/settings.yml` excludes
`papers/P2606_003-sok_randomized_metrology/**` inside a generated "demoted document" block, an
authority-gate cleanup that landed in commit `7d915ed` ("fix: 降格済み文書を意味検索の索引から外し、
漏れを gate で止める"), dated **2026-07-28 14:56 JST — two days before the bekko swap**. The
smoke's target document was already outside the index before any model changed. Confirmed
independently, this session: with the index restored to the incumbent, the same query returns
`docs/records/R2607_038-three_master_theorems_program.md:159-165` at rank 1 / **0.900** — not
`\section{適用境界}`, which does not appear at all. The old expectation does not hold for the
INCUMBENT either; it was a stale oracle (§Active model owns the replacement anchor), not a bekko
regression.

**Verdict: bekko-embedding-v1-a25m is neither adopted nor validly rejected — UNDECIDED.** The
2026-07-30 revert was not justified by the evidence available at the time. The pre-registered
489-chunk A/B (table above) is still the only same-corpus signal on record, and it said
adopt-candidate. Re-opening this decision requires the three items already flagged as unmeasured
(above), run against a smoke anchor that is actually indexable — not a repeat of the 2026-07-30
swap on the strength of this table alone: a synthetic single-repo gold remains weak evidence for
a second, differently-shaped corpus, which is the caveat this entry has carried throughout and
which the confounded smoke never actually tested.

An earlier run of the same harness reported a25m at code −10.8% and was WRONG — its code half
was n=22 (file-level granularity, over-filtered), and its `all` column was a micro average over
a 200/22 split, i.e. a restatement of the notes half. Both defects were found and fixed before
any conclusion was recorded. Kept here because the corrected number is only trustworthy if the
correction is visible.

### Rejected on paper — `Shuu12121/CodeSearch-ModernBERT-Crow-Plus`

Appears in ccc's own curated `EMBEDDINGS.md` table as a local tier (the table this file no
longer copies — see above). Model card YAML frontmatter (`README.md`, probed 2026-07-30)
declares `language: - en` and lists its training datasets as `code-search-net/code_search_net`
plus the author's own `Shuu12121/{python,java,javascript,rust,ruby}-codesearch-filtered` sets —
CodeSearchNet-family code corpora. Its "multilingual" claim (visible in the model's own tags:
python, java, javascript, php, ruby, rust, go) means multiple PROGRAMMING languages, not
multiple natural languages. Adopting it as ccc's global embedding model would recreate exactly
the Japanese language wall that `granite-embedding-311m-multilingual-r2` was adopted 2026-07-17
to fix (§Active model above) — rejected on this reading of the model card alone, no local A/B
run.

## Known issues (provenance-graded)

| Issue | Grade | Basis |
|---|---|---|
| Daemon `BrokenPipeError`/streaming-response crash on client disconnect | **HIGH** | directly observed in `daemon.log` (2 occurrences) + matches a summarized top GitHub issue |
| `ccc mcp` hard-exits code 1 outside an initialized project, before the MCP handshake | **HIGH** | direct source read (`cli.py::require_project_root`) + direct reproduction; host log evidence: 34 client-log files spanning 2026-06-25→07-12, **35/35 connection attempts failed with the identical** `Not in an initialized project directory` **error, each in ~200–300ms** — the count SKILL.md's Gotchas row points at |
| No filesystem watcher; reindex is pull-based only | **HIGH** | direct grep of installed source for `watchdog\|watchfiles\|inotify\|fsevents`, zero hits |
| `describe`/`guide` mentioned in a changelog blurb (v0.2.34) don't exist in installed `--help` | **HIGH** (the absence) / low (the changelog claim itself) | direct `--help` vs. a summarized changelog fetch — docs/changelog-vs-reality mismatch |
| Return-type annotations break bare `):`-terminated `ccc grep` patterns | **HIGH** | directly reproduced on synthetic + real (`cli.py`) source |
| Voyage/Bedrock LiteLLM encoding-format breakage (fixed v0.2.31) | CONSENSUS only | summarized WebFetch of issues/releases, not reproduced |
| Dart file-type gap / watchdog-based auto-reindex requested | CONSENSUS only | summarized WebFetch of issues page |
| `ccc reset` (no `--all`) followed by unexpected auto-rebuild on next daemon poke | observed, **UNVERIFIED mechanism** | could not disambiguate background auto-rebuild vs. an implicit ensure-index side-effect of repeated status polls — do not rely on this behavior |
| Smoke-anchor rot: a corpus-scoping change (excluding a document from `settings.yml`) silently invalidates a recorded end-to-end smoke anchor, which then misreads as a MODEL regression on the next unrelated swap that happens to use it | **HIGH** | reproduced this session: qoed commit `7d915ed` (2026-07-28) excluded the 2026-07-17 smoke anchor's target document from the index, 2 days before that anchor was used to gate the 2026-07-30 bekko swap and reverted it; the SAME anchor also fails against the CURRENT incumbent index (verified live), proving the anchor had rotted, not the model — rule: a smoke anchor is a corpus-scoping dependency, not a fixed constant; re-verify it resolves under the CURRENT index before trusting a pass/fail verdict measured against it, and record which file the anchor depends on so a future exclusion is traceable |

## Provenance hygiene

A **WebFetch-summarized** page read mis-rendered 2026 release dates as "2025" for ccc's own
release table — caught only by cross-checking raw `gh api repos/.../releases` / PyPI JSON, which
are authoritative. Rule for reforging this file: prefer raw `curl`/`gh api`/direct command output
over WebFetch's small-model summaries for anything date- or number-sensitive; the installed
package's own Python source (`cli.py`, `server.py`, `settings.py`, `daemon.py`, `client.py`) was
the single best ground-truth source available this session — better than the docs site (never
independently raw-fetched, everything from it here is CONSENSUS-backed via a summarized GitHub
README instead) or GitHub README-via-summarizer.
