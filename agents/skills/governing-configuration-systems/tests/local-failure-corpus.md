# Local failure corpus

> These are design failures used to test the skill's rules. They are constructed from the bounded
> source position and are not measurements of a particular tool.

| ID | Failure | Gate that must change the executor's action | Correct response |
|---|---|---|---|
| F1 | “Use strict JSON and hash the file” names no raw-byte policy or canonical profile. | C2 BOUNDARY | Choose raw bytes with encoding/formatting policy, or name a semantic canonicalization profile. |
| F2 | A formatter changes a signed file and the team calls the resulting failure a cryptographic bug. | C2 BOUNDARY | State whether formatting should invalidate raw-byte protection; otherwise canonicalize before signing. |
| F3 | TOML is rejected solely because dotted keys and tables have multiple source notations. | C1 CONSUMER / C2 BOUNDARY | Preserve TOML when its human/target role fits; add a named semantic projection only if integrity needs it. |
| F4 | A comment says an environment is exempt, but the gate reads only the boolean value. | C3 AUTHORITY | Encode the exception, authority, and expiry as target-readable data or record it separately from effective state. |
| F5 | Two config files set the same array and readers assume “deep merge.” | C4 INTERPRETATION | Specify and test discovery order plus map/array/conflict behavior for that target. |
| F6 | A lockfile is hand-edited after generation and treated as the authoritative declaration. | C1 CONSUMER / C3 AUTHORITY | Name the generator as writer and regenerate from its inputs or explicitly transfer authority. |
