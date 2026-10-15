import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { changesetDiagnostic, parseChangeset } from "./changeset.ts";

export async function lintChangesets(root: string): Promise<string[]> {
  const problems: string[] = [];
  const toolsRoot = join(root, "tools");
  for await (const path of new Bun.Glob("*/.changes/*.md").scan({
    cwd: toolsRoot,
    onlyFiles: true,
  })) {
    problems.push(...(await problemsForFile(root, toolsRoot, path)));
  }
  return problems;
}

async function problemsForFile(
  root: string,
  toolsRoot: string,
  path: string,
): Promise<string[]> {
  const absolute = join(toolsRoot, path);
  const parsed = parseChangeset(await readFile(absolute, "utf8"));
  return parsed.isErr()
    ? [changesetDiagnostic(relative(root, absolute), parsed.error.message)]
    : [];
}

if (import.meta.main) {
  report(await lintChangesets(resolve(import.meta.dir, "..")));
}

function report(problems: string[]): void {
  if (problems.length === 0) {
    process.stdout.write("OK: all tool changesets are valid\n");
    return;
  }
  for (const problem of problems) process.stderr.write(`FAIL: ${problem}\n`);
  process.exitCode = 1;
}
