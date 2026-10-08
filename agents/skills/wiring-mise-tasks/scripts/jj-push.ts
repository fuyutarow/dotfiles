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

const aheadResult = await command([
  "log",
  "--no-graph",
  "-r",
  "alpha@origin..alpha",
]);
if (aheadResult.exitCode !== 0) {
  if (aheadResult.stderr.includes("Name `alpha` is conflicted"))
    die("alpha has diverged from alpha@origin; run `mise run pull` first");
  const stderr = aheadResult.stderr.trim();
  die(
    `listing alpha@origin..alpha failed: ${stderr !== "" ? stderr : `jj exited ${aheadResult.exitCode}`}`,
  );
}
const ahead = aheadResult.stdout.trimEnd();
process.stdout.write(`${ahead !== "" ? ahead : "nothing to push"}\n`);

if (!(await hasRevision("alpha"))) die("bookmark alpha does not exist");
if (!(await hasRevision("alpha@origin")))
  die("bookmark alpha@origin does not exist; run `mise run pull` first");

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

if (ahead === "") {
  process.exit(0);
}
if (parsed.flags.dryRun) process.exit(0);

await run(["git", "push", "-b", "alpha"], "pushing alpha");
