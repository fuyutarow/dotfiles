#!/usr/bin/env bun
import { check, judgeRun, list, run, stats, type Flags } from "./run.ts";
import { cli, command } from "cleye";

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`agx-next: unknown option '--${flag}'\n`);
    process.exit(2);
  }
};
const commands = [
  command({
    name: "run",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  }),
  command({
    name: "check",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  }),
  command({ name: "ls", strictFlags: true, ignoreArgv: rejectPrototypeFlag }),
  command({
    name: "judge",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  }),
  command({
    name: "stats",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  }),
];
const rawArgs = process.argv.slice(2);
const root = cli(
  {
    name: "agx-next",
    parameters: [],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    commands,
  },
  undefined,
  rawArgs.slice(0, 1),
);
await root;

let exit = 2;
const commandName = rawArgs[0];
const commandArgs = rawArgs.slice(1);
if (commandName === "run") {
  const parsed = cli(
    {
      name: "agx-next run",
      parameters: ["<ticket>"],
      flags: {
        cd: {
          type: String,
          description: "working tree for the worker and premises",
        },
        sandbox: {
          type: String,
          description: "none | read-only | workspace-write",
          default: "workspace-write",
        },
        continue: {
          type: String,
          description: "previous agx-next run id to resume",
        },
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    commandArgs,
  );
  const flags = {
    ticket: parsed._[0],
    cd: parsed.flags.cd,
    sandbox: parsed.flags.sandbox,
    continue: parsed.flags["continue"],
  } satisfies Flags;
  exit = await run(flags);
} else if (commandName === "check") {
  const parsed = cli(
    {
      name: "agx-next check",
      parameters: ["<ticket>"],
      flags: {
        cd: {
          type: String,
          description: "tree in which to evaluate ticket premises",
        },
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    commandArgs,
  );
  exit = check({ ticket: parsed._[0], cd: parsed.flags.cd });
} else if (commandName === "ls") {
  const parsed = cli(
    {
      name: "agx-next ls",
      parameters: [],
      flags: {
        json: { type: Boolean, description: "emit the ls JSON contract" },
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    commandArgs,
  );
  exit = list(parsed.flags satisfies Flags);
} else if (commandName === "judge") {
  const parsed = cli(
    {
      name: "agx-next judge",
      parameters: ["<run>", "<decision>"],
      flags: {
        note: { type: String, description: "optional judgment note" },
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    commandArgs,
  );
  exit = judgeRun({
    id: parsed._[0],
    decision: parsed._[1],
    note: parsed.flags.note,
  });
} else if (commandName === "stats") {
  const parsed = cli(
    {
      name: "agx-next stats",
      parameters: [],
      flags: {
        importLegacy: {
          type: Boolean,
          description: "import legacy agx JSONL records",
        },
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    commandArgs,
  );
  exit = await stats(parsed.flags satisfies Flags);
}
process.exit(exit);
