# Changelog

## 0.2.0

- Delegate synchronous-call prohibition to oxlint 1.82.0 node/no-sync.
- Keep only non-sync Bun replacements in prefer-bun-api; exemptions now use policy-generated overrides.
- Move stale path/rule checks and shrink-only enforcement to the repository ratchet.

## 0.1.0

- Add policy-configured Bun API enforcement with binding resolution and stale exemption detection.
- Exclude test directories and .test.ts files from Bun API enforcement through policy globs;
  production files retain per-file exemptions and the shrink-only membership check.
