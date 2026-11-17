| row term | fact | owner (file:line) | location (file:line) | verdict | quote of owner | quote of location |
| --- | --- | --- | --- | --- | --- | --- |
| checkpoint | checkpoint definition | glossary:glossary.md:5 | guide.md:3 | mismatch | A saved state that a restart resumes from. | A checkpoint is a saved position in the log. |
| checkpoint | checkpoint definition | glossary:glossary.md:5 | overview.md:3 | mismatch | A saved state that a restart resumes from. | A checkpoint is a snapshot written every 30 s. |
| export_csv | export_csv availability | guide.md:5 | overview.md:5 | mismatch | `export_csv` is available since 1.2. | `export_csv` is 未実装 in this release. |
| lease | lease definition | glossary:glossary.md:6 | overview.md:7 | mismatch | A time-bounded right to act on a resource. | A lease is a lock that never expires. |
| mise run check | the gate command | overview.md:6 | guide.md:6 | qualifier-omitted | The gate is `mise run check`. | The gate is `mise run check`; add `check:chain`… |
| retry_timeout | retry_timeout default | overview.md:4 | guide.md:4 | match | The `retry_timeout` is 30 s by default. |  |
