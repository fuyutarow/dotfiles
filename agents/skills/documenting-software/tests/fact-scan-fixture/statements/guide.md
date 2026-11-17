# Guide

A write completes within 500 ms.

| Feature | Status | Limit |
| --- | --- | --- |
| export_csv | 未確認 | 10 MB |
| audit_log | 未実装 | 5 回 |

`snapshot` とは、毎回の再起動で破棄される一時状態を指します。
Retention: 60 件 per bucket.

```toml
retry_timeout = "60s"
```

The word ledger appears here only as a word.
