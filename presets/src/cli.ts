import {
  access,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { cli } from "cleye";
import { attempt, errorMessage } from "../../agents/hooks/attempt.ts";
import { jsonOf, z } from "../../agents/hooks/zod.ts";
import { discoverPresets, jsonKey } from "./manifests.ts";

const ROOT = resolve(import.meta.dir, "../..");
const PRESETS = join(ROOT, "presets");

function exists(path: string): Promise<boolean> {
  return access(path).then(
    () => true,
    () => false,
  );
}

function fatal(message: string): never {
  process.stderr.write(`preset: ${message}\n`);
  process.exit(2);
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__")
    fatal(`unknown option '--${flag}'`);
}

const argv = cli(
  {
    name: "preset",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: ["<action>", "[name]", "[dir]"],
    help: {
      description: "Copy a dotfiles preset or show target drift.",
    },
    flags: {
      to: { type: String, description: "target repository" },
      "dry-run": {
        type: Boolean,
        default: false,
        description: "show writes without applying",
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);

const [action, name, targetArg] = argv._;
if (argv._.length > 3) fatal("too many arguments");
if (!["apply", "sync", "diff", "list"].includes(action ?? ""))
  fatal("use list, apply, sync or diff");
const catalog = await discoverPresets(PRESETS);
if (!catalog.ok) fatal(catalog.error);
if (action === "list") {
  if (
    name !== undefined ||
    argv.flags.to !== undefined ||
    argv.flags["dry-run"]
  )
    fatal("list accepts no name, target or --dry-run");
  const languages = ["typescript", "python", "rust", "julia", "latex"];
  const rank = (language: string): number => {
    const index = languages.indexOf(language);
    return index < 0 ? languages.length : index;
  };
  for (const preset of catalog.presets.toSorted((a, b) => {
    const difference = rank(a.name) - rank(b.name);
    return difference === 0 ? a.name.localeCompare(b.name) : difference;
  }))
    console.log(`${preset.name}\t${preset.description}`);
  process.exit(0);
}
const preset = catalog.presets.find((entry) => entry.name === name);
if (preset === undefined)
  fatal(`unknown preset: ${name ?? "(missing name)"}; use preset list`);
const writes = action === "apply" || action === "sync";
if (action === "sync" && name !== "typescript")
  fatal("sync currently supports typescript only");
if (argv.flags["dry-run"] && !writes)
  fatal("--dry-run is only valid with apply or sync");
const targetText = writes ? argv.flags.to : (argv.flags.to ?? targetArg);
if (targetText === undefined || targetText.length === 0) {
  fatal(writes ? `${action} needs --to <dir>` : "diff needs <dir>");
}
if (writes && targetArg !== undefined)
  fatal(`${action} accepts --to, not a positional directory`);
if (action === "diff" && argv.flags.to !== undefined && targetArg !== undefined)
  fatal("diff accepts one target: positional directory or --to");
const target = resolve(targetText);
if (!(await exists(target))) fatal(`target does not exist: ${target}`);

const files = preset.files.map((file) => ({
  createOnly: file.createOnly,
  source: join(preset.directory, file.source),
  destination: join(target, file.destination),
}));

async function requireOwnedDestination(destination: string): Promise<void> {
  let current = target;
  const paths = [target];
  for (const part of relative(target, destination).split("/")) {
    current = join(current, part);
    paths.push(current);
  }
  for (const path of paths) {
    const entry = await attempt(() => lstat(path));
    if (entry.ok && entry.value.isSymbolicLink())
      fatal(`refusing write through consumer symlink: ${path}`);
    if (
      !entry.ok &&
      !z.looseObject({ code: z.literal("ENOENT") }).safeParse(entry.error)
        .success
    )
      fatal(`cannot inspect ${path}: ${errorMessage(entry.error)}`);
  }
}

// Validate every destination before the first write, including unchanged files and parent paths.
if (writes)
  for (const file of files) await requireOwnedDestination(file.destination);

const expected = new Map<string, string>();
for (const file of files) {
  if (
    action === "sync" &&
    ![
      ".oxlintrc.json",
      "house.oxlintrc.json",
      "house-plugin.js",
      "oxlint-plugin-eslint.d.ts",
    ].includes(relative(preset.directory, file.source))
  )
    continue;
  if (file.createOnly === true && (await exists(file.destination))) continue;
  expected.set(file.destination, await readFile(file.source, "utf8"));
}

async function applyOne(destination: string, content: string): Promise<void> {
  const current = (await exists(destination))
    ? await readFile(destination, "utf8")
    : undefined;
  if (current === content) {
    console.log(`preset: current ${relative(target, destination)}`);
  } else if (argv.flags["dry-run"]) {
    console.log(`preset: would write ${relative(target, destination)}`);
  } else {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
    console.log(`preset: wrote ${relative(target, destination)}`);
  }
}

type JsonRequirement = { destination: string; key: string; expected: unknown };

async function checkJsonFile(
  destination: string,
  requirements: JsonRequirement[],
): Promise<boolean> {
  const path = join(target, destination);
  const content = await attempt(() => readFile(path, "utf8"));
  const json = content.ok
    ? jsonOf(z.record(z.string(), z.unknown())).safeParse(content.value)
    : undefined;
  if (json === undefined || !json.success) {
    console.log(`preset: ${destination}: missing or invalid JSON object`);
    return true;
  }
  let drift = false;
  for (const requirement of requirements) {
    const actual = jsonKey(json.data, requirement.key);
    if (isDeepStrictEqual(actual, requirement.expected)) continue;
    console.log(
      `preset: ${destination}: ${requirement.key}: expected ${JSON.stringify(requirement.expected)}, found ${actual === undefined ? "missing" : JSON.stringify(actual)}`,
    );
    drift = true;
  }
  return drift;
}

async function checkJsonKeys(
  requirements: JsonRequirement[],
): Promise<boolean> {
  let drift = false;
  for (const destination of new Set(
    requirements.map((item) => item.destination),
  )) {
    const changed = await checkJsonFile(
      destination,
      requirements.filter((item) => item.destination === destination),
    );
    drift = changed || drift;
  }
  return drift;
}

if (writes) {
  for (const [destination, content] of expected)
    await applyOne(destination, content);
  process.exit(
    action === "sync" && (await checkJsonKeys(preset.requirements)) ? 1 : 0,
  );
}

let drift = await checkJsonKeys(preset.requirements);
const scratch = await mkdtemp(join(tmpdir(), `preset-diff-${process.pid}-`));
for (const [destination, content] of expected) {
  const destinationExists = await exists(destination);
  const current = destinationExists ? await readFile(destination, "utf8") : "";
  if (current === content) continue;
  drift = true;
  const label = relative(target, destination);
  const expectedPath = join(
    scratch,
    `${expected.size}-${label.replaceAll("/", "_")}`,
  );
  await writeFile(expectedPath, content);
  const currentPath = destinationExists ? destination : "/dev/null";
  const diff = Bun.spawn(
    [
      "diff",
      "-u",
      "--label",
      `${label} (target)`,
      "--label",
      `${label} (preset)`,
      "--",
      currentPath,
      expectedPath,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(diff.stdout).text(),
    new Response(diff.stderr).text(),
    diff.exited,
  ]);
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
  if (exitCode > 1) {
    await rm(scratch, { recursive: true, force: true });
    fatal(`diff failed for ${label}: ${stderr}`);
  }
}
await rm(scratch, { recursive: true, force: true });
if (drift) process.exit(1);
console.log(`preset: ${name} is up to date`);
