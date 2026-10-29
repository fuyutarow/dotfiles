import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";

const SkillName = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/u);
const SourceName = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u);

const DeclarationSchema = z.strictObject({
  cli_version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  skills: z
    .array(z.strictObject({ source: SourceName, skill: SkillName }))
    .default([]),
});

const SkillLockSchema = z.looseObject({
  skills: z.record(z.string(), z.unknown()),
});

export type ThirdPartySkill = z.infer<typeof DeclarationSchema>;
export type SkillEntry = ThirdPartySkill["skills"][number];
export type SkillLock = z.infer<typeof SkillLockSchema>;
export type SkillFile = { path: string; content: string };

export const DECLARATION_PATH = "agents/skills.thirdparty.toml";

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseDeclaration(
  text: string,
): Result<ThirdPartySkill, string> {
  const toml = fromThrowable((source: string) => Bun.TOML.parse(source))(text);
  if (toml.isErr()) return err(`invalid TOML: ${errorText(toml.error)}`);

  const parsed = DeclarationSchema.safeParse(toml.value);
  if (!parsed.success)
    return err(
      `invalid declaration: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );

  const names = parsed.data.skills.map((entry) => entry.skill);
  if (new Set(names).size !== names.length)
    return err("invalid declaration: skill names must be unique");

  return ok(parsed.data);
}

export function readDeclaration(root: string): Result<ThirdPartySkill, string> {
  const file = fromThrowable((path: string) => readFileSync(path, "utf8"))(
    resolve(root, DECLARATION_PATH),
  );
  if (file.isErr()) return err(`${DECLARATION_PATH}: ${errorText(file.error)}`);
  return parseDeclaration(file.value);
}

export function formatDeclaration(declaration: ThirdPartySkill): string {
  const rows = declaration.skills
    .map(
      ({ source, skill }) =>
        `\n[[skills]]\nsource = ${JSON.stringify(source)}\nskill = ${JSON.stringify(skill)}`,
    )
    .join("\n");
  return `cli_version = ${JSON.stringify(declaration.cli_version)}\n${rows}\n`;
}

export function parseSkillLock(text: string): Result<SkillLock, string> {
  const parsed = jsonOf(SkillLockSchema).safeParse(text);
  if (!parsed.success)
    return err(
      `invalid skills lock: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  return ok(parsed.data);
}

export function skillFiles(skillsDir: string): SkillFile[] {
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => resolve(skillsDir, entry.name, "SKILL.md"))
    .filter((path) => existsSync(path))
    .map((path) => ({ path, content: readFileSync(path, "utf8") }));
}

/** In-house skills have no vendor-specific agents/ scaffold, including links or empty entries. */
export function skillLayoutRefusal(skill: string): string | undefined {
  const path = resolve(skill, "agents");
  return pathExists(path)
    ? `${path}: nested agents/ entries are forbidden in in-house skills; remove the vendor UI scaffold`
    : undefined;
}

export function inHouseLayoutRefusals(skillsDir: string): string[] {
  // sync-ok: Startup metadata admission must finish before any skill installation effects.
  if (!existsSync(skillsDir)) return [];
  // sync-ok: One shallow package-directory listing, with no payload traversal or hot-path work.
  return readdirSync(skillsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .flatMap((entry) => {
      const refusal = skillLayoutRefusal(resolve(skillsDir, entry.name));
      return refusal === undefined ? [] : [refusal];
    });
}

function frontmatterName(content: string): string | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(content)?.[1];
  if (block === undefined) return undefined;
  const value = /^name:\s*["']?([a-z0-9][a-z0-9-]{0,63})["']?\s*$/mu.exec(
    block,
  )?.[1];
  return value;
}

export function thirdPartySkillFiles(
  files: readonly SkillFile[],
  declaration: ThirdPartySkill,
): { path: string; skill: string }[] {
  const names = new Set(declaration.skills.map((entry) => entry.skill));
  return files.flatMap((file) => {
    const name = frontmatterName(file.content);
    return name !== undefined && names.has(name)
      ? [{ path: file.path, skill: name }]
      : [];
  });
}

export function pathExists(path: string): boolean {
  return fromThrowable((value: string) => lstatSync(value))(path).isOk();
}

export function isSymlink(path: string): boolean {
  return fromThrowable((value: string) => lstatSync(value))(path)
    .map((stat) => stat.isSymbolicLink())
    .unwrapOr(false);
}

function canonicalPath(path: string): string | undefined {
  const absolute = resolve(path);
  const direct = fromThrowable((value: string) => realpathSync(value))(
    absolute,
  );
  if (direct.isOk()) return direct.value;

  const link = fromThrowable((value: string) => readlinkSync(value))(absolute);
  if (link.isOk()) {
    const target = isAbsolute(link.value)
      ? link.value
      : resolve(dirname(absolute), link.value);
    return canonicalPath(target) ?? resolve(target);
  }
  return undefined;
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

function repositoryAncestor(path: string): string | undefined {
  let current = path;
  while (true) {
    if (
      existsSync(resolve(current, ".git")) ||
      existsSync(resolve(current, ".jj"))
    )
      return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** Detects both this checkout and other repo targets the pinned CLI must not write through. */
export function resolvesIntoRepository(path: string, root: string): boolean {
  const resolved = canonicalPath(path);
  if (resolved === undefined) return false;
  const rootPath = canonicalPath(root) ?? resolve(root);
  if (isWithin(rootPath, resolved)) return true;
  return isSymlink(path) && repositoryAncestor(resolved) !== undefined;
}

/** Only an individual link to its namesake source in this checkout can be taken over. */
export function isOwnInHouseLink(
  path: string,
  root: string,
  name: string,
): boolean {
  if (!isSymlink(path)) return false;
  const checkout = canonicalPath(root);
  // sync-ok: Admission must resolve the existing link before permitting any installation.
  const target = fromThrowable((value: string) => realpathSync(value))(path);
  if (checkout === undefined || target.isErr()) return false;
  return target.value === resolve(checkout, "agents/skills", name);
}

export function skillCliArgs(
  version: string,
  source: string,
  names: readonly string[],
): string[] {
  return [
    "bunx",
    "--bun",
    "--yes",
    `skills@${version}`,
    "add",
    source,
    ...names.flatMap((name) => ["--skill", name]),
    "-g",
    "--agent",
    "claude-code",
    "codex",
    "--copy",
    "-y",
  ];
}

export function homePathRefusals(
  home: string,
  root: string,
  names: readonly string[],
  inHouseNames: readonly string[] = [],
): string[] {
  const paths = [
    `${home}/.agents/skills`,
    `${home}/.agents/.skill-lock.json`,
    `${home}/.claude/skills`,
    ...names.flatMap((name) => [
      `${home}/.agents/skills/${name}`,
      `${home}/.claude/skills/${name}`,
    ]),
  ];
  const allowed = new Set(
    inHouseNames.flatMap((name) =>
      [".agents/skills", ".claude/skills"]
        .map((base) => resolve(home, base, name))
        .filter((path) => isOwnInHouseLink(path, root, name)),
    ),
  );
  const unsafe = [...new Set(paths)].filter(
    (path) => !allowed.has(resolve(path)) && resolvesIntoRepository(path, root),
  );
  if (unsafe.length === 0) return [];
  const more =
    unsafe.length > 1 ? ` (and ${unsafe.length - 1} more path(s))` : "";
  return [
    `Refusing: ${unsafe[0]}${more} resolves into a repository; run mise run skills:migrate`,
  ];
}

/** Global repo links that migration and skills-wiring own: the Codex root link and vendor names. */
export function homeRepoLinkedSkillTargets(
  home: string,
  root: string,
  names: readonly string[],
): string[] {
  const paths = [
    resolve(home, ".agents/skills"),
    ...[".agents/skills", ".claude/skills"].flatMap((target) =>
      names.map((name) => resolve(home, target, name)),
    ),
  ];
  return [...new Set(paths)].filter(
    (path) => isSymlink(path) && resolvesIntoRepository(path, root),
  );
}

export function toolLockPath(home: string): string {
  return resolve(home, ".agents/.skill-lock.json");
}

export function readToolLock(home: string): Result<SkillLock, string> {
  const path = toolLockPath(home);
  if (!existsSync(path)) return ok({ skills: {} });
  const contents = fromThrowable((value: string) =>
    readFileSync(value, "utf8"),
  )(path);
  if (contents.isErr()) return err(`${path}: ${errorText(contents.error)}`);
  return parseSkillLock(contents.value);
}
