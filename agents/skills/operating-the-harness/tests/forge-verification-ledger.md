# Forge verification ledger — operating-the-harness (F3 artifact)

Append on reforge; never overwrite. The fire/no-fire desk-check set lives here (§ Trigger set) —
re-run it after any description edit.

## CURRENT STATE

**Invariants (live):**

- **Three coordinates, not two.** §0 carried P1 (context budget) and P2 (deterministic
  enforcement) and declared "the whole field collapses to two principles". It did not. Both
  answer *which mechanism*; neither answers *which scope*. P3 (2026-07-29) is that axis and must
  survive any reforge: a rule naming ONE repo belongs in that repo's `.claude/`, and a
  `cwd.startsWith(...)` guard inside a globally-registered hook is not scoping — it is a global
  rule with an early return.
- **The skill enforces its own rules mechanically.** Before 2026-07-29 this skill had no
  `scripts/` and no `tests/` — it taught "put enforcement where it is deterministic" and shipped
  its own rules as prose only. `scripts/scope-check.ts` owns the greppable half of P3; its own
  header enumerates what it cannot catch, so judgment keeps the ceiling.
- **§5 audits BOTH scopes.** Items 1–7 are project-shaped and structurally cannot see a defect
  that lives at user scope. Item 8 exists for that blind spot and must not be folded back in.
- **A decision owes its reader the whole list.** §3 taught how to EMIT a decision (exit codes,
  the JSON channel) and never what a decision must CONTAIN. The reader of a PreToolUse deny is an
  agent that will re-issue the call, so an incomplete list costs a turn per omitted axis and
  teaches that one fix sufficed. The batched-diagnostics bullet (2026-08-08) is that rule;
  `scripts/gate-diagnostics-check.ts` holds the declarable half of it.

**Open defects:** the 4 live P3 violations found by the floor (below) are NOT yet fixed — the
hooks must move to the firedancer repo, which has an active session. Tracked, not closed.

**Retired decisions (do not resurrect):**

- **A standalone "error recovery / batched diagnostics" skill** — rejected 2026-08-08, on two
  grounds. (1) It is a *property* of output, like idempotency or observability, not an activity;
  the house naming shape is a gerund naming what you DO, and nobody ever asks to "do error
  recovery", so it has no firing moment. (2) The surveyed application surface was **one gate of
  three** (table in the 2026-08-08 entry) — below the function-first existence bar. It landed
  instead as a §3 invariant plus `scripts/gate-diagnostics-check.ts`. The judgment the rule needs
  — which axes are independent — is domain knowledge a skill could not have supplied anyway; the
  rule therefore ships as a QUESTION ("does B consume A's output?"), not as an answer.

- **Rename to drop the article** — rejected 2026-07-29, measured. `operating-the-harness` is the
  only one of 49 skill names carrying an article (the 11 non-gerund names are all vendored
  upstream, out of scope). But the article is a *symptom of house rule 7*, not sloppiness: the
  natural name (`operating-claude-code`) is forbidden by the reserved-word rule, so the object
  cannot be named directly and "the harness" is the substitute coinage. Cost of renaming:
  **121 occurrences across 51 files**, concentrated in siblings' reciprocal pointers and cut
  tables (forging-skills ×9, driving-* ×4–7 each) and in ledger history, which is append-only by
  its own discipline. Benefit: ~0 — skill firing is lexical description matching, and the
  description already carries the real tokens (`CLAUDE.md`, `settings.json`, `PreToolUse`,
  `CLAUDE_PROJECT_DIR`); nobody searches "harness". If ever revisited, the candidate is
  `operating-agent-harness`.

## 2026-07-29 reforge — P3 (scope), and the skill's first floor + ledger

**Source: a postmortem, not a document.** Three hooks naming one repo
(`detect-uncited-diagnosis`, `detect-footing-splice`, `detect-unanchored-registration`) were
written into user scope and wired into `~/.claude/settings.json`, each carrying a hardcoded
`/home/fuyu/Workspace/firedancer` and an early-return cwd guard. Two of the three were committed
in this repo the same day (`aa9b913`), with a commit message that described the repo gate as
design rather than as a defect. A fourth was being written the same way when the owner caught it.

**Why the skill produced this.** The defect is traceable to specific lines, not to inattention:

| Site | What it said | What it failed to ask |
|---|---|---|
| §0 opening | "collapses to **two principles** … everything else is a recipe" | a spine declared complete licenses treating scope as a detail |
| §0 decision reflex | columns "You want… / Put it here / Why" | "Put it here" names a FILE TYPE, never a scope level |
| §0 hook row | "Something that **must happen every time**" | "every" is unquantified — the maximal reading (global) always satisfies it |
| §4 MCP row | "keep personal-credential servers at *user* scope" | the scope axis EXISTS in this skill and was applied to MCP only — evidence of omission, not of a deliberate cut |
| `settings-permissions-mcp.md` | 5-level precedence table | answers "who wins", never "where should this go" |
| §5 checklist | "auditing **a project's** config", 7 project-shaped items | the audit cannot see the surface the defect lives on |

**Changes landed.** Description: two→three precedence rules, plus `~/.claude`, `user vs project
scope`, `CLAUDE_PROJECT_DIR` triggers. §0: P3 paragraph + the scope table (repo / user / machine /
managed) + the deny line. §4: "Project policy at user scope" anti-pattern. §5: item 8 (audit user
scope; budget the survivors — each user-scope hook is a process on every matching event in every
project). New `scripts/scope-check.ts`; new `tests/` (this file).

**Description budget — a maintenance hazard found by measurement.** The description was at
**1526 / 1536 characters**, i.e. 10 characters of headroom, so it could not absorb a new rule.
The first edit pushed it to 1604 and the harness **silently truncated the tail** (`headless,
claude -p, verification loop` vanished from the skill listing — observed live, then observed to
return). Duplicate tokens between the "Use whenever" sentence and the "Trigger on" list were the
fat; removing them landed **1479 / 1536 (57 free)**. Any future addition must displace something.

**Gate proof (both directions).** `scope-check.ts` was run before being trusted:

| Run | Result |
|---|---|
| live `~/.claude` | **FAIL, exit 1** — 4 violations across the 3 postmortem hooks, 14 files scanned |
| synthetic clean fixture (`$CLAUDE_PROJECT_DIR` form only) | **PASS, exit 0** |
| synthetic bad fixture (one hardcoded home path) | **FAIL, exit 1**, 1 finding |

A gate never seen red is decoration; a gate never seen green is noise. Both were observed.
`bun script-check.ts scope-check.ts` → **FAIL=0 WARN=0** (the house Bun floor, self-applied).

**PROSE-DEBT waiver (dated 2026-07-29).** Measured A/B, not asserted: **25 → 29 → 26** long
sentences; version header **14 → 14**. The first draft of P3 added 4 long sentences; three were
split back out rather than waived, leaving **net +1**. The residue is not cleared: clearing 25
pre-existing sentences plus a 14-line header is a full body pass, not a rider on a LAW change.
Queue position: behind the P3 violations above and behind the writing-bun-scripts BG0 marker work.

## 2026-08-08 reforge — batched diagnostics (§3) + its floor

**Source: a live defect in this repo's own gate, not a document.**
`agents/claude/hooks/enforce-dispatch-contract.ts` verified three independent axes per `agent()`
call (model, effort, resource) and already collected each axis into its own line array — the
batching instinct was there. But each array was emitted through its own `decidePre("deny", …)`,
and `decidePre` ends in `process.exit(0)` (`lib.ts`). Only the first array could ever reach the
caller. A script violating all three was denied three times in a row, one axis per turn, with the
per-call fix list never assembled.

**Why the skill produced this.** §3 was complete on the *channel* (exit 0 + JSON vs exit 2 +
stderr, `permissionDecision` placement, tighten-not-loosen) and silent on the *payload*. Nothing
asked what a deny owes the agent that will read it and re-issue the call. Two supporting gaps: the
verification loop in §2 is written for the human's check, not for the gate's own message; and §5
had no item that inspects a hook's diagnostic behavior at all.

**Scope survey before writing the rule.** All three PreToolUse gates were read, not assumed:

| Gate | Shape | Serialized? |
|---|---|---|
| `enforce-dispatch-contract.ts` | 3 genuinely independent axes | **yes** — the defect |
| `enforce-supervised-execution.ts` | `detachmentIn()` returns the first matching form | no — alternatives, one remedy |
| `enforce-search-route.ts` | `isRawSearch()` is one boolean OR | no — single axis by construction |

One site of three. That count is why this landed as an invariant with a floor and **not** as a new
skill (see Retired decisions).

**Changes landed.** §3: the batched-diagnostics bullet (batch / poison / cap / declare). §5: item
9. New `scripts/gate-diagnostics-check.ts` + its line in the existence-check block. Wired into the
repo gate as `mise run lint:gates` (a member of `lint`, so `mise run check` carries it). All three
gates annotated at every deny site. `enforce-dispatch-contract.ts` rewritten to one batched
emitter per tool arm, with poisoning for unbalanced spans and a stated cap at 20 lines.

**Gate proof (both directions).** `gate-diagnostics-check.ts` was run before being trusted:

| Run | Result |
|---|---|
| the 3 gates, pre-annotation | **FAIL, exit 1** — 9 undeclared deny sites |
| the 3 gates, post-annotation | **PASS, exit 0** |
| fixture: one declaration removed | **FAIL, exit 1** |
| fixture: `BATCHED` gate with its batching test renamed away | **FAIL, exit 1** |
| fixture: bare `// SINGLE-AXIS:` with an empty reason | **FAIL, exit 1** |

`bun script-check.ts gate-diagnostics-check.ts` → **FAIL=0 WARN=0**. On the hook side,
`enforce-dispatch-contract.test.ts` grew a `batched diagnostics` block (12 cases: three axes on one
line, per-call grouping, poisoning suppressing the cascade, the cap stating its remainder, the
incompleteness NOTE, HOW TO FIX listing only fired axes). Suite: 63 pass in that file, 194 pass /
1 skip / 0 fail across `agents/claude/hooks/tests/`, `mise run check` exit 0.

**PROSE-DEBT waiver (dated 2026-08-08).** Measured: **26 → 30 → 27** long sentences; version
header **14 → 15 → 14**. The first draft added 4 long sentences and a header line; three sentences
were split back out and the header recompressed, leaving **net +1** — same discipline as
2026-07-29. The 26-sentence residue is still queued behind the P3 violations.

**Description untouched**, so the trigger set below was not re-run. Budget unchanged at 1479 /
1536.

## Trigger set (F3 desk-check) — re-run after any description edit

FIRES:

| Ask | Why here |
|---|---|
| 「この hook、`~/.claude` に置いていい？」 | P3 is the whole question |
| "add a Stop hook that runs the linter" | mechanism (P2) + scope (P3), both owned here |
| 「skill が一覧に出ない / 発火しない」 | listing/budget diagnostics |
| 「CLAUDE.md が長すぎる、どう削る」 | P1 |
| "should this MCP server be project or user scope?" | P3 applied to MCP |
| "add `Bash(npm test)` to permissions" | settings semantics |
| 「毎回 format させたい」 | must-happen-every-time → hook |

MUST NOT fire (near-miss — each shares vocabulary with a FIRES row):

| Ask | Route | Near-miss on |
|---|---|---|
| 「この skill の description を直して」 | `forging-skills` | says "skill", but it is CRAFT not contract |
| 「skill を新設して」 | `forging-skills` | same word, other side of the PURPOSE cut |
| "which `--sandbox` flag for `codex exec`?" | `driving-codex` | a subprocess CLI, not this harness |
| 「この bun script のフラグ処理を直して」 | `writing-bun-scripts` | scripts live under `.claude/`, but this is script craft |
| "what does Opus 5 cost per token?" | `claude-api` | names Claude, but it is the API not the harness |
| 「誰にどう委任するか配役を決めて」 | `orchestrating-agents` | subagents appear in both; delegation policy is theirs |
| 「`mise run check` の task を足して」 | `wiring-mise-tasks` | a runnable check, but the task graph is theirs |

## 2026-08-08 — reciprocal row for `codifying-doctrine` (F2)

Edit: one row added to §0's decision-reflex table — a tie-break for when two good rules conflict
and nobody can ask is authored in `codifying-doctrine` FIRST, then installed here. PURPOSE cut:
that skill decides whether the rule sacrifices anything and what retires it; this one decides
where it lives and what enforces it. Its config-as-prose anti-pattern is that skill's D5 gate.
Reciprocal row lives in `codifying-doctrine`'s routing table.

**PROSE-DEBT waiver (dated 2026-08-08).** This commit leaves `operating-the-harness` at 27 long
prose sentences and a 14-line version header — the pre-existing baseline, unchanged by this edit.
The edit is a single table row. Queue position: clear at the next substantive reforge of this
skill, not in a sibling's forge commit.
