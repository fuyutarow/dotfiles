# F3 trigger desk-check — designing-command-line-interfaces

Run these against the name and description after each description or cut edit.

## FIRES

| Ask | Why |
|---|---|
| “Design a CLI for humans and CI.” | Multi-consumer CLI CONTRACT. |
| 「CLI設計で subcommand と flags を決めたい」 | Invocation grammar. |
| “Should `--json` write progress to stdout?” | Channels and machine mode. |
| 「終了コードと partial failure の扱いを設計して」 | Outcome/recovery contract. |
| “Our destructive command has dry-run and force; audit its contract.” | Ordered interaction then C2. |
| “Make this command script-safe across future output changes.” | Stable machine route and evolution. |
| “This new CLI's interface is unsettled; implement it.” | This contract first, then implementation. |

## MUST NOT FIRE

| Ask | Route |
|---|---|
| “Which `codex exec` sandbox flag?” | `driving-codex`. |
| “Make this error message friendlier.” | `linting-prose` or diagnostic card. |
| “Should releases use SemVer?” | `designing-version-schemes`. |
| “Canonicalize config before signing.” | `governing-configuration-systems`. |
| “Launch our open-source CLI.” | `growing-oss-adoption`. |
| `git status | jq .` once. | Direct shell use. |
| “Implement the already-specified subcommand.” | `implementing-and-debugging` plus language owner. |

