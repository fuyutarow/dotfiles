+++
schema = 2
name = "nosync-rule"
outcome = "`node/no-sync` is an error again for non-test TypeScript in this repo (removed in f1f0a2c4); a genuinely required sync call is exempted at its call site with a stated reason in one recognised form that survives moving the code to another file (never a path-keyed list); the no-disable check still refuses blanket disables; the remaining sites are a lint-generated baseline (count per file) that can only shrink, so a new sync call fails lint and a conversion lowers the baseline"
writes = [".oxlintrc.json", "oxlint-policy.toml", "scripts/lint-*.ts", "scripts/tests/lint-*.test.ts", "scripts/oxlint-*.ts", "scripts/tests/oxlint-*.test.ts", "lint/**", "mise.toml", "tools/*/.changes/*.md"]
verify = ["mise run lint:ts", "bun test scripts/tests"]
timeout_s = 3000
premises = ["file:.oxlintrc.json", "file:mise.toml"]

[proposition]
id = "NOSYNC-ORACLE"
claim = "fixtures: a new fs.readFileSync in a clean non-test file fails `mise run lint:ts`; the same call with the call-site exemption and a reason passes; moving that exempted function to another file still passes; a bare oxlint-disable still fails; converting one baseline site and regenerating lowers the baseline, and the baseline cannot grow without failing"
refuted_by = "a sync call that passes lint without an exemption, an exemption that breaks when its code moves, or a baseline that can grow silently"
+++

Retro: /home/fuyu/Workspace/retrospectives/2026-10-15-no-sync-oracle-retro.md (I-N1..I-N4, section 7 synthesis).
Why it was removed (keep these goals): f1f0a2c4's message — path-keyed exemptions punished behaviour-preserving
moves, refused durable fsync writes and the agx.ts split. Restore the rule without those failures.
Facts: the pre-removal definition is in a550ad7a's `.oxlintrc.json` (`node/no-sync` with allowAtRootLevel:true;
`**/tests/**` and `**/*.test.ts` off). With it, the repo currently has ~1,228 sites in ~162 files (facts-nosync run
65ddc33d). Many no-sync units are landing in parallel: generate the baseline at the end of your run from the
working copy, and make regeneration one declared task so land can refresh it. Prefer oxlint's own options over a
custom plugin (leverage); a tiny wrapper or comment form is fine for the exemption. Test data outside the workspace.
Do not commit or push.

## Current state (coordinator, 01:4x — single current version)
Your change was accepted; land's commit gate ran your new `lint:no-sync` and it failed: since your baseline was generated, alpha gained new code (e.g. workspace-tool 56e774ee, run-outcome2 60b5de8e, nosync units). The baseline must describe alpha at the moment the rule lands. Rebase onto alpha, regenerate the baseline on that tree with your declared task, check that `mise run lint:no-sync` passes on it and still fails on a fixture with one new sync call, then `mise run lint:ts` and `mise run lint:bun`.
Ignore config-map findings on zero-byte sandbox placeholder files. Test data outside the workspace. Do not commit or push.
