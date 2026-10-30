# DIAGNOSTIC CARD

Surface: cli
Severity: error
Machine contract: exit=2; channel=stderr
Renderer: terminal

Observed condition: `timeout_ms` is negative
Evidence / locus: config.toml:12, key `timeout_ms`
Cause confidence: proven

Primary message: `timeout_ms` must be zero or greater
Related loci: none

Recovery mode: exact
Validated recovery: set `timeout_ms = 30`
Preconditions: the unit is seconds
Next observation: none

Positive case: config with `timeout_ms = -1`
Negative case: config with `timeout_ms = 0`
Receipt: `tool check config.toml` exits 2 and writes the diagnostic to stderr
