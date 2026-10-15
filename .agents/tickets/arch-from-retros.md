+++
schema = 2
name = "arch-from-retros"
outcome = "tools/spec/architecture.md is reorganised from the retrospectives (owner request 2026-10-16: 'retrospectives をよく踏まえてシステムアーキテクチャは整理されるべき'), judged by the Unix philosophy (one job per part, one home per value, filters with visible provenance, silence on success and loud failure, composition over new built-ins) and Tiger Style (every decision reaches a check): (1) a component map — each dotfiles part (agx, ws/jj-ws, land, hooks, statusline, capacity + disk-reclaim, presets, skills, herdr integration, router, and the coordinator protocol's tooling) with its one job, its inputs and outputs, and the single home of every value it owns; (2) one data path from owner request to visible effect — request → brief → run → accepted → alpha → deployed → visible — with exactly one owner and one check per stage; (3) every finding from the extraction tables in /home/fuyu/.cache/coord/retro-map/*.tsv assigned to exactly one component and one invariant, merged where they are the same invariant (show the merge), with the check that enforces it (existing file:line, or 'missing' → listed as a ticket); (4) what to delete: duplicated homes, coordinator glue that a component should own (~/.cache/coord/bin/*.ts: serial-land, land-clean, precheck, dispatch-queue, why, export-unlanded, gen-*), dormant rules with no check; (5) a MECE check: a table that shows each finding in exactly one cell, plus the counterexamples found (overlaps and leaks) and how the map resolves them; keep the existing R*/I* identifiers where they still hold and say which are retired"
writes = ["tools/spec/architecture.md", "tools/spec/retro-trace.md"]
verify = ["mise run lint:md"]
timeout_s = 3600
premises = ["file:tools/spec/architecture.md", "file:tools/spec/workspace.md", "file:tools/agx/docs/scope.md"]

[proposition]
id = "ARCH-FROM-RETROS"
claim = "tools/spec/retro-trace.md maps every extracted finding (count stated, equal to the input rows minus stated merges) to one component and one invariant; architecture.md has the component map, the 7-stage path with one owner and one check per stage, a deletion list, and a ticket list for every 'missing' check; no value has two homes in the map"
refuted_by = "a finding without a home, a finding in two homes, a stage with no check, or a value with two homes"
+++

Inputs: the five extraction tables in /home/fuyu/.cache/coord/retro-map/ (one per group of ~20 retrospectives), the retros
themselves in /home/fuyu/Workspace/retrospectives (read when a row is unclear), the current tools/spec/architecture.md,
tools/spec/workspace.md and tools/agx/docs/scope.md. Do not change code; this ticket writes the spec only. If `mise run
lint:md` does not exist, run the repo's markdown formatter check that `mise tasks` lists. Record `mise run hook:pre-commit`
exit code and last line in the checks field of your JSON return. Do not commit or push.
