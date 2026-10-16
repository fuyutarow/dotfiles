import { command } from "cleye";

export function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

/** Cleye retains excess operands even for a command with an empty parameter schema. */
export function statusHasOperands(parsed: { _: unknown[] }): boolean {
  return parsed._.length > 0;
}

export const statusCommand = command({
  name: "status",
  parameters: [],
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  help: {
    description:
      "Read current slot capacities, sources, holders and FIFO queues without changing state.",
  },
});
