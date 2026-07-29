#!/usr/bin/env bun
// fixture binary: never exits on its own — exercises the HANG path with a REAL spawned process,
// not a mock. The probe must kill it via AbortSignal and report FAIL HANG.
await Bun.sleep(60_000);
