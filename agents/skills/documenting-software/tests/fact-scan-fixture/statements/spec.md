# Spec

The ledger is replicated to
three regions, and a write completes within 200 ms.

| Feature | Status | Limit |
| --- | --- | --- |
| export_csv | 未実装 | 10 MB |
| audit_log | 実装済み | 5 回 |

- `snapshot` は、一定時間ごとに保存される状態です。
- Retention: 30 件 per bucket.

```toml
retry_timeout = "30s"
```
