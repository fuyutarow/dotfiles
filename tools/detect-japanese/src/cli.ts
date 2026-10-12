#!/usr/bin/env bun
import { classifyJapanesePrimary } from "./classify.ts";

const result = classifyJapanesePrimary(await Bun.stdin.text());
process.stdout.write(`${JSON.stringify(result)}\n`);
let exitCode = 2;
if (result.outcome === "japanese-primary") exitCode = 0;
else if (result.outcome === "non-japanese") exitCode = 1;
process.exit(exitCode);
