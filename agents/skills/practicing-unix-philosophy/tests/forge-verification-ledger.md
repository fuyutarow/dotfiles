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
