# jex

`jex Q FILE...` is a zero-shot multi-label yes/no classifier over UTF-8 files through Jev.
It asks every question about the combined file state. It executes no commands and writes no records.
Install the repository's bins with `mise run deps` to make `jex` available by name.

```toml
schema = 1
refuted_question = "Does the text contradict the stated outcome?" # optional

[[question]]
id = "clear"
text = "Does the text state a concrete outcome?"
```

Use 1–8 `[[question]]` entries with unique, nonempty `id` and `text`. Optional
`refuted_question` is a string and reserves the answer id `refuted`. Unknown fields,
including command checks, are rejected; the caller owns verification.

```sh
jex questions.toml report.md > ev.json
jex --request questions.toml report.md # print the exact request; send nothing
jex questions.toml report.md > ev.json && agx judge RUN accept --evidence ev.json
```

There are no subcommands. Flags may precede or follow operands; `--` permits paths
beginning with a dash. `--help` prints usage and `--version` prints only semver.
Stdout emits one JSON object per HTTP answer, in terminals and pipelines alike:
`{bits:[{id,p,reason}],refuted?:{p,reason}}`. Exit 1 still prints the complete object,
including every bit and any refuted answer; the exit status carries the yes/no result.
Diagnostics go to stderr. The TypeSafe
Noul API supplies probabilities, without explanations: absent an endpoint-provided
reason, `reason` says `Jev Noul probability of yes`. It is a source label, not generated reasoning.

| Exit | Meaning                                                                                  |
| ---- | ---------------------------------------------------------------------------------------- |
| 0    | Every bit is at least 0.5, and refuted is absent or below 0.5                            |
| 1    | A bit is below 0.5, or refuted is at least 0.5                                           |
| 2    | Usage error                                                                              |
| 3    | No Jev response (transport failure, timeout, or unavailable key)                         |
| 4    | Cannot judge: invalid questions/input, non-200 HTTP, malformed answer, or mismatched ids |

Malformed answers print `{bits:[]}`; well-shaped answers with mismatched ids retain
the returned probabilities on stdout and exit 4. Missing optional refutation answers
also exit 4 when requested. No response or invalid local inputs produce no verdict JSON.
Preview exits 0 after reading inputs and validating the questions, without looking up a key.

Requests carry each path, full-file SHA-256, original byte size, UTF-8 content/excerpt,
and `truncated`. Excerpts are capped at 64 KiB per file and 256 KiB total, ending on
UTF-8 boundaries. Files are streamed to compute their full hashes. The serialized
request must fit 1 MiB; invalid UTF-8 in included content is rejected.

`JEX_JEV_URL` overrides the endpoint (then `AGX_NEXT_JEV_URL`, then
`https://api.typesafe.ai/v1/systemone`). `JEX_JEV_MODEL` defaults to `jev-latest`.
The shared Jev client uses `TYPESAFE_API_KEY`, then fnox, then the legacy TypeSafe
key file, exactly as agx-run does; calls have a 30-second timeout and no retries.
The request uses [TypeSafe Noul questions](https://docs.typesafe.ai/primitives/noul)
and validates [Noul answers](https://docs.typesafe.ai/api) against the exact requested ids.

`agx judge RUN accept|reject --evidence FILE` accepts repeatable evidence flags.
Each file is read as UTF-8 and stored with its path, byte SHA-256, and full content
in the single appended judgment record. Evidence is opaque: even probabilities
below 0.5 do not override the caller's explicit decision. All evidence must be
readable before a record is appended; no evidence flag preserves the old format.
`agx jev` remains available, deprecated in favour of `jex`; its removal is separate work.
