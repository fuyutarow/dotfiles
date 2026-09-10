# Consumer and trust regimes

> **SOLE owner** of consumer classification and regime selection.

Format syntax belongs to the target language or tool.

## Classify before naming a format

A surface may carry multiple regimes.

| Regime | Consumer asks | Contract consequence |
|---|---|---|
| human-authored | Can a person review and edit intent? | Name format, schema, comment policy, and source writer. |
| generated | Can a tool reproduce an exact output? | Name generator, inputs, regeneration, and hand-edit rule. |
| signed-raw | Must exact bytes be attested? | Name encoding, line endings, byte profile, and formatting policy. |
| signed-canonical | Must equivalent values share protected bytes? | Name profile, admission rules, serializer, and rejected ambiguity. |
| gated-decision | Can a verifier accept the declaration? | Name schema, authority, exceptions, and verifier. |

These roles are not a maturity ladder.

A local file can be only human-authored.

A signed rendered artifact can combine human-authored, generated, signed-canonical, and gated-decision.

## Role examples, not format rules

| Example | Direct observation | Do not infer |
|---|---|---|
| Cargo | Human-written broad dependencies differ from Cargo-maintained exact resolution. | Every lock must be JSON. |
| PyPA | Project data and tool-specific data have distinct TOML tables. | Every TOML file is a human-only input. |
| pylock | A resolution format can be TOML with consistency rules for diff noise. | TOML is automatically cryptographically canonical. |
| mise | Project, local, and global configurations have documented precedence. | Every tool has the same merge operator. |

The source basis and limits are in
[forge-verification-ledger.md](../tests/forge-verification-ledger.md).

Use target documentation or a measured target receipt for actual precedence and parser behavior.

## Classifier questions

| Question | Yes | No |
|---|---|---|
| Does a person edit the declaration? | Retain a human-facing source and review policy. | Treat it as generated or machine-facing. |
| Must a tool reconstruct exact resolution? | Separate inputs from output and name the writer. | Do not invent a lockfile. |
| Does integrity cover bytes or values? | Choose signed-raw or signed-canonical. | Do not claim semantic equivalence from a digest. |
| Can an exception change a gate result? | Make scope, expiry, and authority machine-readable. | A narrative reason may remain documentation. |
| Do multiple sources contribute a value? | Specify precedence and merge behavior. | Keep resolution local and simple. |
