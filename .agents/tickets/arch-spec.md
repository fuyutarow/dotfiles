+++
schema = 2
name = "arch-spec"
outcome = "tools/spec/architecture.md is the single in-repo home of the tools/ architecture: the dispatch pipeline v3 (components, data flow by names, I1-I17, negative space, releases R1-R7 with their current status) from /home/fuyu/Workspace/retrospectives/2026-10-15-dispatch-architecture.md, PLUS the capacity domain it omitted (measure / guard / admit / recover / report, one owner each, invariants I-R1..I-R9 from 2026-10-15-self-recovery-contradiction-retro.md, and the oracle rule I-N1..I-N5 from 2026-10-15-no-sync-oracle-retro.md); every invariant names the test or doctor check that enforces it, or is marked UNCHECKED with the ticket that will add the check; each tool README links to it"
writes = ["tools/spec/**", "tools/*/README.md", "tools/agx/docs/scope.md", "README.md", "scripts/config-registry.ts", "tools/*/.changes/*.md"]
verify = ["mise run lint:md", "mise run lint:config-map"]
timeout_s = 2400
premises = ["file:tools/agx/docs/scope.md"]

[proposition]
id = "ARCH-SPEC-HOME"
claim = "tools/spec/architecture.md exists, contains every invariant id from the three retros with an enforcement locus or UNCHECKED+ticket, and every tools/*/README.md links to it"
refuted_by = "an invariant id from the retros missing from the spec, or an invariant marked enforced whose named check does not exist at the --cd revision"
+++

Source documents (read them; do not invent): /home/fuyu/Workspace/retrospectives/2026-10-15-dispatch-architecture.md (v1-v3),
2026-10-15-self-recovery-contradiction-retro.md, 2026-10-15-no-sync-oracle-retro.md, 2026-10-15-devx-progress-blockers-retro.md
(section 5 MECE table). Status facts for R1-R7: continue-pin landed (367abb54); run-outcome2, workspace-tool, worker-jj-guard,
jjsafe4 are queued; `.agx.toml`, integrator, admission are not started. Verify each "enforced by" claim by locating the test
(rr text/files) before writing it. Write in English. Another ticket (tools-spec) moves existing tools/*/docs markdown under
tools/spec; do not move files, only add architecture.md and links. Do not commit or push.
