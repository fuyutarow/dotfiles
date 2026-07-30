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
// Exit: 0 success, 1 no rg matches, 2 usage/environment failure, 124 child timeout.
// Children receive argv directly; no query or path is evaluated by a shell.

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { typeFlag } from "type-flag";

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

const usage = `usage:
  repo-search concept    --query <concept> [--path <glob>] [--limit <n>]
  repo-search battery    --query <q1> --query <q2> --query <q3> [...] [--path <glob>]
  repo-search literal    --query <text> [--path <path> ...] [--glob <glob> ...]
  repo-search exhaustive --query <regex> [--path <path> ...] [--glob <glob> ...]
  repo-search files      [--path <path> ...] [--glob <glob> ...] [--hidden]
  repo-search structural --query <pattern> [--path <glob>]
  repo-search symbol     --query <identifier>

Common: --timeout-ms <positive integer>
rg search routes: --ignore-case --hidden --context <n> --files-with-matches --count`;

function isRoute(value: string | undefined): value is Route {
  return ROUTES.some((route) => route === value);
}

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

function rejectUnknownFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag") {
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
  "ignore-case"?: boolean;
  hidden?: boolean;
  context?: number;
  "files-with-matches"?: boolean;
  count?: boolean;
}): string[] {
  if (values["files-with-matches"] && values.count) {
    throw new Error("--files-with-matches and --count are mutually exclusive");
  }

  const flags: string[] = ["--color", "never"];
  if (values["ignore-case"]) flags.push("--ignore-case");
  if (values.hidden) flags.push("--hidden");
  if (values.context !== undefined) {
    flags.push("--context", String(values.context));
  }
  if (values["files-with-matches"]) flags.push("--files-with-matches");
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

async function main(): Promise<number> {
  const parsed = typeFlag(
    {
      query: {
        type: [nonEmptyString("query")],
        alias: "q",
        default: () => [],
      },
      path: {
        type: [nonEmptyString("path")],
        alias: "p",
        default: () => [],
      },
      glob: {
        type: [nonEmptyString("glob")],
        alias: "g",
        default: () => [],
      },
      limit: positiveInteger("limit"),
      "timeout-ms": positiveInteger("timeout-ms"),
      "ignore-case": Boolean,
      hidden: Boolean,
      context: positiveInteger("context"),
      "files-with-matches": Boolean,
      count: Boolean,
      help: { type: Boolean, alias: "h" },
    },
    Bun.argv.slice(2),
    { ignore: rejectUnknownFlag },
  );

  if (Object.getPrototypeOf(parsed.unknownFlags) !== Object.prototype) {
    throw new Error("unknown option '--__proto__'");
  }
  const unknownFlag = Object.keys(parsed.unknownFlags)[0];
  if (unknownFlag !== undefined) {
    throw new Error(`unknown option '--${unknownFlag}'`);
  }

  const [rawRoute, ...unexpectedPositionals] = parsed._;
  if (rawRoute === undefined) {
    const hasSearchFlags =
      parsed.flags.query.length > 0 ||
      parsed.flags.path.length > 0 ||
      parsed.flags.glob.length > 0 ||
      parsed.flags.limit !== undefined ||
      parsed.flags["timeout-ms"] !== undefined ||
      parsed.flags["ignore-case"] !== undefined ||
      parsed.flags.hidden !== undefined ||
      parsed.flags.context !== undefined ||
      parsed.flags["files-with-matches"] !== undefined ||
      parsed.flags.count !== undefined;
    if (parsed.flags.help && !hasSearchFlags) {
      process.stdout.write(`${usage}\n`);
      return 0;
    }
    throw new Error("missing route");
  }
  if (!isRoute(rawRoute)) {
    throw new Error(`unknown route '${rawRoute}'`);
  }
  if (unexpectedPositionals.length > 0) {
    throw new Error(
      `unexpected positional arguments: ${unexpectedPositionals.join(" ")}`,
    );
  }

  const rejectFlag = (present: boolean, flag: string): void => {
    if (present) throw new Error(`${rawRoute} does not accept --${flag}`);
  };
  const isRgSearch = rawRoute === "literal" || rawRoute === "exhaustive";
  const isLexical = isRgSearch || rawRoute === "files";
  rejectFlag(parsed.flags.glob.length > 0 && !isLexical, "glob");
  rejectFlag(parsed.flags.hidden !== undefined && !isLexical, "hidden");
  rejectFlag(
    parsed.flags["ignore-case"] !== undefined && !isRgSearch,
    "ignore-case",
  );
  rejectFlag(parsed.flags.context !== undefined && !isRgSearch, "context");
  rejectFlag(
    parsed.flags["files-with-matches"] !== undefined && !isRgSearch,
    "files-with-matches",
  );
  rejectFlag(parsed.flags.count !== undefined && !isRgSearch, "count");
  rejectFlag(
    parsed.flags.limit !== undefined &&
      rawRoute !== "concept" &&
      rawRoute !== "battery",
    "limit",
  );
  rejectFlag(parsed.flags.path.length > 0 && rawRoute === "symbol", "path");
  rejectFlag(parsed.flags.query.length > 0 && rawRoute === "files", "query");

  const queries = parsed.flags.query;
  const paths = parsed.flags.path;
  if (
    rawRoute === "concept" ||
    rawRoute === "literal" ||
    rawRoute === "exhaustive" ||
    rawRoute === "structural" ||
    rawRoute === "symbol"
  ) {
    if (!parsed.flags.help || queries.length > 0) {
      exactlyOneQuery(rawRoute, queries);
    }
  } else if (
    rawRoute === "battery" &&
    (!parsed.flags.help || queries.length > 0) &&
    (queries.length < 3 || queries.some((query) => query.trim() === ""))
  ) {
    throw new Error("battery requires at least 3 non-empty --query values");
  }
  if (
    (rawRoute === "concept" ||
      rawRoute === "battery" ||
      rawRoute === "structural") &&
    paths.length > 1
  ) {
    throw new Error(`${rawRoute} accepts at most one --path glob`);
  }
  if (isRgSearch) {
    rgFlags(parsed.flags);
  }

  if (parsed.flags.help) {
    process.stdout.write(`${usage}\n`);
    return 0;
  }

  const timeoutMs = parsed.flags["timeout-ms"] ?? 120_000;
  switch (rawRoute) {
    case "symbol": {
      const symbol = exactlyOneQuery(rawRoute, parsed.flags.query);
      process.stderr.write(
        `FATAL: route=symbol belongs to Serena, not shell search; ` +
          `use Serena definitions/references for '${symbol}'\n`,
      );
      return 2;
    }
    case "concept":
    case "battery": {
      const queries = parsed.flags.query;
      const paths = parsed.flags.path;
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
        parsed.flags.limit ?? 8,
        timeoutMs,
      );
    }
    case "structural": {
      const query = exactlyOneQuery(rawRoute, parsed.flags.query);
      const paths = parsed.flags.path;
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
      const paths = parsed.flags.path;
      return runRg(
        rawRoute,
        undefined,
        paths.length > 0 ? paths : ["."],
        parsed.flags,
        timeoutMs,
      );
    }
    case "literal":
    case "exhaustive": {
      const query = exactlyOneQuery(rawRoute, parsed.flags.query);
      const paths = parsed.flags.path;
      return runRg(
        rawRoute,
        query,
        paths.length > 0 ? paths : ["."],
        parsed.flags,
        timeoutMs,
      );
    }
  }
}

if (import.meta.main) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(
        `FATAL: ${error instanceof Error ? error.message : String(error)}\n` +
          "Run 'repo-search --help' for usage.\n",
      );
      process.exitCode = 2;
    });
}
