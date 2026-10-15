import { access as accessPath } from "node:fs/promises";

import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { changesetDiagnostic, parseChangeset } from "./changeset.ts";

const pathExists = (path: Parameters<typeof accessPath>[0]) =>
  accessPath(path).then(
    () => true,
    () => false,
  );

type Bump = "patch" | "minor" | "major";
type Change = { path: string; bump: Bump; entry: string };
type ToolRelease = { tool: string; version: string; entries: number };
export type LandChangesetsResult = {
  paths: string[];
  consumedChangesets: string[];
  releaseFiles: string[];
  releases: ToolRelease[];
};

const bumpRank: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };
const parseChange = async (path: string): Promise<Result<Change, Error>> => {
  const text = await readFile(path, "utf8");
  const parsed = parseChangeset(text);
  if (parsed.isErr())
    return err(new Error(changesetDiagnostic(path, parsed.error.message)));
  return ok({ path, ...parsed.value });
};

async function readToolChanges(
  toolsRoot: string,
  tool: string,
): Promise<Result<Change[], Error>> {
  const changesDir = join(toolsRoot, tool, ".changes");
  if (!(await pathExists(changesDir))) return ok([]);
  const changeFiles = (
    await readdir(changesDir, { withFileTypes: true })
  ).filter((entry) => entry.isFile() && entry.name.endsWith(".md"));
  const changes: Change[] = [];
  for (const changeFile of changeFiles) {
    const parsed = await parseChange(join(changesDir, changeFile.name));
    if (parsed.isErr()) return err(parsed.error);
    changes.push(parsed.value);
  }
  return ok(changes);
}

function bumpedVersion(current: string, bump: Bump): Result<string, Error> {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(current);
  if (match === null)
    return err(new Error(`invalid SemVer package version: ${current}`));
  const version = match.slice(1).map(Number);
  if (version.some((part) => !Number.isSafeInteger(part)))
    return err(
      new Error(
        `SemVer package version is outside safe integer range: ${current}`,
      ),
    );
  const [major = 0, minor = 0, patch = 0] = version;
  if (bump === "major") return ok(`${major + 1}.0.0`);
  if (bump === "minor") return ok(`${major}.${minor + 1}.0`);
  return ok(`${major}.${minor}.${patch + 1}`);
}

export async function applyToolChangesets(
  root: string,
  date = Temporal.Now.plainDateISO().toString(),
): Promise<Result<LandChangesetsResult, Error>> {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date))
    return err(new Error(`invalid release date: ${date}`));
  const toolsRoot = join(root, "tools");
  if (!(await pathExists(toolsRoot)))
    return ok({
      paths: [],
      consumedChangesets: [],
      releaseFiles: [],
      releases: [],
    });
  const pending: { tool: string; change: Change }[] = [];
  for (const toolDir of (
    await readdir(toolsRoot, { withFileTypes: true })
  ).filter((entry) => entry.isDirectory())) {
    const changes = await readToolChanges(toolsRoot, toolDir.name);
    if (changes.isErr()) return err(changes.error);
    pending.push(
      ...changes.value.map((change) => ({ tool: toolDir.name, change })),
    );
  }
  const groups = new Map<string, Change[]>();
  for (const { tool, change } of pending) {
    const group = groups.get(tool) ?? [];
    group.push(change);
    groups.set(tool, group);
  }
  const prepared: {
    tool: string;
    packagePath: string;
    changelogPath: string;
    packageText: string;
    changelogText: string;
    changes: Change[];
    version: string;
  }[] = [];
  for (const [tool, changes] of groups) {
    const orderedChanges = changes.toSorted((left, right) =>
      left.path.localeCompare(right.path),
    );
    const bump = orderedChanges.reduce<Bump>(
      (highest, change) =>
        bumpRank[change.bump] > bumpRank[highest] ? change.bump : highest,
      "patch",
    );
    const packagePath = join(toolsRoot, tool, "package.json");
    const changelogPath = join(toolsRoot, tool, "CHANGELOG.md");
    const packageText = await readFile(packagePath, "utf8");
    const packageJson = jsonOf(
      z.looseObject({ version: z.string() }),
    ).safeParse(packageText);
    if (!packageJson.success)
      return err(
        new Error(
          `${packagePath}: invalid package JSON or missing version: ${packageJson.error.message}`,
        ),
      );
    const next = bumpedVersion(packageJson.data.version, bump);
    if (next.isErr()) return err(next.error);
    const changelogText = (await pathExists(changelogPath))
      ? await readFile(changelogPath, "utf8")
      : "# Changelog\n";
    if (!changelogText.startsWith("# Changelog\n"))
      return err(new Error(`${changelogPath}: expected # Changelog preamble`));
    prepared.push({
      tool,
      packagePath,
      changelogPath,
      packageText,
      changelogText,
      changes: orderedChanges,
      version: next.value,
    });
  }
  const paths = new Set<string>();
  const consumedChangesets = new Set<string>();
  const releaseFiles = new Set<string>();
  const releases: ToolRelease[] = [];
  for (const item of prepared) {
    const packageJson = jsonOf(z.record(z.string(), z.unknown())).safeParse(
      item.packageText,
    );
    if (!packageJson.success)
      return err(new Error(`${item.packagePath}: invalid package JSON`));
    const packageData = { ...packageJson.data, version: item.version };
    const newSection = `## ${item.version} — ${date}\n\n${item.changes.map(({ entry }) => `- ${entry}`).join("\n")}`;
    const previousSections = item.changelogText
      .slice("# Changelog\n".length)
      .trim();
    await writeFile(
      item.packagePath,
      `${JSON.stringify(packageData, null, 2)}\n`,
    );
    await writeFile(
      item.changelogPath,
      [`# Changelog`, newSection, previousSections]
        .filter(Boolean)
        .join("\n\n") + "\n",
    );
    const packagePath = `tools/${item.tool}/package.json`;
    const changelogPath = `tools/${item.tool}/CHANGELOG.md`;
    paths.add(packagePath);
    paths.add(changelogPath);
    releaseFiles.add(packagePath);
    releaseFiles.add(changelogPath);
    for (const { path } of item.changes) {
      await unlink(path);
      const relative = path.slice(root.length + 1);
      paths.add(relative);
      consumedChangesets.add(relative);
    }
    releases.push({
      tool: item.tool,
      version: item.version,
      entries: item.changes.length,
    });
  }
  return ok({
    paths: [...paths].toSorted(),
    consumedChangesets: [...consumedChangesets].toSorted(),
    releaseFiles: [...releaseFiles].toSorted(),
    releases,
  });
}
