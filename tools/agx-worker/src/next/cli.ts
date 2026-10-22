#!/usr/bin/env bun
import { check, judgeRun, list, run, stats, type Flags } from "./run.ts";
import { waitRun } from "./wait.ts";
import { COMMAND_NAMES } from "./commands.ts";
import { cli as cleyeCli, command } from "cleye";
import { standardCli } from "../../../shared/src/cli.ts";
import { exitWithError } from "./exit.ts";
import { flushRunPublications, stateDir } from "./store.ts";
import { doctor } from "./doctor.ts";
import { roster } from "./public.ts";
import packageJson from "../../package.json" with { type: "json" };

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, packageJson, cliArgv);

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
  const rawArgs = cliArgv();
  if (COMMAND_NAMES.some((name) => name === rawArgs[0])) stateDir();
  const root = cli(
    {
      name: "agx-worker",
      help: {
        description: packageJson.description,
      },
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
  if (commandName === "dispatch") {
    const { dispatchMain } = await import("../dispatch.ts");
    await dispatchMain(commandArgs);
    return;
  } else if (commandName === "run") {
    const parsed = cli(
      {
        name: "agx-worker run",
        help: {
          description:
            "To amend a continuation, edit the ticket file, then `agx worker run TICKET --continue RUN`.",
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
          },
          continue: {
            type: String,
            description: "previous agx worker run id to continue",
          },
          supersedes: {
            type: String,
            description: "previous run replaced by this fresh dispatch",
          },
          session: {
            type: String,
            description: "dispatching Claude Code or Codex session id",
          },
          dispatchBinding: {
            type: String,
            description: "internal binding supplied by agx worker dispatch",
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
      supersedes: parsed.flags.supersedes,
      session: parsed.flags.session,
      dispatchBinding: parsed.flags.dispatchBinding,
    } satisfies Flags;
    exit = await run(flags);
  } else if (commandName === "check") {
    const parsed = cli(
      {
        name: "agx-worker check",
        parameters: ["<ticket>"],
        flags: {
          cd: {
            type: String,
            description:
              "target tree for all launch preflights (no reservation)",
          },
          sandbox: {
            type: String,
            description: "sandbox to validate against the ticket",
          },
          continue: {
            type: String,
            description: "previous run to validate for continuation",
          },
          supersedes: { type: String, description: "previous run to replace" },
        },
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
      },
      undefined,
      commandArgs,
    );
    exit = await check({
      ticket: parsed._[0],
      cd: parsed.flags.cd,
      sandbox: parsed.flags.sandbox,
      continue: parsed.flags.continue,
      supersedes: parsed.flags.supersedes,
    });
  } else if (commandName === "ls") {
    const parsed = cli(
      {
        name: "agx-worker ls",
        parameters: ["[selector]"],
        help: {
          description:
            "List runs newest first (last 30 by default; use --all for everything). SELECTOR is a run id/prefix or ticket name.",
        },
        flags: {
          ticket: {
            type: String,
            description: "exact ticket name for --latest",
          },
          latest: {
            type: Boolean,
            description: "show only the latest run for --ticket",
          },
          json: { type: Boolean, description: "emit the ls JSON contract" },
          summary: {
            type: Boolean,
            description:
              "with --json, include running counts by dispatcher session",
          },
          all: { type: Boolean, description: "show every run" },
          workspace: {
            type: String,
            description: "show runs for this real workspace path",
          },
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
    if (parsed.flags.wait === true && parsed.flags.workspace !== undefined) {
      process.stderr.write("agx: --workspace cannot be combined with --wait\n");
      process.exitCode = 2;
      return;
    }
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
        name: "agx-worker judge",
        parameters: ["<run>", "<decision>"],
        flags: {
          note: { type: String, description: "optional judgment note" },
          evidence: {
            type: [String],
            description: "attach file sha256 and content (repeatable)",
          },
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
      evidence: parsed.flags.evidence,
    });
  } else if (commandName === "stats") {
    const parsed = cli(
      {
        name: "agx-worker stats",
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
    if (Object.hasOwn(process.env, "AGX_DOCTOR_QUIET")) {
      process.stderr.write(
        "agx-worker doctor: AGX_DOCTOR_QUIET is no longer supported; use --quiet\n",
      );
      process.exitCode = 2;
      return;
    }
    const parsed = cli(
      {
        name: "agx-worker doctor",
        flags: {
          quiet: {
            type: Boolean,
            description: "suppress the findings summary",
          },
        },
        parameters: [],
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
        help: {
          description:
            "Diagnose worker records as JSON Lines (tool, object, finding, remedy).",
        },
      },
      undefined,
      commandArgs,
    );
    exit = await doctor(parsed.flags.quiet === true);
  } else if (commandName === "roster") {
    const parsed = cli(
      {
        name: "agx-worker roster",
        help: {
          description:
            "Print one selected worker row for TICKET; --json without a ticket retains the full roster interface.",
        },
        parameters: ["[ticket]"],
        flags: {
          json: { type: Boolean, description: "emit the roster JSON" },
        },
        strictFlags: true,
        ignoreArgv: rejectPrototypeFlag,
      },
      undefined,
      commandArgs,
    );
    if (parsed._[0] !== undefined) exit = await roster(parsed._[0]);
    else if (parsed.flags.json === true) exit = await roster();
    else {
      process.stderr.write("agx worker roster: use --json\n");
      exit = 2;
    }
  }
  await flushRunPublications();
  process.exitCode = exit;
}

if (import.meta.main) await main();
