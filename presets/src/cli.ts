import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { cli } from "cleye";
import {
  loadPolicy,
  loadRepoPolicy,
  renderOxlintrc,
} from "../../scripts/render-oxlintrc.ts";

const ROOT = resolve(import.meta.dir, "../..");
const PRESETS = join(ROOT, "presets");

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
    parameters: ["<action>", "<name>", "[dir]"],
    help: { description: "Apply a dotfiles preset or show target drift." },
    flags: {
      to: { type: String, description: "target repository (apply)" },
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
if (action !== "apply" && action !== "diff") fatal("use apply or diff");
if (name !== "ts" && name !== "oxlint")
  fatal("preset name must be ts or oxlint");
if (argv.flags["dry-run"] && action !== "apply")
  fatal("--dry-run is only valid with apply");
const targetText = action === "apply" ? argv.flags.to : targetArg;
if (targetText === undefined || targetText.length === 0) {
  fatal(action === "apply" ? "apply needs --to <dir>" : "diff needs <dir>");
}
if (action === "apply" && targetArg !== undefined)
  fatal("apply accepts --to, not a positional directory");
if (action === "diff" && argv.flags.to !== undefined)
  fatal("diff accepts a positional directory, not --to");
const target = resolve(targetText);
if (!existsSync(target)) fatal(`target does not exist: ${target}`);

const files =
  name === "ts"
    ? ["tsconfig.json", "package.json", "zod.ts", "mise-tasks.toml"].map(
        (file) => ({
          source: join(PRESETS, "ts", file),
          destination: join(target, file),
        }),
      )
    : [
        {
          source: join(PRESETS, "oxlint", "policy.toml"),
          destination: join(target, "oxlint-policy.toml"),
        },
        {
          source: join(PRESETS, "oxlint", "local.example.toml"),
          destination: join(target, "oxlint-policy.local.toml"),
          createOnly: true,
        },
      ];

const expected = new Map<string, string>();
for (const file of files) {
  if (file.createOnly === true && existsSync(file.destination)) continue;
  expected.set(file.destination, readFileSync(file.source, "utf8"));
}

if (name === "oxlint") {
  const loaded = await loadPolicy();
  if (!loaded.ok) fatal(`cannot load oxlint preset: ${loaded.error}`);
  const example = files.find((file) => file.createOnly === true);
  if (
    action === "apply" &&
    !existsSync(join(target, "oxlint-policy.local.toml")) &&
    !argv.flags["dry-run"] &&
    example !== undefined
  )
    writeFileSync(example.destination, readFileSync(example.source, "utf8"));
  const repoPolicy = await loadRepoPolicy(target, loaded.value);
  if (repoPolicy.ok)
    expected.set(
      join(target, ".oxlintrc.json"),
      renderOxlintrc(repoPolicy.value),
    );
  else if (!existsSync(join(target, "oxlint-policy.local.toml"))) {
    const housePolicy = {
      ...loaded.value,
      custom: loaded.value.custom.filter((rule) => rule.scope === "house"),
    };
    expected.set(join(target, ".oxlintrc.json"), renderOxlintrc(housePolicy));
  } else fatal(repoPolicy.error);
}

function applyOne(destination: string, content: string): void {
  const current = existsSync(destination)
    ? readFileSync(destination, "utf8")
    : undefined;
  if (current === content) {
    console.log(`preset: current ${relative(target, destination)}`);
  } else if (argv.flags["dry-run"]) {
    console.log(`preset: would write ${relative(target, destination)}`);
  } else {
    writeFileSync(destination, content);
    console.log(`preset: wrote ${relative(target, destination)}`);
  }
}

if (action === "apply") {
  for (const [destination, content] of expected) applyOne(destination, content);
  process.exit(0);
}

let drift = false;
const scratch = mkdtempSync(join(tmpdir(), `preset-diff-${process.pid}-`));
for (const [destination, content] of expected) {
  const current = existsSync(destination)
    ? readFileSync(destination, "utf8")
    : "";
  if (current === content) continue;
  drift = true;
  const label = relative(target, destination);
  const expectedPath = join(
    scratch,
    `${expected.size}-${label.replaceAll("/", "_")}`,
  );
  writeFileSync(expectedPath, content);
  const currentPath = existsSync(destination) ? destination : "/dev/null";
  const diff = Bun.spawnSync(
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
  if (diff.stdout.byteLength > 0) process.stdout.write(diff.stdout);
  if (diff.stderr.byteLength > 0) process.stderr.write(diff.stderr);
  if (diff.exitCode > 1)
    fatal(`diff failed for ${label}: ${diff.stderr.toString()}`);
}
rmSync(scratch, { recursive: true, force: true });
if (drift) process.exit(1);
console.log(`preset: ${name} is up to date`);
