+++
schema = 2
name = "cccplan"
outcome = "a forgotten exclude is caught BEFORE indexing starts, not hours later: `rr index` first computes the exact file set ccc would index (same matcher ccc uses), estimates chunks and GPU time, classifies data-like content, prints the top contributors with ready-to-paste exclude lines, and refuses to start when the plan exceeds the repo's declared budget or when data-like content dominates; while indexing, a measured rate gives an ETA and the run stops with the same top-contributor report when the ETA exceeds the budget"
writes = ["tools/repo-retrieve/**", "tools/*/.changes/*.md"]
verify = ["bun test tools/repo-retrieve", "bunx --bun tsgo --noEmit", "mise run gate:land"]
timeout_s = 3000
premises = ["file:tools/repo-retrieve/src/ccc_scope.py", "file:tools/repo-retrieve/src/ccc-index.ts"]

[proposition]
id = "CCC-PLAN-GATE"
claim = "for a repo whose settings.yml forgot to exclude a bulk data directory, `rr index` refuses before embedding anything and names that directory with an exclude line that, once added, brings the plan under budget"
refuted_by = "a fixture repo with 80% of its chunks in one JSON data directory starts embedding, or the report does not name that directory, or the suggested exclude line does not remove it from the plan"
+++

Owner's problem (2026-10-15): indexing repeatedly runs forever because settings.yml forgot an exclude, and it is
discovered only afterwards. It recurs: firedancer 2026-08-12 (literature API caches were 93,979 of 135,102 chunks,
69.6%) and 2026-10-15 (JSON data 129,587 of 166,738 chunks, 78%). Today's only signal is, after 10 minutes,
"FATAL: ccc index made no observable progress for 600000ms" (tools/repo-retrieve/src/ccc-index.ts:946), which says
nothing about why.
Existing pieces to reuse (do not reimplement ccc's matching): tools/repo-retrieve/src/ccc_scope.py already builds
ccc's own matcher from settings (`build_matcher(root, settings.include_patterns, settings.exclude_patterns)`, line 25);
ccc_defs.py uses the same. ccc semantics (firedancer settings.yml header): root-anchored globset, exclude wins,
directories pruned by exclude alone, .gitignore honored, chunking is extension-agnostic at ~800 chars.
Do:
1. `rr index --plan` (and the first step of every `rr index`): walk with ccc's matcher, output JSONL per file
   {path, bytes, est_chunks, kind} and a summary aggregated by directory (depth-limited) and extension: files, bytes,
   est_chunks, share. est_chunks = ceil(chars / 800) unless ccc's chunker is cheaply callable; say which.
2. kind classification, fail-closed toward "data": by extension (json, jsonl, csv, tsv, parquet, ndjson, log, lock,
   min.js, svg, ipynb outputs), and by content (very long lines, high digit/punctuation ratio, minified). Not by
   name guesses alone.
3. Budget: per-repo `rr` budget in the repo's own config (max est_chunks; max data share, default 20%), with a
   default when absent. Over budget -> exit non-zero before any embedding, printing the top 10 contributors, each
   with a suggested exclude line in the scoped-by-extension style (`'<dir>/**/*.json'`, never the bare directory,
   per the pruning rule above). `--accept-plan` proceeds anyway and records that it did.
4. During indexing: measure chunks/s from ccc's progress; print ETA; stop (client only, daemon left running, as now)
   when ETA exceeds the budget's time bound, with the same report. Keep the existing no-progress guard.
5. Fixture tests: a repo with a bulk JSON dir (refused, named, suggested line fixes it); a code-only repo (passes);
   a negation case proving the suggestion never prunes a directory that holds included text.
Also report, read-only: the plan for /home/fuyu/Workspace/firedancer as it is now (after its 2026-10-15 excludes).
Do not run a real index, restart the daemon, or edit any other repo. Do not commit or push.

## Current state (coordinator, 2026-10-15 13:00)
Run e4cecc81 is accepted in substance (plan gate, data classification, scoped exclude suggestions, ETA guard, 144
tests). One defect blocks land: tools/repo-retrieve/CHANGELOG.md and package.json are edited by hand. Revert both to
alpha and add tools/repo-retrieve/.changes/index-plan-gate.md in exactly this shape:
    ---
    bump: minor
    ---

    <one plain-text entry line>
Change nothing else; re-run the verify commands.
