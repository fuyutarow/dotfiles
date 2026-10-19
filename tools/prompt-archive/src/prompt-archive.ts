#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import { standardCli } from "../../shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import { archiveHistories } from "./archive.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, cliArgv);

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`Error: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

export async function main(argv = cliArgv()): Promise<number> {
  const parsed = cli(
    {
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      name: "prompt-archive",
      parameters: [],
      flags: {},
      help: {
        description:
          "Append new Claude Code and Codex typed-input history entries to monthly archives",
      },
    },
    undefined,
    argv,
  );
  if (parsed._.length > 0) {
    process.stderr.write("prompt-archive: unexpected positional arguments\n");
    return 2;
  }
  const result = await archiveHistories();
  if (!result.ok) {
    process.stderr.write("prompt-archive: unable to archive history files\n");
    return 2;
  }
  process.stdout.write(
    `ARCHIVED\t${result.value.archived}\tSKIPPED\t${result.value.skipped}\n`,
  );
  return 0;
}

if (import.meta.main) {
  const code = await Promise.try(() => main()).then(
    (result) => result,
    () => {
      process.stderr.write("prompt-archive: unable to archive history files\n");
      return 2;
    },
  );
  process.exit(code);
}
