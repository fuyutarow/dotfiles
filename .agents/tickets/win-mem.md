+++
schema = 2
name = "win-mem"
outcome = "wsl-capacity-recover measures Windows host memory again: today every 5-minute run logs 'WARN Windows memory could not be measured' (scripts/wsl-capacity-recover.ts:1041) and then 'DISK_CLEAR_MEMORY_UNKNOWN host_free=…' (journal 2026-10-16 09:55:50), so the memory branch of automatic recovery never acts; find why the measurement fails under the systemd user unit (environment, PATH to the Windows interop binary, timeout, or parse) and fix it so a run under the unit logs the measured value"
writes = ["scripts/wsl-capacity-recover.ts", "scripts/tests/wsl-capacity-recover*.test.ts", "tools/*/.changes/*.md"]
verify = ["bun test scripts/tests", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 1800
premises = ["file:scripts/wsl-capacity-recover.ts"]

[proposition]
id = "WIN-MEM-MEASURED"
claim = "the cause is named with file:line; a test reproduces the failing measurement path and passes after the fix; a manual run of the measurement under the same environment as the unit prints a number"
refuted_by = "the WARN line still printed by a run under the unit environment, or a cause stated without evidence"
+++

Unit: wsl-capacity-recover.service (timer every 5 min). Read `systemctl --user cat wsl-capacity-recover.service` and
`journalctl --user -u wsl-capacity-recover --since -1h` to compare the unit environment with an interactive shell.
Add no sync calls. Do not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks
field of your JSON return. Test data outside the workspace. Do not commit or push.

## Current state (coordinator — single current version)
Your stop was right: the sandbox blocked PowerShell (WSL socket) and the user bus, so the unit environment could not be
reproduced. This run has no sandbox (`--sandbox none`) so you can run `systemctl --user cat/show wsl-capacity-recover`,
`journalctl --user -u wsl-capacity-recover`, and the measurement command under `systemd-run --user --wait --pipe
--collect` (the same environment as the unit). Change only the writes listed. Do not start, stop or edit any unit.

