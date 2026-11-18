| row term | fact | scope | owner (file:line) | location (file:line) | verdict | quote of owner | quote of location | context |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| checkpoint | checkpoint definition | same | glossary:glossary.md:5 | guide.md:3 | mismatch | A saved state that a restart resumes from. | A checkpoint is a saved position in the log. | guide.md:1-7 |
| checkpoint | checkpoint definition | same | glossary:glossary.md:5 | overview.md:3 | mismatch | A saved state that a restart resumes from. | A checkpoint is a snapshot written every 30 s. | overview.md:1-7 |
| export_csv | export_csv availability | same | guide.md:5 | overview.md:5 | mismatch | `export_csv` is implemented since 1.2. | `export_csv` is 未実装 in this release. | overview.md:1-7 |
| lease | lease definition | same | glossary:glossary.md:6 | overview.md:7 | mismatch | A time-bounded right to act on a resource. | A lease is a lock that never expires. | overview.md:1-7 |
| mise run check finishes | the gate duration | same | overview.md:6 | guide.md:6 | qualifier-omitted | The gate `mise run check` finishes within 5 min. | The gate `mise run check` finishes within 5 min; add `check:chain`… | guide.md:1-7 |
| retry_timeout | retry_timeout default | same | overview.md:4 | guide.md:4 | mismatch | The `retry_timeout` is 30 s by default. | The `retry_timeout` is 60 s by default. | guide.md:1-7 |
| [unit:time] | time values | same | overview.md:4 | guide.md:4 | match | The `retry_timeout` is 30 s by default. | The `retry_timeout` is 60 s by default. | guide.md:1-7 |
| [unit:time] | time values | same | overview.md:4 | overview.md:3 | match | The `retry_timeout` is 30 s by default. | A checkpoint is a snapshot written every 30 s. | overview.md:1-7 |
| [unit:time] | time values | same | overview.md:4 | overview.md:6 | match | The `retry_timeout` is 30 s by default. | The gate `mise run check` finishes within 5 min. | overview.md:1-7 |
| [unit:time] | time values | same | overview.md:4 | guide.md:6 | match | The `retry_timeout` is 30 s by default. | The gate `mise run check` finishes within 5 min; add `check:chain`… | guide.md:1-7 |
