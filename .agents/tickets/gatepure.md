+++
schema = 2
name = "gatepure"
outcome = "gate:land and the test suites it runs read only the repository tree and temp fixtures: every test that reads the deployed machine (real ~/.config/systemd units, the live ccc daemon, real HOME skills, installed bins, PATH tools absent from mise) is either rewritten against a fixture or moved to doctor's own suite; bun test scripts/tests passes in a worker sandbox and in the main checkout alike"
writes = ["scripts/tests/**", "scripts/doctor.ts", "scripts/wsl-ccc-daemon.ts", "mise.toml"]
verify = ["bun test scripts/tests", "env HOME=$(mktemp -d) mise run gate:land"]
timeout_s = 2400
premises = ["file:scripts/tests/doctor.test.ts"]

[proposition]
id = "GATE-REPO-ONLY"
claim = "bun test scripts/tests has zero failures with HOME pointed at an empty temp dir and ~/.bun/bin removed from PATH"
refuted_by = "any scripts test fails only because of machine state (deployed units, live daemons, HOME contents, PATH tools)"
+++

Retro 2026-10-15 root 2: worker verify reports failures that are not the worker's — today `bun test scripts/tests`
had 24-25 failures in every worker run (ccc-daemon deploy tests reading the deployed unit, "doctor reports the
reservation-yield policy and rejects an old CPU/RAM-only unit", the rumdl round-trip test needing rumdl on PATH), and
the coordinator had to guess which were environmental; it guessed wrong twice.
Do: enumerate every failing test under `env HOME=$(mktemp -d) PATH=<without ~/.bun/bin> bun test scripts/tests`, and
for each either (a) make it hermetic with a fixture (temp HOME, fake unit files, fake daemon) or (b) move it to a
doctor-only suite that gate:land does not run. Fix the reservation-yield expectation to the GPU-only design (cccgpu,
cccoom on alpha). Tools a test shells out to must come from mise (`mise exec -- rumdl`), not bare PATH. Report the
list with the action per test. Do not commit or push.
