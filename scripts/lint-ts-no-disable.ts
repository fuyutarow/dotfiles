import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import {
  jjChanged,
  jjContent,
  jjContext,
  jjFiles,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";

type Listing = { code: number; stdout: string; stderr: string };

function matchingLineNumbers(content: string): number[] {
  return content
    .split(/\r?\n/u)
    .flatMap((line, index) =>
      /(oxlint|eslint)-disable/u.test(line) ? [index + 1] : [],
    );
}

function listTrackedTypeScript(cwd: string): Listing {
  const result = Bun.spawnSync(
    [
      "bun",
      join(import.meta.dir, "tracked-files.ts"),
      "--expect-non-empty",
      ":(glob)**/*.ts",
      ":(glob)**/*.tsx",
    ],
    { cwd, stdout: "pipe", stderr: "pipe", timeout: 30_000 },
  );
  return {
    code: result.exitCode ?? 1,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString().trim(),
  };
}

function scanJjPath(
  context: NonNullable<ReturnType<typeof jjContext>>,
  path: string,
  present: Set<string>,
): number {
  if (!/\.tsx?$/u.test(path) || !present.has(path)) return 0;
  const lines = jjContent(context, path).toString().split("\n");
  let findings = 0;
  for (const [index, line] of lines.entries()) {
    if (!/(oxlint|eslint)-disable/u.test(line)) continue;
    process.stdout.write(`${path}:${index + 1}:${line}\n`);
    findings++;
  }
  return findings;
}

async function scan(cwd: string): Promise<number> {
  const context = jjContext();
  if (context !== undefined) {
    const present = new Set(jjFiles(context.rev, context.root));
    let findings = 0;
    for (const path of jjChanged(context)) {
      findings += scanJjPath(context, path, present);
    }
    process.stdout.write(
      `lint:ts-no-disable: ${findings} finding(s) in selected jj snapshot\n`,
    );
    return findings === 0 ? 0 : 1;
  }

  const listing = listTrackedTypeScript(cwd);
  if (listing.code !== 0) {
    process.stderr.write(
      `FATAL: could not list tracked TypeScript files${listing.stderr === "" ? "" : `: ${listing.stderr}`}\n`,
    );
    return 2;
  }

  const files = listing.stdout.split("\0").filter(Boolean);
  let found = false;
  for (const file of files) {
    const source = Bun.file(join(cwd, file));
    if (!(await source.exists())) continue;
    const content = await source.text();
    for (const line of matchingLineNumbers(content)) {
      process.stdout.write(`${file}:${line}\n`);
      found = true;
    }
  }
  return found ? 1 : 0;
}

const attempted = await fromAsyncThrowable(() => scan(process.cwd()))();
if (attempted.isErr()) {
  const error = attempted.error;
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 2;
} else process.exitCode = attempted.value;
