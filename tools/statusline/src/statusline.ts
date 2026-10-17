#!/usr/bin/env bun
// The sampler owns the prepared display. Keep the common read path free of collector dependencies.
import { readInput } from "./stdin.ts";
import { presentation } from "./presentation.ts";
const input = process.argv.length === 2 ? await readInput() : undefined;
const output = input === "" ? await presentation(process.cwd()) : undefined;
if (output !== undefined) {
  process.stdout.write(output);
  process.exit(0);
}
await import("./statusline-main.ts");
