# Unix philosophy — distillation and verification record

## Outcome and placement

The requested outcome is a Unix-philosophy SoK and an operational skill with substantial original
passage quotations. The initial draft reduced the subject to tool boundaries, relied on the book's
contents for several important claims, and gave qualifications more space than the positive account.
The user rejected that scope and explicitly requested unix in the name.
This package replaces that draft; it is not an additional entry alongside it.

The distinguishing job is to apply the connected Unix design approach to responsibilities,
data, reuse, interaction layers and learning through prototypes.
The CLI owner still specifies protocols, the interaction owner designs behavior, and the
refactoring owner performs behavior-preserving edits. The entry composes these decisions without
reproducing their contracts. Their reciprocal pointers and the active catalog use the new name.

## Source and synthesis evidence

The canonical position is `urn:uuid:01a12617-62e2-7590-a783-533a10598156`.
Its existing identity and unit are preserved. The corpus contains the position, protocol, claim
ledger, two retained initial captures and thirteen new chapter/history captures.
The new captures represent twelve portions of one Gancarz book and one McIlroy publication,
not thirteen independent corroborating studies.

Primary chapter content was obtained through a reproduction of the author's text.
Edition metadata was checked against the publisher preview; inconsistent host footer data was rejected.
Japanese quotations are supplied excerpts whose meanings were compared with the English text;
exact fidelity to a published Japanese translation was not certified.
The author-hosted Research UNIX Reader PDF was retrieved and pp.5–6 read through pypdf.

The survey now separates source claims, conceptual synthesis and adaptation.
It preserves the author's positive first/second/third-system account and his broad filter model,
including sensor and GUI inputs. It also retains his own allowances for a human-facing layer,
destructive-operation interaction and compiled implementations when runtime cost matters.

## Retrieval and admission

`repo-retrieve index --timeout-ms 60000` succeeded on 2026-10-10:
1,636 files, 19,496 chunks, 7 reprocessed, zero errors.
The three-query JA/EN battery returned the prior draft and interaction/delegability passages.
Those hits justified the explicit boundaries; no absence verdict is claimed.

The new name and description add 487 characters to the 50,736-character baseline.
The collection remains 58 skills. The listing ceiling is pinned to the measured 51,223-character total.
These are static characters, not measured charged tokens or proof of benefit.

## Serial content review

| Review criterion | Observation |
|---|---|
| Preserve every supplied major theme | Flexibility, smallness, single responsibility, filters, portability, leverage, captivity, prototypes, three systems and useful scope have substantive homes. |
| Cover the complete major-principle set | The source guide maps all nine; data portability and script composition are also in the operating instructions. |
| Distinguish the lesser principles | All ten are summarized separately with their differing purpose and force. |
| Explain the positive third-system lesson | The core preserves the first concept, selects useful second-stage features and expertise, and pursues balanced capability and cost. |
| Preserve the source's broad filter model | Sensors, GUI events and error statuses are inputs, rather than categorical exceptions. |
| Honor the quotation preference | Supplied quotations appear in both the operational core and the source explanation, attached to their meaning. |
| Keep the source guide about the subject | Installation, index repair and listing measurements appear here; they are absent from the thematic explanation. |
| Use a discoverable Unix name | Directory and frontmatter are both practicing-unix-philosophy; catalog and sibling pointers agree. |

## Execution check

An independently constructed name-processing example was run with newline-delimited records:

```sh
printf '%s\n' bob alice bob | LC_ALL=C sort | uniq -c
```

Observed result: one alice record and two bob records.
Replacing the consumer with `uniq` produced alice and bob once each while preserving the source
and sorter. This demonstrates the promised reusable composition on one concrete path.
It is not a throughput benchmark or a general improvement measurement.

The invalid-option failure was also exercised under zsh's pipefail option:

```sh
zsh -c 'setopt pipefail; printf "%s\n" bob | sort --no-such-option | uniq'
```

The middle stage rejects the option with a diagnostic and the pipeline exits nonzero.
The example therefore distinguishes a failed stage from a successful empty result.

Structure, catalog, selected-change listing budget and installed symlink targets are checked
with the repository's skill checker and mise tasks. Prose-length warnings are review signals;
some correspond to the supplied quotations. They do not establish selection or conduct accuracy.
These checks and the content review are serial. No independent evaluator, live selector accuracy,
or matched comparison against the old manual is claimed.

Final receipts on 2026-10-10:

- `soks-govern validate`: 16 changed/new documents, zero changed-document failures and zero introduced failures.
- `soks-govern land` through the declared mise environment: document commit
  `e2618b8af5830e80f17add9ef2955907a073e561`, index commit
  `0cd94d2aacba62132cf38c70ce24dce238203085`; the corpus working copy is clean.
- `mise run lint:skills-index`: passed for the selected jj change.
- `mise run lint:skills-floor`: passed for the selected jj change, 58 skills and 51,223 listing characters.
- `mise run lint:skills-wiring`: passed after `mise run link:skills`.
- `mise run lint:config-map`: passed, 76 registered surfaces.
- The new Claude and Codex paths resolve to the renamed package; the old Claude link was pruned.
- The name-count and substituted-consumer paths succeeded; the failed-middle-stage probe exited 2.

## 2026-10-15 — three-part operating outline, superseded

The user requested revision and reorganization so the skill's outline is clear.
The existing seven peer sections mixed tool boundaries, data interfaces and the learning cycle.
Acceptance: make those three decisions visible at the start, preserve the nine major principles
and their substantive quotations, and keep source interpretation separate from ordinary execution.

The body now groups the instructions under small reusable tools, explicit data interfaces,
and growth through prototypes and demonstrated needs. These headings are an operating grouping
of the existing account. The source guide retains the nine-tenet mapping and ten lesser principles.
The design/review starting point precedes the principles; checking and delivery follow them.
The survey locator and discussion of supplied headings and creative information live in the source
guide. Quotation fidelity remains qualified in both the entrypoint and the source explanation.
Name, description, discovery policy and sibling ownership are unchanged.

The entrypoint now makes quiet data channels and observable failed stages explicit.
The CLI owner retains the detailed stdout/stderr and outcome contract.
Shell guidance allows stage-status inspection or pipefail and accounts for intentional early
consumer termination. This closes the documented gap between the earlier failure probe and the
instructions an executor normally reads.

Checks run on the working files:

- `mise exec -- bun agents/skills/forging-skills/scripts/skill-check.ts agents/skills/practicing-unix-philosophy`:
  exit 0. Length warnings remain in the body and source guide; review retained the supplied
  quotations and explanatory passages. They are readability signals, not structural failures.
- `mise run lint:skills-floor`: exit 0; 57 skills, 50,329 name-plus-description characters.
- `mise run lint:skills-index`: exit 0; catalog complete.
- Under `zsh -c 'setopt pipefail; …'`, the documented name-count example produced one alice
  and two bob records; replacing `uniq -c` with `uniq` produced alice and bob once each.
  The intermediate sorted stream was alice, bob, bob. All three commands exited 0.
- With the same shell option, `printf "%s\n" bob | sort --no-such-option | uniq` emitted a
  diagnostic and exited 2. `printf "" | LC_ALL=C sort | uniq` emitted nothing and exited 0.
  These exercise the failure-versus-empty-result distinction on this host.

Serial review also retained the indivisible-transaction exception, binary inspection/export,
human-judgment interaction and required correctness in the supported scope.
No independent evaluator, live selector test, or matched outcome improvement is claimed.

Deployment check: `mise run lint:skills-wiring` exited 0 for the repository tree.
`mise run skills:sync -- --in-house-only` exited 1 before copy installation:
`claude plugin marketplace list --json` produced a pretty-printed JSON array, while
`scripts/skills-sync.ts` attempted to parse only its last line (`]`). The marketplace already
points at this checkout. The installed Claude plugin reads `agents/skills` from this checkout
but is disabled at user scope. Its enabled state is outside this content revision.
The selected Codex package is installed separately with the declaration's pinned installer:
`mise exec -- bunx --bun --yes skills@1.5.22 add /home/fuyu/dotfiles/agents/skills --skill practicing-unix-philosophy -g --agent codex --copy -y`.

## 2026-10-15 — preserve the author's nine-plus-ten outline

The user challenged the three-part outline because it obscured the nine major principles and
the lesser principles, and supplied a numbered practical account of the nine major principles.
The three-part grouping above was this revision's editorial choice; it was not a reduction proved
from the source or a replacement set of principles. It is superseded.

Acceptance: expose all nine major principles in the source order, keep the ten lesser principles
separately identifiable, and attach practical actions and qualifications to the relevant item.
The body now follows that outline. Smallness is distinct from single purpose; portability from
text data; reuse from script composition; noncaptive interfaces from filters.
The three-systems account is subordinate to prototyping. Quiet output and useful common scope
are subordinate to lesser principles 5 and 8. The source guide retains the detailed explanation
of all ten lesser principles. The three-part taxonomy is removed from current instructions.

The supplied modern examples are illustrations, not evidence of historical derivation or universal
performance benefits. The revision retains contextual judgments about size, indivisible operations,
performance, binary data, human interaction and stateful filters.
No live selector accuracy or comparative outcome improvement is claimed.

The affected-package skill checker, `mise run lint:skills-floor` and
`mise run lint:skills-index` all exited 0. The collection remained 57 skills and 50,329
name-plus-description characters. The heading inventory shows major principles 1–9 in order,
followed by the separate lesser-principle section and its ten-entry table.
Existing prose-length warnings remain; no runtime helper or pipeline example changed.

## 2026-10-15 — make all ten lesser principles actionable

The user requested decision and action guidance for every lesser principle, preserving the
nine-plus-ten distinction. The body now has ten numbered lesser-principle sections with relevant
conditions, actions and checks. The nine major-principle sections are unchanged from the previous
installed copy. The source guide keeps the meaning table and points to the body for execution.
No description, registration, runtime helper or sibling contract changed.

Serial desk review covered these decisions:

| Lesser item | Reviewed practical choice |
|---|---|
| 1 | Expose legitimate configuration changes while retaining required invariants. |
| 2 | Keep optional work outside the essential core after comparing boundary costs. |
| 3 | Choose concise readable names while preserving ecosystem and public naming contracts. |
| 4 | Retain searchable sources and reusable data behind rendered information. |
| 5 | Preserve clean data output and observable failures or meaningful waits. |
| 6 | Separate independent work from dependencies and shared state before parallel execution. |
| 7 | Try a useful new producer/consumer combination before adding a built-in feature. |
| 8 | State supported scope, omissions and required correctness. |
| 9 | Compare adoption and delivery burdens within that scope while retaining required guarantees. |
| 10 | Give names and responsibilities coherent levels and one home without hiding data flow. |

A supplied secondary summary mixed in shallow/dynamic binding, prototyping and script composition
as lesser items 8–10, and asserted a master-precept pyramid. Rechecked
[the author's §1.4](https://flylib.com/books/en/2.506.1.13/1/) and
[the publisher preview](https://api.pageplace.de/preview/DT0400.9780080510347_A23526296/preview-9780080510347_A23526296.pdf),
contents §§7.8–7.10: the retained items are the 90-percent solution, worse is better and hierarchy.
The inspected outline does not establish the supplied master-precept pyramid; it is not adopted.
The primary-text host and translation-fidelity limits stated above still apply.

The affected-package checker, `mise run lint:skills-floor`, `mise run lint:skills-index` and
`mise run lint:skills-wiring` exited 0. The listing remained 57 skills and 50,329 characters.
Length warnings remain (13 body sentences and 12 source-guide sentences at this check).
These are structural checks and serial content review, not live selector or matched outcome evidence.
The unchanged pipeline example was not rerun for this instruction-only expansion.
