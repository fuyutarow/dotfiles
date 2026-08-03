# Local failure corpus — distilled fixtures

These are bounded adversarial fixtures distilled from the triggering session attachment. They are
not another project-status ledger and do not reproduce the source transcript.

## Should fire

| ID | Observed request/state | Failure without governance | Required admission decision |
|---|---|---|---|
| SF-01 | A route inventory was requested while every registered goal was failed or retired. | A dated 178-line audit became an unauthorized quasi-state record. | `freeze`; locate an authorized authority or request ownership before creating state. |
| SF-02 | Missing reverse links prompted an “unconsumed artifact index.” | Another manually maintained ledger would duplicate the registries it indexes. | `derive` the index from declared registries with source manifest and freshness. |
| SF-03 | A handoff request led directly to a 319-line “permanent canonical ledger.” | No authority key, evidence mapping, owner, supersession rule, or review contract existed first. | `freeze`; then `update` an existing authority or admit one draft canonical with review. |
| SF-04 | External reviewability prompted a second 293-line “current state” document. | The review copy silently became a second authority with no decision, evidence cut, or expiry. | Create a small review request; optionally `derive` an expiring packet; update canonical after review. |
| SF-05 | A Skill reference named a version/durability owner that did not exist. | Future authors could neither resolve nor safely replace the owner. | `update` the pointer or explicitly admit the missing owner; never leave an ownership void. |
| SF-06 | Facts conflicted across several R&D documents. | Single-document restructuring could make one file tidy while leaving global authority divergent. | Freeze the authority decision, update one canonical, derive views, and retire competitors. |
| SF-07 | A canonical title changed during an ordinary update, so an agent issued a new month/sequence and left the old file active. | One authority became two identities; links and review history split even though no new document passed admission. | `update` the existing ID/path; title changes never allocate or rename. |

## Should not fire

| ID | Observed request/state | Correct owner |
|---|---|---|
| NF-01 | Facts are duplicated only across sections of one report. | `structuring-documents` |
| NF-02 | One task must survive compaction, executor change, or handoff. | `continuing-long-running-tasks` |
| NF-03 | A multi-source literature claim needs provenance and reconciliation. | `systematizing-knowledge` |
| NF-04 | A selected research frame has candidate theses that must be compared. | `directing-research` / `forging-novel-theses` |
| NF-05 | A finished manuscript claim needs calibration and red-team review. | `arguing-research-papers` |
| NF-06 | One ordinary README or source file needs a local rename with no R&D portfolio policy. | repository/domain owner |

## Acceptance use

Every future reforge must desk-check these fixtures against the public descriptions. The test passes
only when SF cases route here for an admission/lifecycle decision and NF cases retain their existing
owners. No fixture licenses automatic file creation or deletion.
