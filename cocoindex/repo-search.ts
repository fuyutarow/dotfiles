#!/usr/bin/env bun
// Agent/human CLI: declare the search shape, then route to ccc, rg, or Serena.
//
// Contract:
//   concept/battery -> ccc search (fresh index; battery requires >=3 paraphrases)
//   literal         -> rg --fixed-strings
//   exhaustive      -> rg regex enumeration
//   files           -> rg --files
//   structural      -> ccc grep
//   symbol          -> exit 2 with a Serena route
//
// Exit: 0 success, 1 no rg matches or Cleye ordinary-unknown refusal, 2 other
// usage/environment failure, 124 child timeout.
// Children receive argv directly; no query or path is evaluated by a shell.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { cli, command } from "cleye";

const ROUTES = [
  "concept",
  "battery",
  "literal",
  "exhaustive",
  "files",
  "structural",
  "symbol",
] as const;

type Route = (typeof ROUTES)[number];

function positiveInteger(name: string): (value: string) => number {
  return (value) => {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed <= 0) {
      throw new Error(`--${name} must be a positive integer`);
    }
    return parsed;
  };
}

function nonEmptyString(name: string): (value: string) => string {
  return (value) => {
    if (value === "") {
      throw new Error(`--${name} requires a value`);
    }
    return value;
  };
}

// Cleye 2.6.0's strictFlags misses --__proto__; reject only that prototype-sensitive name before
// assignment. Commands do not inherit ignoreArgv, so every command below installs this guard;
// ordinary unknowns remain Cleye strictFlags' responsibility.
function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`unknown option '--${flag}'`);
  }
}

function findRegisteredProject(start: string): string | null {
  let current = resolve(start);
  while (true) {
    if (existsSync(join(current, ".cocoindex_code", "settings.yml"))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function requireExecutable(name: string): string {
  const executable = Bun.which(name);
  if (!executable) throw new Error(`${name} is not available on PATH`);
  return executable;
}

function exactlyOneQuery(route: string, queries: string[]): string {
  if (queries.length !== 1 || queries[0].trim() === "") {
    throw new Error(`${route} requires exactly one non-empty --query`);
  }
  return queries[0];
}

async function runChild(command: string[], timeoutMs: number): Promise<number> {
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
    signal,
    killSignal: "SIGTERM",
  });
  const exitCode = await child.exited;
  if (signal.aborted) {
    process.stderr.write(
      `FATAL: search child timed out after ${timeoutMs}ms: ${command[0]}\n`,
    );
    return 124;
  }
  return exitCode;
}

async function runChildCaptured(
  command: string[],
  timeoutMs: number,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const signal = AbortSignal.timeout(timeoutMs);
  const child = Bun.spawn({
    cmd: command,
    cwd: process.cwd(),
    env: process.env,
    stdout: "pipe",
    stderr: "pipe",
    signal,
    killSignal: "SIGTERM",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (stdout !== "") process.stdout.write(stdout);
  if (stderr !== "") process.stderr.write(stderr);
  if (signal.aborted) {
    process.stderr.write(
      `FATAL: search child timed out after ${timeoutMs}ms: ${command[0]}\n`,
    );
    return { exitCode: 124, stdout, stderr };
  }
  return { exitCode, stdout, stderr };
}

function cccResultCount(stdout: string): number {
  return stdout.match(/^--- Result \d+ \(/gm)?.length ?? 0;
}

function rgFlags(values: {
  glob?: string[];
  ignoreCase?: boolean;
  hidden?: boolean;
  context?: number;
  filesWithMatches?: boolean;
  count?: boolean;
}): string[] {
  if (values.filesWithMatches && values.count) {
    throw new Error("--files-with-matches and --count are mutually exclusive");
  }

  const flags: string[] = ["--color", "never"];
  if (values.ignoreCase) flags.push("--ignore-case");
  if (values.hidden) flags.push("--hidden");
  if (values.context !== undefined) {
    flags.push("--context", String(values.context));
  }
  if (values.filesWithMatches) flags.push("--files-with-matches");
  if (values.count) flags.push("--count");
  for (const glob of values.glob ?? []) flags.push("--glob", glob);
  return flags;
}

async function runCccSearch(
  route: "concept" | "battery",
  queries: string[],
  path: string | undefined,
  limit: number,
  timeoutMs: number,
): Promise<number> {
  const project = findRegisteredProject(process.cwd());
  if (!project) {
    throw new Error(
      `${route} requested, but ${process.cwd()} is not ccc-registered; ` +
        "run ccc init/index or use an explicitly lexical route",
    );
  }
  const ccc = requireExecutable("ccc");
  let matchedQueries = 0;

  for (const [index, query] of queries.entries()) {
    const command = [ccc, "search", query, "--limit", String(limit)];
    if (path !== undefined) command.push("--path", path);
    if (index === 0) command.push("--refresh");

    process.stderr.write(
      `ROUTE: ${route} -> ccc search (${index + 1}/${queries.length}) project=${project}\n`,
    );
    const result = await runChildCaptured(command, timeoutMs);
    if (result.exitCode !== 0) return result.exitCode;
    if (cccResultCount(result.stdout) > 0) matchedQueries += 1;
  }

  if (matchedQueries === 0) {
    process.stderr.write(
      `RESULT: NO_MATCH route=${route} engine=ccc queries=${queries.length}; ` +
        `exit 0 with no result blocks is not PASS and does not by itself prove absence\n`,
    );
    return 1;
  }
  process.stdout.write(
    `RESULT: PASS route=${route} engine=ccc queries=${queries.length} ` +
      `queries_with_hits=${matchedQueries}\n`,
  );
  return 0;
}

async function runRg(
  route: "literal" | "exhaustive" | "files",
  query: string | undefined,
  paths: string[],
  values: Parameters<typeof rgFlags>[0],
  timeoutMs: number,
): Promise<number> {
  const rg = requireExecutable("rg");
  const command =
    route === "files"
      ? [rg, "--files", ...rgFlags(values), ...paths]
      : [
          rg,
          ...(route === "literal" ? ["--fixed-strings"] : []),
          "--line-number",
          ...rgFlags(values),
          "--",
          query ?? "",
          ...paths,
        ];

  process.stderr.write(`ROUTE: ${route} -> rg\n`);
  const exitCode = await runChild(command, timeoutMs);
  if (exitCode === 0) {
    process.stdout.write(`RESULT: PASS route=${route} engine=rg\n`);
  } else if (exitCode === 1) {
    process.stderr.write(`RESULT: NO_MATCH route=${route} engine=rg\n`);
  }
  return exitCode;
}

type SearchFlags = {
  query?: string[];
  path?: string[];
  glob?: string[];
  limit?: number;
  timeoutMs?: number;
  ignoreCase?: boolean;
  hidden?: boolean;
  context?: number;
  filesWithMatches?: boolean;
  count?: boolean;
};

function queryFlag() {
  return {
    query: { type: [nonEmptyString("query")], alias: "q", default: () => [] },
  };
}

function pathFlag() {
  return {
    path: { type: [nonEmptyString("path")], alias: "p", default: () => [] },
  };
}

function globFlag() {
  return {
    glob: { type: [nonEmptyString("glob")], alias: "g", default: () => [] },
  };
}

function timeoutFlag() {
  return { timeoutMs: positiveInteger("timeout-ms") };
}

function rgSearchFlags() {
  return {
    ignoreCase: Boolean,
    hidden: Boolean,
    context: positiveInteger("context"),
    filesWithMatches: Boolean,
    count: Boolean,
  };
}

async function runRoute(rawRoute: Route, values: SearchFlags): Promise<number> {
  const queries = values.query ?? [];
  const paths = values.path ?? [];
  const timeoutMs = values.timeoutMs ?? 120_000;
  switch (rawRoute) {
    case "symbol": {
      const symbol = exactlyOneQuery(rawRoute, queries);
      process.stderr.write(
        `FATAL: route=symbol belongs to Serena, not shell search; ` +
          `use Serena definitions/references for '${symbol}'\n`,
      );
      return 2;
    }
    case "concept":
    case "battery": {
      if (rawRoute === "concept") {
        exactlyOneQuery(rawRoute, queries);
      } else if (
        queries.length < 3 ||
        queries.some((query) => query.trim() === "")
      ) {
        throw new Error("battery requires at least 3 non-empty --query values");
      }
      if (paths.length > 1) {
        throw new Error(`${rawRoute} accepts at most one --path glob`);
      }
      return runCccSearch(
        rawRoute,
        queries,
        paths[0],
        values.limit ?? 8,
        timeoutMs,
      );
    }
    case "structural": {
      const query = exactlyOneQuery(rawRoute, queries);
      if (paths.length > 1) {
        throw new Error("structural accepts at most one --path glob");
      }
      const ccc = requireExecutable("ccc");
      const command = [ccc, "grep", query];
      if (paths[0] !== undefined) command.push("--path", paths[0]);
      process.stderr.write("ROUTE: structural -> ccc grep\n");
      const result = await runChildCaptured(command, timeoutMs);
      if (result.exitCode !== 0) return result.exitCode;
      if (result.stdout.trim() === "") {
        process.stderr.write(
          "RESULT: NO_MATCH route=structural engine=ccc-grep; empty output is not PASS\n",
        );
        return 1;
      }
      process.stdout.write("RESULT: PASS route=structural engine=ccc-grep\n");
      return 0;
    }
    case "files": {
      return runRg(
        rawRoute,
        undefined,
        paths.length > 0 ? paths : ["."],
        values,
        timeoutMs,
      );
    }
    case "literal":
    case "exhaustive": {
      const query = exactlyOneQuery(rawRoute, queries);
      return runRg(
        rawRoute,
        query,
        paths.length > 0 ? paths : ["."],
        values,
        timeoutMs,
      );
    }
  }
}

function routeCommand(route: Route) {
  const flags =
    route === "concept" || route === "battery"
      ? {
          ...queryFlag(),
          ...pathFlag(),
          limit: positiveInteger("limit"),
          ...timeoutFlag(),
        }
      : route === "literal" || route === "exhaustive"
        ? {
            ...queryFlag(),
            ...pathFlag(),
            ...globFlag(),
            ...timeoutFlag(),
            ...rgSearchFlags(),
          }
        : route === "files"
          ? { ...pathFlag(), ...globFlag(), ...timeoutFlag(), hidden: Boolean }
          : route === "structural"
            ? { ...queryFlag(), ...pathFlag(), ...timeoutFlag() }
            : { ...queryFlag(), ...timeoutFlag() };
  return command(
    {
      name: route,
      parameters: [],
      flags,
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      help: { description: `Run the ${route} repository-search route.` },
    },
    async (parsed) => {
      if (parsed._.length > 0) {
        throw new Error(
          `unexpected positional arguments: ${parsed._.join(" ")}`,
        );
      }
      const exitCode = await runRoute(route, parsed.flags);
      process.exitCode = exitCode;
    },
  );
}

async function main(): Promise<void> {
  await cli(
    {
      name: "repo-search",
      parameters: ["[route]"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      help: {
        description:
          "Declare a repository-search shape and route it to ccc, rg, or Serena.",
      },
      commands: ROUTES.map(routeCommand),
    },
    (parsed) => {
      if (parsed._.route === undefined) throw new Error("missing route");
      throw new Error(`unknown route '${parsed._.route}'`);
    },
    Bun.argv.slice(2),
  );
}

if (import.meta.main) {
  main().catch((error) => {
    process.stderr.write(
      `FATAL: ${error instanceof Error ? error.message : String(error)}\n` +
        "Run 'repo-search --help' for usage.\n",
    );
    process.exitCode = 2;
  });
}
