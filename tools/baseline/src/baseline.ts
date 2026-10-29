#!/usr/bin/env bun
import { cli as cleyeCli, command } from "cleye";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import { attempt, errorMessage } from "@dotfiles/shared/src/attempt.ts";
import packageJson from "../package.json" with { type: "json" };
import { newFailures, render } from "./data.ts";
import { record } from "./record.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, packageJson, cliArgv);

function fatal(message: string): void {
  process.stderr.write(`FATAL: baseline: ${message}\n`);
  process.exitCode = 2;
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    fatal("unknown option --__proto__");
    process.exit(2);
  }
}

async function main(): Promise<void> {
  await cli(
    {
      name: "baseline",
      version: packageJson.version,
      parameters: [],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      help: {
        description:
          "Record Bun test failures as sorted lines; diff reports only new failures.",
      },
      commands: [
        command(
          {
            name: "record",
            parameters: ["<rev>"],
            strictFlags: true,
            ignoreArgv: rejectPrototypeFlag,
            help: {
              description:
                "record <rev> -- <test command>: run in a temporary clean jj workspace, then remove it.",
            },
          },
          async (argv) => {
            const cmd = argv._["--"];
            if (cmd.length === 0 || argv._.length !== cmd.length + 1) {
              fatal("usage: baseline record <rev> -- <test command>");
              return;
            }
            const result = await record(argv._.rev, cmd);
            if (result.isErr()) {
              fatal(result.error);
              return;
            }
            process.stdout.write(render(result.value));
          },
        ),
        command(
          {
            name: "diff",
            parameters: ["<base>", "<head>"],
            strictFlags: true,
            ignoreArgv: rejectPrototypeFlag,
            help: {
              description:
                "Print head minus base; exit 1 for new failures, 0 otherwise.",
            },
          },
          async (argv) => {
            if (argv._.length !== 2) {
              fatal("usage: baseline diff <base.txt> <head.txt>");
              return;
            }
            const read = await attempt(() =>
              Promise.all([
                Bun.file(argv._.base).text(),
                Bun.file(argv._.head).text(),
              ]),
            );
            if (!read.ok) {
              fatal(errorMessage(read.error));
              return;
            }
            const [base, head] = read.value;
            const added = newFailures(base, head);
            process.stdout.write(render(added));
            process.exitCode = added.length > 0 ? 1 : 0;
          },
        ),
      ],
    },
    () => {
      fatal("expected record or diff; use baseline --help");
    },
  );
}

if (import.meta.main)
  await main().catch((error: unknown) => {
    fatal(errorMessage(error));
  });
