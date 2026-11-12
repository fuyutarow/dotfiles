# Storage architecture

Core responsibilities are L-STORE, L-QUERY, L-SCOPE, L-ATTEST, L-IMAGE and the host adapter portion.
The system uses a record chain, a blob service and an encryption service. See the operation table.

## Operation table

The table in this supplied extract contains the application's import and material-view operations.
An import prepares a blob, then submits its reference in a record transaction. A confirmed blob is
not a confirmed record; a lost transaction response is unknown. Retain the operation digest and
reconcile it before any new submission. This application table does not enumerate core SDK APIs.

## Supporting services

The record chain holds record references and authorizes protected reads; the blob service stores
large payloads; the encryption service wraps protected payloads and releases keys after authorization.
The SDK assembles and verifies the requests; the host supplies endpoints and signing capabilities;
the application selects the content and its access policy. A payload may also be inline in a record.
