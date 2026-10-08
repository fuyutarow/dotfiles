import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";

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

async function scan(cwd: string): Promise<number> {
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
    const content = await Bun.file(join(cwd, file)).text();
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
