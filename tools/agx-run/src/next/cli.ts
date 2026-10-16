#!/usr/bin/env bun
import { check, judgeRun, list, run, stats, type Flags } from "./run.ts";
import { waitRun } from "./wait.ts";
import { COMMAND_NAMES } from "./commands.ts";
import { cli, command } from "cleye";
import { exitWithError } from "./exit.ts";
import { doctor } from "./doctor.ts";
import { jev, roster } from "./public.ts";
import packageJson from "../../package.json" with { type: "json" };

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    exitWithError(`agx: unknown option '--${flag}'\n`, 2);
  }
};
export const COMMANDS = COMMAND_NAMES.map((name) => ({
  name,
  definition: command({
    name,
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
  }),
}));

async function main(): Promise<void> {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.length === 1 && rawArgs[0] === "--version") {
    process.stdout.write(`${packageJson.version}\n`);
    return;
  }
  const root = cli(
    {
      name: "agx",
      parameters: [],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      commands: COMMANDS.map((entry) => entry.definition),
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
        name: "agx run",
        help: {
          description:
            "To amend a continuation, edit the ticket file, then `agx run TICKET --continue RUN`.",
        },
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
            description: "previous agx run id to continue",
          },
          session: {
            type: String,
            description: "dispatching Claude Code or Codex session id",
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
      session: parsed.flags.session,
    } satisfies Flags;
    exit = await run(flags);
  } else if (commandName === "check") {
    const parsed = cli(
      {
        name: "agx check",
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
    exit = await check({ ticket: parsed._[0], cd: parsed.flags.cd });
  } else if (commandName === "ls") {
    const parsed = cli(
      {
        name: "agx ls",
        parameters: ["[selector]"],
        help: {
          description:
            "List runs newest first (last 30 by default; use --all for everything). SELECTOR is a run id/prefix or ticket name.",
        },
        flags: {
          json: { type: Boolean, description: "emit the ls JSON contract" },
          all: { type: Boolean, description: "show every run" },
          running: { type: Boolean, description: "show only live runs" },
          wait: {
            type: Boolean,
            description:
              "wait for the next ticket run to end; run ids return immediately when terminal (read-only)",
          },
        },
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
      },
      undefined,
      commandArgs,
    );
    exit =
      parsed.flags.wait === true
        ? await waitRun({
            selector: parsed._[0],
            json: parsed.flags.json === true,
          })
        : await list({
            ...parsed.flags,
            selector: parsed._[0],
          } satisfies Flags);
  } else if (commandName === "judge") {
    const parsed = cli(
      {
        name: "agx judge",
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
    exit = await judgeRun({
      id: parsed._[0],
      decision: parsed._[1],
      note: parsed.flags.note,
    });
  } else if (commandName === "stats") {
    const parsed = cli(
      {
        name: "agx stats",
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
  } else if (commandName === "doctor") {
    exit = await doctor();
  } else if (commandName === "jev") {
    cli(
      {
        name: "agx jev",
        help: {
          description:
            "POST one JSON request from stdin to the configured Jev endpoint; print the JSON answer to stdout.",
        },
        parameters: [],
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
      },
      undefined,
      commandArgs,
    );
    exit = await jev();
  } else if (commandName === "roster") {
    const parsed = cli(
      {
        name: "agx roster",
        help: {
          description:
            "Print the validated dispatch roster as JSON. Use --json for the machine-readable interface.",
        },
        parameters: [],
        flags: {
          json: { type: Boolean, description: "emit the roster JSON" },
        },
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
      },
      undefined,
      commandArgs,
    );
    if (parsed.flags.json === true) exit = await roster();
    else {
      process.stderr.write("agx roster: use --json\n");
      exit = 2;
    }
  }
  process.exitCode = exit;
}

if (import.meta.main) await main();
