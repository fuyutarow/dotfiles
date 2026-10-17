#!/usr/bin/env bun
import { cli } from "cleye";
import packageJson from "../package.json" with { type: "json" };
import { classify } from "./classify.ts";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";

async function main(): Promise<void> {
  if (Bun.argv.length === 3 && Bun.argv[2] === "--version") {
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }
  const parsed = await attempt(() =>
    cli({
      name: "jex",
      parameters: ["[questions]", "[files...]"],
      flags: {
        request: {
          type: Boolean,
          description: "Print the request without sending it",
        },
      },
      strictFlags: true,
      ignoreArgv: (type, flag) => {
        if (type === "unknown-flag") {
          process.stderr.write(`jex: unknown option --${flag}\n`);
          process.exit(2);
        }
      },
      help: {
        description:
          "Zero-shot multi-label yes/no classification over files through Jev. Exit: 0 yes, 1 no/refuted, 2 usage, 3 unreachable, 4 cannot judge.",
      },
    }),
  );
  if (!parsed.ok) {
    process.stderr.write(`jex: ${errorMessage(parsed.error)}\n`);
    process.exitCode = 2;
    return;
  }
  const args = parsed.value;
  if (args._.questions === undefined || args._.files.length === 0) {
    process.stderr.write("jex: usage: jex [--request] Q FILE...\n");
    process.exitCode = 2;
    return;
  }
  process.exitCode = await classify(
    args._.questions,
    args._.files,
    args.flags.request === true,
  );
}
if (import.meta.main)
  await main().catch((error: unknown) => {
    process.stderr.write(`jex: ${errorMessage(error)}\n`);
    process.exitCode = 4;
  });
