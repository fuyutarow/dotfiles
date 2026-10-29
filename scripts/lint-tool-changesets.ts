import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { applyToolChangesets } from "./land-changesets.ts";
import { join } from "node:path";
import { jsonOf, z } from "../tools/shared/src/zod.ts";
import { changesetDiagnostic, parseChangeset } from "./changeset.ts";
import { attempt } from "../tools/shared/src/attempt.ts";

export type ToolDiffEntry = { path: string; status: "A" | "M" | "D" };

export type ToolChangesetReaders = {
  current: (path: string) => string | undefined;
  base: (path: string) => string | undefined;
};

const relevantToolPath =
  /^tools\/[^/]+\/(?:package\.json|CHANGELOG\.md|\.changes\/.+)$/u;
const VERSIONED_CHANGESET = /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?\.md$/u;
const CHANGESET_SLUG = /^[a-z0-9][a-z0-9-]*\.md$/u;

function packageVersion(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const parsed = jsonOf(
    z.looseObject({ version: z.string().optional() }),
  ).safeParse(text);
  return parsed.success ? parsed.data.version : undefined;
}

function readyChangeset(tool: string): string {
  return `Create a release note with mise run changeset -- ${tool} patch "Describe the user-visible change"`;
}

export function toolChangesetProblems(
  entries: readonly ToolDiffEntry[],
  readers: ToolChangesetReaders,
): string[] {
  const violations = new Map<string, Set<string>>();
  const add = (tool: string, reason: string | undefined): void => {
    if (reason === undefined) return;
    const reasons = violations.get(tool) ?? new Set<string>();
    reasons.add(reason);
    violations.set(tool, reasons);
  };

  for (const { path, status } of entries) {
    const packageMatch = /^tools\/([^/]+)\/package\.json$/u.exec(path);
    if (packageMatch !== null) {
      const tool = packageMatch[1] ?? "";
      const beforeText = readers.base(path);
      const afterText = readers.current(path);
      const before = packageVersion(beforeText);
      const after = packageVersion(afterText);
      add(
        tool,
        before !== after ||
          ((before === undefined || after === undefined) &&
            beforeText !== afterText)
          ? `${path}: package version changed in the workspace diff`
          : undefined,
      );
      continue;
    }

    const changelogMatch = /^tools\/([^/]+)\/CHANGELOG\.md$/u.exec(path);
    if (changelogMatch !== null) {
      add(
        changelogMatch[1] ?? "",
        `${path}: CHANGELOG.md is written by land, not by the worker`,
      );
      continue;
    }

    const changesetMatch = /^tools\/([^/]+)\/\.changes\/([^/]+)$/u.exec(path);
    if (changesetMatch === null || status === "D") continue;
    const tool = changesetMatch[1] ?? "";
    const filename = changesetMatch[2] ?? "";
    const content = readers.current(path);
    if (content === undefined) continue;
    if (VERSIONED_CHANGESET.test(filename)) {
      add(
        tool,
        `${path}: changeset filename must be a descriptive slug, not a version`,
      );
      continue;
    }
    if (!CHANGESET_SLUG.test(filename)) {
      add(
        tool,
        `${path}: changeset filename must be <slug>.md using lowercase letters, numbers, and hyphens`,
      );
      continue;
    }
    const parsed = parseChangeset(content);
    if (parsed.isErr())
      add(tool, changesetDiagnostic(path, parsed.error.message));
  }

  return [...violations]
    .toSorted(([left], [right]) => left.localeCompare(right))
    .flatMap(([tool, reasons]) =>
      [...reasons].map((reason) => `- ${reason}`).concat(readyChangeset(tool)),
    );
}

export function toolDiffEntries(
  baseFiles: ReadonlyMap<string, string>,
  currentFiles: ReadonlyMap<string, string>,
): ToolDiffEntry[] {
  return [...new Set([...baseFiles.keys(), ...currentFiles.keys()])]
    .filter(
      (path) =>
        relevantToolPath.test(path) &&
        baseFiles.get(path) !== currentFiles.get(path),
    )
    .toSorted()
    .map((path) => {
      if (!currentFiles.has(path)) return { path, status: "D" };
      if (!baseFiles.has(path)) return { path, status: "A" };
      return { path, status: "M" };
    });
}

async function jjText(
  root: string,
  args: string[],
): Promise<string | undefined> {
  const result = await attempt(async () => {
    const child = Bun.spawn(["jj", ...args], {
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
    });
    const [stdout, , exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return exit === 0 ? stdout : undefined;
  });
  return result.ok ? result.value : undefined;
}

export async function lintToolChangesets(
  root: string,
): Promise<string[] | undefined> {
  // Pin the worker's fork point: alpha may advance with land-generated releases.
  const commonAncestors = await jjText(root, [
    "--ignore-working-copy",
    "--no-pager",
    "--color",
    "never",
    "log",
    "--no-graph",
    "-r",
    "heads(::@ & ::alpha)",
    "-T",
    'commit_id ++ "\\n"',
  ]);
  const bases = commonAncestors?.trim().split("\n").filter(Boolean);
  if (bases?.length !== 1) return undefined;
  const base = bases[0];
  if (base === undefined) return undefined;
  const baseFiles = await revisionToolFiles(root, base);
  if (baseFiles === undefined) return undefined;
  const currentPaths = new Set<string>();
  for (const pattern of [
    "tools/*/package.json",
    "tools/*/CHANGELOG.md",
    "tools/*/.changes/**",
  ]) {
    for await (const path of new Bun.Glob(pattern).scan({
      cwd: root,
      onlyFiles: true,
    }))
      currentPaths.add(path);
  }
  const currentFiles = new Map<string, string>();
  for (const path of currentPaths)
    currentFiles.set(path, await readFile(join(root, path), "utf8"));
  const contextPath = join(root, ".jj", "land-release.json");
  if (await Bun.file(contextPath).exists()) {
    const context = jsonOf(LandReleaseContext).safeParse(
      await readFile(contextPath, "utf8"),
    );
    if (!context.success || context.data.base !== base) return undefined;
    return releaseProblems(root, context.data, baseFiles, currentFiles);
  }
  return problemsForMaps(baseFiles, currentFiles);
}

async function revisionToolFiles(
  root: string,
  base: string,
): Promise<Map<string, string> | undefined> {
  const listed = await jjText(root, [
    "--ignore-working-copy",
    "--no-pager",
    "--color",
    "never",
    "file",
    "list",
    "-r",
    base,
    "-T",
    'path ++ "\\n"',
    "--",
    "tools",
  ]);
  if (listed === undefined) return undefined;
  const basePaths = new Set(
    listed
      .split("\n")
      .filter((path) => path !== "" && relevantToolPath.test(path)),
  );
  const baseFiles = new Map<string, string>();
  for (const path of basePaths) {
    const baseText = await jjText(root, [
      "--ignore-working-copy",
      "--no-pager",
      "--color",
      "never",
      "file",
      "show",
      "-r",
      base,
      "--",
      path,
    ]);
    if (baseText === undefined) return undefined;
    baseFiles.set(path, baseText);
  }
  return baseFiles;
}

const LandReleaseContext = z.strictObject({
  base: z.string().regex(/^[0-9a-f]{40,64}$/u),
  candidate: z.string().regex(/^[0-9a-f]{40,64}$/u),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
});

/** A locator for immutable inputs, never an exemption from validation. */
export async function recordLandReleaseCandidate(
  root: string,
  base: string,
  candidate: string,
  date: string,
): Promise<void> {
  await writeFile(
    join(root, ".jj", "land-release.json"),
    JSON.stringify({ base, candidate, date }),
  );
}

function problemsForMaps(
  base: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>,
): string[] {
  return toolChangesetProblems(toolDiffEntries(base, current), {
    base: (path) => base.get(path),
    current: (path) => current.get(path),
  });
}

async function releaseProblems(
  root: string,
  context: z.infer<typeof LandReleaseContext>,
  base: ReadonlyMap<string, string>,
  current: ReadonlyMap<string, string>,
): Promise<string[] | undefined> {
  // The candidate must descend from this workspace's actual fork point.
  const descendant = await jjText(root, [
    "--ignore-working-copy",
    "log",
    "--no-graph",
    "-r",
    context.base + "::" + context.candidate,
    "-T",
    "commit_id",
  ]);
  if (descendant === undefined || !descendant.includes(context.candidate))
    return undefined;
  const candidate = await revisionToolFiles(root, context.candidate);
  if (candidate === undefined) return undefined;
  const workerProblems = problemsForMaps(base, candidate);
  if (workerProblems.length > 0) return workerProblems;
  const replay = await mkdtemp(join(tmpdir(), "versionguard-release-"));
  const checked = await attempt(async () => {
    for (const [path, content] of candidate) {
      await mkdir(dirname(join(replay, path)), { recursive: true });
      await writeFile(join(replay, path), content);
    }
    const applied = await applyToolChangesets(replay, context.date);
    if (applied.isErr()) return [applied.error.message];
    const expected = new Map(candidate);
    for (const path of applied.value.consumedChangesets) expected.delete(path);
    for (const path of applied.value.releaseFiles)
      expected.set(path, await readFile(join(replay, path), "utf8"));
    return toolDiffEntries(expected, current).map(
      ({ path }) =>
        path +
        ": differs from the release reproduced from land's pre-release candidate",
    );
  });
  await rm(replay, { recursive: true, force: true });
  return checked.ok ? checked.value : undefined;
}

const root = import.meta.dir.replace(/\/scripts$/u, "");
if (import.meta.main) {
  const result = await attempt(() => lintToolChangesets(root));
  const problems = result.ok ? result.value : undefined;
  if (problems === undefined) {
    process.stderr.write(
      "tool changesets: FATAL: could not compare workspace tool files with the unique fork point of @ and alpha\n",
    );
    process.exitCode = 2;
  } else if (problems.length === 0) {
    process.stdout.write("tool changesets: PASS\n");
  } else {
    process.stderr.write(`tool changesets: FAIL\n${problems.join("\n")}\n`);
    process.exitCode = 1;
  }
}
