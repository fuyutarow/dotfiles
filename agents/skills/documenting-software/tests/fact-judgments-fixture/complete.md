| row term | fact | scope | owner (file:line) | location (file:line) | verdict | quote of owner | quote of location |
| --- | --- | --- | --- | --- | --- | --- | --- |
| checkpoint | checkpoint definition | same | glossary:glossary.md:5 | guide.md:3 | mismatch | A saved state that a restart resumes from. | A checkpoint is a saved position in the log. |
| checkpoint | checkpoint definition | same | glossary:glossary.md:5 | overview.md:3 | mismatch | A saved state that a restart resumes from. | A checkpoint is a snapshot written every 30 s. |
| export_csv | export_csv availability | same | guide.md:5 | overview.md:5 | mismatch | `export_csv` is implemented since 1.2. | `export_csv` is 未実装 in this release. |
| lease | lease definition | same | glossary:glossary.md:6 | overview.md:7 | mismatch | A time-bounded right to act on a resource. | A lease is a lock that never expires. |
| mise run check finishes | the gate duration | same | overview.md:6 | guide.md:6 | qualifier-omitted | The gate `mise run check` finishes within 5 min. | The gate `mise run check` finishes within 5 min; add `check:chain`… |
| retry_timeout | retry_timeout default | same | overview.md:4 | guide.md:4 | mismatch | The `retry_timeout` is 30 s by default. | The `retry_timeout` is 60 s by default. |
| (hand) | a lease never expires | same | glossary:glossary.md:6 | overview.md:7 | mismatch | A time-bounded right | a lock that never expires |
| [unit:time] | time values | same | overview.md:4 | guide.md:4 | match | The `retry_timeout` is 30 s by default. | The `retry_timeout` is 60 s by default. |
| [unit:time] | time values | same | overview.md:4 | overview.md:3 | match | The `retry_timeout` is 30 s by default. | A checkpoint is a snapshot written every 30 s. |
| [unit:time] | time values | same | overview.md:4 | overview.md:6 | match | The `retry_timeout` is 30 s by default. | The gate `mise run check` finishes within 5 min. |
| [unit:time] | time values | same | overview.md:4 | guide.md:6 | match | The `retry_timeout` is 30 s by default. | The gate `mise run check` finishes within 5 min; add `check:chain`… |
