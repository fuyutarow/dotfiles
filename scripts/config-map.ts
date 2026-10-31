// `mise run config:map` — the whole configuration of this repo on one screen, printed from
// scripts/config-registry.ts (never hand-maintained: the deploy code reads the same tables).
// Consumer: a human or agent asking "where is X configured, who writes it, what checks it".
//
//   (default)  the map, grouped by kind (link, rendered, tool-owned, …); a group whose rows share
//              a writer/verifier prints it once
//   --json     the rows as JSON, for a tool
//   --check    the completeness gate (lint:config-map): every config-shaped file in the checkout is
//              a source of some row, or excluded below with a reason; every source a row names
//              exists. One line per finding; all of them, not the first.
//
// Exit: 0 ok · 1 --check found a finding (or Cleye rejected an unknown flag) · 2 usage/FATAL.

import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";
import { consola } from "consola";
import { err, ok, type Result } from "neverthrow";
import { errorMessage } from "../agents/hooks/attempt.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { type Kind, type Surface, surfaces } from "./config-registry.ts";
import {
  jjCandidate,
  jjContent,
  jjContext,
  type JjPrecommit,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";

const ROOT = join(import.meta.dir, "..");

// What "config-shaped" means for the gate: the extensions a declaration in this repo uses. A file
// without one (zsh/zshenv, git/gitconfig, Brewfile) is still registered; the gate just cannot
// discover it by name.
const CONFIG_PATH = /\.(?:toml|json|jsonc|yml|yaml|conf|plist|win|mac|wsl)$/u;

// Installed, private and runtime trees are not configuration declarations.
const LOCAL_TREES = new Set([
  "node_modules",
  ".git",
  ".jj",
  ".serena",
  ".agent-state",
  "__pycache__",
  "local",
  "backups",
  ".vscode",
  ".idea",
  "automatic_backups",
]);

/** Files inventory: current, non-ignored paths; never consults a VCS index. */
export async function workingTreeConfigFiles(
  root: string = ROOT,
): Promise<Result<string[], Error>> {
  // Use the ignore engine for nested/negated .gitignore rules and global/local Git exclusions.
  // --no-require-git also applies these rules in non-colocated jj workspaces.
  // Positive -g globs would override ignores, so filter configuration extensions afterward.
  const listing = Bun.spawn(
    [
      "rg",
      "--no-config",
      "--files",
      "--hidden",
      "--no-require-git",
      "--null",
      ...[...LOCAL_TREES].flatMap((directory) => ["-g", `!**/${directory}/**`]),
    ],
    { cwd: root, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    listing.stdout.text(),
    listing.stderr.text(),
    listing.exited,
  ]);
  if (exitCode !== 0 && exitCode !== 1)
    return err(new Error(`working-tree inventory failed: ${stderr.trim()}`));
  const files = (
    await Promise.all(
      stdout
        .split("\0")
        .filter((path) => path !== "")
        .map(async (path) =>
          isWorkingConfig(path, await Bun.file(join(root, path)).exists())
            ? path
            : undefined,
        ),
    )
  ).flatMap((path) => (path === undefined ? [] : [path]));
  return ok(files.toSorted());
}

function isWorkingConfig(path: string, fileExists: boolean): boolean {
  if (!fileExists || !CONFIG_PATH.test(path)) return false;
  if (
    path.startsWith(".cocoindex_code/") &&
    path !== ".cocoindex_code/settings.yml"
  )
    return false;
  if (path.startsWith("agents/commands/.system/")) return false;
  return (
    !path.endsWith("/settings.local.json") &&
    !path.endsWith(".resource.json.peak.json")
  );
}

// Paths the gate does not ask about, each with its reason.
const EXCLUDED: readonly {
  readonly test: (p: string) => boolean;
  readonly why: string;
}[] = [
  { test: (p) => p.startsWith("node_modules/"), why: "installed dependencies" },
  {
    test: (p) => p.startsWith("archives/"),
    why: "retired, kept as reference, never deployed",
  },
  {
    test: (p) => /(^|\/)(tests|fixtures|examples)\//u.test(p),
    why: "test data and examples, read by their tests only",
  },
  {
    test: (p) =>
      p === "tools/herdr-projector/evidence/owner-native-validation-oct21.json",
    why: "retained read-only owner evidence, not deployed configuration",
  },
  {
    test: (p) =>
      p.startsWith("tools/shared/evidence/") &&
      p.endsWith("-soks-request.json"),
    why: "retained SOKS evidence import requests, not deployed configuration",
  },
  {
    test: (p) => p.includes(".example."),
    why: "an example, not a configuration",
  },
];

const ORDER: readonly Kind[] = [
  "link",
  "etc-link",
  "rendered",
  "tool-owned",
  "fan-out",
  "applied",
  "in-place",
  "machine-local",
];

class UsageError extends Error {}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    consola.error(`FATAL: unknown option '--${flag}'`);
    process.exit(2);
  }
}

const covers = (source: string, path: string): boolean =>
  path === source || path.startsWith(`${source}/`);

/** The completeness findings: unregistered config files, and sources that do not exist. */
export async function findings(
  rows: readonly Surface[],
  files: readonly string[],
  sourceExists: (source: string) => boolean | Promise<boolean> = (source) =>
    access(join(ROOT, source)).then(
      () => true,
      () => false,
    ),
): Promise<string[]> {
  const sources = rows.flatMap((r) => r.sources);
  const unregistered = files
    .filter((f) => !EXCLUDED.some((e) => e.test(f)))
    .filter((f) => !sources.some((s) => covers(s, f)))
    .map(
      (f) =>
        `unregistered: ${f} — add a row to scripts/config-registry.ts (or an EXCLUDED reason in scripts/config-map.ts)`,
    );
  const missing = (
    await Promise.all(
      [...new Set(sources)].map(async (s) =>
        (await sourceExists(s)) ? undefined : s,
      ),
    )
  )
    .flatMap((s) => (s === undefined ? [] : [s]))
    .map(
      (s) =>
        `missing: ${s} — a registry row names a source that does not exist`,
    );
  return [...unregistered, ...missing];
}

function shared(
  rows: readonly Surface[],
  key: "writer" | "verify",
): string | undefined {
  const first = rows[0]?.[key];
  return rows.every((r) => r[key] === first) ? first : undefined;
}

function render(rows: readonly Surface[]): string {
  const out: string[] = [];
  for (const kind of ORDER) {
    const group = rows.filter((r) => r.kind === kind);
    if (group.length === 0) continue;
    const writer = shared(group, "writer");
    const verify = shared(group, "verify");
    out.push(`\n## ${kind} (${group.length})`);
    if (writer !== undefined) out.push(`   writer: ${writer}`);
    if (verify !== undefined) out.push(`   verify: ${verify}`);
    for (const r of group) {
      const from = r.sources.length > 0 ? r.sources.join(" + ") : "(machine)";
      out.push(`  [${r.when}] ${from}  →  ${r.deployed}`);
      const extra = [
        `consumer: ${r.consumer}`,
        ...(writer === undefined ? [`writer: ${r.writer}`] : []),
        ...(verify === undefined ? [`verify: ${r.verify}`] : []),
      ];
      out.push(`         ${extra.join(" · ")}`);
    }
  }
  const gaps = rows.filter((r) => r.verify === "none");
  out.push(
    `\n${rows.length} surfaces · ${gaps.length} with no verifier: ${gaps.map((g) => g.sources.join("+")).join(", ")}`,
  );
  return `${out.join("\n").trimStart()}\n`;
}

async function snapshotRows(
  context: JjPrecommit,
  candidate: ReadonlyMap<string, string>,
): Promise<Result<Surface[], Error>> {
  const path = "scripts/config-registry.ts";
  const rev = candidate.get(path);
  if (rev === undefined)
    return err(new Error(`missing candidate registry: ${path}`));
  // The registry is a zero-dependency TS declaration. Evaluate its candidate copy, not an
  // unrelated worktree edit, and validate the subprocess result at this boundary.
  const tmp = await mkdtemp(join(tmpdir(), "config-map-jj-"));
  const source = join(tmp, "registry.ts");
  await writeFile(source, await jjContent(context, path, rev));
  const result = Bun.spawn(
    [
      "bun",
      "-e",
      `import {surfaces} from ${JSON.stringify(source)}; process.stdout.write(JSON.stringify(surfaces()));`,
    ],
    { stdout: "pipe", stderr: "pipe", timeout: 30_000 },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    result.stdout.text(),
    result.stderr.text(),
    result.exited,
  ]);
  await rm(tmp, { recursive: true, force: true });
  if (exitCode !== 0)
    return err(new Error(`candidate registry failed: ${stderr.trim()}`));
  const parsed = jsonOf(
    z.array(
      z.object({
        kind: z.enum(ORDER),
        when: z.enum(["all", "mac", "wsl", "linux", "not-mac"]),
        sources: z.array(z.string()),
        deployed: z.string(),
        consumer: z.string(),
        writer: z.string(),
        verify: z.string(),
      }),
    ),
  ).safeParse(stdout);
  return parsed.success
    ? ok(parsed.data)
    : err(new Error(`invalid candidate registry: ${parsed.error.message}`));
}

async function main(): Promise<Result<number, Error>> {
  const parsed = cli(
    {
      name: "config-map.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Print every configuration surface from scripts/config-registry.ts, or --check it for completeness.",
      },
      flags: {
        json: {
          type: Boolean,
          default: false,
          description: "print the rows as JSON",
        },
        check: {
          type: Boolean,
          default: false,
          description: "completeness gate",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0)
    return err(new UsageError(`unexpected argument: ${parsed._[0]}`));
  if (parsed.flags.check) {
    const context = await jjContext();
    const candidate =
      context === undefined ? undefined : await jjCandidate(context);
    const rowsResult =
      context !== undefined && candidate !== undefined
        ? await snapshotRows(context, candidate)
        : ok(surfaces());
    if (rowsResult.isErr()) return err(rowsResult.error);
    const rows = rowsResult.value;
    // A precommit candidate remains immutable; ordinary checks judge current working-tree files.
    const pathsResult =
      candidate === undefined
        ? await workingTreeConfigFiles()
        : ok([...candidate.keys()]);
    if (pathsResult.isErr()) return err(pathsResult.error);
    const paths = pathsResult.value;
    const files = paths.filter((f) => CONFIG_PATH.test(f));
    const found = await findings(rows, files, async (source) =>
      context === undefined
        ? access(join(ROOT, source)).then(
            () => true,
            () => false,
          )
        : paths.some((path) => covers(source, path)),
    );
    for (const f of found) consola.error(f);
    (found.length === 0 ? consola.success : consola.error)(
      found.length === 0
        ? `config-map: every config file is registered (${rows.length} surfaces)`
        : `config-map: ${found.length} finding(s)`,
    );
    return ok(found.length === 0 ? 0 : 1);
  }
  const rows = surfaces();
  if (parsed.flags.json)
    process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  else consola.info(render(rows).trimEnd());
  return ok(0);
}

if (import.meta.main) {
  const r = await main();
  const code = r.match(
    (value) => value,
    (error) => {
      consola.error(
        `${error instanceof UsageError ? "usage" : "FATAL"}: ${errorMessage(error)}`,
      );
      return error instanceof UsageError ? 2 : 2;
    },
  );
  process.exitCode = code;
}
