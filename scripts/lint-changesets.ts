import { readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { changesetDiagnostic, parseChangeset } from "./changeset.ts";

export function lintChangesets(root: string): string[] {
  const problems: string[] = [];
  const toolsRoot = join(root, "tools");
  for (const path of new Bun.Glob("*/.changes/*.md").scanSync({
    cwd: toolsRoot,
    onlyFiles: true,
  })) {
    problems.push(...problemsForFile(root, toolsRoot, path));
  }
  return problems;
}

function problemsForFile(
  root: string,
  toolsRoot: string,
  path: string,
): string[] {
  const absolute = join(toolsRoot, path);
  const parsed = parseChangeset(readFileSync(absolute, "utf8"));
  return parsed.isErr()
    ? [changesetDiagnostic(relative(root, absolute), parsed.error.message)]
    : [];
}

if (import.meta.main) {
  report(lintChangesets(resolve(import.meta.dir, "..")));
}

function report(problems: string[]): void {
  if (problems.length === 0) {
    process.stdout.write("OK: all tool changesets are valid\n");
    return;
  }
  for (const problem of problems) process.stderr.write(`FAIL: ${problem}\n`);
  process.exitCode = 1;
}
