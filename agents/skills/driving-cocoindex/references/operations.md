# Operations — setup, project lifecycle, daemon, and search/grep craft

> The arguing home for *how* to drive `ccc`: install → register a project → keep it fresh →
> search well → grep well → change the embedding model → wire MCP per-project. Dated perishables
> (exact versions, latencies, DB sizes, model scores) are quarantined to `catalog.md` — this file
> cites it by name rather than repeating numbers that rot. Facts below trace to a live-trial +
> installed-source read (2026-07); commands are the primary source, never training memory
> (`cocoindex-code` is a ~5-month-old project, unlikely to be well-represented there).

## 1. Setup on a fresh machine

- Binary: `uv tool install 'cocoindex-code[full]'` — shown here for locality; the install/pin/
  upgrade VERB is `running-python-tools`' territory (declared seam — this file starts once the
  binary exists). What this skill owns is the VARIANT choice: base install = LiteLLM-only
  (cloud embedding, needs an API key); `[full]` (= `embeddings-local` alias) adds
  `sentence-transformers` for local embeddings — its dependency chain
  (`cocoindex-code[full]` → `cocoindex[sentence-transformers]` → `sentence-transformers` →
  **unconditional** `torch`/`transformers`/`scikit-learn`/`scipy`) makes it a genuinely heavier
  install. Base never pulls torch.
- Dotfiles wiring (house-declarative, verbatim from `scripts/link-dots.sh`):
  `link cocoindex/global_settings.yml "$HOME/.cocoindex_code/global_settings.yml"` — this repo-local
  file is symlinked to the global settings path, so **no interactive `ccc init`** is needed globally
  on a fresh machine; only the per-project `ccc init` (§2) remains manual. `mise run cc:install-mcp`
  ensures the binary exists: `command -v ccc >/dev/null 2>&1 || uv tool install --upgrade
  'cocoindex-code[full]'`.
- `global_settings.yml` schema (`EmbeddingSettings`): `model` (str), `provider`
  (`litellm` default | `sentence-transformers`), `device` (ST only, e.g. `mps`/`cpu`/`cuda`),
  `min_interval_ms` (LiteLLM throttle), `indexing_params` / `query_params` (extra kwargs passed to
  `embedder.embed()`). Wrapped in `UserSettings{embedding, envs}` — `envs` injects LITERAL
  values into the daemon's environment for cloud providers. **Secrets rule**: this file is
  repo-managed (dotfiles-symlinked) — never write a real key into `envs:`; keep the block
  commented and export the key in the machine's environment instead, so the committed YAML
  carries the SLOT, never the secret.
- This dotfiles config's shape: `provider: sentence-transformers`, `model:
  ibm-granite/granite-embedding-311m-multilingual-r2`, `indexing_params: {}`,
  `query_params: {prompt_name: query}` — the `prompt_name` distinguishes the query-time
  embedding call from the indexing-time one (asymmetric encoding; granite-r2 defines
  `query` as an empty-string prompt, so the setting is a valid no-op there). The house
  default is `granite-311m-multilingual-r2` (dim 768), chosen 2026-07-17 by a JA-notes+code
  A/B pilot; it superseded granite-97m-r2, which had replaced the shipped
  `snowflake-arctic-embed-xs` over the LANGUAGE-WALL (§4b; swap history → `catalog.md` and
  the settings file's own header comment).
- **"Offline" nuance**: the daemon still makes live HTTP HEAD/GET calls to the HF Hub at model
  *load* time (cache-freshness/revision resolution — `resolve/main/modules.json`, `config.json`,
  a recursive tree listing), even though the weights are already cached and the embedding
  *computation* is local/keyless. Neither `HF_HUB_OFFLINE` nor `TRANSFORMERS_OFFLINE` is set by
  default — set both `=1` for genuine air-gapped behavior; otherwise "offline" in the config
  comment means "no embedding API key/cost," not "no network calls."
- The `uv` install receipt is **unpinned** (`{name = "cocoindex-code", extras = ["full"]}`, no
  version bound) — the *next* PyPI release floats straight in on `uv tool upgrade`, with no
  ceiling and no way to preview first: `uv tool upgrade --dry-run` does not exist as a flag
  (confirmed: unsupported-argument error, not skipped). Pin the extras spec if you need
  reproducibility across a fleet; otherwise treat every upgrade as "verify `ccc --help` /
  `ccc doctor` still match this file" rather than "assume nothing changed."

## 2. Per-project lifecycle — PROJECT-REGISTER, RE-INDEX, reset

**PROJECT-REGISTER** (`ccc init`, run once per repo):
- Mutation checklist: run `git status` FIRST (init edits `.gitignore`); after init, commit
  `settings.yml` + the `.gitignore` hunk, nothing else; full undo = `ccc reset --all` (drops
  DBs + settings + the gitignore entry) then `git checkout -- .gitignore` if a conflict
  remains.
- Creates `.cocoindex_code/{settings.yml, cocoindex.db/, target_sqlite.db}` in the project root.
- Appends a self-`.gitignore` block that un-ignores its own settings file, so only `settings.yml`
  is ever committed and the DB artifacts stay untracked:
  ```
  .cocoindex_code/*
  !.cocoindex_code/settings.yml
  ```
- `settings.yml` (`ProjectSettings`): `include_patterns` / `exclude_patterns` (defaults cover
  ~50 extensions — py, js/ts family, rs, go, java, c/cpp family, sql, shell, md/rst, and more;
  excludes `.*`, `__pycache__`, `node_modules`, `target`, `build`/`dist`/`vendor`,
  `.cocoindex_code` itself), `language_overrides` (per-extension language hints, e.g. `.inc`→php),
  `chunkers` (per-extension custom chunker hooks, `module: "pkg.mod:callable"`).

**RE-INDEX** (`ccc index`, run after edits) vs first index: a full first build is the slowest
step; an incremental re-index (only changed files reprocessed) is fast — most of its measured
wall time is `uvx` process-startup, not embedding work. DB size scales with corpus size (small
project vs a large one differ by roughly an order of magnitude). Exact wall-clock and size
numbers → `catalog.md`.

**What the evidence looks like** (the CC1/CC2 artifacts, verbatim shapes):
- CC1 registration proof = `ccc status` success header: `Project: <root>` / `Settings: …` /
  `Index stats: Chunks: N, Files: M` (an unregistered cwd errors instead).
- CC2 freshness proof = `ccc index`'s summary line — `N files listed | a added, d deleted,
  r reprocessed, u unchanged, error: 0` — THAT line adjacent to your hits is the artifact;
  normal search output alone proves nothing about freshness.
- A search hit = `file:start_line-end_line (score)` + chunk; a hit without that locus is not
  evidence (CC4).

**`ccc reset`**: with no flags, deletes only the two DB artifacts (`cocoindex.db/`,
`target_sqlite.db`) and **keeps `settings.yml`** — the project stays "initialized," just
empty. `--all` also removes `settings.yml` and the `.gitignore` entry. Either form removes the
project from the live daemon's registry first, so it releases file handles cleanly. **Observed,
mechanism UNVERIFIED**: after a bare `ccc reset`, the project was seen flipping to `[indexing]`
and rebuilding on its own on the *next* status poke, without an explicit `ccc index` ever being
run — but this could not be disambiguated from "the repeated status polls themselves acted as an
implicit ensure-index ping." Do not rely on auto-rebuild: after any `ccc reset`, run `ccc index`
explicitly if you need the index back, and verify with `ccc status` before trusting a search.

## 3. Daemon — lifecycle, freshness, and the uptime trap

| Fact | Detail |
|---|---|
| Spawn | Lazy, self-daemonizing: any `ccc` command auto-spawns the daemon (`start_new_session=True`, i.e. `setsid`) if no live socket is found. Not launchd-registered — no plist anywhere, `launchctl list` shows nothing, `ccc daemon --help` has no install/enable subcommand. It survives its parent's exit only because it's detached into its own session, then orphan-reparented to PID 1. |
| Boot behavior | Does **not** start on boot (no plist, no install path) — it only comes alive the next time a `ccc` command needs it and the socket is gone. |
| Config-change restart | **PULL-BASED**, not manual: the daemon computes a settings-file mtime at boot and returns it on every handshake; the client detects a mismatch on the *next* connection and transparently restarts the daemon — one restart, on next use, no `ccc daemon restart` required after editing `global_settings.yml`. |
| Uptime field | Backed by a monotonic-since-boot-awake clock, **not** wall-clock daemon age — it does not advance while the machine sleeps, so it silently undercounts real age across sleep/lid-close cycles. For true age, use `ps -o lstart -p $(cat ~/.cocoindex_code/daemon.pid)`, never the `doctor`/`daemon status` "Uptime" line. |
| Logs | `~/.cocoindex_code/daemon.log`. Known, recurring `BrokenPipeError` / "Error during streaming response" crash noise on client disconnect — cosmetic, not a sign the daemon is unhealthy by itself. |
| Multi-project | One daemon serves every registered project (loads the embedder model once); `ccc daemon status` lists each project with an `idle`/`indexing` state — poll this before issuing a search if you want to avoid racing an in-flight (re)index. |
| Index-job ownership | The `ccc index` CLI process is a thin client WATCHING a daemon-side job — killing the client (Ctrl-C, timeout, harness kill) does NOT stop indexing; the daemon carries the job to completion (observed live: a client killed at 473/853 files finished daemon-side minutes later). After any interrupted `ccc index`, poll `ccc daemon status` for `[indexing]`→`[idle]` rather than blindly re-running — and don't trust a search issued mid-build. |

## 4. Search craft — routing around the doc-over-code bias

**ROUTE-BY-QUERY-SHAPE in practice.** `ccc search` earns its keep on vocabulary-mismatch queries
— natural-language phrasing that maps to a concept the code implements under a different name
(e.g. "where are HTTP redirect responses implemented" landing on the actual `Response` subclass
that a bare `rg redirect` buries under a wall of unrelated `redirect_*` identifiers). It
**loses** in two reproducible ways, argued here (verdicts: the 6-query head-to-head table in
`catalog.md`):

1. **Doc-over-code ranking bias.** When a corpus mixes markdown docs and source, and both restate
   the query's vocabulary, prose-to-prose similarity systematically outranks prose-to-code
   similarity — sometimes burying the correct implementation entirely off the default top-window.
   Mitigation: `--path` filtered to the source tree (e.g. `--path 'src/**/*.py'`) recovers the
   code; treat any top-hit as suspect until you've re-run with a source-only `--path` when the
   corpus contains both docs and code.
2. **No exhaustiveness guarantee, by construction.** Top-k similarity ranking is not "all
   references" — for "find every call site of X" tasks, ccc's top-k can both miss real sites and
   surface literal-zero-match false positives (a query with an exact identifier is a signal you're
   in the wrong tool). Route enumeration/refactoring-safety tasks to `ccc grep` or `rg`, never
   `ccc search`.

**Query phrasing that helps**: describe the *mechanism* the code performs, not the topic word a
doc section heading would use — a query that echoes a heading verbatim invites the doc-bias
failure mode above. **Pagination**: `--limit`/`--offset` to look past a shallow top-N before
concluding "not found" — the correct hit is often present, just outranked, not absent.

### 4b. Markdown / prose corpora — where the bias flips, until the language wall

A pure-markdown corpus (notes vault, docs tree, knowledge base) is a first-class
PROJECT-REGISTER target, and the doc-over-code bias of §4 becomes moot by construction —
there is no code for the prose to outrank. What the markdown trial (numbers, ranks, and
cosine matrices → `catalog.md` §Markdown-corpus trial) actually measured:

1. **EN→EN concept recall: usable, not oracular.** On a ~500-file corpus, vocabulary-mismatch
   concept queries put the true target in the top-5 but NOT at #1, with flat score bands
   (adjacent scores differ by 0–0.015, exact ties included — rank order carries weak
   confidence signal). Operational form: `--limit 10`, read the candidate set, never accept
   #1 on rank alone. `rg` controls on both queries hit only vocabulary coincidences (the
   true targets used different words; controls → `catalog.md`) — this is exactly the query
   shape where ccc earns its keep on prose.
2. **The LANGUAGE-WALL (load-bearing).** With the shipped default
   `Snowflake/snowflake-arctic-embed-xs`, topical signal flows through ENGLISH tokens only.
   Measured at the ccc level AND at the raw-model level — including a symmetric-encode
   counter-probe that rules out ccc's `prompt_name` asymmetry as the cause (matrices →
   `catalog.md`) — so it is the model, not ccc's search pipeline. Consequences, each probed:
   - **Pure-JA queries against pure-JA prose are topic-blind**: an unrelated JA document
     outranked the correct one; extra pure-JA paraphrases were unreliable (1 of 2 recovered
     the truth into top-8, never to #1; 1 of 2 missed entirely) — pure-JA phrasing is not a
     dependable craft fix.
   - **Code-switching IS a measured craft fix for JA/EN-MIXED notes**: a query that reuses
     the note's own English technical tokens (「malformed な tool call を context に入れない
     対策」) put the truth at #1 and swept the top-8 — the strongest retrieval of the trial.
     Technical notes that mix 日本語 prose with EN terms stay searchable through their EN
     vocabulary; deliberately carry the note's EN terms into the query.
   - **No EN↔JA bridging** in either direction.
   - Exact-token misses are NOT wall evidence: an EN control token unique to one file was
     missed just as completely as the JA one — that is CC3's general top-k limitation;
     route exact-token lookups to `rg` in any language.
   A pure-Japanese notes vault gets no dependable semantic search from the default model —
   route literal lookups to `rg` and gate any semantic promise on the model swap below.
3. **The fix, chosen and END-TO-END VERIFIED.** The measured recommendation is
   `ibm-granite/granite-embedding-311m-multilingual-r2` (dim 768) — chosen 2026-07-17 by a
   JA-notes + code A/B pilot in which it beat the prior granite-97m-r2 on BOTH halves, notes
   and code (`catalog.md` §Active model). A JA-specialist like `cl-nagoya/ruri-v3-70m` wins
   Japanese notes but collapses on code, so it cannot be the single GLOBAL model. The
   code-switch craft above remains the first aid for hosts still on an EN-only model. Two
   consequences, both source-verified: (a) the embedding model is GLOBAL — `EmbeddingSettings`
   lives only in `global_settings.yml`, `ProjectSettings` has no embedding field — so a swap
   re-embeds EVERY registered project (`ccc reset --force && ccc index` in each); (b) a
   dimension change (here 384 → 768) hard-requires the reset — the sqlite-vec table's dim is
   fixed at creation and no error will catch a skipped reindex.
4. **Freshness pressure is higher, not lower.** Notes churn harder than code and edits are
   often the very thing you next search for — no file watcher exists (SKILL.md LAW (b);
   RE-INDEX → §2), so `--refresh` every load-bearing lookup, and a vault-wide re-index
   before any batch of lookups.

## 5. `ccc grep` craft — structural, by-example matching

The only project-independent verb: it needs neither a daemon nor an index, and runs cleanly even
in a repo that has never been `ccc init`-ed. It honors a project's `include`/`exclude` patterns
and `.gitignore` **only inside an initialized project** — outside one, it scans everything with
no filtering.

By-example syntax: `\NAME` is a name metavariable, `\(ARGS*\)` an argument-list metavariable —
e.g. `ccc grep 'def \NAME(\(ARGS*\)):'` or `ccc grep 'foo(\(ARGS*\))'`. Flags: `--lang` (repeatable),
`--path` (globset), `--no-color`.

**Why it earns its place over line-based regex**: on a black-formatted file, a pattern like
`def \NAME(\(ARGS*\)) -> None:` matched every `__init__` definition including the multi-line
(formatter-wrapped) ones — a naive single-line regex equivalent caught only the signatures that
happened to fit on one physical line, silently missing the rest. This is `ccc grep`'s concrete,
verified value: AST/structural, multi-line-and-whitespace-invariant matching where regex fails on
real, formatter-wrapped code — not a marginal win.

**Return-type gotcha (load-bearing)**: a pattern ending in a bare `):` does **not** match a
return-type-annotated signature (`def foo(a, b) -> int:`) — it needs the return-type position
wildcarded or the trailing-colon expectation dropped: use `'def \NAME(\(ARGS*\)) -> \RET:'`, or
drop the trailing `:` entirely. This is why grepping typed/typer-annotated source for a bare
`'def \NAME(\(ARGS*\)):'` can return **zero** matches on a file full of `def` statements — nearly
all of them carry a return-type annotation. When by-example-grepping typed code, always wildcard
the return-type position.

## 6. Embedding model change procedure

**Rule, unconditional**: on any embedding config change (`model`, `provider`, or `device`),
always run `ccc reset && ccc index` — never assume an in-place swap is safe.

- **Dimension change** is a documented requirement (the project's own README states switching
  models requires re-indexing, since vector dimensions differ) — the sqlite-vec `vec0` table has
  a fixed dimension baked in at creation time, so a real dimension mismatch would hit a hard
  runtime error on insert.
- **Same-dimension swap is silently unguarded**, not silently safe: no code path in the daemon,
  client, indexer, or settings modules checks whether the configured model *string* changed since
  the last index and forces a rebuild — CocoIndex's incremental design means only *changed* files
  get re-embedded, so a same-dim model swap would mix old-model and new-model vectors in the same
  table with zero error and zero warning. Treat "same-dim swap without reset" as equally unsafe
  as a dimension change, because the table's own vec0 dimension check is the *only* safety net,
  and it doesn't fire here.
- **Choosing a model**: defer first to the project's **own curated list** — its names live in
  `catalog.md` (this includes the reasoning for why the shipped default is deliberately the
  lowest-quality/most-compatible tier on the project's own comparison table, not a quality
  recommendation). A **separate, disjoint** wider-landscape set (general embedding models not
  in the project's own curated table) is also cataloged there — the two sets do not overlap and
  should not be conflated when recommending an upgrade.

## 7. MCP wiring per-project

Connecting the MCP `search` tool for a given repo takes exactly one thing: **`ccc init` in the
repo whose root Claude Code actually opens as its cwd** — `ccc mcp` resolves its project purely
from the launching process's working directory (no `--project`/env-var override exists), and it
calls the same project-root check every other subcommand uses *before* constructing the MCP
server, so an unregistered cwd exits non-zero before the stdio handshake even begins.

**Failure signature**: `claude mcp list` reports the server as `✘ Failed to connect` (a generic
line — it does not distinguish "server crashed" from "server never started the protocol"). The
per-server MCP client log is the disambiguator — macOS:
`~/Library/Caches/claude-cli-nodejs/<escaped-project-path>/mcp-logs-<server-name>/*.jsonl`;
Linux/WSL: expected under `~/.cache/claude-cli-nodejs/…` by the same layout, but observed only
on macOS this forge [dated:2026-07, UNVERIFIED elsewhere] — fallback:
`find ~/.cache ~/Library/Caches -path '*mcp-logs-cocoindex*' 2>/dev/null`. For an unregistered
cwd it shows the literal `Not in an initialized project directory` stderr line followed
near-instantly by a connection-closed error (an immediate fast-fail — timings →
`catalog.md`), i.e. a project-root gate firing, not a slow start, a crash, or a timeout. If the log instead shows a long stall before failing, that is a *different* class of
problem (owned by `operating-the-harness`'s MCP-lifecycle diagnostics, not this one).

**CLI vs MCP, when to bother**: the CLI exposes the full verb set (`init`/`index`/`search`/
`grep`/`status`/`reset`/`doctor`/`daemon`) and works everywhere a shell does, including repos
that were never wired into `.mcp.json`. MCP exposes only `search`, and only inside a project
whose cwd is already registered — its one real advantage is a typed, schema-validated result
(vs. the CLI's formatted-text stdout). Default to the CLI for daily driving; reach for MCP
per-project once `ccc init` has run there and a typed return value is worth the narrower surface.
