// Prints the canonical coredev task selection. This file selects declarations only; callers own
// execution, so it cannot grow an independent installer or provider policy.
import { cli } from "cleye";
import {
  COREDEV_SELECTION,
  type CoredevHostKind,
  type CoredevPhase,
} from "./config-registry.ts";
import { z } from "../agents/hooks/zod.ts";

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (
    type === "unknown-flag" &&
    (flag === "__proto__" || flag === "constructor")
  ) {
    process.stderr.write(`unknown flag(s): --${flag}\n`);
    process.exit(2);
  }
}

const parsed = cli({
  name: "deployment-selection",
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  parameters: [],
  flags: {
    kind: { type: String, description: "target host kind" },
    phase: { type: String, description: "deploy or doctor" },
    json: { type: Boolean, description: "emit the machine-readable selection" },
  },
});

if (parsed._.length > 0) {
  process.stderr.write(`unexpected argument(s): ${parsed._.join(" ")}\n`);
  process.exit(2);
}

const kindResult = z.enum(["linux", "wsl", "mac"]).safeParse(parsed.flags.kind);
const phaseResult = z.enum(["deploy", "doctor"]).safeParse(parsed.flags.phase);
if (!kindResult.success || !phaseResult.success) {
  process.stderr.write(
    "usage: deployment-selection --kind <linux|wsl|mac> --phase <deploy|doctor> [--json]\n",
  );
  process.exit(2);
}

const kind: CoredevHostKind = kindResult.data;
const phase: CoredevPhase = phaseResult.data;
const tasks = [
  ...COREDEV_SELECTION.core[phase],
  ...COREDEV_SELECTION[kind][phase],
];
const selection = { kind, phase, tasks };

if (parsed.flags.json === true) {
  process.stdout.write(`${JSON.stringify(selection)}\n`);
} else {
  for (const step of selection.tasks)
    process.stdout.write(
      `${phase} ${step.task} timeout=${step.timeoutSeconds}s\n`,
    );
}
