#!/usr/bin/env bun
// fixture binary: asks a question it can never be answered, then exits — exercises
// PROMPT-WITHOUT-TTY without also tripping HANG.
process.stdout.write("Overwrite existing file? [y/N] ");
process.exit(0);
