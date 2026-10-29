#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import { classifyJapanesePrimary } from "./classify.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, cliArgv);

const parsed = cli({
  name: "detect-japanese",
  parameters: [],
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  help: {
    description:
      "Classify stdin text as Japanese-primary; write one JSON result.",
  },
});

if (parsed._.length > 0) {
  process.stderr.write("FATAL: unexpected positional arguments\n");
  process.exit(2);
}

const result = classifyJapanesePrimary(await Bun.stdin.text());
process.stdout.write(`${JSON.stringify(result)}\n`);
let exitCode = 2;
if (result.outcome === "japanese-primary") exitCode = 0;
else if (result.outcome === "non-japanese") exitCode = 1;
process.exit(exitCode);

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("Error: unknown flag --__proto__\n");
    process.exit(2);
  }
}
