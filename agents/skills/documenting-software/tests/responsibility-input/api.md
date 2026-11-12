# getRecord

Returns a verified record, or a typed read failure. The caller supplies its ID. It performs no writes
and asks for no signature. A protected body requires a read session supplied separately. A network
failure returns Unavailable; a denied body returns AccessDenied. Neither is an empty successful result.

```ts
const result = await client.getRecord({ id });
if (result.ok) renderMetadata(result.value);
else showReadError(result.error);
```

This exact reference is for callers already familiar with a record. It does not promise a complete
application tutorial or library implementation guide. No particular internal library is required.
