# Forge verification ledger — writing-bun-scripts F3 artifact (2026-07-23)

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

Trigger: a house script (`qoed/scripts/check_p1_oracle.ts`, a mise `test:banded` body moved out
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
