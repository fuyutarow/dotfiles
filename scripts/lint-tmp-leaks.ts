// TESTS-OWN-TMP: no dotfiles test leaves anything in its temp directory.
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { cli } from "cleye";
import { fromAsyncThrowable } from "neverthrow";
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

export async function topLevel(dir: string): Promise<string[]> {
  return (await fromAsyncThrowable(() => readdir(dir))())
    .unwrapOr<string[]>([])
    .toSorted();
}

export function newEntries(before: string[], after: string[]): string[] {
  const known = new Set(before);
  return after.filter((name) => !known.has(name));
}

async function ownedByMe(path: string): Promise<boolean> {
  const statResult = await fromAsyncThrowable(() => stat(path))();
  const uid = process.getuid?.();
  return (
    statResult.isOk() && (uid === undefined || statResult.value.uid === uid)
  );
}

function exempt(lines: string[], index: number): boolean {
  for (let i = index - 1; i >= 0 && /^\s*\/\//u.test(lines[i] ?? ""); i--) {
    if (/\btmp-ok:\s*\S/u.test(lines[i] ?? "")) return true;
  }
  return false;
}

export function staticFindings(path: string, text: string): string[] {
  const lines = text.split("\n");
  return lines.flatMap((line, index) =>
    LEAK.test(line) && !exempt(lines, index)
      ? [
          `${path}:${index + 1}: writes under a literal system temp path; use mkdtemp(join(tmpdir(), …)) so the test preload's TMPDIR owns it`,
        ]
      : [],
  );
}

async function testFiles(root: string, pattern: string): Promise<string[]> {
  const found = await Array.fromAsync(
    new Bun.Glob(pattern).scan({ cwd: root, onlyFiles: true }),
  );
  return found.filter((path) => !path.split("/").includes("node_modules"));
}

export async function lintStatic(root: string): Promise<string[]> {
  const paths = new Set(
    (
      await Promise.all(TEST_GLOBS.map((pattern) => testFiles(root, pattern)))
    ).flat(),
  );
  const findings = await Promise.all(
    [...paths].toSorted().map(async (path) => {
      const text = await fromAsyncThrowable(() =>
        readFile(join(root, path), "utf8"),
      )();
      return staticFindings(path, text.unwrapOr(""));
    }),
  );
  return findings.flat();
}

export async function leakedBy(
  root: string,
  run: () => Promise<void>,
): Promise<string[]> {
  const before = await topLevel(root);
  await run();
  let fresh = newEntries(before, await topLevel(root));
  for (let round = 0; round < SETTLE_ROUNDS && fresh.length > 0; round++) {
    await Bun.sleep(SETTLE_MS);
    const previous = fresh;
    fresh = newEntries(before, await topLevel(root)).filter((name) =>
      previous.includes(name),
    );
  }
  const owned = await Promise.all(
    fresh.map(async (name) =>
      (await ownedByMe(join(root, name))) ? name : undefined,
    ),
  );
  return owned.filter((name) => name !== undefined);
}

export type Probe = {
  readonly command?: string[];
  readonly ambientTmp?: string;
};

async function spawnAndCapture(
  command: string[],
  options: {
    cwd: string;
    env?: Record<string, string | undefined>;
    timeout: number;
  },
): Promise<{ exitCode: number | null; stderr: string }> {
  const child = Bun.spawn(command, {
    ...options,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stderr };
}

export async function probeProblems(
  root: string,
  options: Probe = {},
): Promise<string[]> {
  const command = options.command ?? ["bun", "test", PROBE_TEST];
  const ambientTmp = options.ambientTmp ?? tmpdir();
  const privateTmp = await mkdtemp(join(ambientTmp, "lint-tmp-probe-"));
  const env: Record<string, string | undefined> = {
    ...process.env,
    TMPDIR: privateTmp,
  };
  delete env[RUN_DIR_ENV];
  const runProbe = async (): Promise<string[]> => {
    let result: { exitCode: number | null; stderr: string } | undefined;
    const leaked = await leakedBy(privateTmp, async () => {
      result = await spawnAndCapture(command, {
        cwd: root,
        env,
        timeout: 120_000,
      });
    });
    const problems = leaked.map(
      (name) =>
        `${join(privateTmp, name)}: new top-level entry left by the probe`,
    );
    if (result?.exitCode !== 0) {
      const stderr =
        result?.stderr.trim().split("\n").slice(-5).join("\n") ?? "";
      problems.push(
        `probe \`${command.join(" ")}\` exited ${result?.exitCode ?? "unknown"}${stderr === "" ? "" : `\n${stderr}`}`,
      );
    }
    return problems;
  };
  const outcome = await Promise.try(runProbe).then(
    (value): { kind: "ok"; value: string[] } => ({ kind: "ok", value }),
    (error: unknown): { kind: "err"; error: unknown } => ({
      kind: "err",
      error,
    }),
  );
  await rm(privateTmp, { recursive: true, force: true });
  return outcome.kind === "ok"
    ? outcome.value
    : [`probe failed: ${String(outcome.error)}`];
}

export async function lintTmpLeaks(
  root: string,
  options: Probe = {},
): Promise<string[]> {
  return [...(await lintStatic(root)), ...(await probeProblems(root, options))];
}

function report(problems: string[]): number {
  if (problems.length === 0) {
    process.stdout.write("OK: tests leave nothing in /tmp\n");
    return 0;
  }
  for (const problem of problems) process.stderr.write(`FAIL: ${problem}\n`);
  return 1;
}

async function runAround(command: string[]): Promise<number> {
  let code = 1;
  const leaked = await leakedBy(SYSTEM_TMP, async () => {
    code =
      (
        await spawnAndCapture(command, {
          cwd: process.cwd(),
          timeout: 3_600_000,
        })
      ).exitCode ?? 1;
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
      ? report(await lintTmpLeaks(resolve(import.meta.dir, "..")))
      : await runAround(command);
}
