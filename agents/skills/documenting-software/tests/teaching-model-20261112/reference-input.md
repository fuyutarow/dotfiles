## Page: api.md — getRun(id)

Scope: lookup by callers who already have a configured Relay client. Setup is in the host guide.

`getRun(id: JobId): Promise<Result<Run, ReadError>>`

Reads one coordinator Job; makes no writes and starts no external operation. A successful Run has
jobId, organizationId, revision and queued/running/completed status. The payload is omitted.
NotFound means no Job with that ID is visible to this caller; Unavailable means the coordinator
could not be reached. Neither result establishes whether external work happened. Callers may retry
the read with the same ID. The first-run page demonstrates success/error handling.
