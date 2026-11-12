# Supplied documentation: Relay

The following four pages are the complete extract for this review. Other linked documents exist
outside the extract; their contents are not available here.

## Page: index.md — Relay

Relay is a reusable TypeScript SDK and job coordinator. Teams build workflow applications on it.
The current application is Release Desk, which approves and dispatches release jobs. Relay can also
be used without Release Desk. See architecture.md for components, first-run.md for a first job and
api.md for exact lookup. Production deployment settings belong to the host application's operator.

## Page: architecture.md — Components and contracts

The coordinator stores Job records and accepts signed commands. A Job has an organization ID,
payload bytes, a revision and queued/running/completed status. Command admission checks the current
organization Operator capability and expected revision. The coordinator does not interpret payload
fields, reviewer roles or Release Desk approval states.

The TypeScript SDK validates application payloads, assembles commands, asks the host signer to sign,
and checks command receipts. Release Desk defines reviewer roles and validates that a release has
been approved before calling the SDK. The UI calls Release Desk. A Job created by another client
can be read through the same SDK; decoding validates the expected application schema.

An executor adapter polls jobs and performs their external work. The host supplies the adapter,
its credentials and a receipt store. Different adapters can execute the same kind of payload.
The coordinator's completed status records the completion command sent by an authorized operator.
The host receipt store records the external operation's receipt. SDK submission success returns a
command receipt. The component API contracts are the authority for exact admission behavior.

Components may be deployed separately. Organization boundaries are checked at command admission.
The SDK package depends on the coordinator transport and payload codec; Release Desk depends on
the SDK. The coordinator has no Release Desk dependency. Applications may add their own executor.

## Page: first-run.md — Submit and observe a job

Begin with a local coordinator and a host-created organization Operator. Host provisioning is
outside this example. Supply coordinatorUrl, operatorSigner and receiptStore from your host setup.

```ts
const relay = connect({ coordinatorUrl, operatorSigner, receiptStore });
const payload = releaseDesk.validate({ release: "1.0", approved: true });
const submitted = await relay.submit(payload);
if (submitted.ok) {
  const run = await relay.getRun(submitted.value.jobId);
  if (run.isOk()) displayStatus(run.value.status);
  else displayReadError(run.error);
} else displaySubmitError(submitted.error);
```

This example uses Release Desk's payload. A different application supplies its own schema and
validation function. An executor and its external credentials must be running for work to execute.
See the host setup guide for provisioning, and executor reference for the adapter protocol.
This example demonstrates submission and one lookup; it does not promise immediate completion.

## Page: api.md — getRun(id)

Scope: lookup by callers who already have a configured Relay client. Setup is in the host guide.

`getRun(id: JobId): Promise<Result<Run, ReadError>>`

Reads one coordinator Job; makes no writes and starts no external operation. A successful Run has
jobId, organizationId, revision and queued/running/completed status. The payload is omitted.
NotFound means no Job with that ID is visible to this caller; Unavailable means the coordinator
could not be reached. Neither result establishes whether external work happened. Callers may retry
the read with the same ID. The first-run page demonstrates success/error handling.
