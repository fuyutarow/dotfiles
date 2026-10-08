# Changelog

## 0.1.3

- Allow small hook writes to the current user's session scratchpad below the storage deny line.

## 0.1.2

- Replace the detached checkout-size measurement with bounded synchronous probes and a shared per-repository cache entry.

## 0.1.1

- Keep unknown checkout sizes from blocking small `jj` repositories while a bounded background measurement fills the cache.

## 0.1.0

- Add the read-only `storage-headroom` CLI over the shared storage policy.
