# Codex native title reader implementation

The shared reader at `tools/shared/src/codex-native-title.ts` reads only
`$CODEX_HOME/session_index.jsonl` (or `~/.codex/session_index.jsonl`) and never
establishes pane ownership. It requires a syntactically valid UUID, an unchanged
regular index no larger than 2 MiB, strict UTF-8 and valid JSONL rows, exactly
one exact `id` match, a nonblank `thread_name` of at most 512 Unicode code
points, and a valid ISO-like `updated_at` timestamp. Titles preserve Unicode
verbatim and reject C0/C1 controls and U+2028/U+2029. `sourceUpdatedAt` is the
native row timestamp; `observedAt` is this read's observation time.

Every failure returns a stable explicit unavailable reason. The reader does
not infer titles from filenames, registration, cwd, row order, or prior state;
it does not write native or fleet data. Its bounded read opens once, reads the
whole initial file plus one growth-detection byte, and compares descriptor and
path device, inode, size, modification time, and change time before and after.
These checks detect observed replacement or mutation but do not claim a
transactional snapshot guarantee.

Focused temporary-index verification used `CODEX_HOME` pointing only to a
temporary directory. Cases were `unique-unicode`, `duplicate-id`, `malformed`,
`controls`, `oversize`, and `missing`; the real private native index was not
opened. Evidence is limited to this reader API and does not establish that a
caller has verified pane identity or safely integrated title display.
