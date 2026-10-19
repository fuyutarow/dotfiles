#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import packageJson from "../package.json" with { type: "json" };
import { standardCli } from "../../shared/src/cli.ts";
import { classify } from "./classify.ts";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, packageJson, cliArgv);

async function main(): Promise<void> {
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
      help: {
        description:
          "Zero-shot multi-label yes/no classification over files through Jev. Input limit: 30000 bytes combined. Exit: 0 yes, 1 no/refuted, 2 usage, 3 unreachable, 4 cannot judge.",
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
