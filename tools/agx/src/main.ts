#!/usr/bin/env bun
// Root help and version are deliberately independent of the dispatcher and its state readers.
import { cli, command } from "cleye";
import pkg from "../package.json" with { type: "json" };

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`agx: unknown option '--${flag}'\n`);
    process.exit(2);
  }
};

const suiteHelp = {
  description: "Ticket, selection, worker dispatch and run ledger suite.",
  render: (nodes, renderers) => {
    renderers.heading = (heading) => heading.toUpperCase();
    return renderers.render(nodes);
  },
} satisfies Exclude<Parameters<typeof cli>[0]["help"], false | undefined>;

const suiteOptions = {
  name: "agx",
  version: pkg.version,
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  parameters: [],
  help: suiteHelp,
  commands: [
    command({
      name: "ticket",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: { description: "Ticket grading and replay" },
    }),
    command({
      name: "pick",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: { description: "Choose a row and inspect available routes" },
    }),
    command({
      name: "dispatch",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: { description: "Run or resume a worker" },
    }),
    command({
      name: "ps",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: { description: "List session runs and their current state" },
    }),
    command({
      name: "ledger",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: { description: "Run records, statistics and notes" },
    }),
  ],
};

const rawArgs = process.argv.slice(2);
const rootArgv = cli(suiteOptions, undefined, rawArgs.slice(0, 1));
await rootArgv;

if (rawArgs.length === 0) {
  rootArgv.showHelp();
  process.exit(2);
}

await import("./agx.ts");
