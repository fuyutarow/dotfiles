# Driving Serena — forge verification ledger

> **Snapshot**: 2026-07-27. Re-fetch every official source on reforge.
> This ledger owns provenance, calibration, placement, and verification history.

## Existence gate — reopened and passed

The first audit rejected a static Serena skill because `initial_instructions` and live schemas
already own tool semantics. The user then supplied a second live session with failures that
survived that dynamic manual:

- the intended Julia language server recognized no files until project configuration changed;
- the active client retained startup state after standalone health checks became green;
- Serena, Julia LSP, CocoIndex, and multiple clients exhausted the parent process's FD budget;
- project memories required canonical-source reconciliation;
- Codex and Claude needed different Serena contexts and fresh server processes.

These are reusable operating decisions, not tool documentation. The skill therefore owns
capability, resource, memory, and routing gates while Serena remains the sole source for schemas.

## Source-grade table — SOLE home

| Rule or claim | Grade | Evidence / handling |
|---|---|---|
| dynamic manual and tool subset | author-confirmed | Serena official source/docs; never freeze a catalog |
| client-specific context and cwd-derived project | author-confirmed, dated | official client/CLI sources; a no-boundary cwd may activate nothing |
| project health/index and memory commands | author-confirmed, dated | official running/workflow docs; call `--help` live |
| language-server, active-project, read-only, and tool-exposure config | author-confirmed | official project template/config docs |
| health check is a sample and logical failure may still exit zero | author-confirmed, dated | official CLI implementation; require target-locus probes and report/log evidence |
| index mutates cache/config and can exit zero after file failures | author-confirmed, dated | official workflow docs and CLI implementation; inspect counts, failures, log, and cache |
| memory checker may exit zero with findings | author-confirmed, dated | official memory docs and CLI implementation; inspect stdout |
| stdio and HTTP have different process owners | author-confirmed | official running docs and MCP implementation |
| FD/process failure and isolation sequence | live-session | user-provided command trace, 2026-07-27 |
| PROJECT-CAPABILITY, RESOURCE-BUDGET, MEMORY-IS-CACHE gates | skill-supplied | constructed from the observed failure chain |
| memory checker is not a factual-freshness oracle | skill-supplied | checker plus canonical-source separation |

## Official-source snapshot

Audited Serena HEAD `9a9d07e83d8c1cba3458992707f440c624446c6d`
(`1.6.2.dev0`) and release `v1.6.1`:

- tools and dynamic subsets:
  <https://oraios.github.io/serena/01-about/035_tools.html>
- live initial instructions:
  <https://github.com/oraios/serena/blob/9a9d07e83d8c1cba3458992707f440c624446c6d/src/serena/tools/workflow_tools.py>
- Codex and Claude Code setup:
  <https://github.com/oraios/serena/blob/9a9d07e83d8c1cba3458992707f440c624446c6d/docs/02-usage/030_clients.md>
- project CLI and state:
  <https://github.com/oraios/serena/blob/9a9d07e83d8c1cba3458992707f440c624446c6d/docs/02-usage/020_running.md>
- project configuration:
  <https://github.com/oraios/serena/blob/9a9d07e83d8c1cba3458992707f440c624446c6d/src/serena/resources/project.template.yml>
- memories:
  <https://github.com/oraios/serena/blob/9a9d07e83d8c1cba3458992707f440c624446c6d/docs/02-usage/045_memories.md>

## Live-session failure ledger

| Trigger | Wrong state or action | Correction | Observed signal / classification |
|---|---|---|---|
| prepare search before a research run | CocoIndex index was current, but its daemon could not spawn under FD pressure | stop the task-owned daemon and isolate Serena validation | spawning resumed; diagnosis evidence only |
| Serena for a Julia repository | Julia language-server coverage was empty | repair project config, run health check, then index | sample symbols plus 274 indexed files; target-locus proof still task-specific |
| config repaired while client stayed open | the connected task retained startup state | start a new Serena server process | the new task saw the new context/language set; transport-specific restart still required |
| repeated Serena/client processes | parent soft limit was 1024 with 1013 FDs used | inspect owner and raise the live limit as a diagnostic | 65,536 restored spawning: `DIAGNOSIS_CONFIRMED`, not durable repair |
| concurrent Serena/LSP instances | task-owned pairs consumed about 3.7 GiB | stop only the three pairs created by the task | bounded cleanup evidence; global lifecycle remained red |
| client registration | generic/stale contexts selected the wrong behavior | correct live Codex/Claude entries | live connection evidence only; canonical installer remained red |
| project onboarding | no durable project memories | create six focused memories and check references | checker reported zero errors; factual and repository persistence remained separate |
| CocoIndex acceptance | do not leave the daemon resident beside experiments | one reindex/search cycle, then stop | 379 files, 13,956 chunks, zero index errors |

The exact counts are dated evidence, not runtime thresholds.

## Post-repair audit — unresolved outside this Skill

A read-only audit later on 2026-07-27 found that the immediate FD ceiling had moved, but the
lifecycle defect remained:

- the app server had exceeded 1,300 descriptors after its soft limit changed from 1,024 to 65,536;
- 39 Serena servers and dashboards plus 13 Julia language servers were resident;
- several Serena servers were more than one day old;
- the committed `.mcp.json` still used deprecated `ide-assistant` and fixed `--project .`;
- `scripts/install-mcp.ts` rendered one shared Serena plan for Claude and Codex.

The live Claude and Codex registrations were corrected, but rerunning the committed installer
would regress them. This is a deterministic harness defect, not a Skill concern. It requires a
client-specific installer change under `operating-the-harness` and behavior-change discipline.
Likewise, the Skill can require ownership evidence and graceful cleanup but cannot repair already
orphaned processes by instruction alone.

Project persistence also remained separate from the Skill: the repaired Serena project files and
some memories were uncommitted or ignored in their own repositories. A successful standalone
health check does not establish that durable repository state.

## Calibration inversion

| | Serena source audience | Agent consumer |
|---|---|---|
| dominant error | underusing semantic tools | inverse risk: trusting listed tools and spawning more services without capability/resource proof |
| corrective bias | use Serena before text tools | use Serena only after project/language proof; route other operation shapes away |
| prominence | symbolic workflow | capability receipt, resource branch, memory cache rule, and no-fire set |

## Placement and reciprocal seams

| Sibling | Resolution |
|---|---|
| `driving-cocoindex` | reciprocal SYMBOL-vs-CONCEPT pointer lands in the same change |
| `operating-the-harness` | its generic MCP-lifecycle and tool-specific-driver pointer already names the owning layers; explicit `driving-serena` naming deferred to its next prose-debt reforge |
| `implementing-and-debugging` | existing scope owns behavior-changing work; this skill declares instrument-only precedence |
| `refactoring-code` | existing LSP-oracle rule already supplies the reciprocal semantic-refactor seam |
| `writing-julia` | existing scope owns Julia code/experiments; explicit Serena-LSP pointer deferred to its next prose-debt reforge |
| `running-python-tools` | reciprocal uv-mechanics-vs-Serena-semantics pointer lands in the same change; description is 1,008 chars and its pre-existing long-prose floor remains 5 → 5 with no body prose touched |
| `raising-resolution` | remains a silent sub-step; no reciprocal edit needed |

## Trigger desk-check

Desk-check only `name` + `description` against nearby skill descriptions.

| Query | Expected | Result |
|---|---|---|
| 「Serena が Julia language server 0件。シンボル解析まで直して」 | FIRE | PASS — explicit Serena LSP capability failure |
| "Tools are listed, but Serena cannot parse the target TypeScript file" | FIRE | PASS — listed-but-unusable parse failure |
| 「実験前の検索基盤で FD 枯渇。Serena と ccc を分離検証して」 | CO-FIRE | PASS — Serena triage first, then `driving-cocoindex` |
| "Serena project memory says an old task name; reconcile it with mise" | FIRE | PASS — Serena memory-integrity trigger |
| "The standalone health check passes, but this client still sees the old project" | FIRE | PASS — Serena project/startup-state trigger |
| "Find every literal TODO" | NO-FIRE native | PASS — exhaustive literal route is native |
| 「識別子不明の概念検索」 | NO-FIRE `driving-cocoindex` | PASS — identifier-unknown concept cut |
| "Serena handshake fails and no tools load" | `operating-the-harness` FIRST | PASS — frontmatter stop |
| 「Julia の数値実験を実装して回す」 | NO-FIRE `implementing-and-debugging` + `writing-julia` | PASS — Julia code/experiment cut |
| "Refactor this God class" | `refactoring-code` FIRST | PASS — no Serena operation requested |
| "What is Serena?" | NO-FIRE plain answer | PASS — explanation is not operation |

Extended near-miss checks also passed after reciprocal edits:

| Query shape | Route |
|---|---|
| direct Serena memory list/delete | live operation; no Skill ceremony |
| Serena install/pin/version/help | `running-python-tools` |
| generic OS FD exhaustion without Serena ownership | owning system/harness diagnosis |
| edit Serena registration/renderer | `operating-the-harness`; behavior-change discipline if code changes |
| fix Serena's own Python source | `implementing-and-debugging` then `writing-python` |
| every lexical call-site occurrence | native `rg` |
| semantic callers of a known symbol | `driving-serena` |
| multi-line structural text pattern | `driving-cocoindex` structural search |
| successful connection with stale HTTP state | `driving-serena`; require a new server PID |

## Verification findings

| Check | Result |
|---|---|
| atomic reference/ledger check | PASS; no output |
| system `quick_validate.py` via uv | PASS: `Skill is valid!` |
| `skill-check.ts driving-serena` | PASS; zero FAIL and zero prose-debt WARN |
| description budget | PASS: 1,016 characters, below the 1,024 API-skill cap |
| skill index | PASS: `mise run lint:skills-index` |
| reciprocal floors | `driving-cocoindex` stays 24/20/1; `running-python-tools` stays 5 and its description is reduced to 1,008 characters |
| collection floor | no FAIL outside unrelated `turnstile-spin` baseline and concurrent user edits in `orchestrating-agents` |
| trigger desk-check | PASS: 11 primary rows plus 9 extended near misses |
| adversarial architecture/operations lenses | initial nine false-green classes fixed; fresh final red-team found no remaining semantic or safety P0/P1 |
| link pass | `mise run link:skills` PASS; Claude per-skill and Codex whole-tree symlinks resolve to this source |
| whitespace | `git diff --check` PASS |

Hostile findings resolved:

1. Split `DIAGNOSIS_CONFIRMED` from durable resource repair and require fresh-server repeated-cycle
   stability.
2. Moved registration mutation/acceptance to `operating-the-harness`; this Skill accepts its
   external receipt only.
3. Bound capability to the actual expected target locus; a nonempty unrelated result never passes.
4. Made health, index, and memory exit status non-evidence and required their reports/findings.
5. Added transport-specific lifecycle, new-server identity, PID/start-time revalidation, and
   survivor checks.
6. Made edit-owner skills select Serena before SR1–SR4 and separated semantic queries from edits.
7. Resolved lexical/exhaustive, structural, concept, and semantic-reference routing.
8. Removed the static CLI catalog; live instructions/help remain authoritative.
9. Added no-fire cuts for direct memory CRUD, version/help/install, registration edits, generic FD
   trouble, and Serena's own Python source.
