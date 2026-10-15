# Changelog

## 0.2.1 — 2026-10-15

- Use asynchronous process execution in CLI tests.

## 0.2.0 — 2026-10-12

- Classify English evidence from runs of at least three plain words and use a 1.5 weight for each Japanese kana/Han character. This admits concise Japanese status prose with identifiers while letting a whole English sentence outweigh a short Japanese preface; a simplified-Han marker guard continues to block Chinese prose.

## 0.1.0 — 2026-10-12

- Add deterministic, local Japanese-primary prose classification for reply-language hooks.
