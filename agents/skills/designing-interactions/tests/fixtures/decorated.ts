#!/usr/bin/env bun
// fixture binary: colours and animates into a pipe — exercises ANSI-TO-PIPE and CR-FLOOD.
const ESC = String.fromCharCode(27);
process.stdout.write(`${ESC}[31mbuilding${ESC}[0m\n`);
for (let index = 0; index < 8; index += 1) process.stdout.write("working...\r");
process.stdout.write("done\n");
