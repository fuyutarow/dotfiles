# Display source ownership audit, 2026-10-21

Reader: coordinator and candidate authors; internal English source review.
Proposition: `DISPLAY-UDF-SOURCE-OWNERSHIP`.

**Overall: FAIL for complete UDF and single logical writer.** Code establishes a
`fullname` display-token feedback loop and overlapping whole-record fleet writers.
Statusline's ordinary inventory projection uses consistent inputs, but its prepared
view can change the displayed session set without changing worker scope. These are
source findings, not a claim that the observed UI is fixed or that either candidate
caused every defect. Candidate acceptance belongs to the coordinator.

## Scope and revision binding

| Key | Exact commit | Meaning |
| --- | --- | --- |
| H | `81f5deea0df2255223cf679f9cf72768b023b114` | Frozen Herdr candidate, workspace `ws_herdr-display-regression-oct21` |
| S | `3e4f88219eef293c19264e855d61356905259acb` | Frozen statusline candidate, workspace `ws_statusline-watch-worker-scope` |
| B | `416103affd15306caccddadece03db07c0b1acf9` | Both candidates' parent; shared fleet writer and unchanged hook code |

All source citations below mean `KEY:path:Lstart-Lend` at these commits. Files
were read with `jj file show -r KEY PATH | nl -ba`; candidate diffs were inspected.
The shared writer is unchanged in H and S. The Codex hook, `herdr-identity.ts`,
statusline `identity.ts`, and statusline `fleet-session.ts` are also unchanged from
B in both candidates. Current workspace HEAD was not substituted for either
candidate. Producer evidence documents and producer verdicts were not authorities.

User story: a pane/session's displayed identity and worker counts must follow
current independently identified input facts. A failed observation must remain
unknown or explicitly old, without changing the authority it purports to describe.
Negative space: this review changes no implementation, deployment, native Herdr
state, candidate lane, versions, changelogs, fixtures, registries, or processes.

README Design invariant 8 (B:`README.md:317-338`) and
`CLAUDE.md` require declaration → render → deployed HOME → runtime, one writer,
with checks as the return channel. For runtime records this audit separately checks
fact authority, logical writer, field overlap, projection, scope, and freshness.
It does not confuse multiple physical callers of one enforced state owner with
multiple independent producers of complete state.

## Actual read/write graph

```text
repo herdr/config.toml --link-dots--> HOME config --read--> Herdr UI layouts

Codex runtime --write--> exact rollout/session_meta/settings/context
      | native viewport                 | read/validate
      v                                 v
H binder --read visible footer--> fleet session JSON <--replace-- statusline
   | report-agent-session                  ^                    stdin/rollout
   v                                       | replace
Herdr agent_session --list/fallback--> H binder     Codex natural hook
   (source herdr:codex)                            | read rollout + pane.get
                                                  |              ^
fleet JSON --read--> H projector --write--> Herdr tokens.fullname --+
                         |                 tokens.model/effort/rc/fleet_session_id
                         +--rename--> tab name --read--> UI text
Herdr tokens --read--> H fingerprint cache --skip/retry--> projection only

provider processes/open files + transcripts --read--> sampler
     --> owner.json (+last-good) --> statusline typed frame --> UI text
agx records/leases --fold/publish--> current-runs.json --read--> scoped frame
     records.jsonl + workspace verdicts --read--> action counts
sampler scoped frame --render/write--> owner.json.view (+last-good)
     --read/decode + PID filter--> UI text [shared worker text stays precomputed]
fleet JSON --read/fill missing context/rate--> sampler session snapshots --> text
```

The registration return edge and the `fullname` return edge are intentional code
paths, not inferred from matching strings on screen. The fingerprint/cache return
edge controls work; it does not write identity. No prepared UI text → agx records
or provider transcript write edge was found in the audited paths.

## Field ownership and invalidation

`F` below is `$XDG_RUNTIME_DIR/fleet/sessions/<session_id>.json`.
Its schema is strict version 1, but contains no writer identity, per-field source,
generation, or per-field observation time (B:tools/shared/src/fleet-session.ts:25-50).

| Field / mutable boundary | Effective source and logical producers | Read/derive/write and invalidation evidence |
| --- | --- | --- |
| Deployed Herdr layout | Repository declaration; link-dots deploys it; Herdr reads it | B:scripts/config-registry.ts:144-146 declares the exact config link; B:scripts/link-dots.ts:1-24,180,674-687 realizes declared links. No inspected runtime path writes this declaration. Actual deployed bytes are UNVERIFIED. |
| Native `agent_session.{value,source,kind,agent}` | Herdr registration is input; projector and natural hook also submit registrations | H:tools/herdr-projector/src/herdr-projector.ts:42-83,186-295 reads selected registration/footer and reports `herdr:codex`. B:agents/codex/hooks/report-herdr-metadata.ts:105-130 reports `dotfiles:codex-session`. Server precedence, expiry and authentication are UNVERIFIED. |
| Native status / UI `state_icon` | Herdr native state feeds the configured icon; projector does not report an agent-status field | B:herdr/config.toml:123-147 selects `state_icon`. H projector:153-167 parses footer state, but 229-274 does not persist that state in F. Native status producer and icon renderer implementation are outside the supplied repository; UNVERIFIED. |
| F `session_id,vendor,cwd,pane_id` | Native exact rollout + pane/footer/registration; statusline payload; hook runtime environment | H projector:229-243 seeds; 50-83 seeds fallback. S:tools/statusline/src/fleet-session.ts:139-159 replaces from payload and `TMUX_PANE`; B:tools/statusline/src/identity.ts:389-418 replaces from hook and `HERDR_PANE_ID`. No shared field-owner arbitration. |
| F `name` | Claude provider name observation; Codex hook naming policy, including inherited display suffix | S statusline fleet-session:36-54,132-159; B:agents/codex/hooks/herdr-identity.ts:10-25,28-89. H projector:235 preserves prior name; 379-384 projects it back. Name syntax validation does not validate suffix provenance. |
| F `model,effort` | Exact rollout settings, native footer display observation, statusline decoded payload | B shared fleet-session:281-354 scans bounded complete native records. H projector:242-270 then overwrites native-read model/effort with footer strings. S statusline fleet-session:145-152 and B statusline identity:408-412 are competing replacements. No source priority/version comparison. |
| F `ctx,rate` | Statusline `SessionStatus` context/rate observations; projector preserves old values; hook writes unknown | S statusline fleet-session:57-97,109-130,153-159; H projector:75-80,235-240; B statusline identity:413-414. S explicitly makes Codex fleet rate unknown. F `updated_at` dates whole writes, not preserved field observations. |
| Herdr `tokens.fullname,model,effort,rc,fleet_session_id`; tab name | Projector is the inspected display producer for these fields | H projector:338-415 requires matching fleet ID/vendor, emits `rc:?`, clears unavailable model/effort/ID, renames tab. B:herdr/config.toml:123-147 reads tokens for sidebar. B:tools/herdr-btm/src/btmp.ts:117-144 writes different token keys; that shared API alone is not a writer conflict. |
| H fingerprint cache | Projector; runtime `<herdr-projector>/<hash(import.meta.path)>.json` | H projector:452-530 hashes package version, agent fields, selected display tokens and fleet identity fields. Native binding runs first (436-451). Atomic cache write only after successful applies; failed mutations retry. No age expiry; content mismatch invalidates. |
| agx `dispatcher_session`, run state; published rows/counts | Worker state owner, not renderer | B:tools/agx-worker/src/next/run.ts:320-332,371-394 records explicit flag → AGX env → Claude env → Codex env. B:tools/agx-worker/src/next/listing.ts:20-41 counts running rows. B:tools/agx-worker/src/next/store.ts:838-909 serializes publication and atomically writes `current-runs.json`. |
| Statusline scoped rows/counts | S reader derives from the same agx snapshot and explicit session/inventory | S:tools/statusline/src/core-runs.ts:27-115; dispatch-display.ts:63-83; format.ts:234-239. Inventory is deduplicated for counts. Count means running workers outside the displayed inventory, including unattributed workers, not provider sessions. |
| `owner.json` fields and `.last-good` | Sampler owns observations under a directory lock; readers do not refresh them | S:tools/statusline/src/sampler.ts:105-175,182-247; owner-state.ts:149-197. Failed samples preserve prior `at` and attach error. Discovery uses provider process/file evidence (session-discovery.ts:46-180), not Herdr display tokens. |
| `.view` and `.view.last-good`; UI text | Sampler writes pre-rendered location/session/shared strings; presentation reader consumes | S sampler:250-318 builds a per-cwd inventory and passes it to both count and row projection. S presentation.ts:9-10,34-111 validates schema 1, release and scope marker `session-inventory-worker-scope-v3`; 113-173 filters PIDs and labels age over 30s/backup. Selected-session requests bypass this cache. |
| Sampler session context/rate text snapshots | Sampler reads typed fleet values as supplemental observations | S sampler:62-74; snapshot-rate.ts:42-132 matches session ID and fills missing fields, then renders. No `updated_at` check; rate additionally requires Claude vendor and parseable reset times. This consumer does not write F. |

## Invariant results and smallest repairs

### 1. Display must not become authoritative state: FAIL

The Codex hook obtains `pane.tokens.fullname` through `pane.get`
(B:agents/codex/hooks/herdr-identity.ts:28-89). `codexAgentName` inherits a parsed
`agt` suffix, including from another project/session, before considering its
thread-ID digest (same file:15-25). The natural hook passes that name to
`reportToHerdr` (B:agents/codex/hooks/report-herdr-metadata.ts:47-84), which writes
F.name (B:tools/statusline/src/identity.ts:400-418). H preserves and projects
F.name back to `fullname` (H projector:235,379-405). The display therefore supplies
part of the allegedly authoritative name. Matching the pane ID and parsing the
name's shape do not independently bind the inherited suffix to the current thread.
This path is inherited from B, not newly introduced by S.

Smallest remedy: stop inheriting the name suffix from `fullname`; use the existing
thread-derived naming policy, or a separately authoritative current-session name
if one already exists. No new registry is necessary. Acceptance: for one exact
thread/cwd, changing only the pane's valid-looking old `fullname` cannot change
F.name. Include pane reuse with an old occupant's valid name. This condition is
not satisfied by the current code.

Native footer model/effort is another display → F edge (H projector:242-270).
Independent rollout validation proves ID/originator, not equality between native
settings and the footer's model/effort. Native viewport observation may be an
explicit observation authority, but it cannot be described as raw-rollout-only
authority. Authenticity of that viewport and freshness relative to settings remain
UNVERIFIED here; regex shape and three repeated observations are not source
authentication. Do not repair this by inventing model/effort when unavailable.

### 2. One logical writer and concurrent preservation: FAIL

The common helper validates and atomically replaces a complete F record
(B shared fleet-session:136-156). It has no owner token, field restrictions, merge,
lock, compare-and-swap, or source-generation rejection. `writeFleetSessionIfChanged`
adds a read/compare before the same replacement (166-185); this is not a transaction.

There are independent, reachable producers: the natural Codex hook above;
statusline stdin and live paths (S:tools/statusline/src/statusline-main.ts:518,
527-532 → fleet-session.ts:139-159); and H's native binder/fallback. Even serialized
execution loses fields: a rich statusline record followed by `reportToHerdr`
replaces known context/rate with unknown (B identity:413-414). For concurrency,
H can read F0, statusline can write newer context F1, then H can replace F1 with
its F0-derived preserved context. Atomic rename prevents torn JSON, not this loss.
Model/effort and pane fields also have overlapping producers. The comment claiming
statusline is the sole writer (B identity:378-379) is contradicted by these callers.

Smallest remedy: choose one existing runtime producer to own complete F records
and remove the other complete-record writes; or, if existing producers must remain,
enforce field ownership and merge under one serialized read/update/write boundary.
The helper name alone cannot implement that contract. Acceptance: hook publication
cannot erase known context/rate, and a deliberately interleaved projector refresh
cannot roll back a later observation. Scope fields and model/effort must obey the
same rule. Retained context/rate must retain their observation age rather than
becoming fresh whenever unrelated settings change. These failures predate or extend
B; S does not establish exclusive ownership.

### 3. Same Herdr object has disjoint input/output fields: PARTIAL

For `projectAgents` itself, PASS: `agent_session.value`, agent vendor and validated
fleet facts are inputs; tab name and display tokens are outputs. `rc` is explicitly
unknown rather than inherited. The read of old tokens at H projector:491-509 is
for cache invalidation only. `tokens.fleet_session_id` does not select authoritative
identity. Sharing one object/API is not evidence of feedback by itself.

For the complete pipeline, fields are not disjoint: the binder reads and reports
`agent_session` (H projector:195-211,251-295), and the hook reads `fullname` as above.
The full-pipeline UDF claim consequently fails even though the final projection
function's principal fields are disjoint.

### 4. Fallback must independently establish its authority: PARTIAL

H writes registrations using `--source herdr:codex`, then accepts registrations
with exactly that source/kind/vendor on a later fresh list (H projector:42-47,
195-211,251-261). Thus its own reported value can qualify as fallback input if
the Herdr server returns that report as the selected registration. This is a
source-level possible feedback edge; native server selection/expiry code was not
supplied, so persistence of that report in a real fresh list is UNVERIFIED.

Validation is substantial but narrower than pane ownership: exact unique rollout
lookup with bounds (B shared fleet-session:237-273), exact metadata ID, accepted
Codex originator, and creation-cwd equality or filesystem-proven equivalence
(281-314,77-87). It rejects a nonexistent/wrong-vendor/wrong-cwd session; it does
not prove that an old session is still this pane's occupant. Two successive sessions
can share cwd and the old rollout can remain. `updated_at` records observation
time, not independently validated pane-binding time. The positive footer path
checks it three times but writes the registration before its final check
(H projector:245-267), so a failed final check does not undo that report.

Smallest acceptance condition: obtain native source proof that selected registration
is an independently current pane binding, or prevent projector-authored bindings
from qualifying as native fallback. Keep unknown when current binding is unavailable.
Test a fresh agent-list response after reporting, footer disappearance and same-cwd
pane reuse; no production calls are required for an author fixture. H's test at
projector.test.ts:914-959 reuses the locally mutated `agents` array, whose successful
bind has only `{value}` (H projector:273); its clearing result does not establish
fresh-server-list behavior. Do not claim source-label authentication from that test.

### 5. Row scope, count scope and cache scope: PARTIAL

PASS at view construction: S sampler:254-307 and statusline-main:107-123 pass the
same explicit session-ID inventory to `readCoreRuns` and `workerSessions`.
core-runs:37-55 deduplicates it, sums the core's per-session running counts and
subtracts from total running. dispatch-display:69-83 selects live attributed rows
by that inventory. An explicit selected session wins over environment fallback
(dispatch-display:139-149); selected requests bypass prepared repository-scope
text (presentation:155-160). No render write to agx authoritative state was found.

**Defect A, prepared view:** presentation:133-152 hides sessions whose PID cmdline
is unreadable/empty, but returns `row.shared` unchanged. Example: sampled inventory
{A,B}, one still-running worker dispatched by B, then B's provider exits. Reader
shows only A; shared text still includes B's worker and counts against {A,B}, and
can say “outside 2 displayed sessions.” A fresh build against {A} would place that
worker outside. PID reuse also passes the nonempty-cmdline check without proving
session identity. This is an inconsistent pure projection, not reverse flow.

Smallest remedy: invalidate the prepared row when its live session membership
changes and use the existing scoped rendering fallback. Validate the existing
PID/session association sufficiently for the supported provider; do not merely
accept any reused PID. Acceptance: sampled {A,B} → B exits → output worker rows,
outside count and displayed-session count all use {A}, including an empty inventory.

**Defect B, missing-ID input:** S core-runs:35-36 resolves an undefined selector
from environment, whereas dispatch-display:77-80 maps undefined to an empty set.
format:235-238 supplies `df.sid`, not `scan.sessionScope`; build-dataframe:180-183,
323-329 allows undefined sid. For an ordinary stdin frame without session ID and
ambient dispatcher E, counts can use E while worker rows use no sessions. The
unselected discovery paths' explicit `null`/inventory avoid this particular case.
Smallest remedy: pass the already resolved scan scope to row selection. Acceptance:
no payload ID + ambient E uses one scope for counts and rows; an explicit payload
ID still wins; explicit empty inventory must remain empty.

Freshness limits: S agx-snapshot.ts:125-140,183-184,234-249 retains failed reads
and compares owner file mtime to records mtime, preserving `capturedAt` for stale
age; fleet-line:49-50 exposes any positive stale-run age. Prepared view validates
release/scope and labels sample age over 30s or backup use, but does not reread agx
generations while returning prepared text (presentation:138-171). Consequently
the claim is “sampled view with age policy,” not current-at-every-render counts.
The sampler timer runs five seconds after completion (B systemd/statusline-sampler.timer:4-8),
not a hard five-second source-to-screen guarantee. Keep these limits explicit;
they are not themselves proof of reverse flow. Prepared view text never becomes
an authoritative dispatcher identity in the inspected code.

### 6. Native ID versus “no session id” contradiction: PARTIAL

The supplied `/tmp/herdr-owner-list-oct21.json` has exact `herdr:codex` IDs for
`wK:pY` and `wS:pB` with `fullname` saying `no session id`. Its provenance explicitly
omits capture time/server endpoint; it is an excerpt and omits tab IDs. It proves
the reported field disagreement, not its writer, freshness, or feedback cause.

For a successfully projected current row to make this disagreement impossible:

1. Its pane/tab and native registration must refer to the same current occupant.
2. A recognized nonempty ID must reach the projection as either a matched typed
   record or an explicit unavailable observation; a missing record is not missing ID.
3. Writes must succeed, projection must run after binding changes, and a cache hit
   must not preserve conflicting text. A pane identity change during application
   needs detection/retry rather than mixing snapshots.

H enforces part of this: recognized registrations preseed an unavailable entry
(199-203), missing footers attempt validated fallback (207-211), and unavailable
records yield `session unavailable`/`no session file`, not `no session id`
(313-325). It does not invent a name/model/effort. Token content participates in
the fingerprint, binding runs before cache lookup, and failed applies do not
publish a successful cache (436-451,491-530).

It does not enforce universal consistency: rows without pane/tab are skipped
(345), binding/current-list authenticity remains open, and rename/metadata reports
are sequential, not one transaction (397-415). The input list is not reread after
projection. Independent changes and native failure can therefore leave visible
disagreement. The evidence does not establish that H was deployed to the supplied
capture. Acceptance: replay complete owner rows with explicit pane/tab and matching
native metadata; each successful projection with a known ID must avoid the missing-ID
reason, while unavailable names stay honestly unknown. Add failed apply, cache
invalidation, pane reuse and fresh-list cases. Runtime/UI acceptance remains open.

## Verification and handoff

This is a completed bounded source review; implementation acceptance remains OPEN.
Selected Tiger obligations were ownership/overlap, failed and late writes,
persistent fallback, and source-to-consumer validity. Static counterexamples above
establish the missing guards; no live reproduction is claimed. Performance,
capacity benchmarking and GPU work were outside scope. Exceptions: none.

Housekeeping choice: evidence-only document at the promised path; no release
changeset, version bump, changelog, or adjacent fixtures are warranted. The count
definition is the core's running-worker count, with unattributed workers included
in the complement, not a count of provider sessions.

Foreground checks:

- `jj log` resolved H and S to the exact commits and common parent printed above.
- `jj diff` confirmed the shared writer and named hook/identity writer files are
  unchanged from B at the relevant candidates (empty diffs).
- Required Markdown/nonempty check:
  `rumdl check tools/herdr-projector/evidence/udf-audit-oct21.md && test -s tools/herdr-projector/evidence/udf-audit-oct21.md`.
  Result: exit 0, no Markdown issues, nonempty document.
- `jj status`: exactly the promised evidence file added; no production changes.

Coordinator: route concrete repairs for name feedback, fleet write arbitration,
prepared membership invalidation and undefined scope to the existing owners.
Resolve the native registration provenance gap before claiming authoritative pane
binding. Preserve S's existing land lane; this review neither alters nor stops it.
Author acceptance fixtures should exercise the conditions in each finding.
Do not translate source inspection or Markdown success into “UI fixed.”
