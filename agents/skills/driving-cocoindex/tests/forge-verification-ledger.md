# driving-cocoindex — forge & verification ledger

> Forged 2026-07-13 (Fable 5) under the `forging-skills` pipeline. This file is the LEDGER
> half of the F3 artifact (provenance, calibration, adversarial-verification findings); the
> other half — the fire/no-fire trigger set — lives inline in SKILL.md's F3 tables. One
> token, two components, per forging-skills' own gate definition.

## Source & provenance

Two survey waves, both under a design frozen SOLO before any harvest result (skeleton +
template choice = `driving-codex`, decided by the editor before dispatch — see the forge
design notes; this ordering means gate/routing shape was NOT reverse-engineered from
convenient facts). Wave 1 was aborted overnight by API stalls — **0 results returned**, but
its live-trial artifacts (the starlette trial checkout, partial command transcripts) survived
on disk and were reused rather than re-run from scratch. Wave 2: 6/6 agents completed —
official-docs, live-trial, host-reality, mcp-wiring, framework-versions, siblings.

**Live-trial protocol** (starlette corpus, 100 files, 1205→1206 chunks, macOS, shared daemon
also serving `qoed`): (a) head-to-head — 6 natural-language queries run through both
`ccc search` and `rg`, each independently verdicted ccc-wins / rg-wins / tie, plus one
adversarial exhaustive-enumeration query; (b) staleness proof — append a marker function,
confirm a miss with zero reindex, confirm the miss persists after a 16s wait with no watcher
activity, run `ccc index`, confirm the hit; (c) `ccc reset` — confirm DB-only deletion vs
`--all`, and the daemon's own auto-rebuild-after-reset (flagged UNVERIFIED mechanism, §below).

**Primary ground truth**: direct read of the installed package's own Python source
(`cli.py`, `server.py`, `settings.py`, `daemon.py`, `client.py` under the uv-tool site-packages
tree) — ranked above the docs site (never raw-fetched this forge) and the GitHub README (only
ever fetched via a summarizer). Design (name, template, gate letters CC1–CC4, section skeleton,
scope line) was an editor-SOLO decision made before dispatching the survey, per the forge
design notes (`wf_3fa238fe-709`) — harvest confirmed rather than generated the gate shapes.

## Source-grade table

| Source | Class | Grade |
|---|---|---|
| Direct command output (`ccc doctor`/`daemon status`/`status`/`--help`, `ps`, `launchctl`) + raw `curl`/`gh api` (PyPI JSON, GitHub REST) | live SESSION, direct | author-confirmed |
| Docs-site content and issue claims relayed only via WebFetch's small-model summary (GitHub README, releases/issues pages, `cocoindex.io/cocoindex-code/` — never raw-fetched) | summarized fetch | CONSENSUS, flagged per claim — never upgraded to fact |
| WebFetch page-summary rendered 2026 release dates as "2025" (both `cocoindex-code` and `cocoindex` release tables) | trap caught mid-forge, cross-checked against raw PyPI/GitHub API JSON | recorded; discard the WebFetch year, keep the raw-API date |
| Daemon auto-rebuild observed immediately after `ccc reset` (no `ccc index` run) | observed once, live trial | UNVERIFIED mechanism — body's Gotchas row says so explicitly and prescribes the operator action only |
| Same-dimension embedding-model swap silently mixes stale/fresh vectors | two grades, split: the ABSENCE of any model-change guard is a **verified negative** (author-confirmed source grep across daemon/client/indexer/settings — no fingerprint/mismatch/invalidate path); the mixing CONSEQUENCE is source-reasoned, not observed | body states the unconditional RULE (`ccc reset && ccc index` on any model change) with full confidence — justified by the verified-negative, not by the reasoned consequence |
| Head-to-head verdicts, `ccc search` vs `rg`/`ccc grep` | author-measured | n=6 queries + 1 adversarial + 1 grep-pattern pair, ONE corpus (starlette, 100 files) — scope stated, not generalized to "ccc beats rg" as a universal claim |

## Calibration

Model failure is dual, same shape as the sibling `driving-codex` inversion: **(a) under-use**
— an agent grep-flails or fans out an Explore agent on a concept-shaped ask instead of reaching
for `ccc search`, the adoption problem motivating this skill; **(b) over-trust** — treating a
plausible top-k as exhaustive or current when the index is stale (no watcher, no staleness
field in `ccc status`) or when the query shape was wrong for semantic search (the adversarial
`get_route_path` case: 5/8 top hits were false positives with zero literal match). Corrective
bias: CC3 ROUTE and CC2 FRESH are placed first-class and early in the body (not buried under
setup mechanics), mirroring driving-codex's placement of CATALOG-BY-PROBE ahead of flags/output
parsing — the routing/freshness decisions are the load-bearing ones, not the invocation syntax.

## VERIFICATION FINDINGS — 2026-07-13, resolutions signed by the editor

Fleet: 4 sonnet lenses (coherence+architecture, sibling-cuts+trigger desk-check,
spec-fidelity, live fact re-check) + 1 codex hostile audit (gpt-5.5 xhigh, read-only, run
solo by the editor). 22 sonnet findings + 10 codex findings.

**Headline**: live fact re-check 10/10 PASS on the assigned load-bearing claims — including a
fresh stdio MCP handshake reproducing the catalog's `search` schema byte-consistent, and a
live confirmation of the uptime-undercount gotcha. Two incidental numeric errors found and
fixed (release count 29→43/44 — an unpaginated first count; framework cadence span 11→24 days).

**Fixed (editor-signed)**: the codex-found LAW-vs-MCP-section contradiction ("every verb works
in any cwd" → rewritten: the CLI's advantage is per-call cwd CONTROL, not gate escape);
durability leftovers purged from bodies (~seconds, 30+, few-hundred-ms → catalog); the
dangling counts-pointer now resolves (35/35 log evidence landed in catalog's known-issues
row); CC3's gate pointer re-aimed at the actual QUERY-SHAPE ladder; SKILL.md's MCP section
deduplicated to a pointer at operations.md §7 (one home); Workflow example hardened against
shell injection (quoted path + sanitization note); `ccc grep`'s scans-everything-outside-a-
project caveat promoted into the recipe row; F3 restructured — the MCP-tools-missing case
moved out of MUST-NOT-FIRE into an explicit CO-FIRE-ORDERED-SECOND table; the upstream-
contribution route now co-fires implementing-and-debugging FIRST per writing-python's own
cut; FIRES examples made lexically independent of the description's bait and the bare
「embedding モデル変えたい」/「インデックス作成」 tokens qualified with ccc/コード context
(anti-race vs writing-python's wandb/ML territory); serena row labeled "(MCP toolset, not a
Skill)"; install-commands-vs-scope tension resolved as a DECLARED SEAM in operations.md §1
(command shown for locality, verb ownership → running-python-tools); init mutation/rollback
checklist, CC1/CC2 success-evidence shapes, secrets rule (envs = literal injection, never
commit keys), and the Linux/WSL log-path fallback (UNVERIFIED, find-based) added to
operations.md; ledger F3-token gloss + the same-dim/auto-rebuild grade split (this section's
own header block).

**Adjudicated, NOT changed**: bare `ccc`/`cocoindex` stay as description tokens (real asks
name the tool; the MUST-NOT-FIRE rows that contain them are dominated by their own routing
tokens — install/MCP/what-is); the reset-auto-rebuild row STAYS in Gotchas (its Fix cell is
operator-action-only, which is exactly the demotion codex asked for); the one-sided co-fire
with operating-the-harness is declared hub-and-spoke convention (same asymmetry as
driving-codex, recorded here rather than editing that skill's over-budget description —
its BODY gains a generic MCP dead-server gotcha instead); compound concept+enumeration asks
resolve in the body's ccc→serena pipeline note, accepted as a description-budget trade.

**Reciprocal edits landed at ship**: running-python-tools (driving-* carve-out clause),
raising-resolution (ccc/cocoindex owner row), operating-the-harness (body gotcha:
MCP config present ≠ server live).

---

## Reforge v2607.2.0 (2026-07-13) — markdown-corpus + LANGUAGE-WALL trial

**Trigger**: user asked whether ccc is effective on markdown, and whether that answer was
distilled into the skill. It was not — markdown appeared only as the doc-over-code bias's
noise source, never as a target corpus; the assistant's own first-pass answer ("your
markdown vault is an ideal ccc target") was then partially REFUTED by measurement, which is
exactly what earned the reforge.

**Source & grade**: live trial, this host, all probes direct command output (grade HIGH) —
md-only mirror of `agents/skills/` (526 files / 5,432 chunks) + 1 planted unique-topic JA
note = 527 files / 5,434 chunks; 2 EN→EN concept queries with known ground truth, 4 wall
probes (one an EN-language query testing EN→JA), then raw-model cosine matrices via the ccc
uvx env (arctic-embed-xs vs granite-107m-multilingual) to isolate model-level cause from
ccc plumbing. Full numbers → `references/catalog.md` §Markdown-corpus
trial. One probe INVALIDATED mid-trial and redone: the first JA→JA ground truth
(courting-on-apps) turned out to be absent from the corpus (private skill, not in dotfiles)
— replaced with an in-corpus truth + the plant. Lesson re-learned: verify ground-truth
presence BEFORE scoring recall (CC1's spirit applied to eval design).

**Findings folded in**: (1) EN→EN prose concept recall usable but truth ranks #3–#4 with
flat score bands → "top-k is a candidate set" rule (SKILL.md §Markdown, operations §4b.1);
(2) LANGUAGE-WALL — new LAW clause (d), new stable token, new Gotchas row, 2 new FIRES rows,
1 new no-fire row: the default model's topical signal is EN-only, established at the MODEL
level (wrong-doc-beats-right-doc 0.593>0.545; no EN↔JA bridging; symmetric-encode control);
post-fleet refinement: code-switching onto a mixed note's EN tokens is a MEASURED craft fix
(truth #1 @ 0.763), pure-JA paraphrases unreliable; (3) fix candidate
granite-107m-multilingual restores JA + cross-lingual at the raw-model pairwise level
[end-to-end ranking UNVERIFIED], and is SAME-DIM (384) — ties directly into §6's
silent-mixing hazard, swap is global (no per-project embedding override, source-verified in
v2607.1.0) so it re-embeds every registered project; its CODE-search effect UNVERIFIED,
flagged in catalog.

**Adjudicated, NOT changed**: description keeps code-first framing (code search remains the
dominant ask); the doc-over-code Gotchas row unchanged (still correct for mixed corpora);
no per-project model workaround invented (none exists — checked ProjectSettings schema in
v2607.1.0 source read).

**Verification**: skill-check floor (exit 0) + read-only fleet, 4 sonnet lenses
(claims-vs-evidence refuter, JA-degeneracy methodologist, trigger desk-check, one-home
consistency) → 21 findings: 2 blocker / 7 major / 9 minor / 3 nit. All adjudicated; the two
blockers were resolved by NEW MEASUREMENT, not wording:

- **Blocker "rephrasing does not help" was FALSE as shipped** — 3 rephrase probes run
  post-fleet: a code-switched query (the note's own EN technical tokens) put the truth at
  #1 @ 0.763 sweeping the top-8; pure-JA paraphrases stayed unreliable (1 of 2 recovered to
  #3, 1 missed). The shipped sentence was replaced by the measured CODE-SWITCH craft rule —
  the refuter improved the content, not just the wording. LANGUAGE-WALL refined from
  "EN-only model" to "topical signal flows through EN tokens only."
- **Blocker structural-hunt F3 row unsupported by description** (pre-existing since
  v2607.1.0): trigger token added (multi-line/構造検索 → ccc grep) + the description's
  literal-string Cuts clause qualified so it no longer steers the structural case away.
- **JA exact-token miss re-attributed**: an EN exact-token control (`CoRNStack`, unique to
  one file) missed identically → general CC3 limitation in both languages, REMOVED from
  LANGUAGE-WALL evidence (was double-counting a non-language-specific phenomenon).
- **granite downgraded to raw-model-verified**: an end-to-end ccc re-run with granite was
  adjudicated NOT RUN — the model is global (dotfiles-symlinked settings) and a swap
  re-embeds every registered project; consent-gated, flagged [UNVERIFIED at ranking level].
- **P2 recast as ranking success + anomaly** (cross-query score comparison is not
  commensurable evidence; the raw-model matrix is the cleaner plank); verdict bands
  restated to cite only tabled values; the symmetric-encode counter-probe (rules out
  `prompt_name` asymmetry) published in catalog; probe-count caveat corrected; Q2 rg
  control added; adjacent-diff band widened to include exact ties; §4b.4's wrong (§3)
  pointer repointed to LAW (b)/§2; SKILL.md §Markdown trimmed to directive+pointer
  (one-home); §7's unverifiable "client timeout" comparison dropped; corpus-size/plant
  provenance noted in catalog.
- **New sibling cut** (desk-check): systematizing-knowledge / structuring-documents —
  SEARCH-vs-SYNTHESIS on the shared 「メモ/ノート」 vocabulary; 全文検索 added to the
  markdown no-fire row.

**Adjudicated, NOT changed (fleet round)**: description keeps the unconditional 純和文
posture despite the single-corpus caveat — calibration inversion: the executor's default
failure is overpromising JA search, so the fail-safe direction is stated flat (LAW (d)
carries the caveat); the MEMORY.md-single-known-file near-miss is left to CC1's Grep
fallback (rated minor); bare `ccc`/`cocoindex` tokens stand per the v2607.1.0 adjudication
above.

### v2607.3.0 addendum (2026-07-13, user-instructed 「すすめて / スキル蒸留」) — swap executed

`cocoindex/global_settings.yml` (dotfiles) switched to
`ibm-granite/granite-embedding-97m-multilingual-r2` with a dated history comment; candidate
chosen by live HF verification + local pairwise matrices (97m-r2 dominated 107m and
multilingual-e5-small on every margin; it is ccc's own curated Multi-Lingual tier, curated
code score 0.80 > arctic's 0.67; its empty-string `query` prompt keeps `query_params`
valid). End-to-end verification on the same md corpus: all four probes recovered or
improved — JA→JA real truth #2 (was absent), plant #1+#2 with a clear gap, EN→JA #1+#2
(was absent), EN→EN control improved to #1 (before/after table → catalog). qoed reset +
rebuilt (11,962 chunks, ~7 min); JA/EN twin concept queries now converge (3 of top-4
shared) on the real code corpus — overlap-based sanity, not hand-scored ground truth.
[UNVERIFIED at ranking level] flags cleared; code-switch craft retained for unswapped
hosts; LAW (d) unchanged (it describes the SHIPPED default, which remains arctic).
Windfall fact folded in: a killed `ccc index` client does NOT stop the daemon-side job
(observed at 473/853 files, completed minutes later) — new Gotchas row + operations §3
Index-job-ownership row; also `ccc reset` needs `--force` non-interactively (daily-loop
reset row updated). Stale registry entry (prior session's starlette trial bed)
deregistered via `ccc reset --all --force`.

---

## 2026-07-14 — PDF-boundary reforge (minimal)

**Change**: added the PDF/binary non-support boundary to SKILL.md (Scope caveat, a Gotchas
row for the silent skip, a FIRES row routing PDF asks to the convert-first workaround) + this
ledger entry. No references/ expansion (user chose the minimal scope).

**Why**: a user asked whether ccc supports PDF (believed it did). It does NOT — confirmed
high-confidence by a 3-agent probe fleet (2 sonnet + codex heterogeneous cross-check), which
also showed the failure is SILENT (no error), exactly the class of trap this skill exists to
prevent.

**Evidence (loci, as installed cocoindex-code v0.2.37 / cocoindex framework v1.0.14)**:
- `cocoindex_code/settings.py` `DEFAULT_INCLUDED_PATTERNS` (~55 globs): no `.pdf` entry.
- `cocoindex_code/indexer.py` `process_file()`: `read_text()` + `except UnicodeDecodeError:
  return` → binary/PDF silently skipped even if force-included.
- Package METADATA: no docling/pypdf/pdfminer/pymupdf/pdfplumber dependency.
- Live probe: probe.md/probe.txt/probe.pdf → `ccc index` = "2 files listed" (PDF pre-filtered,
  no error, not counted); `ccc search` never returned the PDF; .md/.txt positive controls hit.
- codex (2nd opinion) verbatim: "No. The installed `ccc` does not ingest `.pdf` as a built-in
  corpus extension."
- Framework distinction: `cocoindex` can do PDF only via user pipeline code calling an external
  parser (official "PDF to Markdown"/`examples/pdf_embedding` use `docling.DocumentConverter`);
  a commented-out `**/*.pdf` line in `cocoindex/cli.py` scaffold template is NOT active support.
  ccc neither depends on nor exposes any of this.

**Gate check**: F1 — each added line changes a tool call (recognize silent skip → convert-first;
route PDF asks correctly). F2 — no new sibling; extends existing one-homes. F3 — FIRES set
extended; this entry is the adversarial-provenance artifact. Durability contract honored: no
version number asserted in the SKILL.md body (dated facts live here).

## Reforge v2607.5.0 (2026-07-23) — director-loop trigger anchors

Reforge record: description に帰着照合・新規性/不在/frontier 主張・委任ブリーフの三錨を加え、operations §4a に三言い換え以上の query battery と不在主張の分母台帳を置いた。

F3 desk-check(name + description のみで判定):

| Ask | 期待 | desk-check |
|---|---|---|
| 「このプローブを検収する前に、既知の帰着がないか照合して」 | FIRE | FIRE — 「検収前の帰着照合」が description の新錨と一致 |
| 「『この機構は frontier で先行例が不在』と主張する前に意味検索して」 | FIRE | FIRE — `frontier` / `不在` 主張前の新錨と一致 |
| 「委任ブリーフを起草する前に、ヒント語を JA/EN 混在の言い換え三本で照合して」 | FIRE | FIRE — 委任ブリーフ・ヒント語照合・battery の全錨と一致 |
| 「この関数の初回呼び出しを漏れなく全部列挙して」 | NO-FIRE(`rg` / `serena`) | NO-FIRE — 「初」は新規性でなく exact-symbol exhaustiveness; CC3 cut が優先 |
| 「既知/未知の二節を読みやすく並べ替えて」 | NO-FIRE(`structuring-documents`) | NO-FIRE — 検索・照合・不在主張・委任ブリーフのいずれも求めていない |

## 2026-07-24: PROSE-DEBT waiver (dated) + 重複実装経路の照準是正

touch: FIRES 表に「機能重複/二重実装」経路の行を追加(grep 0件 ≠ 不在、battery FIRST)。
床の実測(この touch 後): 長文24・版見出し20行・長セル1 — 全て既存負債で本編集の増分なし。
waiver を記載する — staleness 行(2+ classes)により reforge queue 入り(driving-* family と同型、
蒸留腕の順位で writing-julia 等の後段)。
description は 1486/1500 字で満杯のため事故語彙(機能重複・二重実装)の追加は不可 — この照準は
(a) global CLAUDE.md の常駐行、(b) implementing-and-debugging の co-fire 行(実装時に必ず読まれる
現職)、(c) PostToolUse[Grep] zero-hit hook の3機構で補償する裁定(2026-07-24)。

## §MCP の登録解除 — 2026-07-25(覆せる既定・追認待ち)

**発端**: 発注者「cocoindex について MCP やめさせたいのだがどう思う? MCP が daemon 版不一致で
二度とも失敗したので ccc CLI へ切り替えた。結果、私が引いていなかった正本が二つ出た」。

**現物の確認**: `.mcp.json` の登録は `{"command":"ccc","args":["mcp"]}` — **CLI と同一バイナリ**。
したがって「MCP 実装が CLI に遅れている」という説明は成立しない。真の非互換は本 skill が
既に記録していた: MCP の project 束縛は **spawn 時の cwd で凍結**される一方、ccc は
PROJECT-BY-CWD。global 登録のサーバは起動 cwd 以外の全 repo に対して誤ったプロジェクトを向く。
複数 repo を往復する運用では版を上げても直らない。

**採択の決め手(人間工学ではなく認識論)**: 「登録されているが死んでいる」検索道具は、実行側に
「意味検索は試した」と信じさせる。そこから grep へ落ち、不在と結論する。これは本 skill が
閉じるべき重複実装の経路そのものであり、しかも我々が同日構築した4層の guard より**上流**で
再生産される。実測の裏づけ: CLI へ切り替えた結果、発注者が引いていなかった正本が2件出た
(答えが変わった = 判定に影響する差)。

**第二の害**: MCP は `refresh_index` 既定 true、CLI は既定で refresh しない(CC2 が明記する
asymmetry)。同じ動詞に家が二つあるだけでなく、**既定が食い違う**。単なる二重化より悪い。

**裁定の範囲**: 「MCP が悪い」ではない。**cwd 束縛の道具を global MCP に登録したのが
category error** である。単一 repo に留まる作業での per-project 配線は依然として正当であり、
SKILL.md の当該節を残した。

**戻し方**: `.mcp.json` に entry を再追加し `mise run cc:install-mcp`。

**床**: skill-check の prose 債務は 24 → 24(私の追記分は一度 29 まで増やして刈り戻した。純増ゼロ)。

## 2026-07-27: `driving-serena` reciprocal seam

`serena` を「MCP toolset, not a Skill」としていた現行 routing を、新設
`driving-serena` への SYMBOL-vs-CONCEPT seam に更新した。既存 PROSE-DEBT waiver の queue
位置は不変。`skill-check.ts` の再計測は長文24・版見出し20・長セル1で、既存 floor から
負債の純増なし。

## 2026-07-30: declared QUERY-SHAPE router + raw-search gate

**Observed failure and decision.** The existing PostToolUse nudge let raw Grep/rg run first and
could be silenced by any one ccc invocation. It optimized “ccc was called once,” not whether the
query shape selected the right engine. The replacement bans the unclassified surface in a
ccc-enabled registered project and routes through the executable `repo-search --help` contract:
concept/battery→ccc search, literal/exhaustive/files→rg, structural→ccc grep, symbol→Serena.

**One-home placement.** Backend fitness remains argued in `references/operations.md`; deterministic
dispatch/timeout now lives in `cocoindex/repo-search.ts`, with the former hook path retained as a
relative compatibility symlink. Enforcement lives in the user-global PreToolUse hook. SKILL.md
contains only the route pointer and CC3 artifact. No script was duplicated inside this skill.

**Red→green.** Before implementation, the two new test files reported 19 failures. After the
router and hook landed: 19 pass / 68 assertions. The full hook suite then passed 120 tests with one
pre-existing optional skip. Fixtures prove rg remains available through declared lexical routes,
unregistered/ccc-absent projects retain direct fallback, ccc concept search never silently
degrades to rg, and a hung ccc child returns 124.

**Hostile deployment regression, same day.** Because `settings.json` was already a live symlink
while the new PATH link had not been run, a worker saw the deny gate before it saw `repo-search`.
It then explicitly proposed replacing grep with Python and performed repository traversal there.
That is not user error: the first design split enforcement and its required entrypoint across two
deployment moments, and its message failed to make “stop, never bypass” a hard rule.

The fix colocates the router with the already-linked hook directory, makes that file the canonical
entrypoint, checks its presence before every denial, names bypass as forbidden, and catches the
observed os.walk/pathlib plus Node/Bun inline traversal family. Direct ccc search/grep is denied
too, because otherwise timeout and empty-result classification remain bypassable. A PATH symlink
remains convenience only. Separate red tests also prove an exit-zero ccc call with no `--- Result` block becomes
NO_MATCH rather than PASS, and that the tracked router remains executable. This is a high-signal
policy guard, not a claim that a shell hook can prove the intent of arbitrary programs. Expanded
targeted suite: 25 pass / 118 assertions; full hook suite: 126 pass / one pre-existing optional
skip / 310 assertions.

**Live ccc probe.** Registration and refresh succeeded: 724 files, 0 changed, 0 errors. Three
semantic queries then produced no output while other daemon projects reported `[indexing]`.
Only this run's client PIDs were terminated. The concurrent indexing is recorded as context, not
asserted as the cause; the verified product requirement is a bounded child, now tested.

**F3 description desk-check (name + 1008-character description only).**

| Ask | Verdict |
|---|---|
| 「識別子不明だけど認可を実装している場所を意味検索して」 | FIRE |
| “ccc search is stale and misses recent edits” | FIRE |
| 「日本語のノートをcccで概念検索したい」 | FIRE |
| “make this PDF searchable through ccc” | FIRE |
| 「cccのembeddingモデルを変えたい」 | FIRE |
| “list every TODO occurrence” | NO-FIRE → `repo-search literal` |
| “rename this known symbol and update callers” | NO-FIRE → `driving-serena` |
| 「このrepoを俯瞰して読む順番を教えて」 | NO-FIRE → Explore |
| “install or upgrade cocoindex-code” | NO-FIRE → `running-python-tools` |
| 「見つけたノートを統合してレビューを書いて」 | NO-FIRE → `systematizing-knowledge` |

**PROSE-DEBT waiver.** The description is now below the API cap and the version block is clean.
The remaining floor is 22 long prose sentences and one long table cell, down from the prior
24/20/1 waiver. Both are pre-existing argued-content debt; this focused mechanism change did not
attempt the queued full prose reforge.

## 2026-07-30 (continued): five findings from a same-day swap-and-revert outage

**What happened.** A candidate embedding model was swapped into `global_settings.yml` globally
and reverted the same day. The swap-and-revert cycle produced five independently-verified
operational findings, each distilled into a rule change (SKILL.md CC5/CC6 gates + two new
Language tokens; `operations.md` §6a–§6e, replacing the old undifferentiated §6). The full
swap/trial narrative and its dated numbers stay owned by `references/catalog.md` (not
duplicated here); this entry records the five MECHANISM findings and their evidence.

1. **Swap-as-measurement-instrument.** The live model was changed in order to test whether a
   candidate was better — that change IS what caused the outage. Verified this session: the
   entire chunked corpus is queryable offline, read-only, no daemon, no sqlite-vec extension,
   straight off `target_sqlite.db`'s own shadow tables. Ran the exact query now in
   `operations.md` §6a against dotfiles' own `.cocoindex_code/target_sqlite.db` (`sqlite3`
   CLI, installed cocoindex-code 0.2.39, `indexer.py`'s
   `Vec0TableDef(auxiliary_columns=["file_path","content","start_line","end_line"],
   partition_key_columns=["language"])`): `code_chunks_vec_auxiliary.value00..03` map to
   file_path/content/start_line/end_line in declaration order; `language` lives in
   `code_chunks_vec_chunks.partition00`, joined via `chunk_id`. `SELECT COUNT(*) FROM
   code_chunks_vec_auxiliary` = 8,334, matching the brief's claim exactly. → SKILL.md CC6,
   operations.md §6a.

2. **Blue-green replaces reset-in-place.** `ccc reset --force && ccc index` destroys the old
   index before the new one exists. Confirmed live: `.cocoindex_code/cocoindex.db/mdb/`
   holds `data.mdb`+`lock.mdb` (LMDB, canonical filenames, `file`-confirmed) and
   `target_sqlite.db` runs `journal_mode=delete` with no `-wal`/`-shm` sidecar — both stores
   are self-contained and rename-safe. Source-confirmed the env-var chain: `COCOINDEX_CODE_DIR`
   → `settings.user_settings_dir()` → `_daemon_paths.daemon_runtime_dir()` (its default
   fallback); `COCOINDEX_CODE_DB_PATH_MAPPING` → `settings.resolve_db_dir()` only — project
   discovery (`find_project_root`) still resolves against the real tree. Mechanized in
   `~/dotfiles/scripts/ccc-swap.ts` (verbs `discover`/`build`/`cutover`/`rollback`/`gc`; landed
   this session by a concurrent agent — read for accuracy, not edited). → operations.md §6c.

3. **A dimension change needs `ccc daemon stop` FIRST.**
   `project.py::Project.close()`'s docstring promises to release "file handles (LMDB, SQLite)"
   but its body only calls `self._env.get_context(SQLITE_DB).close()` — the LMDB environment
   backing `coco.Environment` is never explicitly closed. The exact error string is present
   verbatim in the installed binary (`cocoindex/_internal/core.abi3.so`, confirmed via
   `strings`): "environment already open in this program; close it to be able to open it again
   with different options". The dimension is baked into the vec0 DDL — confirmed live on
   dotfiles' own index (`.schema code_chunks_vec`): `CREATE VIRTUAL TABLE code_chunks_vec USING
   vec0(... embedding float[768])`. The daemon builds its embedder once at startup
   (`daemon.py::run_daemon`) with no in-place reload path; its only settings-change recovery is
   a full stop+respawn on the client's next handshake after the settings mtime moves
   (`client.py::_connect_and_handshake`/`_needs_restart`) — a hot-reload it is not, and its
   timing relative to a scripted multi-project reset→index loop is not something to trust.
   `operations.md` previously stated the reset-on-change rule without this prerequisite —
   fixed (old §6 folded into §6b/§6d). Same-day observation: three projects were left with a
   0-byte index this way (reported; the precise multi-project trigger sequence was not
   independently reproduced this session — see "Not re-derived" below). → SKILL.md `reset` row
   + FIRES row, operations.md §6b.

4. **Registered projects must be enumerated, never recalled.** Verified this session: `fd -H
   --full-path '\.cocoindex_code/settings\.yml$' ~` found exactly 5 real project registrations
   — `dotfiles`, `Workspace/{firedancer,beateater,qoed}`, `DPP/min-sys-dpp-mvp` — the last
   confirmed on-disk with a 32,526,336-byte (32 MB) `target_sqlite.db` dated 2026-07-17. Three
   remembered search roots (`~/dotfiles`, `~/Workspace`, `/mnt/g`) would have silently skipped
   it; `/mnt/g` itself holds zero registrations under this probe. `$HOME/.cocoindex_code` is
   the GLOBAL settings/daemon-runtime home, not a project (no `settings.yml`, confirmed by
   `ls` — only `global_settings.yml` + daemon runtime files) — the probe's `settings.yml`
   requirement correctly excludes it. `ccc-swap.ts`'s own `discover` subcommand already
   mechanizes this exact walk. → SKILL.md CC5, operations.md §6c.

5. **A rotted smoke anchor fabricated a regression.** `qoed`'s recorded end-to-end smoke
   (「境界条件の正規化」 → `\section{適用境界}` in
   `papers/P2606_003-sok_randomized_metrology/main.tex`) died silently when commit `7d915ed`
   ("fix: 降格済み文書を意味検索の索引から外し、漏れを gate で止める" — independently confirmed
   via `git show 7d915ed` in `~/Workspace/qoed`: Tue Jul 28 14:56:24 2026 +0900, author
   fuyutarow) added `papers/P2606_003-sok_randomized_metrology/**` to
   `.cocoindex_code/settings.yml`'s generated `exclude_patterns` block (16 demoted directories,
   index 1021→973 files per the commit message) as an authority-gate cleanup unrelated to any
   embedding model. Confirmed live: the file is still on disk but the current index holds zero
   chunks matching that path (`SELECT COUNT(*) FROM code_chunks_vec_auxiliary a JOIN
   code_chunks_vec_rowids r ON r.rowid=a.rowid WHERE a.value00 LIKE 'papers/P2606_003%'` = 0,
   run against qoed's live `target_sqlite.db`). Two days later the missing hit was read as a
   candidate-model regression and triggered a same-day revert. → SKILL.md CC6, operations.md
   §6e.

**Verification method.** All five findings were independently re-derived against the
INSTALLED `cocoindex-code` 0.2.39 (confirmed: `cocoindex_code-0.2.39.dist-info` alongside
`cocoindex-1.0.18.dist-info` under the uv-tool site-packages tree) — none read from the stale
0.1.10 `archive-v0` copy the brief warned about. No claim from the brief failed verification;
none were dropped or softened beyond the "not re-derived" note below.

**Not re-derived.** The exact sequence of daemon calls that produced the "environment already
open" error on the day in question is not reconstructed here. `client.py`'s
restart-on-settings-mismatch logic makes a single-project reset→index cycle unlikely to
reproduce the error on its own (a freshly respawned daemon holds no stale handle for a project
it has never touched); the likelier trigger is a multi-project loop where the daemon was
already warm on some project before the edit, or a race between concurrent `ccc` invocations —
neither was reproduced live this session, and this ledger does not assert which one occurred.
The error STRING, the vec0 DDL, and the `Project.close()` LMDB-close gap are all
source/binary-verified; the day-of trigger sequence and the "three projects" count are
recorded as same-day operational observations from the brief, not re-derived.

**Gate check.** F1 — every new gate/rule row cites a runnable command or a source-file/binary
citation (the SQL query, the `fd` probe, the `strings` match, the DDL read, the git commit).
F2 — no new sibling; CC5/CC6 extend the existing gate table, §6a–§6e extend the existing
swap-procedure owner (`operations.md`), catalog.md stays untouched (concurrent draft, numbers
only). F3 — this entry is the adversarial-provenance artifact; `skill-check.ts` floor
before/after this touch: 22 prose sentences / 1 table cell (WARN, exit 0) — unchanged, net
zero new prose-debt.
