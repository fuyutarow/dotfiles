# CONFIGURATION CONTRACT — storage-headroom

The configuration system behind `enforce-storage-headroom.ts`. The config says WHAT is guarded;
the hook is the mechanism.

- Consumer: runtime — the `enforce-storage-headroom.ts` PreToolUse hook reads it on every Bash call; a human editor authors it
- Authority / writer: the dotfiles owner, by commit to this repo
- Effective configuration: `agents/claude/hooks/storage-headroom.toml`, read through the `~/.claude/hooks` symlink; `STORAGE_HEADROOM_CONFIG` replaces the path for the test suite only
- Source representation: TOML, parsed by Bun's built-in `Bun.TOML.parse` (hooks stay zero-dep)
- Trust regime: human-authored
- Signature / digest input: n/a
- Canonicalization profile: n/a
- Schema / version: `schema = 1`, validated field by field in `validate()` in the hook
- Duplicate-key policy: reject — a TOML parse error, reported as "is not valid TOML" in a deny
- Number / Unicode policy: every size and bound is a finite non-negative TOML number (GiB, seconds, minutes); strings are UTF-8 and must be non-empty; launcher commands must match `[A-Za-z0-9._-]+`
- Precedence / merge: one file, no merge and no defaults; an unknown key, wrong type, or missing field makes the whole config invalid, and every error is reported in one deny
- Decision record: none: the effective declaration's writer is the sole authority; the reason for each number is a comment beside it in the TOML
- Exception encoding: encoded: `STORAGE_ASSERT_OVERRIDE=1` in the command text bypasses the gate for that one command, visibly in the transcript
- Verification command: `bun test agents/claude/hooks/tests/enforce-storage-headroom.test.ts`
- Positive case: the committed `storage-headroom.toml` — `ls -la` through the hook with no override returns no decision
- Negative case: a fixture with `drive.host.deny_gib = "thirty"` and an unknown `launcher[0].comand` — every Bash call is denied with both errors in one reason
