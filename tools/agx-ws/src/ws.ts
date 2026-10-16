#!/usr/bin/env bun
import { cli, command } from "cleye";
import { errorMessage } from "../../shared/src/attempt.ts";
import packageJson from "../package.json" with { type: "json" };
import {
  add,
  doctor as doctorWorkspaces,
  gc,
  gcAll,
  refresh,
  remove,
} from "./workspace.ts";

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("ws: unknown option '--__proto__'\n");
    process.exit(2);
  }
};

const fail = (error: unknown): void => {
  process.stderr.write(`ws: ${errorMessage(error)}\n`);
  process.exitCode = 1;
};

const repoFlag = {
  type: String,
  description:
    "any workspace or the main checkout of the repository (default: cwd)",
} as const;

const addCommand = command(
  {
    name: "add",
    parameters: ["<slug>"],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    help: {
      description:
        "The only workspace creator: create <repo>.ws/ws_<slug>, trust its mise.toml or .mise.toml, then run readiness commands (.ws.toml).",
    },
    flags: {
      rev: {
        type: String,
        description: "parent revision (default: jj's own default)",
      },
      repo: repoFlag,
    },
  },
  async (argv) => {
    const done = await add({
      slug: argv._.slug,
      rev: argv.flags.rev,
      repo: argv.flags.repo ?? process.cwd(),
    });
    if (!done.ok) {
      fail(done.error);
      return;
    }
    process.stdout.write(`${done.value}\n`);
  },
);

const rmCommand = command(
  {
    name: "rm",
    parameters: ["<slug>"],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    help: {
      description:
        "Forget and rip ws_<slug>; refuses while it holds an unlanded change.",
    },
    flags: { repo: repoFlag },
  },
  async (argv) => {
    const done = await remove({
      slug: argv._.slug,
      repo: argv.flags.repo ?? process.cwd(),
    });
    if (!done.ok) {
      fail(done.error);
      return;
    }
    process.stdout.write(`removed\t${done.value}\n`);
  },
);

const refreshCommand = command(
  {
    name: "refresh",
    parameters: ["<slug>"],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    help: {
      description:
        "Update ws_<slug> if jj reports it stale; do not run readiness commands or change sparse patterns.",
    },
    flags: { repo: repoFlag },
  },
  async (argv) => {
    const done = await refresh({
      slug: argv._.slug,
      repo: argv.flags.repo ?? process.cwd(),
    });
    if (!done.ok) {
      fail(done.error);
      return;
    }
    process.stdout.write(`refreshed\t${done.value}\n`);
  },
);

const gcCommand = command(
  {
    name: "gc",
    parameters: [],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    help: {
      description:
        "Enumerate jj workspaces. Print TSV: path, kind, verdict, change id, age, reason. Legacy workspaces are report-only until --legacy. .ws.toml keep is always protected; ws add is the only creator.",
    },
    flags: {
      dryRun: { type: Boolean, description: "report only; remove nothing" },
      legacy: {
        type: Boolean,
        description: "also forget and rip empty or landed legacy workspaces",
      },
      abandoned: {
        type: Boolean,
        description:
          "also collect workspaces whose runs all ended without acceptance over 24h ago; legacy layouts also need --legacy",
      },
      all: {
        type: Boolean,
        description: "visit every consumer registry repo plus dotfiles",
      },
      includeUnrecorded: {
        type: Boolean,
        description:
          "also collect workspaces with no agx record when they have no diff",
      },
      repo: repoFlag,
    },
  },
  async (argv) => {
    if (argv.flags.all === true && argv.flags.repo !== undefined) {
      fail("--all and --repo cannot be combined");
      return;
    }
    const options = {
      dryRun: argv.flags.dryRun === true,
      includeUnrecorded: argv.flags.includeUnrecorded === true,
      legacy: argv.flags.legacy === true,
      abandoned: argv.flags.abandoned === true,
    };
    const done = await (argv.flags.all === true
      ? gcAll(options)
      : gc({ ...options, repo: argv.flags.repo ?? process.cwd() }));
    if (!done.ok) {
      fail(done.error);
      return;
    }
    for (const line of done.value.lines) process.stdout.write(`${line}\n`);
    if (done.value.failed.length > 0)
      fail(`could not collect: ${done.value.failed.join(", ")}`);
  },
);

const doctorCommand = command(
  {
    name: "doctor",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    help: { description: "Read-only registered workspace inventory." },
  },
  async () => {
    const done = await doctorWorkspaces();
    if (!done.ok) {
      fail(done.error);
      if (process.env.AGX_DOCTOR_QUIET !== "1")
        process.stderr.write("agx-ws doctor: error\n");
      return;
    }
    for (const line of done.value) process.stdout.write(`${line}\n`);
    if (process.env.AGX_DOCTOR_QUIET !== "1")
      process.stderr.write(`agx-ws doctor: ${done.value.length} finding(s)\n`);
    process.exitCode = done.value.length === 0 ? 0 : 1;
  },
);

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--version")
  process.stdout.write(`${packageJson.version}\n`);
else
  void cli({
    name: "ws",
    version: packageJson.version,
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    commands: [addCommand, refreshCommand, rmCommand, gcCommand, doctorCommand],
  });
