# inspectReceipt(id)

Scope: exact API lookup for callers who already have a configured client. Setup and the complete
save workflow are documented in the site's getting-started guide, outside this review extract.

`client.inspectReceipt(id: ReceiptId): Promise<Result<Receipt, LookupError>>`

Looks up the current receipt by its validated identifier. It performs one read and makes no writes.
Success returns `Receipt { id: ReceiptId, revision: bigint, payload: Uint8Array }`.
`NotFound` means no visible receipt was found; `Unavailable` means the service did not answer.
Neither error proves that a previously submitted write failed. Do not resend a write based on this read.

```ts
const result = await client.inspectReceipt(receiptId);
if (result.isOk()) render(result.value.payload);
else showLookupError(result.error);
```
