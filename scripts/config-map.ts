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

import { existsSync } from "node:fs";
import { join } from "node:path";
import { cli } from "cleye";
import { err, ok, type Result } from "neverthrow";
import { errorMessage } from "../agents/hooks/attempt.ts";
import { type Kind, type Surface, surfaces } from "./config-registry.ts";

const ROOT = join(import.meta.dir, "..");

// What "config-shaped" means for the gate: the extensions a declaration in this repo uses. A file
// without one (zsh/zshenv, git/gitconfig, Brewfile) is still registered; the gate just cannot
// discover it by name.
const CONFIG_GLOB = "**/*.{toml,json,jsonc,yml,yaml,conf,plist,win,mac,wsl}";

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
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

const covers = (source: string, path: string): boolean =>
  path === source || path.startsWith(`${source}/`);

/** The completeness findings: unregistered config files, and sources that do not exist. */
export function findings(
  rows: readonly Surface[],
  files: readonly string[],
): string[] {
  const sources = rows.flatMap((r) => r.sources);
  const unregistered = files
    .filter((f) => !EXCLUDED.some((e) => e.test(f)))
    .filter((f) => !sources.some((s) => covers(s, f)))
    .map(
      (f) =>
        `unregistered: ${f} — add a row to scripts/config-registry.ts (or an EXCLUDED reason in scripts/config-map.ts)`,
    );
  const missing = [...new Set(sources)]
    .filter((s) => !existsSync(join(ROOT, s)))
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

function main(): Result<number, Error> {
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
  const rows = surfaces();
  if (parsed.flags.check) {
    // Tracked files only — an untracked cache or editor file is not configuration.
    const ls = Bun.spawnSync(
      ["bun", "scripts/tracked-files.ts", "--expect-non-empty"],
      {
        cwd: ROOT,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      },
    );
    if (ls.exitCode !== 0)
      return err(new Error(`tracked-files failed: ${ls.stderr.toString()}`));
    const glob = new Bun.Glob(CONFIG_GLOB);
    const files = ls.stdout
      .toString()
      .split("\0")
      .filter((f) => f !== "" && glob.match(f));
    const found = findings(rows, files);
    for (const f of found) process.stdout.write(`${f}\n`);
    process.stdout.write(
      found.length === 0
        ? `config-map: every config file is registered (${rows.length} surfaces)\n`
        : `config-map: ${found.length} finding(s)\n`,
    );
    return ok(found.length === 0 ? 0 : 1);
  }
  process.stdout.write(
    parsed.flags.json ? `${JSON.stringify(rows, null, 2)}\n` : render(rows),
  );
  return ok(0);
}

if (import.meta.main) {
  const r = main();
  const code = r.match(
    (value) => value,
    (error) => {
      process.stderr.write(
        `${error instanceof UsageError ? "usage" : "FATAL"}: ${errorMessage(error)}\n`,
      );
      return error instanceof UsageError ? 2 : 2;
    },
  );
  process.exit(code);
}
