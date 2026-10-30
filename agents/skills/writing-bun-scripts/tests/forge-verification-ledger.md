# Forge verification ledger — writing-bun-scripts F3 artifact (2026-07-23)

**PROSE-DEBT waiver (dated 2026-09-18).** The F4 description shortening and the new
`designing-command-line-interfaces` cut add no body prose debt. Existing measured debt remains
pre-existing: 12 sentences over 120 characters, an 11-line version header, 4 table cells over 400
characters, and 34 reference warnings in `bun-facts.md`. Queue position: **1 — next
writing-bun-scripts full reforge after the F4 listing swap**. This waiver expires when that reforge
starts; do not use a description-only change to declare the body debt resolved.

## 2026-09-10 — reciprocal configuration seam / PROSE-DEBT waiver

One typed routing row distinguishes Bun implementation from configuration-contract selection.
Existing prose/version/table debt remains pre-existing. Queue: next writing-bun-scripts reforge.

Adversarial-verification findings ledger demanded by gate F3 (`forging-skills`). Append on
reforge, never overwrite. The fire/no-fire trigger set lives in SKILL.md (MUST-NOT-FIRE
section) and is desk-checked after every description edit.

## Mission context (calibration)

Ordered 2026-07-23 by the user, mid-forge, verbatim intent: the 2026-07 bash→TS migration
corpus is 拙い (crude) and will be WHOLLY refactored; this skill is forged FIRST to be the
normative oracle for that refactor. Consequence: the corpus is graded KEEP/REFACTOR (SKILL.md
Refactor map), never treated as house law. The user named Bun.$'s zero usage in the corpus as
an example of the crudeness ("当然利用しろよって話でしょ").

## Harvest fleet (AUDIT phase)

3 read-only sonnet agents, 2026-07-23 (≈278k subagent tokens, 124 tool calls, 0 errors):

1. **House corpus inventory** — 18 skill scripts + driving-claude tests + 4 hooks + lib.ts ×2
   + mise.toml; every claim with file:line receipts. Key: no root package.json/bunfig/tsconfig;
   `bun <path>` invocation, shebang only on binary-substituted fixtures; parseArgs strict vs
   Bun.argv split; envelope vs verdict-line families; exit 0/1/2 + FATAL exit 2; Bun.spawn +
   hand-rolled setTimeout/kill ×4; zero npm imports; bunx for external CLIs; fixture-binary
   tests; hooks stated rule "node:-APIs only, zero npm deps" (hooks/lib.ts:1-4); Bun.$ zero
   hits corpus-wide.
2. **Official docs verification** — every load-bearing Bun claim graded
   CONFIRMED/NUANCED/REFUTED with bun.com URLs; landed in references/bun-facts.md (auto-install
   cwd rule + inline pins, Bun.$ semantics, native spawn timeout/killSignal/signal, test
   discovery, --compile targets, no native .bun-version/packageManager, bun 1.3.14 stable).
3. **Pitfall survey** — GH-issue-grounded failure modes; landed in bun-facts.md (§2 sharp
   edges, §4 cwd trap incl. magarcia Claude-skills postmortem, §5 bunx staleness #6375,
   §9 .env cwd-relative, §12 long-running leaks).

Follow-up solo fetches (same day): bun.com/docs/api/spawn + /docs/runtime/shell — confirmed
native `timeout:`/`killSignal:`/`signal:` on Bun.spawn and NO timeout on Bun.$; these two facts
license the Refactor map's setTimeout+kill verdict and the $-vs-spawn split.

## Corpus drift baseline — receipts (harvest 1, spot-re-verified by the editor)

| # | Drift | Receipt | Skill's disposition |
|---|---|---|---|
| 1 | exit-style split `process.exitCode` vs `process.exit` | claim-check.ts:242,250 / research-check.ts:261,269 vs gate-check.ts:120,127 + skill-check.ts:143,150 + mise-contract.ts:238,245 | RULE row: boundary-only, either form |
| 2 | auth-probe error envelopes exit 0 | turnstile-spin/auth-probe.ts:37-90 (`output(...); return;`, no exit) vs every sibling's `process.exit(1)` | REFACTOR row (bug); fix belongs to the corpus refactor, not this commit |
| 3 | run()/timeout helper duplicated ×3, never shared | driving-{codex,antigravity,grok}/scripts/probe-models.ts:9-38 | RULE row: shrink via native timeout; never import across skill dirs |
| 4 | turnstile lib command() has no timeout/kill | turnstile-spin/scripts/lib.ts:72-93 | BG2 + Refactor row ($ or timeout:) |
| 5 | envelope vs verdict-lines split | turnstile lib.ts:27-33 + run-claude.ts:147-169 vs probe/gate families | KEEP as the two declared consumer contracts (BG1) |
| 6 | hooks avoid Bun natives wholesale | hooks/lib.ts:1-4 stated rule | KEEP sync+zero-dep as load-bearing; Bun globals ruled equally legal |
| 7 | CI gap: fmt:ts excludes agents/skills/**; skill tests unreachable from `mise run test` | mise.toml:56-71 (fd -E agents/skills), mise.toml:128-136 | recorded; owner `wiring-mise-tasks`, DEFERRED |
| 8 | writing-typescript's zod/ts-pattern rows vs zero-dep corpus, no stated override outside hooks | corpus grep: no zod/ts-pattern anywhere | SEAM RULING in Routing (canonical here) + reciprocal line landed in writing-typescript |
| 9 | unpinned bunx (textlint, wrangler) | lint-floor.ts:19, turnstile scripts ×5 | REFACTOR row; floor W7 |

## Proof-of-fire — scripts/script-check.ts (build day, 2026-07-23)

- Known-bad fixture (node shebang, bare import, pinned import, require, execSync, spawn
  without timeout): **FAIL=4 WARN=2, exit 1** — every detector observed red.
- Self-scan: initially 3 false positives (detector token sequences inside its own FAIL
  messages); messages reworded (self-scan guard comment added) → **FAIL=0 WARN=0, exit 0**.
- Corpus spot-run: driving-codex/probe-models.ts → W6 hand-rolled timeout (intended);
  linting-prose/lint-floor.ts → W5 spawn-unbounded + W7 unpinned bunx (both true findings,
  match Refactor map rows 4/9); forging-skills/skill-check.ts → clean.
- `forging-skills/scripts/skill-check.ts` over the skill dir: clean after description trimmed
  1646 → ≤1500 chars; strict-YAML parse OK (keys: name, description).

## Provenance — this skill's own claims

| Content class | Grade | Notes |
|---|---|---|
| Bun API semantics (auto-install, $, spawn timeout, test, --compile, env) | official-docs, dated 2026-07-23 | URLs in bun-facts.md; re-verify when `bun --version` moves |
| Sharp edges / staleness / leaks / WSL quirks | gh-issue + named third-party | issue numbers in bun-facts.md; several are OPEN issues — re-check on reforge |
| Corpus conventions & drift | corpus-observed 2026-07-23 | file:line receipts above and in harvest 1 |
| KEEP/REFACTOR verdicts, BG gates, dependency ladder, shim classes, RULE rows | skill-supplied (constructed) | this skill's operationalization under the user's normative directive; engineered, not measured |
| CWD-HOSTILE law | official-docs mechanism + third-party postmortem | the one law grounded in BOTH docs (§4 resolution rule) and an observed production failure (magarcia) |

## Deferred (owner named)

| Item | Owner / when |
|---|---|
| Corpus refactor itself (incl. auth-probe exit-0 bug; hooks' unnecessary shebangs flagged by floor W8) | next session's standing work order; Refactor map is the spec |
| fmt:ts / test coverage gap for agents/skills/** | `wiring-mise-tasks` next touch |
| Reciprocal pointers in wiring-mise-tasks / forging-skills / operating-the-harness / driving-* / writing-python | their next reforge — those working-tree files are dirty with another session's in-flight migration (refactoring-code was clean → its co-fire list edit LANDED 2026-07-23); cut is named from this side |
| operating-the-harness hooks reference carries generic bash/npx recipe examples that contradict NO-NEW-BASH for house hooks | clarifying clause added to this skill's routing row; a reciprocal "house hook bodies → writing-bun-scripts" note lands on its next reforge |

README.md index rows (this skill + two pre-existing omissions acting-as-director /
optimizing-julia-gpu-kernels) LANDED same-day; `mise run lint:skills-index` green.

## Verification fleet (VERIFY phase) — findings

Fleet: 2 read-only sonnet lenses (A: sibling-cut fidelity vs the live collection text +
trigger desk-check from the stage-1 view + invented near-misses; B: self-contradiction +
one-home + fact spot-check vs live sources + floor-script attack with executed evasion
fixtures), per `forging-skills` references/verifying.md §2. 28 findings
(A: 1 BLOCKER · 5 MAJOR · 10 MINOR; B: 4 BLOCKER · 3 MAJOR · 5 MINOR); every fix applied solo
by the editor and re-proven red→green via the new bun-test suite.

| Severity | Lens | Finding | Resolution |
|---|---|---|---|
| BLOCKER | B one-home | body said "forged against bun 1.3.14" while its own Durability clause bans version numbers from the body | version number removed; runtime snapshot lives only in bun-facts.md |
| BLOCKER | B floor-attack | W5 scope was file-wide: one bounded spawn (or an unrelated `boundedRegion` token) silenced the warning for a hangable spawn elsewhere — evasion reproduced | per-call windows capped at the next spawn call; bounded note must be `// bounded: <reason>` (colon + text) beside the call; regression tests added |
| BLOCKER | B floor-attack | backtick dynamic import (`` import(`left-pad`) ``) evaded F3 entirely | backtick literals classified; computed specifiers WARN for hand review; tests added |
| BLOCKER | B self-application | the skill mandates tested floors (BG4) but shipped its floor without a bun test | tests/script-check.test.ts added — 9 cases incl. every fleet evasion, 9/9 green |
| BLOCKER | A cut-fidelity | operating-the-harness's hooks reference ships generic bash/npx recipes, contradicting NO-NEW-BASH with no reconciliation | routing row now names the recipes as upstream-doc illustrations, not house style; reciprocal deferred with owner |
| MAJOR | B fact-error | bun-facts cited #6375 as "closed not-planned = accepted behavior"; live check: closed as DUPLICATE, partial fix v1.0.29, tracking issue #4989 OPEN/reopened | §5 provenance corrected; the pin-always rule unchanged |
| MAJOR | B floor-attack | multi-line `/* */` interiors were scanned as live code → false-positive FAILs | codeLines() block-comment state machine; regression test |
| MAJOR | A cut-fidelity | "JS-side home its description already points at" overstated running-python-tools' pointer (body prose, not description) | routing row reworded to cite the body line + landed reciprocal |
| MAJOR | A trigger | 「bun で CLI 作って npm に publish」 would misfire — no scope suppression for product/package work | MUST-NOT-FIRE row added |
| MAJOR ×3 | A cut-fidelity | forging-skills / driving-* / wiring-mise-tasks carry no reciprocal rows | F2 deferral path: owners named above; their trees are another session's in-flight work |
| MINOR ×2 | B | WARN-vs-exit-code contract ambiguity; `bun run` name-collision nuance unrecorded | BG1 row now says WARNs don't gate; nuance added to bun-facts §11 |
| MINOR | B coverage | floor accepted any non-node shebang while BG1 restricts shebangs to fixtures | W8 added: any other shebang WARNs; hooks corpus now (correctly) flags — refactor input |
| MINOR ×2 | A trigger | refactor asks co-fire refactoring-code; --json-flag co-fire vs implementing-and-debugging's one-line exclusion | co-fire is the intended outcome; FIRES rows softened ("when non-trivial", context marker); refactoring-code's clean co-fire list gained this skill |
| MINOR ×2 | A near-miss | Express-server refactor / wrangler-deploy-script races | no-fire row (app/server) added; Worker row gained the deploy-SCRIPT co-fire clause |
| no_change | B bloat | lineage/immunization sentence flagged | KEPT — mandated header formula (forging-skills execution-models components f+g) |
| no_change | A | codex token in description inflates recall on codex asks | KEPT — cuts-in-description is the house pattern; MUST-NOT-FIRE row covers it |

Post-fix re-verification: `bun test` 9/9 · floor self-scan FAIL=0 WARN=0 · corpus spot-run
reproduces exactly the Refactor-map signals (probe-models W5+W6, lint-floor W5+W7, hooks W8) ·
`skill-check.ts` clean · strict-YAML parse OK.

## Refactor map — EXECUTED 2026-07-23 (the standing work order was run same-day)

Commits: baseline cdc5407 (migration frozen) → hat 1 6d50530 (behavior-preserving) → hat 2
(behavior: auth-probe exits, timeouts, bunx pins). Orchestration: 19-agent sonnet Workflow
(Characterize → Refactor → Verify ×6 families + no-churn Sweep; ~1.26M subagent tokens), then
solo editor fixes. G5 inventory: 21 files, extension-blind (caught 2 .py — both KEEP: coinage
needs sudachipy via uvx; codemix keeps pair coherence, G3 deny-gate unfillable).

| Outcome | Detail |
|---|---|
| Every REFACTOR row landed | 8 files, −41/+28 (hat 1): native AbortSignal.timeout ×4, lib command() → Bun.$ (escape/quiet/cwd/stdin parity proven by 5 independent probes), Bun.file in skill-check, bounded notes ×2 |
| Oracle installed FIRST (G2) | 92 new characterization tests before any edit + 4 pre-existing (assertions untouched, G1); suites total 105 green |
| Fleet caught a real preservation bug | agy/grok workers used `signalCode !== null` (any signal death reads as timeout); verifier refuted empirically; editor re-aligned both to AbortSignal.timeout |
| Floor caught its own gap twice | shorthand `signal,` not recognized as W5 evidence (fixed + test); W5 window truncation at next-spawn boundary (fixed + test) |
| Behavior hat (2nd commit) | auth-probe: 8 error paths now exit 1 (+ pinning test); auth-probe/mise-contract spawns gained timeouts; pins landed: wrangler@4.113.0 ×3, degit@3.6.1 ×2 |
| textlint pin REVERTED — discovery | pin-breaks-plugins corollary (bun-facts §5): rules resolve from the bun GLOBAL install; pinned bunx switches to an isolated dir → "No rules found"; characterization test caught the hat-2 change. DEFERRED with owner: linting-prose floor graduation (package.json pinning textlint+rules) |
| Completion criterion (G5, narrowed openly) | floor FAIL=0 WARN=0 EXCEPT lint-floor W7 ×1 (the declared graduation deferral); zero .sh under scripts/; every inventory file carries REFACTORED / KEEP / declared-exception |

## Reforge 2026-07-28 — subprocess detection facts (field-driven)

Trigger: a house script (`consumer repository/scripts/check_p1_oracle.ts`, a mise `test:banded` body moved out
of TOML under wiring-mise-tasks' BODY-IS-DECLARATION) was written against BG2 from memory rather
than from facts §3. Two defects shipped and were caught by running it, not by review.

| Defect | Symptom in the field | Was the skill at fault? | Landed |
|---|---|---|---|
| stdout drained to completion, THEN stderr | a 120s child never returned; the 600s `timeout:` fired and read as "the child is slow" | NO — facts §3 already carried the `Promise.all` drain pattern. The author did not read it. But the rule lived ONLY in the reference while BG2 named only "bound relayed output" | drain rule promoted into the BG2 row; floor **W10** (drains both pipes + no `Promise.all`) |
| branched on `proc.killed` to detect the timeout | every run, including a clean exit-0 run that had already produced correct output, reported "killed at 600s" | YES — facts §3 enumerated `killed` in a bare API list with no semantics; the name invites exactly this | measured table added to facts §3; floor **W9** |

Measured on bun 1.3.14 `[dated:2026-07]`, three spawns, one command each: clean exit →
`exited=0 killed=true signalCode=null`; `AbortSignal.timeout` fired → `exited=137 killed=true
signalCode=SIGKILL sig.aborted=true reason=TimeoutError`; external `kill("SIGTERM")` →
`exited=143 signalCode=SIGTERM`. Also probed: `typeof ($\`echo x\`).timeout === "undefined"` —
`Bun.$` cannot bound a hangable child at all, so the decision table's "can hang → spawn" row is
a capability boundary, not a style preference. That line is now in facts §3.

**Near-miss worth recording.** The first draft of this reforge asserted `signalCode !== null` as
THE timeout detector — which would have silently overridden the 2026-07-23 VERIFY row where the
fleet refuted exactly that ("any signal death reads as timeout") and re-aligned the corpus to
`AbortSignal.timeout`. The ledger caught it: reading the prior ruling before editing is what kept
the two from contradicting. The probe's third row (external SIGTERM, `aborted=false`) is the
empirical form of that refutation and is now recorded so the next author does not re-litigate it.

Proof-of-fire (F3): a bad fixture (sequential drain + `.killed` branch) raises W9+W10; the good
fixture and the fixed real script raise neither; the floor's own source raises neither after the
`KILLED` self-scan guard (same split-token pattern as `BUNX` — the first cut of W9 tripped the
floor on itself and turned the suite red, 9 pass/1 fail, which is how the gap was found).
Post-fix: `bun test` 10 pass / 0 fail.

Not fixed here (pre-existing, unchanged by this reforge): skill-check reports 10 prose sentences
>120 chars, an 11-line version header, and 4 table cells >400 chars.

## 2026-07-28 — BG1/BG3 re-cut: parseArgs → type-flag, and the graduation that makes it legal

**Trigger.** Owner directive: migrate the repo's bun scripts to `type-flag` wholesale. An initial
recommendation against it was overruled and the migration executed as asked.

**What the corpus KEEP row got wrong.** "zero npm imports … it is CWD-HOSTILE physics, not taste"
was right about the physics and wrong about the remedy. Measured 2026-07-28 (bun 1.3.14):

| Probe | Result |
|---|---|
| inline pinned `import … from "type-flag@4.5.0"`, no ancestor `node_modules` | resolves |
| same, with an ancestor `node_modules` present | **`error: Cannot find package`, exit 1** — and it fails on the SCRIPT's location, not cwd (reproduced from `/` with an absolute path) |
| bare `import … from "type-flag"` under a repo-root package.json + bun.lock | resolves |
| same, invoked through the `~/.claude/skills/<skill>` SYMLINK, from an unrelated cwd | **resolves** — Bun follows the link to the realpath, so the repo-root `node_modules` serves linked skills |
| warm startup, 5 runs, parseArgs vs type-flag | 0.150 s vs 0.139 s — no material difference |
| registry metadata | type-flag 4.5.0, MIT, `dependencies: {}`, unpackedSize 45,419 B (the widely-quoted "1.4 kB" is a minified bundle figure, not the install footprint) |

So abstinence was never the only answer; **graduation** was. Repo root now carries
`package.json` + `bun.lock` pinning `type-flag` at an exact `4.5.0`, `node_modules/` is gitignored,
and `mise run deps` (`bun install --frozen-lockfile`) restores it — wired into `mac:init` and
`wsl:init`.

**Three semantic gaps type-flag opens, all measured, all now floor-enforced.** It is NOT a drop-in
for `parseArgs({strict: true})`:

| Gap | Measured behaviour | Floor check added |
|---|---|---|
| unknown flags | collected into `unknownFlags`, process exits 0, and the flag's VALUE leaks into positionals | **F5** — FAIL any `typeFlag(` in a file that never mentions `unknownFlags` |
| malformed `type: Number` | yields `null`/`NaN` silently, never throws | **W11** — WARN a `type: Number` with no null/finite check |
| camelCase schema keys | a `dryRun` key ALSO registers `--dryRun` as valid, widening the CLI contract; declaring the key in kebab removes the alias entirely | **F6** — FAIL a camelCase schema key, naming the kebab spelling to use |

F6 is the one that matters most and was nearly missed: the migration fleet reported it as an
unavoidable divergence and one agent hand-rolled a per-file reject-list. The root fix — spell the
schema key exactly as the CLI flag — deleted that workaround and closed the class in all five files.

**Scope: 5 of 10 parseArgs files migrated.** Excluded, for the same measured reason in two forms:

- `agents/claude/hooks/*` — run on every harness event, before any `mise run deps` on a given machine.
- `agents/skills/turnstile-spin/*` — `persist-skill.ts` degit-copies the skill into *other people's*
  repositories, where no lockfile exists. Also an upstream Cloudflare mirror.

Mechanised: `hooks/` and `templates/` are path-detected, and any tree may opt out with a
`.zero-dep` marker file (dropped in `turnstile-spin/`). A bare import in such a tree FAILs even
under a graduation project — "does this get distributed?" is not inferable from a path.

**Verification.** Corpus floor A/B over all 77 `.ts`: **FAIL=10 WARN=31 before and after**, byte-identical
— the new checks add no false positives and the migration adds no regressions (the 10 pre-existing FAILs are
turnstile-spin's `templates/` and this floor's own test-fixture string literals). Full suite: **192 pass,
1 skip, 0 fail** across 12 files. Each new check proved to fire red on injected input before being trusted
(F5, W11, F6, the hook rule, the `.zero-dep` rule). CLI contract A/B per script: every kebab spelling
behaves as before, every camelCase spelling now exits non-zero with that script's own pre-existing
error convention.

**Known divergence, disclosed not hidden.** Where an invocation contains BOTH an unknown flag and a
stray positional, the ported scripts report the unknown flag first; `parseArgs` reported whichever
came first in argv order. Both exit non-zero either way. Closing it exactly would mean re-implementing
argv-order tracking on top of type-flag's parser.

**PROSE-DEBT waiver (dated 2026-07-28).** This SKILL.md is left at WARN 10 long sentences / 11-line
version header / 4 long table cells. Measured A/B against `HEAD`: the counts are **identical before and
after** this edit — the debt is pre-existing, this change added none. Clearing it is a full reforge of
the body, queued behind the corpus REFACTOR work order rather than smuggled into a LAW change.

## 2026-07-30 — BG0 fourth shim class (`vendored`) + the marker nobody carried

**Trigger.** Owner audit of BG0's "three shim classes" wording: is the `# shim: <class>` marker on
`.sh` files load-bearing, or decorative? Three defects measured before any fix was made.

**Defect 1 — 0-of-13 markers.** `repo-search files --glob '*.sh' --path . --hidden` over the whole
repo (rg route, respects `.gitignore` so `node_modules` is excluded): **13** `.sh` files —
`scripts/{check-tools,link-dots}.sh`, `agents/claude/hooks/{run,herdr-agent-state}.sh`,
`lazygit/ai-commit.sh`, and 8 `tmux/scripts/*.sh`. `repo-search literal --query '# shim:' --glob
'*.sh' --path .`: **0 matches** (exit 1, NO_MATCH). The marker BG0's Artifact column named as the
checkable evidence was carried by nothing, and grepped by nothing — a decorative artifact.

**Defect 2 — `run.sh`'s false claim.** `agents/claude/hooks/run.sh:2` read "the ONLY shell left in
the hook chain." `agents/claude/settings.json`'s `SessionStart` hook is `sh
~/.claude/hooks/herdr-agent-state.sh session` — invoked directly, bypassing `run.sh` entirely. The
claim was false; the comment now names the exception instead of asserting uniqueness.

**Defect 3 — the taxonomy had no slot for shell we didn't write.**
`agents/claude/hooks/herdr-agent-state.sh` header: "installed by herdr / managed by herdr;
reinstalling or updating the integration overwrites this file." ~100 lines of real dispatch logic
(a `case` statement + an embedded `python3` heredoc) — not bootstrap, not hook-entry, not a
≤10-line exec-wrapper, and a written marker would be destroyed on herdr's next reinstall. Added a
fourth class, **`vendored`**, marker-**EXEMPT**: the floor detects it from the file's OWN CONTENT
(a "managed by / installed by / generated by / do not edit" header regex), never a path allowlist —
per the owner's instruction, this is what makes the exemption honest instead of a loophole.

**Marking the corpus surfaced a fourth, bigger finding.** Of the 13 `.sh` files, only 2 are genuine
thin shims: `agents/claude/hooks/run.sh` (`hook-entry`) and `scripts/link-dots.sh` (`bootstrap`,
per the standing rule). `herdr-agent-state.sh` is the one `vendored` exemption (untouched, per
instruction). The other **10** — 8 `tmux/scripts/*.sh` (40–155 lines each: `tmux-window-name.sh`'s
multi-language project-detection cascade, 4 pane-layout scripts, a status-bar system monitor, a
truecolor preset dumper, a step debugger) plus `scripts/check-tools.sh` (39-line loop over a tool
array) and `lazygit/ai-commit.sh` (65-line, `claude`-invoking, self-labeled "TEMPORARY DEBUG
BUILD") — do **not** fit any of the four classes. Every one has the exact shape BG0's own LAW names
as the signal a `.sh` "should have been `.ts`" (conditionals, loops, functions). They predate this
change and sit outside the current migration corpus (this SKILL.md's Version note scopes the corpus
to "18 skill scripts + 4 hooks"). Forcing a marker onto them would misrepresent real, undeclared
bash debt as a compliant shim. **Left unmarked, deliberately** — the extended floor (F7) now
correctly FAILs all 10, which is their true state, not something to paper over. Recorded here as new
REFACTOR-candidate debt; owner unassigned, not fixed in this change.

**F7 added to `scripts/script-check.ts`.** A `.sh` path now skips every TS check and runs only the
BG0 shim-marker check: FAIL with no `# shim: <bootstrap|hook-entry|exec-wrapper|vendored>` line and
no vendor-header signal; FAIL naming the value if the declared class isn't one of the four; WARN
(not FAIL — vendored is an exemption) when no marker is present but a vendor-header phrase is
detected; PASS when a valid class is declared. Usage string and header comment updated to
`<file.ts|file.sh ...>`. Still zero-dependency (`node:fs` + `node:path` + Bun globals only).

**Proof-of-fire — same-file red→green (`run.sh`, git `HEAD` vs working tree):**

```
$ bun agents/skills/writing-bun-scripts/scripts/script-check.ts <HEAD copy of run.sh, no marker>
FAIL …/run.sh: no `# shim: <bootstrap|hook-entry|exec-wrapper|vendored>` marker (BG0) — a surviving
.sh needs a declared shim class, or a vendor header if the exemption applies
floor: FAIL=1 WARN=0 (files=1) — structure only; BG1-BG4 judgment is not covered
exit=1

$ bun agents/skills/writing-bun-scripts/scripts/script-check.ts agents/claude/hooks/run.sh
floor: FAIL=0 WARN=0 (files=1) — structure only; BG1-BG4 judgment is not covered
exit=0
```

Cross-file confirmation, same run: `scripts/check-tools.sh` (deliberately unmarked, see above) →
FAIL=1; `scripts/link-dots.sh` and `agents/claude/hooks/run.sh` (both now marked) → FAIL=0 WARN=0;
`agents/claude/hooks/herdr-agent-state.sh` (vendored, content-detected, file untouched) → FAIL=0
WARN=1 ("vendored exemption"). Self-scan near-miss: the first draft's `checkShellFile` called
`SHIM_LINE.exec(source)`, and the literal token `exec(` combined with an unrelated pre-existing
`child_process` string elsewhere in the file false-positived the floor's own F4 check on itself
(`FAIL=1`) — switched to `source.match(SHIM_LINE)` (same self-scan-guard pattern as the file's
existing `BUNX`/`KILLED` token splits); self-scan back to `FAIL=0 WARN=0`.
`tests/script-check.test.ts` gained 6 F7 cases (red / green / bad-class-name / vendored-WARN /
content-not-path exemption / TS-checks-skipped-on-.sh); `bun test`: **16 pass / 0 fail** (was 10/10
before this reforge).

**PROSE-DEBT A/B.** BG0's Rule/Artifact cells are table-row text, excluded from the prose-sentence
scan entirely (`skill-check.ts` skips any line starting with `|`) — so the `vendored` addition could
only ever move the *table-cell* WARN, not the sentence WARN. First draft pushed one BG0 fragment
(split on its own escaped `\|`s) to 408 chars, tripping a 5th long-table-cell WARN; trimmed the
`vendored` clause and re-measured. `bun skill-check.ts` before vs. after, byte-identical: **10 prose
sentences >120 chars, 11-line version header, 4 table cells >400 chars** — net-zero, not merely
"aimed for."

## 2026-07-30 — exceptionless type-flag boundary; Cleye experiment denied

**Trigger.** Owner required every Bun argv boundary to use type-flag and asked whether Cleye was
actually the better choice. The answer was tested in the real `repo-search` command rather than
selected from README feature lists.

**Selection result.** Cleye remains a good small CLI framework in general, but it does not fit this
corpus' explicit exit 0/1/2 boundary. Its automatic help exits 0 before application-level
unknown/excess/cardinality guards; `strictFlags` and required `parameters` hard-exit 1; disabling
those conveniences leaves routing/help metadata split across manual code. The working Cleye port
therefore added framework surface without preserving the contract. It was removed. The house
boundary is now one type-flag parse for both single- and multi-command scripts; commands route from
`parsed._[0]`, and help renders only after the same guards as execution.

**The adversarial finding that changed the rule.** type-flag 4.5.0 stores unknown flags in an
ordinary object. With only the previously required
`Object.keys(parsed.unknownFlags).length > 0` check, `--__proto__` invokes the prototype setter and
creates no own key. Direct red probe:

```text
bun scripts/script-check.ts --__proto__ scripts/script-check.ts
floor: FAIL=0 WARN=0 ...
exit=0
```

The fix is pre-assignment rejection through the documented callback:
`typeFlag(schema, argv, { ignore: rejectUnknownFlag })`, where `rejectUnknownFlag` throws on
`"unknown-flag"`. The post-parse `unknownFlags` check remains as an invariant. Forwarding wrappers
carry `// argv-forwarding: <downstream>` and return true from `ignore` instead; a fixture proves
`--__proto__` reaches textlint byte-for-byte without mutating the table.

**Second parser edge.** A raw `String` parser accepts a present option with no value as `""`.
Every string-valued flag now uses a throwing non-empty parser. `script-check.ts` gained:

- F5: require an early `ignore: rejectUnknownFlag` per strict typeFlag call;
- F8: reject parseArgs, Cleye, a raw argv read with no typeFlag call, and extra argv reads;
- F13: reject schema-shaped raw `String` / `[String]`;
- one explicit forwarding-marker path that still requires an `ignore` callback and
  `unknownFlags` invariant.

**Red → green receipts.**

- harness self-bypass above now prints `FATAL: unknown option '--__proto__'`, exit 2;
- floor fixtures: 27 pass / 0 fail, including Cleye denial, raw String, second argv read, and
  forwarding;
- `repo-search`: 39 tests plus 18 direct contract cases pass; unknown/prototype/camel/excess/
  missing/cardinality/help cases all preserve exit 2;
- Turnstile: 24 tests pass; all five entrypoints reject `--__proto__` and known string flags with
  missing values on stderr only, exit 2, before network/filesystem/subprocess work;
- tracked production inventory: 24 typeFlag callers (23 strict + one forwarding wrapper), floor
  FAIL=0; independent fleet reports strict `--__proto__` 23/23 at exit 2;
- `mise run lint:bun`: FAIL=0, WARN=14 (declared pre-existing warnings only);
- production imports from Cleye: zero; package.json/bun.lock mention Cleye: zero.

The untracked `scripts/ccc-swap.ts` and its untracked tests are explicitly outside this tracked
corpus and were not overwritten.

## 2026-08-02 — owner-authorized Cleye-first contract redesign supersedes the denial

**Decision.** The 2026-07-30 record remains historical evidence of the then-required
type-flag-only exit contract; it is not deleted or rewritten. The owner has now authorized a
different contract: ordinary Bun CLI boundaries are Cleye `cli` at exact `cleye@2.6.0`, with
framework help and positional schemas first-class. The old conclusion is therefore superseded,
not falsified.

**Security boundary.** Cleye 2.6.0 delegates parsing to type-flag before its `strictFlags` check.
Every ordinary `cli` and `command` must declare `ignoreArgv: rejectPrototypeFlag`; that local
guard throws for unknown `__proto__` before the ordinary unknown-flags object can receive the
prototype setter. `constructor` and `prototype` are not added to that guard because they create
ordinary own keys rather than invoking the special setter; `strictFlags: true` rejects them by
the normal unknown-flag path. Commands inherit strictFlags but not ignoreArgv, so the floor counts
both declarations per boundary.

**Positional and forwarding contract.** Every Cleye boundary names `parameters:` including `[]`.
Spread parameters make excess deliberate; non-spread schemas visibly reject `parsed._.length`.
The sole direct type-flag exception remains the pre-existing exact marker
`// argv-forwarding: textlint` (general form: `// argv-forwarding: <consumer>`). It parses a copy
and relays the original argv, preserving order and `--`; the floor requires the marker, a real
type-flag call, and its `unknownFlags` invariant, while review owns confirmation of the relay's
behavioral semantics.

**Red → green receipts.** `bun test agents/skills/writing-bun-scripts/tests/script-check.test.ts`
passed 39 tests: Cleye acceptance/default, raw and unguarded parser rejection, unmarked
type-flag rejection, the marked forwarding exception, strict/prototype and command guards,
parameters/excess intent, positional mapping, and parser names inside comments/strings/templates.
Exact Cleye bindings are import-owned: unrelated local/imported `cli` helpers do not count as
boundaries or license raw argv, while aliased Cleye boundary imports fail explicitly.
The floor's own CLI is now Cleye with `<file...>` and its self-scan passed.
`bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/writing-bun-scripts`
exited clean with the pre-existing prose-debt warnings: 12 sentences over 120 characters, an
11-line version header, and 4 table cells over 400 characters. This contract redesign did not
claim those warnings were eliminated.

## 2026-08-02 — closeout audit: interpolation bypass closed and corpus exits pinned

**P1 found by independent audit.** The first Cleye-first scanner blanked an entire template
literal, including executable `${...}` bodies. Three red fixtures — a raw `Bun.argv` read, an
unguarded `cli()` call, and an unmarked `typeFlag()` call — each returned `FAIL=0 WARN=0` when
placed inside an interpolation. The scanner now blanks only template text, recursively scans
interpolation bodies, balances nested braces, and handles nested templates, strings, comments,
and regular expressions inside the expression. A benign parser-shaped string inside `${...}`
remains a near-miss PASS. The same lexer now keeps the bunx floor from treating a detector regex
as a real subprocess call. `script-check.test.ts`: **41 pass / 0 fail / 98 assertions**;
self-scan: `FAIL=0 WARN=0`.

**Exit contract reconciled.** The owner-authorized Cleye redesign intentionally supersedes the
old code-only distinction between usage and findings. Cleye-owned help exits 0; ordinary unknown
flags and missing required parameters use Cleye's stderr + exit 1; the local pre-assignment
`--__proto__` guard and caught fatal paths exit 2. Once parsing succeeds, domain verdict tools
retain 0 clean / 1 findings / 2 FATAL. The Skill now states that distinction instead of retaining
the contradictory earlier prose.

**Corpus fixture.** `cleye-corpus.test.ts` requires its declared inventory to equal every
production `from "cleye"` import, then pins help, ordinary unknown, and named `__proto__`
rejection for all 30 entrypoints, including command-local guards in `repo-search literal` and
`ccc-swap discover`: **31 pass / 0 fail / 181 assertions**. Combined with the floor suite:
**72 pass / 0 fail / 279 assertions**.

## 2026-09-13 — PATH commands are package `bin` entries; floor F14

**Finding.** Three scripts (`agent-resource-run`, `serena-foreground`, `repo-search`) carried
`#!/usr/bin/env bun` and tripped W8 on every `mise run lint:bun`, with no declared way to say why:
link-dots.sh hand-symlinked each `.ts` into `~/.local/bin`, re-implementing npm/bun's `bin`
mechanism without the declaration that makes a shebang legitimate. The floor had no exemption
and the brief forbade inventing a comment marker for it — correctly: the declaration already has
a home, `package.json`.

**Change.** `package.json` `bin` entries now name the three; `mise run deps` runs `bun link`,
which symlinks them into `~/.bun/bin` (measured on bun 1.3.14: `bun link` creates
`~/.bun/bin/<name> -> ../install/global/node_modules/<pkg>/<file>` and chmods the target;
`bun unlink` removes them). `zsh/zshenv` now puts `~/.bun/bin` on every shell's PATH beside
`~/.local/bin` — until now only `.zprofile` did, so the commands existed in a terminal and
vanished one process down (`env -i zsh -c` showed only `~/.local/bin`). The old `~/.local/bin`
links are retired by link-dots.sh (a resolving link is invisible to the dangling prune).

**Floor.** `findGraduation` also collects the manifest's `bin` realpaths. W8 splits: a `bin`
file needs the shebang AND the exec bit (F14, FAIL on either missing — the symlink would not run);
any other file with a shebang still WARNs, now pointing at the `bin` route. `script-check.test.ts`:
**45 pass / 0 fail** (four F14 cases added: clean bin, bin without shebang, bin without exec bit,
string-form `bin`). `mise run lint:bun`: shebang WARNs 3 → 0; one WARN remains
(`assign-lib.ts` computed dynamic import — a separate floor gap, still open).

**skill-check run.** `bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/writing-bun-scripts`
exits clean with exactly the pre-existing, already-waived prose debt (12 sentences >120 chars,
11-line version header, 4 table cells >400 chars, 34 in `bun-facts.md`) — identical counts at
HEAD before this change; no new debt.


## 2026-10-01 — description routes a new repo/project to wiring-repositories first

Observed: asked 「juliaの新規プロジェクトを立ち上げたい」, a session loaded only the language skill and
never wiring-repositories, so the repo's layer set (jj, mise contract, .claude/) was skipped. The
description now names the cut: new repo/project (新規プロジェクト, 立ち上げ) → wiring-repositories FIRST;
this skill then owns the language manifest. skill-check clean; listing within budget.

## 2026-10-30 DISTILL-BUN-1030 triage map

Frozen source: `ufp-triage-writing-bun-scripts-1030.md` and `usecase-triage-writing-bun-scripts-1030.md` in the dispatcher scratchpad. Rows count original decision statements, including duplicates; R IDs are frozen usecase IDs. Historical ledger entries above describe earlier versions, not current instructions.

| Frozen class and locator | Decision | Disposition |
|---|---|---|
| RESIDUE-KEEP; SKILL.md:24-26 | dated Bun facts は `references/bun-facts.md` に集約し、version 変更時に再検証する | R001: removed (unproven) |
| RESIDUE-CUT; SKILL.md:27-28 | facts・floor・ledger の存在確認を atomic build order とする | Removed (residue) |
| RESIDUE-CUT; SKILL.md:32 | 英語で書き、日本語で応答する | Removed (residue) |
| RESIDUE-CUT; SKILL.md:33-35 | stable tokens を固定する | Removed (residue) |
| UFP-DERIVED; SKILL.md:39-42 | Bash は bootstrap・hook-entry・短い exec wrapper に限る | Kept: SKILL.md (see mapping by locator below) |
| UFP-DERIVED; SKILL.md:40-42 | `.sh` の最初の conditional、loop、JSON access は TypeScript 移行の合図 | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:42-45 | scripts は任意 cwd から `bun <path>` で動き、path は `import.meta.dir` 基準 | R002: kept SKILL.md#runtime-and-distribution |
| CLIG-SUPPORTED; SKILL.md:45-46 | 通常 argv 境界は parser framework を使う | Kept: SKILL.md#dependencies-and-argv; conditional CLIG basics citation |
| RESIDUE-KEEP; SKILL.md:45-46,59 | 通常 argv parser は Cleye `cli`、framework help と `parameters` を契約にする | R003: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:46-47 | `typeFlag` 例外は marker 付き forwarding に限り raw argv の順序と `--` を保つ | R004: kept SKILL.md#dependencies-and-argv |
| UFP-DERIVED; SKILL.md:48-50 | Bun native primitive がある場合は手製実装を避ける | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:50-51 | third-party code は exact pin または package.json + bun.lock で導入 | R005: kept SKILL.md#dependencies-and-argv |
| UFP-DERIVED; SKILL.md:51-52 | Bun の green run を型検査の証拠とみなさない | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:58 | BG0 は新規 local script を Bun TypeScript にし、shim 以外の Bash、Node runtime、Deno を拒否 | R006: kept SKILL.md#runtime-and-distribution |
| RESIDUE-KEEP; SKILL.md:58 | vendored shell は自己記述 vendor header で例外判定する | R007: kept SKILL.md#runtime-and-distribution |
| RESIDUE-KEEP; SKILL.md:58 | bootstrap 例外は Bun 導入前の呼出しに限り、実呼出元を調べる | R008: kept SKILL.md#runtime-and-distribution |
| RESIDUE-KEEP; SKILL.md:59 | script は shebang なし、PATH binary は package `bin` と shebang/100755 を使う | R009: kept SKILL.md#runtime-and-distribution |
| RESIDUE-KEEP; SKILL.md:59 | PATH command に手製 `.ts` symlink を使わない | R010: kept SKILL.md#runtime-and-distribution |
| RESIDUE-KEEP; SKILL.md:59 | Cleye exact version を root manifest/lock に置く | R011: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:59 | `parseArgs` と手書き `Bun.argv` parsing を禁止 | R012: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:59 | 各 Cleye boundary は strict flags、prototype guard、parameters を宣言 | R013: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:59 | Cleye camelCase keys を kebab flags として使う | R014: removed (unproven) |
| CLIG-SUPPORTED; SKILL.md:59 | excess positionals は意図して宣言し、他は拒否する | Referenced: designing-command-line-interfaces |
| RESIDUE-KEEP; SKILL.md:59 | Cleye usage exit 1 と local fatal exit 2 を stderr で区別する | R015: kept SKILL.md#dependencies-and-argv |
| CLIG-SUPPORTED; SKILL.md:59 | parse 後の domain result は成功0、失敗非0 | Referenced: designing-command-line-interfaces |
| UFP-DERIVED; SKILL.md:59 | fatal error を entry catch で stderr に伝え exit 2 にする | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:59 | machine consumer は一行 JSON、agent/human は verdict lines と宣言 | R016: kept SKILL.md#dependencies-and-argv |
| CLIG-SUPPORTED; SKILL.md:59; references/bun-facts.md:147-151 | piped output には `process.stdout.write` を用いる | Removed: implementation override has no proven live usecase |
| RESIDUE-KEEP; SKILL.md:60 | hangable process は native timeout/killSignal を使う | R017: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; SKILL.md:60 | stdout/stderr と exited を同じ Promise.all で drain する | R018: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; SKILL.md:60 | timeout は AbortSignal.timeout と `sig.aborted` で判定する | R019: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; SKILL.md:60 | relay output を slice cap で制限する | R020: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; SKILL.md:60; references/bun-facts.md:191-192 | real work 前に `Bun.which` で executable を確認する | R021: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:60-61,96 | hooks は sync main、spawnSync、zero npm imports とする | R022: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; SKILL.md:61 | dependency ladder は builtin/Bun global/root graduation/bunx の順 | R023: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:61 | hooks/CI/scripts の bunx は pinned | R024: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:61 | ≥2 files share dependencies, a pin need, or type/editor pressure triggers graduation | R025: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:61 | inline version imports は既知の clean cwd の throwaway に限定 | R026: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:61 | hooks は node:/bun: 以外を import しない | R027: kept SKILL.md#dependencies-and-argv |
| CLIG-SUPPORTED; SKILL.md:62 | behavior worth keeping は sibling tests と fixture-binary で検査する | Kept: SKILL.md#workspace-boundaries-and-verification |
| UFP-DERIVED; SKILL.md:62 | 新 gate は bad input で fail することを確認する | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:62 | graduation 時に pinned TypeScript compiler の独立 gate を置く | R028: removed (unproven) |
| UFP-DERIVED; SKILL.md:62 | green Bun run だけで typed と主張しない | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:66-69 | CLI helper/template を使い、dotfiles adapter は static manifest import | R029: removed (unproven) |
| RESIDUE-CUT; SKILL.md:68-69 | `cliArgv` helper を境界で宣言して再利用する | Removed (residue) |
| CLIG-SUPPORTED; SKILL.md:70 | `-V`/`--version` は version を stdout 一行で出して成功終了 | Referenced: designing-command-line-interfaces |
| RESIDUE-KEEP; SKILL.md:71 | aliases は最初の package bin 名を共有 | R030: removed (unproven) |
| CLIG-SUPPORTED; SKILL.md:72-75 | help output を terminal decoration と環境変数に依存させない | Removed: implementation override has no proven live usecase |
| RESIDUE-KEEP; SKILL.md:72-76 | root/command help を4 TTY/FORCE_COLOR 組合せで同一 bytes とし、unknown flag spelling を保つ | R031: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:76-77 | forwarding wrapper は downstream contract を保ち、自身の help/version を先に扱う | R032: removed (unproven) |
| UFP-DERIVED; SKILL.md:83 | 新規 local script は一つの `.ts` として `bun path` で実行 | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:84; references/bun-facts.md:32-33 | shell commands は Bun.$ とし、side effects を別 await にする | R033: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:85 | repo tool release は changeset task を使い、version/changelog を手編集しない | R034: owned by AGENTS.md |
| RESIDUE-KEEP; SKILL.md:86 | potentially hanging CLI を native Bun.spawn timeout で実行 | R035: kept SKILL.md#processes-and-hooks |
| RESIDUE-CUT; SKILL.md:87 | file IO では Bun.file/Bun.write を優先する | Removed (residue) |
| CLIG-SUPPORTED; SKILL.md:88 | 普通の command の argv parsing は named flags/parameters を持つ parser で行う | Kept: SKILL.md#dependencies-and-argv; conditional CLIG basics citation |
| RESIDUE-KEEP; SKILL.md:89 | named commands は各 command で prototype guard を再宣言 | R036: kept SKILL.md#dependencies-and-argv |
| CLIG-SUPPORTED; SKILL.md:90 | excess positionals は意図して許可し、他は拒否 | Referenced: designing-command-line-interfaces |
| RESIDUE-KEEP; SKILL.md:91 | arbitrary downstream argv は marker 付きで原順・`--` を維持 | R037: kept SKILL.md#dependencies-and-argv |
| CLIG-SUPPORTED; SKILL.md:92 | progress, spinner, prompt は human-facing interactive surface に用いる | Referenced: designing-command-line-interfaces |
| RESIDUE-KEEP; SKILL.md:92 | prompts は exact-pinned @clack、hooks では使わず、non-TTY confirm を拒否 | R038: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:92 | hand-drawn carriage-return progress bar を避ける | R039: kept SKILL.md#processes-and-hooks |
| RESIDUE-CUT; SKILL.md:92 | interactive example `disk-reclaim run purge --interactive` | Removed (residue) |
| CLIG-SUPPORTED; SKILL.md:93 | JS/TS one-off tool は versioned/pinned invocation を使う | Kept: SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:94 | Python payload は running-python-tools に移す | R040: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:95 | library import 前に BG3 graduation check を通す | R041: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:96 | hook は sync/zero-dep、fail-open/-closed を header に宣言 | R042: kept SKILL.md#processes-and-hooks |
| CLIG-SUPPORTED; SKILL.md:97 | script tests は actual fixture executable で child behavior を exercise | Kept: SKILL.md#workspace-boundaries-and-verification |
| UFP-DERIVED; SKILL.md:98 | Bash migration で既存 CLI/exit/output contract を先に固定する | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:98 | 新 TS ができた同じ change で旧 `.sh` を削除 | R043: removed (unproven) |
| UFP-DERIVED; SKILL.md:102-103 | corpus contracts を KEEP、実装を必要に応じ REFACTOR | Kept: SKILL.md (see mapping by locator below) |
| UFP-DERIVED; SKILL.md:107 | exit 0/1/2 と main catch contract を保持 | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:108 | raw/manual parser を ordinary boundary の Cleye に置換 | R044: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:109 | manual help/position routing を Cleye help/parameters に置換 | R045: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:110 | every cli/command に rejectPrototypeFlag を置く | R046: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:111 | Cleye camelCase schema を使い kebab rendering に任せる | R047: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:112 | machine envelope と human/agent verdict-lines を consumer ごとに宣言 | R048: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:113 | zero npm imports rule は graduation により supersede、distributed trees は zero-dep | R049: kept SKILL.md#dependencies-and-argv |
| CLIG-SUPPORTED; SKILL.md:114 | fixture-binary tests を他 script family に適用 | Kept: SKILL.md#workspace-boundaries-and-verification |
| RESIDUE-KEEP; SKILL.md:115 | hooks は sync + zero-dep、Bun globals は許可 | R050: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; SKILL.md:116 | manual setTimeout/kill を native Bun.spawn timeout に置換 | R051: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; SKILL.md:117 | short bounded process は Bun.$ に置換 | R052: removed (unproven) |
| RESIDUE-CUT; SKILL.md:118 | whole-file node:fs read boilerplate を Bun.file に置換 | Removed (residue) |
| UFP-DERIVED; SKILL.md:119 | error envelope は nonzero exit にする | Kept: SKILL.md (see mapping by locator below) |
| UFP-DERIVED; SKILL.md:120 | process exit state は entry boundary にだけ設定 | Kept: SKILL.md (see mapping by locator below) |
| UFP-DERIVED; SKILL.md:121 | cross-skill imports を避け、native options で重複を縮める | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:122 | unpinned bunx calls は exact pin に変更 | R053: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:124-125 | CI gap の owner は wiring-mise-tasks | R054: owned by wiring-mise-tasks |
| RESIDUE-CUT; SKILL.md:129 | one script is SOLO, zero agents | Removed (residue) |
| RESIDUE-KEEP; SKILL.md:129-131 | corpus migration/audit dispatches one read-only worker per script | R055: removed (unproven) |
| UFP-DERIVED; SKILL.md:131-132 | verdict evidence includes command and verbatim output | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-CUT; SKILL.md:132 | without harness, run serially | Removed (residue) |
| RESIDUE-CUT; SKILL.md:132-134 | Fable 5 frontier guidance is authoritative even if a constraint feels unnecessary | Removed (residue) |
| UFP-DERIVED; SKILL.md:142 | Bash-to-TS migration is in scope | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:143 | full refactor co-fires refactoring-code and this Bun oracle | R056: kept SKILL.md#workspace-boundaries-and-verification |
| UFP-DERIVED; SKILL.md:144 | local script request without Bun keyword still routes to Bun TS | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; SKILL.md:145 | editing a house Bun script invokes this guidance | R057: kept SKILL.md |
| RESIDUE-KEEP; SKILL.md:146 | dependency question on a Bun script invokes BG3 | R058: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:147 | new hook detector requires inspecting local event/matcher declaration first | R059: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; SKILL.md:148 | bootstrap conversion depends on actual callers and whether Bun exists yet | R060: kept SKILL.md#runtime-and-distribution |
| RESIDUE-KEEP; SKILL.md:154 | React props typing routes to writing-typescript | R061: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:155 | PDF text extraction routes to running-python-tools | R062: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:156 | mise task graph routes to wiring-mise-tasks | R063: owned by wiring-mise-tasks |
| CLIG-SUPPORTED; SKILL.md:157 | one-shot interactive pipeline is a command, not a kept script | Removed: scope example; CLI composition is owned by designing-command-line-interfaces |
| RESIDUE-KEEP; SKILL.md:158 | Codex sandbox flag question routes to dispatch tool | R064: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:159 | Worker deployment routes to wrangler semantics; deployment script may co-fire here | R065: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:160 | published product CLI routes outside local automation scope | R066: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:161,171 | reusable CLI design routes to designing-command-line-interfaces, implementation returns here | R067: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:162 | Express server refactor routes to refactoring-code and writing-typescript | R068: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:163 | zsh alias routes to shell configuration topic | R069: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:169 | config reader/generator implementation here; authority/acceptance to governing-configuration-systems | R070: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:170 | TS idiom belongs to writing-typescript; script lifecycle belongs here | R071: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:170 | zero-config no-dep floor beats zod/ts-pattern until graduation | R072: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; SKILL.md:171 | reusable CLI contract goes to CLI skill; settled Bun implementation returns here | R073: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:172-173 | Python NOW and kept Python route to respective Python skills | R074: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:174 | task graph belongs to wiring-mise-tasks, script body here | R075: owned by wiring-mise-tasks |
| RESIDUE-KEEP; SKILL.md:175 | skill publication/floor doctrine belongs to forging-skills | R076: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:176 | hook event/matcher source and checks belong to configuration owner; body here | R077: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; SKILL.md:177 | vendor CLI laws stay with vendor skills; generic subprocess mechanics here | R078: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:178 | structural refactor belongs to refactoring-code; implementation follows repo instructions | R079: kept SKILL.md#workspace-boundaries-and-verification |
| RESIDUE-KEEP; SKILL.md:179 | verify actual Bun runtime rather than recall from training | R080: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:185 | load Bun facts before relying on an unencoded feature | R081: removed (unproven) |
| RESIDUE-KEEP; SKILL.md:186 | run script floor after each new/edited script | R082: kept SKILL.md#workspace-boundaries-and-verification |
| RESIDUE-KEEP; SKILL.md:187 | read forge ledger for refactors, audits, corpus work | R083: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:3-8 | Bun version/API fact 全体を version change または reforge 時に再確認 | R084: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:17-19 | frozen lockfile を使う CI では Bun binary version を pin | R085: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:25-26 | Bun.$ interpolation は escaped、dynamic content のみ raw escape hatch | R086: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; bun-facts.md:32-33 | side-effecting Bun.$ commands は別々に await | R087: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; bun-facts.md:37-38 | `.env()` は既存 process.env を spread | R088: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:39-40 | `.nothrow()` の直後に exitCode を分岐 | R089: removed (unproven) |
| RESIDUE-CUT; bun-facts.md:41 | Bun Shell command substitution は `$()` を使う | Removed (residue) |
| RESIDUE-KEEP; bun-facts.md:42 | hangable child に Bun.$ を使わない | R090: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; bun-facts.md:43-44 | polling loop で Bun.$ を使わない | R091: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:45-46 | dotfile glob behavior を test | R092: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:47-48 | cross-platform destructive rm は node:fs rm | R093: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:49 | cross-OS newline output は echo でなく printf | R094: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:53-57 | timeout-capable child は native Bun.spawn timeout API を使う | R095: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; bun-facts.md:59-70 | `proc.killed` を timeout detector にしない | R096: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; bun-facts.md:71-82 | `signalCode` だけで timeout を判定しない | R097: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; bun-facts.md:79-82 | timeout 判定は AbortSignal.timeout と aborted state | R098: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; bun-facts.md:83-86 | Bun.$ を使うのは hang risk がない時 | R099: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; bun-facts.md:88-95 | stdout/stderr concurrently drain し relay size を bound | R100: kept SKILL.md#processes-and-hooks |
| RESIDUE-KEEP; bun-facts.md:101-110 | inline version import の auto-install 条件を限定 | R101: kept SKILL.md#dependencies-and-argv |
| RESIDUE-CUT; bun-facts.md:111 | Bun auto install is unavailable offline | Removed (residue) |
| RESIDUE-CUT; bun-facts.md:112 | list bunfig auto-install modes | Removed (residue) |
| RESIDUE-KEEP; bun-facts.md:113-115 | dependency updates を受け入れる前に resolved tree を検証 | R102: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:119-124 | hooks/CI/scripts の bunx は exact-pin | R103: kept SKILL.md#dependencies-and-argv |
| RESIDUE-KEEP; bun-facts.md:125-126 | stale global bunx copy が残る場合 cache と global bin を確認 | R104: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:127-132 | plugins を要する bunx tool は tool+plugins を graduation project で pin | R105: kept SKILL.md#dependencies-and-argv |
| RESIDUE-CUT; bun-facts.md:133-134 | bunx can be slower than npx; benchmark before claiming speed win | Removed (residue) |
| RESIDUE-KEEP; bun-facts.md:135-138 | WSL bunx install は noninteractive flags を渡し managed dirs を native filesystem に置く | R106: removed (unproven) |
| RESIDUE-CUT; bun-facts.md:142-143 | list Bun.file method and Bun.write accepted types | Removed (residue) |
| RESIDUE-KEEP; bun-facts.md:144-145 | node:fs は sync exists, readdir, rm, mkdtemp に残す | R107: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:149-151 | piped scripts は process.stdout.write を使う | R108: removed (unproven) |
| RESIDUE-CUT; bun-facts.md:155-157 | list bun test discovery patterns and preload syntax | Removed (residue) |
| RESIDUE-KEEP; bun-facts.md:158-159 | house tests use sibling tests/ and fixture binary | R109: kept SKILL.md#workspace-boundaries-and-verification |
| RESIDUE-KEEP; bun-facts.md:163-165 | native addon を避け Bun.password/sqlite/JS-WASM alternatives | R110: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:166-167 | fragile Node APIs を使うなら Bun 上で smoke-test | R111: removed (unproven) |
| RESIDUE-CUT; bun-facts.md:168-169 | record node:util parseArgs implementation version history | Removed (residue) |
| RESIDUE-KEEP; bun-facts.md:170-173 | scripts は cwd-relative `.env` discovery に依存しない | R112: removed (unproven) |
| RESIDUE-CUT; bun-facts.md:177-179 | list `bun build --compile` target matrix | Removed (residue) |
| RESIDUE-KEEP; bun-facts.md:180-182 | compiled binary を clean machine で検査してから distribution を信頼 | R113: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:186-187 | process.env を portability idiom として使う | R114: removed (unproven) |
| UFP-DERIVED; bun-facts.md:188-190 | dual-use script に import.meta.main guard、path anchor に import.meta.dir/path | Kept: SKILL.md (see mapping by locator below) |
| RESIDUE-KEEP; bun-facts.md:191-192 | binary override は env fallback、実行前 PATH gate は Bun.which | R115: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:193-195 | graduation 時の `bun run` vs `bun <path>` collision を考慮 | R116: removed (unproven) |
| RESIDUE-CUT; bun-facts.md:199-201 | Bun cold-start is ~8–15 ms vs Node ~60–120 ms | Removed (residue) |
| RESIDUE-KEEP; bun-facts.md:202-204 | long-running daemon/watcher に Bun を使わず別 runtime または restart | R117: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:208-209 | Bun run is not type-check evidence | R118: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:210-213 | graduation project has pinned tsc gate; zero-config files rely on floor/tests/editor | R119: removed (unproven) |
| RESIDUE-KEEP; bun-facts.md:217-218 | workspace boundary is dependency graph enforced by a gate | R120: kept SKILL.md#workspace-boundaries-and-verification |
| RESIDUE-CUT; bun-facts.md:220-222 | conditional exports cannot be relied on as default package boundary | Removed (residue) |
| RESIDUE-KEEP; bun-facts.md:223-226 | workspace boundary tests must account for ancestor node_modules resolution | R121: kept SKILL.md#workspace-boundaries-and-verification |
| RESIDUE-KEEP; bun-facts.md:227-229 | `imports` targets stay in owning package | R122: kept SKILL.md#workspace-boundaries-and-verification |
| RESIDUE-KEEP; bun-facts.md:230-232 | workspace dependency cycles are gated, including devDependencies | R123: kept SKILL.md#workspace-boundaries-and-verification |

UFP locator mapping: SKILL.md:39–42, 83, 98, 102–103, 121, 142, 144 and bun-facts.md:188–190 → SKILL.md#runtime-and-distribution; SKILL.md:48–50 → SKILL.md#processes-and-hooks; SKILL.md:51–52, 62, 131–132 → SKILL.md#workspace-boundaries-and-verification; SKILL.md:59, 107, 119–120 → SKILL.md#dependencies-and-argv. General guarantees remain in base-usecase-first.
