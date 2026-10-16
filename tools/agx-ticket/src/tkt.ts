#!/usr/bin/env bun
import { cli, command } from "cleye";
import {
  attempt,
  errorMessage,
  type Attempt,
} from "../../shared/src/attempt.ts";
import { collect, create, list } from "./tickets.ts";
import pkg from "../package.json" with { type: "json" };

const fail = (error: unknown): void => {
  process.stderr.write(`tkt: ${errorMessage(error)}\n`);
  process.exitCode = 1;
};
async function show<T>(
  work: () => Promise<Attempt<T>>,
  print: (value: T) => void,
): Promise<void> {
  const result = await attempt(work);
  if (!result.ok) {
    fail(result.error);
    return;
  }
  if (!result.value.ok) {
    fail(result.value.error);
    return;
  }
  print(result.value.value);
}
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("tkt: unknown option '--__proto__'\n");
    process.exit(2);
  }
};
const repo = {
  type: String,
  description: "repository or workspace (default: cwd)",
} as const;
const lines = (items: string[]) => {
  for (const line of items) process.stdout.write(`${line}\n`);
};
const common = { strictFlags: true, ignoreArgv: rejectPrototypeFlag } as const;
const newCommand = command(
  {
    ...common,
    name: "new",
    parameters: ["<slug>"],
    help: {
      description:
        "Issue ticket files without overwriting. Templates use {{key}} or {{key:json}}.",
    },
    flags: {
      repo,
      from: {
        type: String,
        description: "template file (default: built-in schema 2 template)",
      },
      set: { type: [String], description: "template value k=v (repeatable)" },
      each: {
        type: String,
        description: "one ticket per nonblank line; slugs are <slug>-1, -2, …",
      },
    },
  },
  async (args) =>
    show(
      () =>
        create({
          repo: args.flags.repo ?? process.cwd(),
          slug: args._.slug,
          from: args.flags.from,
          set: args.flags.set,
          each: args.flags.each,
        }),
      lines,
    ),
);
const lsCommand = command(
  {
    ...common,
    name: "ls",
    flags: { repo, json: { type: Boolean, description: "emit a JSON array" } },
    help: {
      description:
        "Derive ticket states and landing from agx and jj; stores nothing.",
    },
  },
  async (args) =>
    show(
      () => list(args.flags.repo ?? process.cwd()),
      (rows) => {
        if (args.flags.json === true)
          process.stdout.write(`${JSON.stringify(rows)}\n`);
        else
          lines(
            rows.map(
              (row) =>
                `${row.state}\t${row.landed === null ? "unknown" : String(row.landed)}\t${row.path.replaceAll(/[\r\n\t]/gu, " ")}\t${row.reason.replaceAll(/\s+/gu, " ")}${row.volatile ? "; volatile path" : ""}`,
            ),
          );
      },
    ),
);
const gcCommand = command(
  {
    ...common,
    name: "gc",
    flags: {
      repo,
      dryRun: {
        type: Boolean,
        description: "list eligible paths without deleting",
      },
    },
    help: {
      description: "Remove only accepted tickets with landed workspaces.",
    },
  },
  async (args) =>
    show(
      () =>
        collect(args.flags.repo ?? process.cwd(), args.flags.dryRun === true),
      lines,
    ),
);
if (process.argv.length === 3 && process.argv[2] === "--version")
  process.stdout.write(`${pkg.version}\n`);
else
  await cli({
    ...common,
    name: "tkt",
    version: pkg.version,
    commands: [newCommand, lsCommand, gcCommand],
  });
