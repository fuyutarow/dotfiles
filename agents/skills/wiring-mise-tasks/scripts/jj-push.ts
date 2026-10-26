#!/usr/bin/env bun
// jj-push.ts — show, validate, and push the alpha bookmark without invoking Git directly.
// Usage: mise run push [-- --dry-run]
import { cli } from "cleye";

const die = (message: string, code = 1): never => {
  process.stderr.write(`jj-push: ${message}\n`);
  process.exit(code);
};

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__")
    die(`unknown option '--${flag}'`, 2);
};

const parsed = cli(
  {
    name: "jj-push.ts",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    help: { description: "Push the alpha bookmark to origin." },
    flags: {
      dryRun: {
        type: Boolean,
        default: false,
        description: "print the commits to push without pushing",
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);
if (parsed._.length > 0) die("unexpected positional arguments", 2);

const command = async (args: string[]) => {
  const child = Bun.spawn(["jj", ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
    killSignal: "SIGTERM",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
};

const run = async (args: string[], label: string): Promise<string> => {
  const result = await command(args);
  if (result.exitCode !== 0) {
    const stderr = result.stderr.trim();
    die(
      `${label} failed: ${stderr !== "" ? stderr : `jj exited ${result.exitCode}`}`,
    );
  }
  return result.stdout.trimEnd();
};

const hasRevision = async (revset: string): Promise<boolean> =>
  (await run(
    ["log", "--no-graph", "-r", `present(${revset})`, "-T", '"x"'],
    revset,
  )) === "x";

if (!parsed.flags.dryRun)
  await run(["git", "fetch", "--remote", "origin"], "fetching origin");

const remoteExists = await hasRevision("alpha@origin");
const aheadRevset = remoteExists
  ? "alpha@origin..alpha"
  : 'remote_bookmarks(remote="origin")..alpha';
const aheadResult = await command(["log", "--no-graph", "-r", aheadRevset]);
if (aheadResult.exitCode !== 0) {
  if (aheadResult.stderr.includes("Name `alpha` is conflicted"))
    die("alpha has diverged from alpha@origin; run `mise run pull` first");
  const stderr = aheadResult.stderr.trim();
  die(
    `listing ${aheadRevset} failed: ${stderr !== "" ? stderr : `jj exited ${aheadResult.exitCode}`}`,
  );
}
const ahead = aheadResult.stdout.trimEnd();
let listing = ahead;
if (listing === "")
  listing = remoteExists
    ? "nothing to push"
    : "creating alpha@origin (no new commits)";
process.stdout.write(`${listing}\n`);

if (!(await hasRevision("alpha"))) die("bookmark alpha does not exist");

const conflictResult = await command(["resolve", "--list", "-r", "alpha"]);
let conflicts = "";
if (conflictResult.exitCode === 0) {
  conflicts = conflictResult.stdout.trimEnd();
} else if (
  conflictResult.stderr.includes("No conflicts found at this revision")
) {
  conflicts = "";
} else {
  const stderr = conflictResult.stderr.trim();
  die(
    `checking alpha conflicts failed: ${stderr !== "" ? stderr : `jj exited ${conflictResult.exitCode}`}`,
  );
}
if (conflicts !== "")
  die(
    `alpha has unresolved conflicts; resolve them before pushing:\n${conflicts}`,
  );

if (remoteExists) {
  const remoteOnly = await run(
    [
      "log",
      "--no-graph",
      "-r",
      "alpha..alpha@origin",
      "-T",
      'commit_id ++ "\\n"',
    ],
    "checking alpha divergence",
  );
  if (remoteOnly !== "")
    die(`alpha has diverged from alpha@origin; run \`mise run pull\` first`);
}

if (remoteExists && ahead === "") {
  process.exit(0);
}
if (parsed.flags.dryRun) process.exit(0);

const expectedResult = await command([
  "log",
  "--no-graph",
  "-r",
  "alpha",
  "-T",
  "commit_id",
]);
if (expectedResult.exitCode !== 0) {
  const stderr = expectedResult.stderr.trim();
  die(
    `reading alpha before push failed: ${stderr !== "" ? stderr : `jj exited ${expectedResult.exitCode}`}`,
  );
}
const expected = expectedResult.stdout.trim();

const pushResult = await command([
  "git",
  "push",
  "--remote",
  "origin",
  "-b",
  "alpha",
]);
const fetchResult = await command(["git", "fetch", "--remote", "origin"]);
const actualResult = await command([
  "log",
  "--no-graph",
  "-r",
  "present(alpha@origin)",
  "-T",
  "commit_id",
]);
let actual = "(unavailable)";
if (actualResult.exitCode === 0) {
  const actualOutput = actualResult.stdout.trim();
  actual = actualOutput === "" ? "(missing)" : actualOutput;
}

const failureDetails: string[] = [];
if (pushResult.exitCode !== 0) {
  const stderr = pushResult.stderr.trim();
  const detail = stderr !== "" ? stderr : pushResult.stdout.trim();
  failureDetails.push(
    `push failed: ${detail !== "" ? detail : `jj exited ${pushResult.exitCode}`}`,
  );
}
if (fetchResult.exitCode !== 0) {
  const stderr = fetchResult.stderr.trim();
  const detail = stderr !== "" ? stderr : fetchResult.stdout.trim();
  failureDetails.push(
    `fresh fetch failed: ${detail !== "" ? detail : `jj exited ${fetchResult.exitCode}`}`,
  );
}
if (actualResult.exitCode !== 0) {
  const detail = actualResult.stderr.trim();
  failureDetails.push(
    `reading alpha@origin failed: ${detail !== "" ? detail : `jj exited ${actualResult.exitCode}`}`,
  );
}
if (
  pushResult.exitCode !== 0 ||
  fetchResult.exitCode !== 0 ||
  actualResult.exitCode !== 0 ||
  actual !== expected
) {
  const detail =
    failureDetails.length === 0 ? "" : `; ${failureDetails.join("; ")}`;
  die(
    `push verification failed: expected alpha=${expected}, actual alpha@origin=${actual}${detail}`,
  );
}

process.stdout.write(`verified commit ${expected} at alpha@origin\n`);
