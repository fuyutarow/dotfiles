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
| Spawn | **LAZY-SPAWN (stock)**: any `ccc` command auto-spawns the daemon (`start_new_session=True`, i.e. `setsid`) if no live socket is found. Not launchd-registered — no plist anywhere, `launchctl list` shows nothing, `ccc daemon --help` has no install/enable subcommand. It survives its parent's exit only because it's detached into its own session, then orphan-reparented to PID 1. The spawn does NOT change cgroup, so the daemon lands in — and is bounded by — whichever client happened to start it. **SUPERVISED** overrides all of this: see §3a. |
| Boot behavior | LAZY-SPAWN: does **not** start on boot (no plist, no install path) — it only comes alive the next time a `ccc` command needs it and the socket is gone. SUPERVISED: starts at login (and at boot, given `loginctl enable-linger`) and is restarted after every exit, so a client never needs to spawn one. |
| Config-change restart | **PULL-BASED**, not manual: the daemon computes a settings-file mtime at boot and returns it on every handshake; the client detects a mismatch on the *next* connection and transparently restarts the daemon — one restart, on next use, no `ccc daemon restart` required after editing `global_settings.yml`. |
| Uptime field | Backed by a monotonic-since-boot-awake clock, **not** wall-clock daemon age — it does not advance while the machine sleeps, so it silently undercounts real age across sleep/lid-close cycles. For true age, use `ps -o lstart -p $(cat ~/.cocoindex_code/daemon.pid)`, never the `doctor`/`daemon status` "Uptime" line. |
| Logs | `~/.cocoindex_code/daemon.log`. Known, recurring `BrokenPipeError` / "Error during streaming response" on client disconnect. Cosmetic for HEALTH — but never cosmetic for RESOURCES: the line marks the moment a client died, and the daemon-side job it started keeps running (2026-08-08: a client died at 01:27, its index ran on for 1h40m at ~6 cores). Treat it as the timestamp to date a runaway from, not as noise to skip. |
| Multi-project | One daemon serves every registered project (loads the embedder model once); `ccc daemon status` lists each project with an `idle`/`indexing` state — poll this before issuing a search if you want to avoid racing an in-flight (re)index. |
| Index-job ownership | The `ccc index` CLI process is a thin client WATCHING a daemon-side job — killing the client (Ctrl-C, timeout, harness kill) does NOT stop indexing; the daemon carries the job to completion (observed live: a client killed at 473/853 files finished daemon-side minutes later). After any interrupted `ccc index`, poll `ccc daemon status` for `[indexing]`→`[idle]` rather than blindly re-running — and don't trust a search issued mid-build. |

## 3a. Ownership and resource ceilings — SUPERVISED mode

**Why the stock design cannot be capped in place.** Everything in §3 composes into one hazard.
The daemon is where all compute happens; it is spawned by whichever client finds no socket; that
spawn inherits the client's cgroup and then outlives the client. So the ceiling is decided by a
race, a killed client does not stop the work, and any limit applied to one caller is discarded by
the next spawn. Capping ccc is therefore an OWNERSHIP change, not a tuning change — and wrapping
the `ccc` command does not achieve it, because the wrapper binds the caller while the work lives
in a process that survives the caller.

**The supervision switch already exists in ccc.** `COCOINDEX_CODE_DAEMON_SUPERVISED=1` is read
independently by two sides (`client.py` `_is_daemon_supervised`, `daemon.py` at reaper
construction). Client side: never call `start_daemon()`; on a missing socket, wait for it to
reappear. Daemon side: disable the idle reaper. Set it for CLIENTS only — leaving it OFF inside
the unit keeps the idle exit alive, and `Restart=always` then returns the multi-GiB model heap to
the host on every idle cycle.

**House implementation (WSL host, landed 2026-08-08).** One unit plus two config edits, no new code:

| Piece | Where | Role |
|---|---|---|
| `ccc-daemon.service` | `dotfiles/cocoindex/ccc-daemon.service.wsl` → `~/.config/systemd/user/` | the sole owner; carries every ceiling, `Restart=always`, `UnsetEnvironment=COCOINDEX_CODE_DAEMON_SUPERVISED` |
| client-side flag | `dotfiles/zsh/zshenv` | exports the flag, guarded on the UNIT FILE existing — so placement and de-authorization can never drift apart, and macOS stays LAZY-SPAWN untouched |
| in-process caps | `envs:` in `global_settings.yml` | thread pools + engine backpressure; see below for why the unit alone is not enough |
| activation | `mise run link:dots` then `mise run wsl:ccc-daemon` | two-step by design: link places the unit, the task enables it |

**Enforceable vs silently ignored (this host, verified against a probe unit 2026-08-08).** The
user manager delegates `cpu memory pids` only. `CPUQuota`, `CPUWeight`, `MemoryHigh`, `MemoryMax`,
`MemorySwapMax`, `TasksMax`, `OOMPolicy` reach cgroup v2. `AllowedCPUs` (needs cpuset) and
`IOWeight` / `IO*BandwidthMax` (need io) do NOT — and systemd accepts them without error, so a
unit can look capped on an axis it never bounded. `Nice` and `IOSchedulingClass` work regardless,
being syscalls rather than controllers. Confirm any claim by reading the unit's own cgroup files,
never the property list you wrote.

**Why `envs:` is required alongside the unit.** PyTorch sizes its thread pool from nproc and
never consults the cgroup quota, so a quota alone yields full-width thread pools contending
inside a narrow slice. `envs:` is applied inside the daemon at startup (`daemon.py`, right after
settings load) — after numpy is imported but BEFORE `create_embedder()`, and torch's own import is
deferred to the first model load, so thread-count variables still land in time. That timing is
also why a shell `export` cannot cap a running daemon. Engine-side, `COCOINDEX_MAX_INFLIGHT_COMPONENTS`
(default 1024) is the backpressure knob that dominates index-time heap. The engine's async worker
threads scale with nproc and have NO environment knob — only `CPUQuota` bounds those.

**No VRAM ceiling exists.** `embedding.device: cpu` (or an empty `CUDA_VISIBLE_DEVICES`) excludes
the GPU entirely; that is the whole toolbox. Allocator variables tune fragmentation, not capacity;
the one true per-process cap is a Python call with no ccc call site; MPS and MIG are unavailable
on a consumer card. Never describe a GPU setting here as a memory limit.

**Three traps that only exist under supervision** (all source-verified 2026-08-08):

1. `ccc daemon restart` is NOT the mirror of `ccc daemon stop`. `cli.py`'s `daemon_restart()`
   imports `start_daemon`/`stop_daemon` and calls them directly, never touching
   `_connect_and_handshake()` — so `_is_daemon_supervised()` is never consulted. It forks a
   second, uncapped daemon into the calling shell's cgroup, that process wins the socket bind
   (it starts ~1s ahead of the supervisor's `RestartSec=2`), and ~2s later the supervisor's own
   respawn unlinks and re-binds the same path — leaving the manual daemon alive, unreachable,
   uncapped, and invisible to `ccc daemon status`. Always `systemctl --user restart ccc-daemon`.
2. ANY stop verb aborts EVERY project's in-flight index on that daemon, not just the project you
   were working on. The index coroutine is an untracked task and the process then hard-exits, so
   nothing drains. Committed state on disk survives and a re-run resumes from `unchanged`, but
   the current pass is lost. Poll `ccc daemon status` for `[indexing]` across ALL projects first.
3. A shadow/throwaway ccc instance (anything pointed at its own `COCOINDEX_CODE_DIR`, notably
   `scripts/ccc-swap.ts`'s blue-green build) has NO supervisor, so it MUST be allowed to
   self-spawn. The supervision flag is exported shell-wide and would otherwise ride into it and
   hang every shadow `ccc index` for 30s. `ccc-swap.ts` deletes the flag from its `shadowEnv`
   for exactly this reason and keeps it in `liveEnv`; any new wrapper must do the same.

**Verify a claim of boundedness:**

```bash
systemctl --user show ccc-daemon.service -p CPUQuotaPerSecUSec -p MemoryHigh -p MemoryMax -p MemorySwapMax -p TasksMax
cat /sys/fs/cgroup/user.slice/user-$(id -u).slice/user@$(id -u).service/app.slice/ccc-daemon.service/cpu.stat
```

`nr_throttled` rising is the only direct proof the CPU ceiling ever engaged. Measured before/after
numbers live in `catalog.md` (2026-08-08 entry).

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

House invocation is `repo-search <route>`: `concept` / `battery` select `ccc search`,
`literal` / `exhaustive` / `files` select rg, and `structural` selects `ccc grep`. The canonical
compatibility entrypoint remains `bun ~/.claude/hooks/repo-search.ts`, a relative symlink to the
single implementation at `cocoindex/repo-search.ts`; the PATH command links to that implementation
directly. A missing canonical file is a configuration fault, not
permission to call ccc search/grep directly or emulate search with Python, Node, or shell loops.
Exit-zero ccc output without a `--- Result` block is reported as NO_MATCH, never PASS. This file remains the arguing home for
why each backend fits; the router owns deterministic dispatch, timeout, and result classification.

**Query phrasing that helps**: describe the *mechanism* the code performs, not the topic word a
doc section heading would use — a query that echoes a heading verbatim invites the doc-bias
failure mode above. **Pagination**: `--limit`/`--offset` to look past a shallow top-N before
concluding "not found" — the correct hit is often present, just outranked, not absent.

### 4a. Director-loop battery — known-reduction checks, novelty/absence, delegation briefs

At the three director-loop anchors — before accepting a claimed reduction, before a
`new` / `novel` / `新規性` / `不在` / `frontier` claim, and before drafting a delegation
brief from hint terms — one semantic query is not evidence. Run a battery:

1. Confirm CC1 registration and CC2 freshness, then execute **at least three paraphrases**
   that vary the mechanism, the expected/known reduction, and the domain vocabulary.
2. Include both Japanese and English tokens in the battery when the corpus or brief mixes
   them. The model check and all query-craft consequences of **LANGUAGE-WALL** live in
   §4b.2; apply that rule here by citation rather than duplicating it.
3. Record the exact denominator before judging:

   | claim | exact query | JA/EN token mix | project/path scope | freshness evidence | hits / known reduction | verdict |
   |---|---|---|---|---|---|---|

4. A known-reduction check accepts or demotes the claim against the reduction found by the
   battery. An absence claim attaches every executed query row as its denominator and says
   “not found in this battery”; without the query ledger, the absence claim is invalid.
   A delegation brief carries forward the matched canonical loci and the hint vocabulary,
   not only the supervisor's remembered wording.

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
     route exact-token lookups to `repo-search literal` in any language.
   A pure-Japanese notes vault gets no dependable semantic search from the default model —
   route literal lookups to `repo-search literal` and gate any semantic promise on the model
   swap below.
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
always run `ccc reset && ccc index` — never assume an in-place swap is safe. Five further rules
below, each distilled from a same-day operational failure (2026-07-30 forge ledger): judge a
candidate WITHOUT touching the live model (§6a); stop the daemon before any dimension change
(§6b); run a fleet-wide adoption as a blue-green build over an ENUMERATED project list, never a
reset-in-place loop over a remembered one (§6c); same-dimension swaps stay silently unguarded
regardless (§6d); and re-verify any smoke expectation before it judges a swap (§6e).

### 6a. Evaluate a candidate WITHOUT swapping the live model

The live model is not an experiment switch. Swapping it in to "see if it's better" IS the
outage — every registered project loses semantic search for the whole rebuild (§6c) — and it
is never necessary: the entire chunked corpus is readable offline, read-only, with no daemon
and no sqlite-vec extension. cocoindex-code stores a vec0 virtual table's payload in ordinary
SQLite shadow tables that any `sqlite3` or `bun:sqlite` client can query directly. Verified
live this session against dotfiles' own `target_sqlite.db` (8,334 chunks, matching `ccc
status`'s own count):

```sql
SELECT r.id, a.value00 AS file_path, a.value01 AS content, a.value02 AS start_line,
       a.value03 AS end_line
FROM code_chunks_vec_auxiliary a
JOIN code_chunks_vec_rowids r ON r.rowid = a.rowid
```

`code_chunks_vec_auxiliary`'s `value00..value03` columns map, in DDL declaration order
(`indexer.py`'s `Vec0TableDef(auxiliary_columns=["file_path", "content", "start_line",
"end_line"])`), to those four fields; `language` is deliberately NOT in the auxiliary table —
it lives in `code_chunks_vec_chunks.partition00` (`partition_key_columns=["language"]`),
joinable via `code_chunks_vec_chunks c ON c.chunk_id = r.chunk_id` — confirmed live, its
distinct values match `ccc status`'s per-language chunk breakdown. This reads chunks and
compares a candidate's own from-scratch embedding of the same text against known content; it
does not exercise ccc's actual KNN ranking (`query.py`'s `vec_distance_L2`), so a real A/B
still needs a built index — build it out of band on a shadow copy, never the live one (§6c).

### 6b. Dimension changes: stop the daemon FIRST

`ccc reset` releases a project's SQLite handle (`Project.close()` calls
`self._env.get_context(SQLITE_DB).close()`) but never explicitly closes the underlying LMDB
environment (`cocoindex.db/mdb/{data,lock}.mdb`) backing `coco.Environment` — the method's own
docstring promises to release "file handles (LMDB, SQLite)"; the body only touches SQLite
(`project.py::Project.close`). If the SAME daemon process is then asked to open a NEW
environment at that path under a different schema — a dimension change edits the vec0 DDL
itself, confirmed live (`CREATE VIRTUAL TABLE code_chunks_vec USING vec0(... embedding
float[768])`; the width is baked into the CREATE statement) — the underlying Rust LMDB binding
refuses. The exact error is present verbatim in the installed binary
(`cocoindex/_internal/core.abi3.so`, confirmed via `strings`): "environment already open in
this program; close it to be able to open it again with different options". `ccc reset`
succeeds regardless (its file deletion does not depend on that handle), so the failure only
surfaces on the following `ccc index`, leaving a 0-byte `target_sqlite.db` with no further
diagnostic — measured today across three projects. The daemon builds its embedder exactly once
at startup (`daemon.py::run_daemon`) and has no in-place reload path; its only settings-change
recovery is a full stop+respawn on the client's NEXT handshake after `global_settings.yml`'s
mtime moves (`client.py::_connect_and_handshake` / `_needs_restart`), and that respawn's timing
relative to a scripted reset→index loop across many projects is not something to depend on.
Running `ccc daemon stop` before editing `global_settings.yml` for a dimension change removes
the ambiguity outright — a freshly spawned daemon process cannot hold a stale LMDB handle for
anything.

REGIME QUALIFIER (2026-08-08). The paragraph above is the LAZY-SPAWN procedure. Under
SUPERVISED (§3a) a bare `ccc daemon stop` no longer gives you a stopped daemon: the supervisor
returns one in about two seconds, and it reads whatever is on disk at that moment — almost
certainly the OLD file, since a human edit rarely finishes inside that window. Two supervised
replacements, in order of preference: (1) edit `global_settings.yml` FIRST, then run
`ccc reset --force && ccc index` — `ccc reset`'s first daemon call already goes through the
handshake's settings-mtime check, which forces the same fresh-process boundary before any DB
file is touched; (2) if you want a durably stopped daemon to inspect, use
`systemctl --user stop ccc-daemon`, edit, then `systemctl --user start ccc-daemon`. Whether the
two-second window alone still averts the stale-LMDB-handle failure is UNVERIFIED — do not rely
on it. And note `scripts/ccc-swap.ts`'s blue-green path (§6c) sidesteps all of this by building
in a shadow directory, which is one more reason to prefer it for anything fleet-wide.

### 6c. Fleet-wide swap: blue-green, and enumerate — never recall

`ccc reset --force && ccc index`, run in place across every project, destroys the OLD index
before the NEW one exists: search is dead project-wide for the whole rebuild, and a rejected
candidate costs a SECOND full rebuild just to roll back. The two stores under `.cocoindex_code/`
(§2) are each self-contained and path-relocatable — `cocoindex.db/mdb/{data,lock}.mdb` (LMDB)
and `target_sqlite.db` (SQLite, `journal_mode=delete`, no `-wal`/`-shm` sidecar file, confirmed
live) — so a POSIX directory `rename()` is a safe, near-instant cutover. `COCOINDEX_CODE_DIR`
overrides `user_settings_dir()` (`settings.py`), which `_daemon_paths.daemon_runtime_dir()`
falls back to by default, so pointing it at a shadow directory gives a shadow build its OWN
daemon (own socket/pid/log) — the live daemon is never touched mid-build.
`COCOINDEX_CODE_DB_PATH_MAPPING` (`source=target[,source=target...]`, parsed by
`settings._parse_path_mapping`) redirects only `resolve_db_dir()` — where DB FILES land —
while `find_project_root` / `load_project_settings` keep resolving against the REAL project
tree, so a shadow build still discovers and reads each project's real `settings.yml`. This is
mechanized in `~/dotfiles/scripts/ccc-swap.ts` (verbs: `discover`, `build --model <hf-id>`,
`cutover`, `rollback [--generation <ts>]`, `gc`) — drive that script rather than hand-rolling
the env-var plumbing above.

`discover` is also the fix for the companion failure: a fleet-wide operation enumerates
registered projects by filesystem probe, never a remembered list of "the usual places".
**The probe MUST pass `--no-ignore`.** `.cocoindex_code/` is gitignored in most repos, so a
default `fd` walk silently skips them — measured 2026-07-30, same host, same instant:

```bash
fd -H            --full-path '\.cocoindex_code/settings\.yml$' ~   # 5  — WRONG
fd -H --no-ignore --full-path '\.cocoindex_code/settings\.yml$' ~   # 8  — correct
```

The three the default walk hid were `ARTS/qinfogeo`, `Workspace/correo`, and a qoed worktree.
This is not a footnote: the first draft of THIS rule shipped the 5-hit command and reported 5 as
the fleet size — the enumeration rule under-enumerated, and the miss it hid was the worst case
on the host. `ARTS/qinfogeo` was found stuck at **dim 384 with 87,560 chunks, last indexed
2026-04-10** — it slept through the 2026-07-17 move to dim 768 and had been answering from a
stale-dimension index for three and a half months. A second earlier miss, `DPP/min-sys-dpp-mvp`
(32,526,336-byte index), came from searching 3 remembered roots instead of `$HOME`.

No command warns that a registered project was left behind; it just keeps serving a
stale-dimension index with zero error, which is why `ccc-swap discover` reports each project's
DDL dimension and flags the odd one out. `$HOME/.cocoindex_code` is NOT itself a project (no
`settings.yml`, only `global_settings.yml` plus daemon runtime files) — requiring `settings.yml`
specifically, not just the directory name, already excludes it.

### 6d. Same-dimension swaps are silently unguarded; choosing a model

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

### 6e. A smoke anchor rots — re-verify before it judges anything

A recorded end-to-end smoke (a query plus its expected top hit) is a claim about the CURRENT
index, not a fixed constant, and nothing marks it stale when the corpus changes under it.
Confirmed this session: qoed's smoke (「境界条件の正規化」 → `\section{適用境界}`) died when
commit `7d915ed` ("fix: 降格済み文書を意味検索の索引から外し、漏れを gate で止める", 2026-07-28
14:56 JST, confirmed via `git show`) added the smoke's target document to `settings.yml`'s
`exclude_patterns` as part of an unrelated authority-gate cleanup — the file stayed on disk but
the live index dropped to zero chunks from that path (confirmed:
`SELECT COUNT(*) FROM code_chunks_vec_auxiliary a JOIN code_chunks_vec_rowids r ON r.rowid =
a.rowid WHERE a.value00 LIKE 'papers/P2606_003%'` → 0). Two days later a candidate-model trial
used the same dead smoke to gate its own decision: the expected hit was absent, read as a MODEL
regression, and the candidate was reverted same-day (full trial detail → `catalog.md`) — but the
smoke was already failing against the INCUMBENT model too, re-verified live this session. Rule:
before a stored smoke expectation is allowed to gate a swap decision, re-run it against the
CURRENT incumbent index in the SAME session — a smoke that fails against its own incumbent is a
rotted oracle, not evidence about a candidate. Record which file a smoke depends on so a future
corpus-scoping change (an `exclude_patterns` edit, a demoted-document sweep) is traceable back
to it.

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
