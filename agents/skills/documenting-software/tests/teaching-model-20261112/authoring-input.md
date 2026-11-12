# Rill input facts

Rill is a fictional TypeScript library for importing large comma-separated files. These facts are
the complete supported behavior for the documentation task; do not assume extra implementation.

A transport supplies Uint8Array chunks. Chunk boundaries can split a UTF-8 character, a quoted
field or a line ending. A quoted field can contain a newline. The decoder retains incomplete text
and quote state between pushes. A completed row is emitted as cells after the row delimiter is
recognized. The finish operation either emits the final complete row or returns a typed error for
an incomplete quoted field. A failed row is not returned as a valid typed record.

A runtime Schema parses cells into domain values. It checks column count, field conversion and
constraints. Applications select the Schema. Transport bytes, syntactically decoded cells and
validated records are different stages. Rill does not infer a specific static application type
from an arbitrary schema read at runtime. A compiled schema module can carry its fixed TypeScript
type and runtime parser together. Rill's decode() default produces cells without domain typing.

Consumers pull validated records from an async iterator. The importer stops requesting chunks
while the consumer is processing a yielded record. Rill reports byte offsets for diagnostics but
does not expose a durable parser checkpoint or a restart-from-offset API. A byte offset alone does
not encode the quote/UTF-8/header state. Callers own database writes and their retry/deduplication.
The library does not commit external database writes or promise exactly-once external effects.
