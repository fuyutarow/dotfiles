---
name: driving-cocoindex
description: >-
  Drives cocoindex-code (ccc) for semantic search over code and Markdown: project
  registration, index freshness, ccc search/grep, daemon failures, embedding models,
  multilingual misses, PDF/binary conversion, and daemon ownership — who may start it and what
  bounds its CPU/RAM (ccc が重い, リソース食いすぎ, daemon を止めたい, 索引が終わらない). Use for
  any ccc/cocoindex operation or
  unknown-identifier concept search (意味検索, コード検索, 「どこで実装」, ノートを概念で探す);
  absence/novelty and pre-implementation duplicate checks require a ≥3-query JA/EN battery.
  LAW: PROJECT-BY-CWD, PULL-BASED, ROUTE-BY-QUERY-SHAPE, LANGUAGE-WALL, DAEMON-OWNED. House route:
  concept/battery→ccc search; literal/exhaustive/files→rg; structural→ccc grep;
  symbol→driving-serena. Raw Grep is hook-denied only in operational ccc repos. Cuts:
  open-ended tour→Explore; install/upgrade→running-python-tools; dead MCP server
  diagnostics→operating-the-harness FIRST. Search fan-out may parallelize; routing and
  freshness stay SOLO. Missing router→STOP/repair, never emulate search with Python/Node;
  empty ccc output→NO_MATCH, not PASS. English skill; respond in the user's language
  (default Japanese).
---

# Driving CocoIndex Code — semantic code search as a disciplined subprocess

> **Version**: v2608.1.0 (2026-08-08 — DAEMON-OWNED law clause + CC7 OWNED).
> The daemon's ceiling belongs to its supervisor; the daemon verb depends on the host's regime.
> **Active model**: `granite-311m-multilingual-r2`; dated model history lives in `references/catalog.md`.

**Scope.** Operate `ccc`: project lifecycle, semantic and structural search over code/Markdown,
daemon state, MCP, and embeddings. PDF/binary input requires conversion (§Gotchas).

**Out of scope.** Authoring CocoIndex framework pipelines; contributing to cocoindex-code's Python
source routes to `writing-python`.

**Durability.** Version numbers, latencies, sizes, and model scores live only in the dated
`references/catalog.md`. The description's trigger tokens and quoted F3 asks are the declared
exceptions.

```bash
for f in catalog operations; do test -f references/$f.md || echo MISSING $f; done
test -f tests/forge-verification-ledger.md || echo MISSING ledger
```

Durable guidance from a frontier model to later executors; every retained constraint encodes an
observed failure mode.

## Language

Stable tokens even inside Japanese prose: **PROJECT-BY-CWD**, **PROJECT-REGISTER** (adding a
repo: init + first index) vs **RE-INDEX** (refreshing an already-registered one) — 'index'
alone is ambiguous, never use it bare; **PULL-BASED**, **ROUTE-BY-QUERY-SHAPE**,
**LANGUAGE-WALL** (the default embedding model discriminates topics in English only),
**RELAY**, **repo-search**, **fire / no-fire**, **ENUMERATE** (a fleet-wide operation starts
from a filesystem probe, never a remembered project list), **READ-NOT-SWAP** (a candidate
model is judged against the live index, never by installing it as the live model),
**DAEMON-OWNED**, **SUPERVISED** (a supervisor unit owns daemon lifetime and ceilings; clients
are forbidden to spawn) vs **LAZY-SPAWN** (stock behavior: the first client forks the daemon
into its own cgroup) — never say "the daemon restarts itself" without naming which regime.

## THE LAW

> `ccc` is a cwd-bound, daemon-backed subprocess whose value is concept-to-code search.
> (a) **PROJECT-BY-CWD**: every capability except `ccc grep` gates on the cwd being inside an
> initialized project — the cwd is the ONLY project selector (verified: `ccc mcp` has zero
> flags); a search promised on an unregistered repo is a promise about a tool that will exit 1.
> (b) **PULL-BASED**: there is NO file watcher — an index is stale the moment a file is
> edited, `ccc status` shows NO timestamp, and nothing warns; freshness is an action
> (`ccc index` / `--refresh`), never an assumption. (c) **ROUTE-BY-QUERY-SHAPE**: embedding
> top-k is not exhaustive and carries a measured doc-over-code bias — exact identifiers,
> call-site enumeration, and structural patterns belong to `repo-search`'s rg / Serena /
> `ccc grep` routes; semantic
> search earns queries whose vocabulary does NOT match the corpus (code OR prose — markdown
> corpora are in-scope, §Markdown). (d) **LANGUAGE-WALL**: the default embedding model's
> topical signal is English-only in practice — pure-JA queries and notes get topic-blind
> noise; JA/EN-mixed notes are reachable only through their English tokens (code-switch the
> query onto them — measured craft fix); never promise a 日本語 semantic search without
> checking the model first (single-corpus trial; evidence → `references/catalog.md`).
> (e) **DAEMON-OWNED**: all index/search compute runs in ONE resident daemon. It OUTLIVES the
> client that asked for it. Unsupervised, the FIRST client to call `ccc` forks it into that
> client's own cgroup. The ceiling is therefore whatever accidental parent won the race.
> Killing the client does not stop the work. No ceiling written outside the supervisor
> survives the next spawn. Ownership precedes limits. Probe the host's regime (§Ownership)
> before any start/stop verb; it also decides whether a runaway is the tool's fault or the
> absence of an owner.
> Precedence: registered before searched · refreshed before trusted · query-shape before
> tool · language before promise · verbatim relay before verdict · enumerated before swapped ·
> read before replaced · owned before limited.

## Gates CC1–CC7

| Gate | Rule | Artifact |
|---|---|---|
| **CC1 REGISTERED** | Before any semantic-search claim, cite live registration evidence (`ccc status` in the target, or the daemon's project list). Unregistered target → the first move is PROJECT-REGISTER (`ccc init && ccc index`; cost table → `references/catalog.md`) or an explicit lexical/Explore fallback — never a blind `ccc search` | the probe output |
| **CC2 FRESH** | Any load-bearing search AFTER edits carries refresh evidence — an `ccc index` run (CLI default does NOT refresh) or `--refresh` / MCP `refresh_index:true` (MCP DEFAULT refreshes; CLI does not — asymmetry stated) | the refresh line adjacent to the hits |
| **CC3 ROUTE** | Name the query shape before choosing the engine (the QUERY-SHAPE ladder — §Routing). On house hosts, invoke `repo-search`; its route is the declaration. Wrong shape (e.g. semantic top-k for "every call site of X") is a gate violation even if results look plausible — the live trial measured both missed call sites AND false positives on exactly that shape (numbers → `references/catalog.md`) | the `repo-search` route + exact query |
| **CC4 RELAY** | A worker that searched relays VERBATIM {query, tool, hits as file:line + snippet, registration+freshness evidence}; "found it" without locus is quarantined | the relay tuple |
| **CC5 ENUMERATE** | A fleet-wide operation ("every registered project" — a global model swap, a fleet audit) starts from a filesystem probe, never a remembered list — a missed project keeps a stale index with no error | `fd -H --full-path '\.cocoindex_code/settings\.yml$' <root>` or `bun ~/dotfiles/scripts/ccc-swap.ts discover` output |
| **CC6 READ-NOT-SWAP** | A candidate embedding model is judged by reading the live index's own SQLite store (`references/operations.md` §6a), never by installing it as the live model to find out; any stored smoke expectation is re-run against the CURRENT index before it judges a swap | the SQL hits, or the smoke re-run, same session (`references/operations.md` §6e) |
| **CC7 OWNED** | Read supervision state before any daemon verb and before any resource claim. SUPERVISED → `ccc daemon stop` is merely undone, but `ccc daemon restart` is DESTRUCTIVE (it never checks supervision and forks a second uncapped daemon that is then orphaned); use the supervisor's verbs for both. A ceiling claim cites the UNIT's cgroup, never the process's RSS — RSS proves current use, not a bound | supervision probe (`test -e ~/.config/systemd/user/ccc-daemon.service`, `$COCOINDEX_CODE_DAEMON_SUPERVISED`) + `systemctl --user show ccc-daemon.service -p CPUQuotaPerSecUSec -p MemoryMax` or `/proc/<pid>/cgroup` naming the unit |

## The daily loop — invocation recipes (LOW freedom)

On house hosts, `bun ~/.claude/hooks/repo-search.ts --help` is the guaranteed compatibility
entrypoint; its single implementation lives at `cocoindex/repo-search.ts`, and `repo-search`
links there directly. Routes: `concept` / `battery` → ccc search;
`literal` / `exhaustive` / `files` → rg; `structural` → ccc grep; `symbol` → Serena. The
user-global PreToolUse gate blocks direct Grep/rg/grep/find/fd/tree, direct ccc search/grep, and
obvious inline-runtime search reimplementations only when ccc and project registration are both present. If the
canonical router is missing, STOP and repair the harness; never replace search with Python, Node,
or shell loops. Exit-zero ccc output without result blocks is NO_MATCH, not PASS. Ccc-absent or
unregistered environments retain lexical fallback.

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
| reset | `ccc reset` [`--all`] [`--force`] | DBs only by default; `--all` also drops `settings.yml`; prompts `Proceed? [y/N]`, ABORTS without `--force` (agents must pass it). A model/dimension change needs a REGIME-CORRECT stop first (`ccc daemon stop` is the LAZY-SPAWN form only) — per-regime procedure in `references/operations.md` §6b. Fleet-wide swaps are blue-green via `~/dotfiles/scripts/ccc-swap.ts` (CC5/CC6), never a bare reset loop |

## Ownership — probe the regime before any daemon verb

```bash
test -e ~/.config/systemd/user/ccc-daemon.service && echo SUPERVISED || echo LAZY-SPAWN
```

| | LAZY-SPAWN (stock; macOS here) | SUPERVISED (WSL host, unit `ccc-daemon.service`) |
|---|---|---|
| who starts it | the first client that finds no socket, into ITS cgroup | the supervisor — at login, and again after every exit |
| ceiling | whatever that accidental parent had; unbounded in practice | the unit's `CPUQuota` / `MemoryHigh` / `MemoryMax` / `MemorySwapMax` / `TasksMax` |
| stop | `ccc daemon stop` | `systemctl --user stop ccc-daemon`; `ccc daemon stop` really kills it, then the supervisor returns it within seconds |
| restart | `ccc daemon restart` | `systemctl --user restart ccc-daemon`. NEVER `ccc daemon restart`: it calls `start_daemon()` directly without consulting supervision, so it forks a SECOND uncapped daemon into your shell's cgroup, wins the socket, and is orphaned when the supervisor re-binds |
| cost of ANY stop | aborts every in-flight index on that daemon, for every project — not just the one you were working on; no resume, though committed state on disk survives | same |
| after a `global_settings.yml` edit | the client kills it and respawns it itself | the client kills it and WAITS; the supervisor respawns it (unit stopped/failed → the client waits out its timeout, then errors) |
| in-process caps | nowhere durable to put them | `envs:` in `global_settings.yml` |

The unit's ceilings and `envs:` are NOT redundant. PyTorch sizes its thread pool from nproc and
never consults the cgroup quota. Without `envs:`, the daemon opens full-width thread pools that
then contend inside a narrowed slice. `envs:` lands at daemon startup, BEFORE the deferred torch
import. That timing is also why a shell `export` cannot cap a live daemon. Values, the unit
itself, and the install/verify procedure: `references/operations.md` §3a.

## Gotchas (2026-07)

| Symptom | Cause | Fix |
|---|---|---|
| MCP shows "Failed to connect" for cocoindex-code in a repo | cwd is not `ccc init`-ed — the process exits before the MCP handshake even starts (every logged connection attempt failed with the identical error; counts → `references/catalog.md`) | `ccc init` in that cwd, or accept CLI-only until you do |
| search hits look stale after an edit | PULL-BASED — no file watcher exists; `ccc status` carries no timestamp/dirty field | `ccc index` or `--refresh` before trusting a load-bearing hit |
| `ccc grep` returns zero matches on a `def`-shaped pattern clearly in the file | bare trailing `):` doesn't match a return-type-annotated signature | wildcard the return type — `-> \RET:` — or drop the trailing colon |
| top hits are all markdown/docs, real implementation missing or buried | embedding model has a measured doc-over-code/prose bias | `--path` filter to the source tree; re-run before trusting the global top-k |
| PDF (or any binary) file silently missing from the index — `ccc index` lists FEWER files than the dir holds, with no error and no count for it | ccc's include-allowlist (`DEFAULT_INCLUDED_PATTERNS`) has no `.pdf`, and the reader is `read_text()` which drops non-UTF-8 input on `UnicodeDecodeError` — a PDF is pre-filtered and never even attempted, so nothing warns (verified end-to-end + codex cross-check, ledger 2026-07-14) | ccc indexes code + markdown/text ONLY. Convert PDF→Markdown/text FIRST (`docling` / `markitdown` / `pdftotext`), then PROJECT-REGISTER the `.md` output — no flag or config makes ccc read a raw PDF |
| daemon "Uptime" looks lower than the process's real age | uptime is a monotonic-awake clock — it does not advance across machine sleep | `ps -o lstart -p $(cat ~/.cocoindex_code/daemon.pid)` for true age |
| edited `global_settings.yml`, expected to need a manual daemon restart | NOT needed — the next `ccc`/MCP call's handshake detects the settings-mtime mismatch and auto-restarts. SUPERVISED hosts: the client still kills it, but the RESPAWN is the supervisor's (the client only waits) | just re-invoke; no `ccc daemon restart` required. If the unit is stopped or failed, nothing respawns and the client waits out its timeout, then errors — `systemctl --user status ccc-daemon` |
| `ccc daemon stop` "does nothing" — the daemon is back seconds later with a new PID | SUPERVISED host: the stop succeeded, and the supervisor restarted it exactly as configured | `systemctl --user stop ccc-daemon` (and `reset-failed` if a crash loop tripped the start limit). Never `kill -9` the PID — on a supervised host it just restarts, and on a lazy-spawn host the next client forks an uncapped replacement |
| daemon burning cores / GiB with nothing waiting on it; `daemon status` shows `[indexing]` for a project nobody asked about | the job outlives its client (see the interrupted-`ccc index` row) AND the idle reaper counts indexing as activity, so the idle timeout never fires. The `BrokenPipeError` in `daemon.log` is the tell: that line is the client's death, not the job's | LAZY-SPAWN → this is unbounded by construction; install the supervisor (`references/operations.md` §3a). SUPERVISED → it is already capped; confirm with the unit's cgroup and let it finish rather than killing it |
| set `OMP_NUM_THREADS` (or any cap) with `export`, daemon still runs full-width | the daemon read its environment once, at ITS startup — a later `export` in your shell reaches the client only, and the client computes nothing | put it in `envs:` in `global_settings.yml`, then let the settings-mtime restart pick it up (§Ownership) |
| capped the daemon, yet `repo-search structural` still spikes the box | `ccc grep` is the one verb that never touches the daemon — it runs in the CALLER on a default `ThreadPoolExecutor()` (`min(32, cpu+4)`, so 16 here), which no daemon ceiling covers | bound the caller if it matters; otherwise accept it — unlike the daemon's, this work dies with the call that owns it |
| a search against an idle, fully-indexed project just hangs for minutes, while a DIFFERENT project is `[indexing]` | one daemon serves every project under ONE ceiling, and a search first awaits its project's index-start lock — so a large index elsewhere can starve an unrelated query outright, not merely slow it (measured 2026-08-08: 8+ minutes of dead concept search under a concurrent large index). Tightening `COCOINDEX_MAX_INFLIGHT_COMPONENTS` makes this worse, not better, since it is daemon-wide | `ccc daemon status` FIRST — if any project reads `[indexing]`, expect concept/battery routes to block; use the rg-backed routes meanwhile, and do not diagnose it as a broken index |
| the daemon restarted on its own and a long index vanished from `ccc daemon status` | an out-of-band `uv tool upgrade` of cocoindex-code changes the binary under the running daemon; the next client's handshake sees a version mismatch and restarts it, discarding every loaded project's in-flight work (observed 2026-08-08, 0.2.40→0.2.41 mid-index). Supervision widens the blast radius by keeping ONE daemon loaded with many projects | committed index state on disk survives — re-run `ccc index` and it resumes from `unchanged`. To remove the trigger, pin the tool version; the install is UNPINNED (`references/catalog.md`) |
| "offline" local embedding still shows HF Hub traffic in `daemon.log` | model LOAD still pings the Hub for cache-freshness/revision resolution even with cached weights | set `HF_HUB_OFFLINE=1` (and `TRANSFORMERS_OFFLINE=1`) for a true air-gap |
| `ccc reset` followed by an unexpected auto-rebuild you never triggered | observed once; the daemon mechanism behind it is UNVERIFIED | don't rely on it — always run `ccc index` yourself after a reset |
| `ccc index` killed/interrupted mid-build (Ctrl-C, timeout) — is the index broken? | the CLI is a thin client watching a daemon-side job; the daemon keeps indexing after the client dies (verified live, §operations 3) | poll `ccc daemon status` until `[indexing]`→`[idle]`, then `ccc status` — don't blindly re-run, don't trust a mid-build search |
| Japanese (or any non-EN) query returns plausible-looking but topic-blind hits | LANGUAGE-WALL — an EN-only embedding model (ccc's SHIPPED default arctic-xs is one; this host swapped it out 2026-07-13); measured at ccc AND raw-model level incl. a symmetric-encode control, so not a ccc bug (evidence → `references/catalog.md`) | check the ACTUAL model first (`cat ~/.cocoindex_code/global_settings.yml`). EN-only model + JA/EN-mixed notes: code-switch the query onto the note's EN tokens (measured first aid). Pure-JA corpora: multilingual model swap — the house runs `granite-311m-multilingual-r2` (measured best on a JA-notes+code A/B, catalog) — but the model is GLOBAL (no per-project override): evaluate the candidate first (CC6), then swap blue-green via `~/dotfiles/scripts/ccc-swap.ts` over every ENUMERATED project (CC5) — never a bare reset-in-place loop, since a missed or raced project keeps a stale-dimension index with no error (§operations 4b/6) |

## Markdown / prose corpora — in-scope, behind the LANGUAGE-WALL

A notes vault / docs tree is a valid PROJECT-REGISTER target: on a pure-markdown corpus the
doc-over-code bias has no code to outrank, and EN→EN concept recall measured usable — treat
top-k as a candidate set (`--limit 10`, then read), never stop at #1 (ranks/bands →
`references/catalog.md`; argued → `references/operations.md` §4b.1). Md-specific deltas,
argued in §4b: (1) notes churn faster than code — PULL-BASED staleness bites harder,
`--refresh` every load-bearing lookup; (2) the LANGUAGE-WALL and its code-switch first aid —
a pure-Japanese vault needs a multilingual model BEFORE any promise (the swap is an
end-to-end-verified fix that also left EN search better, → §4b.3; the router's rg route covers
literal lookups on unswapped hosts); (3) heading-echo and exact-token queries still belong to
`repo-search literal` / `exhaustive` — in BOTH languages (controls → catalog).

## MCP surface — UNREGISTERED globally since 2026-07-25; use the CLI

> **Decision (覆せる既定 2026-07-25・追認待ち)**: `cocoindex-code` is out of the house `.mcp.json`.
> Not a version story — the registered command IS `ccc mcp`, the same binary.
> The mismatch is structural. ccc is PROJECT-BY-CWD; MCP freezes that selector at server spawn.
> A globally-registered server therefore points at its spawn cwd and is wrong for every other repo.
> Measured: two consecutive failures, then the CLI answered and surfaced two 正本 nobody had pulled.
> The deciding harm is epistemic. A search tool that is LISTED BUT DEAD makes the executor believe
> it searched. It then falls back to grep and concludes absence. That is the very pathway this skill
> closes, reproduced upstream of every guard. Second harm: MCP defaults `refresh_index:true`, the CLI does
> not refresh (CC2). Two homes for one verb with DIFFERENT DEFAULTS is worse than two homes.
> Per-project wiring inside a repo you stay in remains legitimate (§below).
> The category error was registering a cwd-bound tool globally.
> Reverse by re-adding the entry and running `mise run cc:install-mcp`.

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
- Recommended composition: ccc LOCATES the semantically relevant region by concept →
  `driving-serena` NAVIGATES/EDITS the exact symbol once found. Not a collision — a pipeline.

## Execution model

| Step | Mode | Why |
|---|---|---|
| route / freshness / registration decisions | SOLO | the judgment spine — query shape, staleness risk, and registration state must sit in one context |
| a single search | SOLO (main-loop Bash) | spawn overhead exceeds the work |
| parallel searches (query-shape-homogeneous) | FAN-OUT — one sonnet worker per query (CC4 relay) | independent; workers relay observables, not opinions |
| adjudicating conflicting hits across workers | SOLO | the verdict braids evidence from more than one search |

Evidence type: **CITATION-RELAY** — a hit is an observable (file:line, Read-verifiable); a
relayed conclusion without its locus is zero. Generic agent contract by pointer:
`orchestrating-agents`. No harness → same map, serial Bash calls.

## MUST-NOT-FIRE — and the fire/no-fire set (F3)

FIRES:

| Ask | Why |
|---|---|
| 「レートリミットってこのサービスのどこで掛けてる？該当コードが見つからない」 | concept, not literal string — CC1 first move: confirm registration |
| "set up semantic search for this repo" | PROJECT-REGISTER is exactly this skill's territory |
| 「この repo で『境界条件の正規化』に相当するコード探して」 | concept query, identifier unknown — core case |
| "ccc search returning stale/no results" | CC2 freshness gotcha |
| 「ccc の embedding モデル変えたい」 | model-change procedure — judge the candidate offline first (CC6), take the regime-correct stop before a dimension change (CC7; `ccc daemon stop` is the LAZY-SPAWN form only), blue-green (`~/dotfiles/scripts/ccc-swap.ts`) for a fleet-wide swap, never a live-model swap as the evaluation method; a bare 「embedding モデル選定」 with no ccc/code-index context is writing-python's ML-selection territory instead |
| a multi-line/formatter-wrapped signature structural hunt | `ccc grep`'s AST-invariant matching is the answer, not naive regex |
| 「markdown のメモ/ノート群も意味検索できる？『どこかに書いたはず』を概念で探したい」 | markdown corpora are in-scope — PROJECT-REGISTER the vault; 日本語ノートなら LANGUAGE-WALL gate first (§Markdown) |
| 「日本語で ccc search してもまともな結果が出ない」 | LANGUAGE-WALL gotcha — code-switch first aid for JA/EN-mixed notes; pure-JA needs the model swap, not query massaging |
| 「PDF/論文(ドキュメント)を ccc で意味検索したい」 | ccc は PDF 非対応 — 生 PDF は無言スキップ(§Gotchas)。境界を示し PDF→Markdown 変換 → 変換後 `.md` を PROJECT-REGISTER へ誘導するのがこのスキルの責務(cocoindex フレームワークの docling PDF→MD example は別層・スコープ外) |
| 「ccc が CPU/メモリを食いすぎている」「daemon が重い/索引が終わらない」「ccc に上限をかけたい」 | CC7 territory — probe the regime first (§Ownership). A limit proposed without naming the owner is the failure this LAW clause exists to stop |
| 「ccc の daemon を止めたい/再起動したい」 | the verb depends on the regime, and the wrong one silently no-ops (§Ownership) |
| 「機能重複してた/二重実装を作ってしまった/既存実装があるはずでは」— ccc 登録 repo での新規実装の着手前・grep 0件からの不在結論の前 | the duplicate-implementation pathway: literal grep 0 hits ≠ absence — `repo-search battery` with ≥3 paraphrases FIRST. implementing-and-debugging carries the reciprocal co-fire row; the PreToolUse gate rejects unclassified raw search before it runs |

MUST NOT fire (route):

| Ask | Route |
|---|---|
| "grep for every TODO comment" | `repo-search literal --query TODO` — declared literal route, rg engine |
| 「ノートのあの見出し、どこだっけ」(フレーズをほぼ覚えている) / 「'deploy' を含むノートを全部列挙」(全文検索) | `repo-search literal` / `exhaustive` — literal recall and exhaustive markdown listing use the rg engine; top-k adds nothing |
| "rename this function safely, resolve its callers semantically" | `driving-serena` — exact symbol relation, not concept or exhaustive lexical occurrence |
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
| `driving-serena` | SYMBOL-vs-CONCEPT, decisive — exact identifier plus semantic definition/callers/rename/outline → there; exhaustive lexical occurrences → `repo-search exhaustive`; concept without an identifier → here. Pipeline: ccc LOCATES by concept → Serena NAVIGATES/EDITS. |
| `repo-search` / `Explore` (non-skill) | QUERY-SHAPE ladder — literal string/regex/every-call-site → its literal/exhaustive rg routes; structural pattern → its ccc-grep route; open-ended "tour this repo" with no search term → Explore; a CONCEPT query against an INDEXED project → its concept/battery ccc route (CC1 first). Raw Grep is not a sibling: the user-global hook denies the unclassified surface. |
| `orchestrating-agents` (P7 resource envelopes) | RESIDENT-vs-DISPATCH — per-run agent admission, declared per call and dying with its caller (`agent-resource-run --manifest`) → there; the ccc daemon, whose ceiling is declared ONCE in a supervisor unit and must survive every caller → here. The statusline `Job:` segment tracks only the dispatch path, so its silence about ccc is not evidence of an uncapped daemon. |
| `operating-the-harness` (durability policy) | The user-global rule that bans orphaning work to init, and sanctions `systemd-run --user --unit=<name>` as the manager-owned alternative, is owned THERE. THIS skill owns only why ccc in particular needs an owner and which verbs change under supervision. |
| `raising-resolution` | Silent sub-step, LOWEST precedence: inspect the actual ccc state (`ccc status`, `ccc daemon status`, `cat ~/.cocoindex_code/global_settings.yml`, `claude mcp list`) before asserting a version/uptime/registration/MCP-liveness fact — never recall one from training; cocoindex-code is plausibly absent from training data entirely. |
| `writing-python` | Contributing to `cocoindex-code`'s OWN Python source (upstream) → there; operating the already-built binary → here. No collision in normal driving usage. |
| `systematizing-knowledge` / `structuring-documents` | SEARCH-vs-SYNTHESIS, decisive — 「ノートから探す/想起する」 (LOCATE passages in a corpus) → here; 「メモをまとめる/統合する/再構成する」 (SYNTHESIZE or reorganize what's found) → those skills. Shared 「メモ/ノート」 vocabulary, disjoint verbs; ccc can still serve as their locate step (pipeline, like serena). |

## Reference index

| File | Covers | Read when |
|---|---|---|
| `references/catalog.md` | DATED snapshot: versions, MCP `search` schema, measured search/index numbers, head-to-head verdicts, the markdown-corpus + LANGUAGE-WALL trial (cosine matrices, measured multilingual fix), embedding-model tables (project-curated + wider landscape), daemon resource footprint before/after supervision (CPU, RSS, threads, ceilings), known-issues provenance | any version, latency, size, star-count, model-name/score, or daemon resource-ceiling question |
| `references/operations.md` | setup, per-project lifecycle, daemon internals, search craft (incl. §4b markdown/prose corpora + the language wall), `ccc grep` craft, embedding-model-change procedure, MCP wiring per-project | setting up a repo or notes vault, diagnosing daemon/search behavior, or changing the embedding model |
| `tests/forge-verification-ledger.md` | forge provenance, source-grade table, calibration, verification results | reforging this skill |
