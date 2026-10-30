#!/usr/bin/env bun
// fixture binary: reports trouble on stdout and chooses its exit code — exercises
// SILENT-FAILURE (exit 0 when the caller declared failure) and ERROR-ON-STDOUT (non-zero exit
// with diagnostics on the payload channel).
process.stdout.write("could not reach the server\n");
process.exit(Bun.argv.includes("--really-fail") ? 3 : 0);
