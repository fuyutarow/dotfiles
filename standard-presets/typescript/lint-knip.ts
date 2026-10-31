/// <reference types="bun" />
// The consumer's pinned local knip must emit a valid JSON report with findings data.
// Exit 0 means checked and clean, 1 means findings, 2 means command/report failure.
import { jsonOf, z } from "./zod.ts";

const Report = jsonOf(
  z.looseObject({
    issues: z.array(
      z.looseObject({
        file: z.string(),
        files: z.array(z.unknown()).optional(),
        dependencies: z.array(z.looseObject({ name: z.string() })).optional(),
        devDependencies: z
          .array(z.looseObject({ name: z.string() }))
          .optional(),
        optionalPeerDependencies: z
          .array(z.looseObject({ name: z.string() }))
          .optional(),
        binaries: z.array(z.looseObject({ name: z.string() })).optional(),
        exports: z.array(z.looseObject({ name: z.string() })).optional(),
        types: z.array(z.looseObject({ name: z.string() })).optional(),
        unlisted: z.array(z.looseObject({ name: z.string() })).optional(),
        unresolved: z.array(z.looseObject({ name: z.string() })).optional(),
        duplicates: z.array(z.unknown()).optional(),
        enumMembers: z.array(z.unknown()).optional(),
        namespaceMembers: z.array(z.unknown()).optional(),
        catalog: z.array(z.looseObject({ name: z.string() })).optional(),
        catalogReferences: z.array(z.unknown()).optional(),
      }),
    ),
  }),
);
const NamedItem = z.looseObject({ name: z.string() });
const KnipConfig = z.looseObject({
  workspaces: z.record(
    z.string(),
    z.looseObject({ project: z.array(z.string()).optional() }),
  ),
});

type Finding = { kind: string; file: string; name?: string };

function itemName(item: unknown): string | undefined {
  const parsed = NamedItem.safeParse(item);
  return parsed.success ? parsed.data.name : undefined;
}

function issueFindings(
  issue: z.infer<typeof Report>["issues"][number],
): Finding[] {
  const findings =
    issue.files !== undefined && issue.files.length > 0
      ? [{ kind: "files", file: issue.file }]
      : [];
  const kinds = [
    "dependencies",
    "devDependencies",
    "optionalPeerDependencies",
    "binaries",
    "exports",
    "types",
    "unlisted",
    "unresolved",
    "duplicates",
    "enumMembers",
    "namespaceMembers",
    "catalog",
    "catalogReferences",
  ] as const;
  return findings.concat(
    kinds.flatMap((kind) =>
      (issue[kind] ?? []).map((item) => {
        const name = itemName(item);
        const finding: Finding = { kind, file: issue.file };
        if (name !== undefined) finding.name = name;
        return finding;
      }),
    ),
  );
}

export function parseKnipOutput(stdout: string): Finding[] | undefined {
  if (stdout.trim().length === 0) return undefined;
  const parsed = Report.safeParse(stdout);
  if (!parsed.success) return undefined;
  return parsed.data.issues.flatMap(issueFindings);
}

export async function countProjectFiles(cwd: string): Promise<number | null> {
  const configText = await Bun.file(`${cwd}/knip.jsonc`).text();
  const configResult = KnipConfig.safeParse(Bun.JSONC.parse(configText));
  if (!configResult.success) return null;
  const matchedFiles = await Promise.all(
    Object.values(configResult.data.workspaces).flatMap((workspace) =>
      (workspace.project ?? []).map(async (pattern) => {
        const paths: string[] = [];
        for await (const path of new Bun.Glob(pattern).scan({
          cwd,
          onlyFiles: true,
        }))
          paths.push(path);
        return paths;
      }),
    ),
  );
  return new Set(matchedFiles.flat()).size;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function summaryOf(counts: Record<string, number>): string {
  const kinds: string[] = Object.keys(counts);
  kinds.sort(compareStrings);
  if (kinds.length === 0) return "no findings";
  let summary = "";
  for (let index = 0; index < kinds.length; index += 1) {
    const kind = kinds[index] ?? "";
    if (index > 0) summary += ", ";
    summary += `${kind}: ${counts[kind] ?? 0}`;
  }
  return summary;
}

export async function handleKnipResult(
  stdout: string,
  stderr: string,
  exit: number,
  cwd: string,
): Promise<number> {
  if (stderr.length > 0) process.stderr.write(stderr);
  const findings = parseKnipOutput(stdout);
  if (findings === undefined) {
    if (stdout.length > 0) process.stdout.write(stdout);
    process.stderr.write(
      `lint-knip: FATAL: knip exited ${exit} without a valid JSON report; check the local knip installation and knip.jsonc\n`,
    );
    return 2;
  }
  const counts: Record<string, number> = {};
  for (const finding of findings)
    counts[finding.kind] = (counts[finding.kind] ?? 0) + 1;
  const summary = summaryOf(counts);
  process.stdout.write(`lint-knip: ${summary}\n`);
  for (const finding of findings)
    process.stdout.write(
      `lint-knip: ${finding.kind}: ${finding.name ?? finding.file} (${finding.file})\n`,
    );
  const checkedFiles = await countProjectFiles(cwd).catch(() => null);
  if (checkedFiles === null || checkedFiles === 0) {
    process.stderr.write(
      "lint-knip: FATAL: no project files matched knip.jsonc project patterns\n",
    );
    return 2;
  }
  process.stdout.write(`lint-knip: checked ${checkedFiles} project file(s)\n`);
  if (findings.length > 0) return 1;
  if (exit !== 0) {
    process.stderr.write(
      `lint-knip: FATAL: knip exited ${exit} despite an empty report\n`,
    );
    return 2;
  }
  return 0;
}

async function main(): Promise<number> {
  const child = Bun.spawn(
    [
      process.execPath,
      "--no-env-file",
      "x",
      "--no-install",
      "--bun",
      "knip",
      "--no-progress",
      "--reporter",
      "json",
    ],
    { stdout: "pipe", stderr: "pipe", timeout: 120_000 },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return handleKnipResult(stdout, stderr, exit, process.cwd());
}

if (import.meta.main)
  process.exitCode = await main().catch((error: unknown) => {
    process.stderr.write(`lint-knip: FATAL: ${String(error)}\n`);
    return 2;
  });
