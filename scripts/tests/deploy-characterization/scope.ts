import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function changedPaths(diff: string): string[] {
  const paths = new Set<string>();
  let oldPath: string | undefined;
  for (const line of diff.split("\n")) {
    const fileHeader = /^diff --git a\/(.+) b\/(.+)$/u.exec(line);
    if (fileHeader?.[2] !== undefined) paths.add(fileHeader[2]);
    const oldHeader = /^--- a\/(.+)$/u.exec(line);
    oldPath = oldHeader?.[1];
    const unifiedHeader = /^\+\+\+ b\/(.+)$/u.exec(line);
    if (unifiedHeader?.[1] !== undefined) paths.add(unifiedHeader[1]);
    if (line === "+++ /dev/null" && oldPath !== undefined) paths.add(oldPath);
    const summary = /^(?:A|M|D|R|C)\s+(.+)$/u.exec(line);
    if (summary?.[1] !== undefined) paths.add(summary[1]);
  }
  return paths.values().toArray().toSorted();
}

if (import.meta.main) {
  const args = Bun.argv.slice(2);
  const separator = args.indexOf("--intended");
  const diffPath = args[0];
  const intended = separator < 0 ? [] : args.slice(separator + 1);
  if (diffPath === undefined || separator < 1 || intended.length === 0) {
    process.stderr.write(
      "usage: bun scope.ts <jj-diff-file|-> --intended <path> [...paths]\n",
    );
    process.exit(2);
  }
  const diff =
    diffPath === "-"
      ? await new Response(Bun.stdin.stream()).text()
      : readFileSync(resolve(diffPath), "utf8");
  const allowed = new Set(intended);
  const unexplained = changedPaths(diff).filter((path) => !allowed.has(path));
  for (const path of unexplained)
    process.stdout.write(`unexplained: ${path}\n`);
  if (unexplained.length > 0) process.exitCode = 1;
}
