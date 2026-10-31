// TESTS-OWN-TMP: no dotfiles test leaves anything in its temp directory. Three checks:
//   1. static  — a test file that writes to a literal /tmp, /var/tmp or /dev/shm path (mkdtemp,
//      mkdir, writeFile … with that base) bypasses the per-process TMPDIR that bunfig.toml's
//      preload (tools/shared/src/test-tmp.ts) gives every `bun test`;
//   2. probe   — run the preload's own test under `bun test` with a private TMPDIR parent;
//      entries still inside it after a short settle window are leaks. Shared /tmp entries
//      belong to other sessions and never affect this verdict;
//   3. wrapper — a shared /tmp before/after comparison around any command:
//      `bun scripts/lint-tmp-leaks.ts -- bun test scripts/tests`.
// `lint:bun` calls (1)+(2), so `lint` and `gate:land` carry them.

import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cli } from "cleye";
import { fromThrowable } from "neverthrow";
import { RUN_DIR_ENV } from "@dotfiles/shared/src/test-tmp.ts";

export const SYSTEM_TMP = "/tmp";
const PROBE_TEST = "tools/shared/tests/test-tmp.test.ts";
const SETTLE_ROUNDS = 4;
const SETTLE_MS = 250;

const TEST_GLOBS = [
  "{scripts,tools,agents,standard-presets,android,obsidian,wsl,zsh}/**/*.test.ts",
  "{scripts,tools,agents,standard-presets,android,obsidian,wsl,zsh}/**/tests/**/*.ts",
];
const WRITER =
  "(?:mkdtemp|mkdtempSync|mkdir|mkdirSync|writeFile|writeFileSync|appendFile|appendFileSync|copyFile|copyFileSync|symlink|symlinkSync|rename|renameSync|Bun\\.write)";
const LITERAL_TMP = "[\"'`]/(?:var/tmp|tmp|dev/shm)(?:[/\"'`])";
const LEAK = new RegExp(
  `\\b${WRITER}\\(\\s*(?:join\\(\\s*)?${LITERAL_TMP}`,
  "u",
);

export function topLevel(dir: string): string[] {
  return fromThrowable(() => readdirSync(dir))()
    .unwrapOr<string[]>([])
    .toSorted();
}

export function newEntries(before: string[], after: string[]): string[] {
  const known = new Set(before);
  return after.filter((name) => !known.has(name));
}

function ownedByMe(path: string): boolean {
  const stat = fromThrowable(() => statSync(path))();
  const uid = process.getuid?.();
  return stat.isOk() && (uid === undefined || stat.value.uid === uid);
}

/** True when the comment block directly above `index` carries `tmp-ok: <reason>`. */
function exempt(lines: string[], index: number): boolean {
  for (let i = index - 1; i >= 0 && /^\s*\/\//u.test(lines[i] ?? ""); i--) {
    if (/\btmp-ok:\s*\S/u.test(lines[i] ?? "")) return true;
  }
  return false;
}

/** Lines of `text` that write under a literal system temp path, unless justified with `// tmp-ok: <reason>`. */
export function staticFindings(path: string, text: string): string[] {
  const lines = text.split("\n");
  return lines.flatMap((line, index) =>
    LEAK.test(line) && !exempt(lines, index)
      ? [
          `${path}:${index + 1}: writes under a literal system temp path; use mkdtempSync(join(tmpdir(), …)) so the test preload's TMPDIR owns it`,
        ]
      : [],
  );
}

/** Test files one TEST_GLOBS pattern selects under `root`, minus node_modules. */
function testFiles(root: string, pattern: string): string[] {
  const found = new Bun.Glob(pattern).scanSync({ cwd: root, onlyFiles: true });
  return [...found].filter((path) => !path.split("/").includes("node_modules"));
}

export function lintStatic(root: string): string[] {
  const paths = new Set(
    TEST_GLOBS.flatMap((pattern) => testFiles(root, pattern)),
  );
  return [...paths].toSorted().flatMap((path) => {
    const text = fromThrowable(() => readFileSync(join(root, path), "utf8"))();
    return staticFindings(path, text.unwrapOr(""));
  });
}

/**
 * Entries that `run` added to its private `root` and that remain after a settle window. Entries not
 * owned by this user are ignored (they are another account's, not a test's).
 */
export function leakedBy(root: string, run: () => void): string[] {
  const before = topLevel(root);
  run();
  let fresh = newEntries(before, topLevel(root));
  for (let round = 0; round < SETTLE_ROUNDS && fresh.length > 0; round++) {
    Bun.sleepSync(SETTLE_MS);
    const previous = fresh;
    fresh = newEntries(before, topLevel(root)).filter((name) =>
      previous.includes(name),
    );
  }
  return fresh.filter((name) => ownedByMe(join(root, name)));
}

export type Probe = {
  /** argv run at the repo root; default: `bun test <the preload's own test>`. */
  readonly command?: string[];
  /** Directory under which to create the probe's private TMPDIR; default os.tmpdir(). */
  readonly ambientTmp?: string;
};

/** Run the probe and attribute leftovers only inside its private TMPDIR. */
export function probeProblems(root: string, options: Probe = {}): string[] {
  const command = options.command ?? ["bun", "test", PROBE_TEST];
  const ambientTmp = options.ambientTmp ?? tmpdir();
  const privateTmp = mkdtempSync(join(ambientTmp, "lint-tmp-probe-")); // sync-ok: synchronous probeProblems callers require TMPDIR creation before spawning the probe.
  using cleanup = new DisposableStack();
  cleanup.defer(() => {
    rmSync(privateTmp, { recursive: true, force: true }); // sync-ok: synchronous DisposableStack must finish cleanup before probeProblems returns to its callers.
  });
  const env: Record<string, string | undefined> = {
    ...process.env,
    TMPDIR: privateTmp,
  };
  delete env[RUN_DIR_ENV];
  let exitCode: number | null = null;
  let stderr = "";
  const leaked = leakedBy(privateTmp, () => {
    const result = Bun.spawnSync(command, {
      cwd: root,
      env,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    });
    exitCode = result.exitCode;
    stderr = result.stderr.toString().trim().split("\n").slice(-5).join("\n");
  });
  const problems = leaked.map(
    (name) =>
      `${join(privateTmp, name)}: new top-level entry left by the probe`,
  );
  if (exitCode !== 0)
    problems.push(
      `probe \`${command.join(" ")}\` exited ${exitCode}\n${stderr}`,
    );
  return problems;
}

export function lintTmpLeaks(root: string, options: Probe = {}): string[] {
  return [...lintStatic(root), ...probeProblems(root, options)];
}

function report(problems: string[]): number {
  if (problems.length === 0) {
    process.stdout.write("OK: tests leave nothing in /tmp\n");
    return 0;
  }
  for (const problem of problems) process.stderr.write(`FAIL: ${problem}\n`);
  return 1;
}

function runAround(command: string[]): number {
  let code = 1;
  const leaked = leakedBy(SYSTEM_TMP, () => {
    code =
      Bun.spawnSync(command, {
        stdout: "inherit",
        stderr: "inherit",
        stdin: "inherit",
        timeout: 3_600_000, // bounded: a full test run; the caller's own timeout is the real limit
      }).exitCode ?? 1;
  });
  const leakCode = report(
    leaked.map((name) => `${join(SYSTEM_TMP, name)}: new top-level entry`),
  );
  return code === 0 ? leakCode : code;
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("FATAL: unknown option '--__proto__'\n");
    process.exit(2);
  }
}

if (import.meta.main) {
  const argv = cli(
    {
      name: "lint-tmp-leaks",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      help: {
        description:
          "Fail when tests leak temp entries. No arguments: static scan + private TMPDIR preload probe. After `--`: run that command and fail on any new /tmp top-level entry.",
        usage: "lint-tmp-leaks [-- <command> [args…]]",
      },
      parameters: ["--", "[command...]"],
    },
    undefined,
    Bun.argv.slice(2),
  );
  const command = argv._.command;
  process.exitCode =
    command.length === 0
      ? report(lintTmpLeaks(resolve(import.meta.dir, "..")))
      : runAround(command);
}
