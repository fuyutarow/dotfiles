+++
schema = 2
name = "cleyecorpus"
outcome = "bun test scripts/tests passes on alpha: the production Cleye corpus boundary test covers scripts/agx-accept.ts, which 67abbb54 added"
writes = ["scripts/**", "agents/skills/writing-bun-scripts/tests/**", "agents/skills/writing-bun-scripts/scripts/**"]
verify = ["bun test scripts/tests", "mise run gate:land"]
timeout_s = 900
premises = ["file:scripts/agx-accept.ts"]

[proposition]
id = "CORPUS-COVERS"
claim = "the declared Cleye corpus exactly covers the production Cleye imports"
refuted_by = "`bun test scripts/tests` reports (fail) production Cleye corpus boundary"
+++

On alpha, `bun test scripts/tests` fails:
`(fail) production Cleye corpus boundary > the declared corpus exactly covers every production Cleye import`,
because scripts/agx-accept.ts imports cleye and is not in the declared corpus. Add it the way the corpus declares its
other entries; if the corpus needs a fixture for each entry, add one. Change nothing else. Do not commit or push.

## Current state (coordinator, 2026-10-15)
Run d8d749a4 found the unregistered production Cleye import (scripts/agx-accept.ts) and stopped because the corpus
declaration and its boundary test live under agents/skills/writing-bun-scripts/tests/, outside writes. writes now
include it. Register agx-accept.ts in the corpus. The 8 "script-check floor" failures in that run's verify were /tmp
ENOSPC at the time (tmpfs was 100%; it is 58% now), not your change; re-run and confirm they pass.
