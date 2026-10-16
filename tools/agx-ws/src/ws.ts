#!/usr/bin/env bun
import { cli, command } from "cleye";
import { errorMessage } from "../../shared/src/attempt.ts";
import packageJson from "../package.json" with { type: "json" };
import { add, gc, refresh, remove } from "./workspace.ts";

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
        "Create <repo>.ws/ws_<slug>, trust its mise.toml or .mise.toml, then run readiness commands (.ws.toml) before handing it to a sandboxed worker.",
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
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    help: {
      description:
        "Collect terminal agx lineages with no live pid and no unlanded change; report everything else.",
    },
    flags: {
      dryRun: { type: Boolean, description: "report only; remove nothing" },
      includeUnrecorded: {
        type: Boolean,
        description:
          "also collect workspaces with no agx record when they have no diff",
      },
      repo: repoFlag,
    },
  },
  async (argv) => {
    const done = await gc({
      repo: argv.flags.repo ?? process.cwd(),
      dryRun: argv.flags.dryRun === true,
      includeUnrecorded: argv.flags.includeUnrecorded === true,
    });
    if (!done.ok) {
      fail(done.error);
      return;
    }
    for (const line of done.value.lines) process.stdout.write(`${line}\n`);
    if (done.value.failed.length > 0)
      fail(`could not collect: ${done.value.failed.join(", ")}`);
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
    commands: [addCommand, refreshCommand, rmCommand, gcCommand],
  });
