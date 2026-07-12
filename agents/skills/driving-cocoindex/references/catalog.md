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
| `cocoindex-code` (ccc) | **0.2.37** = latest on PyPI, matches installed | ~weekly now — 43 PyPI releases / 44 GitHub tags across a ~5mo life (first upload 2026-02-08, repo created 2026-02-01), initial burst (4/day, 2026-04-14) tapering to ~1/week; verify-fleet corrected an unpaginated first count | raw PyPI JSON `pypi.org/pypi/cocoindex-code/json` (`.releases \| keys \| length`) + `gh api --paginate repos/cocoindex-io/cocoindex-code/releases` |
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

## Embedding models — two DISJOINT sets, do not conflate

**(a) ccc's own curated table** (`EMBEDDINGS.md`, snapshot dated 2026-06-15 in the doc itself):
local tiers `lightonai/LateOn-Code` / `LateOn-Code-edge`, `Shuu12121/CodeSearch-ModernBERT-Crow-
Plus`, `microsoft/harrier-oss-v1-270m`, `ibm-granite/granite-embedding-97m-multilingual-r2`;
cloud picks `voyage-4-large`, Gemini `text-embedding-004`, OpenAI `text-embedding-3-small`.
Installed default **Snowflake/snowflake-arctic-embed-xs** (22M params, dim 384, Apache-2.0,
"Very Fast"/CPU-friendly) scores **0.67** on ccc's own code-score metric — the **lowest of six
local tiers**, beaten even by the smaller 17M-param `LateOn-Code-edge` (0.82). Defensible as the
lowest-friction, fully-CPU, no-big-download default — not defensible as "best small code
embedder available"; the project's own docs steer power users elsewhere.

**(b) wider landscape** (asked-about models, cross-checked 2026-07; NONE appear in ccc's own
table (a) — a real gap, not an oversight to paper over):

| Model | Params/Dim | Local/API | Code-specific | Note |
|---|---|---|---|---|
| `Snowflake/snowflake-arctic-embed-l` | 335M / 1024 | Local | No — general retrieval | MTEB NDCG@10≈55.98; bigger dim = bigger reindex cost for a non-code-specific gain |
| `jinaai/jina-embeddings-v2-base-code` | 161M / 768 | Local (`trust_remote_code=True`) | Yes — GitHub-code + 150M+ code/docstring pairs, 30 langs | 8192-token via ALiBi; Oct-2023-era, Jina's own current lineup has moved to general v3/v4 |
| `voyageai/voyage-code-3` | undisclosed | **API-only** | Yes, purpose-built | Matryoshka 2048/1024/512/256 + int8/binary; vendor claims beat OpenAI-v3-large/CodeSage by 13.8/16.8% (self-reported, CONSENSUS-tier) |
| `nomic-ai/nomic-embed-code` | 7B (Qwen2.5-Coder base) / 3584 | Local-capable, GPU-class | Yes, CoRNStack hard-negative trained | Apache-2.0; 32,768-token context; self-reported CodeSearchNet wins (vendor-reported); heavy for a laptop CPU despite "local" |

Model-swap procedure and same-dim silent-mixing hazard: `operations.md` (owner).

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

## Provenance hygiene

A **WebFetch-summarized** page read mis-rendered 2026 release dates as "2025" for ccc's own
release table — caught only by cross-checking raw `gh api repos/.../releases` / PyPI JSON, which
are authoritative. Rule for reforging this file: prefer raw `curl`/`gh api`/direct command output
over WebFetch's small-model summaries for anything date- or number-sensitive; the installed
package's own Python source (`cli.py`, `server.py`, `settings.py`, `daemon.py`, `client.py`) was
the single best ground-truth source available this session — better than the docs site (never
independently raw-fetched, everything from it here is CONSENSUS-backed via a summarized GitHub
README instead) or GitHub README-via-summarizer.
