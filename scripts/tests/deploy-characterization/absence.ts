import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type Reference = { path: string; line: number; name: string };

function referencesForLine(
  path: string,
  line: string,
  lineNumber: number,
  names: readonly string[],
): Reference[] {
  return names.flatMap((name) =>
    name !== "" && line.includes(name)
      ? [{ path, line: lineNumber, name }]
      : [],
  );
}

function referencesInFile(
  path: string,
  contents: Buffer,
  names: readonly string[],
): Reference[] {
  if (contents.includes(0)) return [];
  const references: Reference[] = [];
  for (const [index, line] of contents.toString("utf8").split("\n").entries())
    references.push(...referencesForLine(path, line, index + 1, names));
  return references;
}

export async function findReferences(
  root: string,
  names: readonly string[],
): Promise<Reference[]> {
  const references: Reference[] = [];
  const glob = new Bun.Glob("**/*");
  for await (const path of glob.scan({ cwd: root, onlyFiles: true })) {
    if (
      path === ".git" ||
      path.startsWith(".git/") ||
      path === ".jj" ||
      path.startsWith(".jj/") ||
      path === "node_modules" ||
      path.startsWith("node_modules/")
    )
      continue;
    references.push(
      ...referencesInFile(path, readFileSync(resolve(root, path)), names),
    );
  }
  return references;
}

if (import.meta.main) {
  const names = Bun.argv.slice(2);
  if (names.length === 0) {
    process.stderr.write("usage: bun absence.ts <retired-name> [...names]\n");
    process.exit(2);
  }
  const root = resolve(import.meta.dir, "../../..");
  const references = await findReferences(root, names);
  for (const reference of references)
    process.stdout.write(
      `${reference.path}:${reference.line}: ${reference.name}\n`,
    );
  if (references.length > 0) process.exitCode = 1;
}
