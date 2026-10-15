import {
  existsSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";

const bumpSchema = z.enum(["patch", "minor", "major"]);
type Bump = z.infer<typeof bumpSchema>;
type Change = { path: string; bump: Bump; entry: string };
type ToolRelease = { tool: string; version: string; entries: number };
export type LandChangesetsResult = {
  paths: string[];
  releases: ToolRelease[];
};

const bumpRank: Record<Bump, number> = { patch: 0, minor: 1, major: 2 };
const parseChange = (path: string): Result<Change, Error> => {
  const text = readFileSync(path, "utf8");
  const match = /^---\n(bump: [^\n]+)\n---\n\n([^\n]+)\n?$/u.exec(text);
  if (match === null)
    return err(
      new Error(`${path}: expected frontmatter bump and one entry line`),
    );
  const bump = bumpSchema.safeParse(match[1]?.slice("bump: ".length));
  const entry = match[2]?.trim();
  if (!bump.success || entry === undefined || entry.length === 0)
    return err(
      new Error(`${path}: bump and one non-empty entry line are required`),
    );
  if (entry.startsWith("-") || entry.startsWith("#"))
    return err(
      new Error(`${path}: entry is plain text; land adds the changelog bullet`),
    );
  return ok({ path, bump: bump.data, entry });
};

function readToolChanges(
  toolsRoot: string,
  tool: string,
): Result<Change[], Error> {
  const changesDir = join(toolsRoot, tool, ".changes");
  if (!existsSync(changesDir)) return ok([]);
  const changeFiles = readdirSync(changesDir, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith(".md"),
  );
  const changes: Change[] = [];
  for (const changeFile of changeFiles) {
    const parsed = parseChange(join(changesDir, changeFile.name));
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

export function applyToolChangesets(
  root: string,
  date = Temporal.Now.plainDateISO().toString(),
): Result<LandChangesetsResult, Error> {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date))
    return err(new Error(`invalid release date: ${date}`));
  const toolsRoot = join(root, "tools");
  if (!existsSync(toolsRoot)) return ok({ paths: [], releases: [] });
  const pending: { tool: string; change: Change }[] = [];
  for (const toolDir of readdirSync(toolsRoot, { withFileTypes: true }).filter(
    (entry) => entry.isDirectory(),
  )) {
    const changes = readToolChanges(toolsRoot, toolDir.name);
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
    const packageText = readFileSync(packagePath, "utf8");
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
    const changelogText = existsSync(changelogPath)
      ? readFileSync(changelogPath, "utf8")
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
    writeFileSync(
      item.packagePath,
      `${JSON.stringify(packageData, null, 2)}\n`,
    );
    writeFileSync(
      item.changelogPath,
      [`# Changelog`, newSection, previousSections]
        .filter(Boolean)
        .join("\n\n") + "\n",
    );
    paths.add(`tools/${item.tool}/package.json`);
    paths.add(`tools/${item.tool}/CHANGELOG.md`);
    for (const { path } of item.changes) {
      unlinkSync(path);
      paths.add(path.slice(root.length + 1));
    }
    releases.push({
      tool: item.tool,
      version: item.version,
      entries: item.changes.length,
    });
  }
  return ok({ paths: [...paths].toSorted(), releases });
}
