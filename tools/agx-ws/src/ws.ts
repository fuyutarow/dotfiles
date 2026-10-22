#!/usr/bin/env bun
import { doctorOutput } from "../../shared/src/doctor-record.ts";
import { cli as cleyeCli, command } from "cleye";
import { standardCli } from "../../shared/src/cli.ts";
import { StepFailure } from "./subprocess.ts";
import { enterStep, runAddCommand } from "./deadline.ts";
import { errorMessage } from "../../shared/src/attempt.ts";
import packageJson from "../package.json" with { type: "json" };
import {
  add,
  adopt,
  doctor as doctorWorkspaces,
  gc,
  gcAll,
  refresh,
  remove,
} from "./workspace.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, packageJson, cliArgv);

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("ws: unknown option '--__proto__'\n");
    process.exit(2);
  }
};

const fail = (error: unknown): void => {
  process.stderr.write(`ws: ${errorMessage(error)}\n`);
  process.exitCode = error instanceof StepFailure ? error.code : 1;
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
      json: {
        type: Boolean,
        description:
          "print a JSON workspace object; readiness output goes to stderr",
      },
      reuse: {
        type: Boolean,
        description:
          "return an already registered workspace without changing it",
      },
    },
  },
  async (argv) =>
    runAddCommand(async () => {
      const done = await add({
        slug: argv._.slug,
        rev: argv.flags.rev,
        repo: argv.flags.repo ?? process.cwd(),
        reuse: argv.flags.reuse === true,
        json: argv.flags.json === true,
      });
      if (!done.ok) {
        enterStep("write failure diagnostic");
        await new Promise<void>((resolve) => {
          process.stderr.write(`ws: ${errorMessage(done.error)}\n`, () => {
            resolve();
          });
        });
        process.exitCode =
          done.error instanceof StepFailure ? done.error.code : 1;
        return;
      }
      enterStep("write workspace result");
      await new Promise<void>((resolve) => {
        process.stdout.write(
          `${argv.flags.json === true ? JSON.stringify({ workspace: done.value }) : done.value}\n`,
          () => {
            resolve();
          },
        );
      });
    }),
);

const adoptCommand = command(
  {
    name: "adopt",
    parameters: ["[path]"],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    help: {
      description:
        "Re-home a jj workspace into <repo>.ws/ws_<hyphen-slug>, stripping legacy layout prefixes and preserving its change. TSV: old path, target path, verdict and reason. Refuses processes inside and existing targets.",
    },
    flags: {
      repo: repoFlag,
      slug: {
        type: String,
        description:
          "override the old basename; normalized to lowercase hyphen words",
      },
      all: {
        type: Boolean,
        description: "adopt every legacy workspace; requires --repo",
      },
      fixNames: {
        type: Boolean,
        description:
          "re-home ws_<repo>-arm-* workspaces to stripped names; requires --repo",
      },
      dryRun: {
        type: Boolean,
        description: "read-only TSV plan; move nothing",
      },
      includeKept: {
        type: Boolean,
        description: "include .ws.toml keep entries and print required updates",
      },
    },
  },
  async (argv) => {
    const done = await adopt({
      path: argv._.path,
      repo: argv.flags.repo,
      slug: argv.flags.slug,
      all: argv.flags.all === true,
      fixNames: argv.flags.fixNames === true,
      dryRun: argv.flags.dryRun === true,
      includeKept: argv.flags.includeKept === true,
    });
    if (!done.ok) {
      fail(done.error);
      return;
    }
    for (const line of done.value.lines) process.stdout.write(`${line}\n`);
    if (argv.flags.dryRun !== true && done.value.failed.length > 0)
      fail(`could not adopt: ${done.value.failed.join(", ")}`);
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
        "Enumerate jj workspaces. Print TSV: path, kind, verdict, change id, age, reason. Legacy workspaces are report-only until --legacy. .ws.toml keep is always protected; agx ws add is the only creator.",
    },
    flags: {
      dryRun: { type: Boolean, description: "report only; remove nothing" },
      json: {
        type: Boolean,
        description: "emit rows and authoritative verdict counts",
      },
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
    if (argv.flags.json === true) {
      const rows = done.value.lines.map((line) => line.split("\t"));
      process.stdout.write(
        JSON.stringify({
          rows,
          counts: done.value.counts,
          complete: done.value.failed.length === 0,
        }) + "\n",
      );
    } else
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
    flags: {
      quiet: { type: Boolean, description: "suppress the findings summary" },
    },
  },
  async (argv) => {
    if (Object.hasOwn(process.env, "AGX_DOCTOR_QUIET")) {
      process.stderr.write(
        "agx ws doctor: AGX_DOCTOR_QUIET is no longer supported; use --quiet\n",
      );
      process.exitCode = 2;
      return;
    }
    const done = await doctorWorkspaces();
    if (!done.ok) {
      fail(done.error);
      if (argv.flags.quiet !== true)
        process.stderr.write("agx ws doctor: error\n");
      return;
    }
    const output = doctorOutput(done.value);
    if (!output.ok) {
      fail(output.error);
      process.exitCode = 2;
      return;
    }
    process.stdout.write(output.value);
    if (argv.flags.quiet !== true)
      process.stderr.write(`agx ws doctor: ${done.value.length} finding(s)\n`);
    process.exitCode = done.value.length === 0 ? 0 : 1;
  },
);

void cli({
  name: "agx-ws",
  version: packageJson.version,
  help: { description: "Create, inspect and collect repository workspaces." },
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  commands: [
    addCommand,
    adoptCommand,
    refreshCommand,
    rmCommand,
    gcCommand,
    doctorCommand,
  ],
});
