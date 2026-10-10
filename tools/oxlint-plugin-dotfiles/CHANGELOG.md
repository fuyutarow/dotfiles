# Changelog

## 0.1.0

- Add policy-configured Bun API enforcement with binding resolution and stale exemption detection.
- Exclude test directories and .test.ts files from Bun API enforcement through policy globs;
  production files retain per-file exemptions and the shrink-only membership check.
