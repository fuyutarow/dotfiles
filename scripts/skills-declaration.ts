import { lstat, readFile, readlink, readdir, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  err,
  fromAsyncThrowable,
  fromThrowable,
  ok,
  type Result,
} from "neverthrow";
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

export async function readDeclaration(
  root: string,
): Promise<Result<ThirdPartySkill, string>> {
  const file = await fromAsyncThrowable(
    () => readFile(resolve(root, DECLARATION_PATH), "utf8"),
    errorText,
  )();
  return file.isErr()
    ? err(`${DECLARATION_PATH}: ${errorText(file.error)}`)
    : parseDeclaration(file.value);
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

export async function skillFiles(skillsDir: string): Promise<SkillFile[]> {
  const listing = await fromAsyncThrowable(() =>
    readdir(skillsDir, { withFileTypes: true }),
  )();
  if (listing.isErr()) return [];
  const files = await Promise.all(
    listing.value
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map(async (entry) => {
        const path = resolve(skillsDir, entry.name, "SKILL.md");
        const content = await fromAsyncThrowable(() =>
          readFile(path, "utf8"),
        )();
        return content.isOk() ? { path, content: content.value } : null;
      }),
  );
  return files.flatMap((file) => (file === null ? [] : [file]));
}

/** In-house skills have no vendor-specific agents/ scaffold, including links or empty entries. */
export async function skillLayoutRefusal(
  skill: string,
): Promise<string | undefined> {
  const path = resolve(skill, "agents");
  return (await pathExists(path))
    ? `${path}: nested agents/ entries are forbidden in in-house skills; remove the vendor UI scaffold`
    : undefined;
}

export async function inHouseLayoutRefusals(
  skillsDir: string,
): Promise<string[]> {
  const listing = await fromAsyncThrowable(() =>
    readdir(skillsDir, { withFileTypes: true }),
  )();
  if (listing.isErr()) return [];
  const refusals = await Promise.all(
    listing.value
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => skillLayoutRefusal(resolve(skillsDir, entry.name))),
  );
  return refusals.flatMap((refusal) =>
    refusal === undefined ? [] : [refusal],
  );
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

export async function pathExists(path: string): Promise<boolean> {
  return (await fromAsyncThrowable(() => lstat(path))()).isOk();
}

export async function isSymlink(path: string): Promise<boolean> {
  return (await fromAsyncThrowable(() => lstat(path))())
    .map((info) => info.isSymbolicLink())
    .unwrapOr(false);
}

async function canonicalPath(path: string): Promise<string | undefined> {
  const absolute = resolve(path);
  const direct = await fromAsyncThrowable(() => realpath(absolute))();
  if (direct.isOk()) return direct.value;
  const link = await fromAsyncThrowable(() => readlink(absolute))();
  if (link.isOk()) {
    const target = isAbsolute(link.value)
      ? link.value
      : resolve(dirname(absolute), link.value);
    return (await canonicalPath(target)) ?? resolve(target);
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

async function repositoryAncestor(path: string): Promise<string | undefined> {
  let current = path;
  while (true) {
    if (
      (await pathExists(resolve(current, ".git"))) ||
      (await pathExists(resolve(current, ".jj")))
    )
      return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

/** Detects both this checkout and other repo targets the pinned CLI must not write through. */
export async function resolvesIntoRepository(
  path: string,
  root: string,
): Promise<boolean> {
  const resolved = await canonicalPath(path);
  if (resolved === undefined) return false;
  const rootPath = (await canonicalPath(root)) ?? resolve(root);
  if (isWithin(rootPath, resolved)) return true;
  return (
    (await isSymlink(path)) &&
    (await repositoryAncestor(resolved)) !== undefined
  );
}

/** Only an individual link to its namesake source in this checkout can be taken over. */
export async function isOwnInHouseLink(
  path: string,
  root: string,
  name: string,
): Promise<boolean> {
  if (!(await isSymlink(path))) return false;
  const checkout = await canonicalPath(root);
  const target = await fromAsyncThrowable(() => realpath(path))();
  if (target.isErr()) return false;
  if (checkout === undefined) return false;
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

export async function homePathRefusals(
  home: string,
  root: string,
  names: readonly string[],
  inHouseNames: readonly string[] = [],
): Promise<string[]> {
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
    (
      await Promise.all(
        inHouseNames.flatMap((name) =>
          [".agents/skills", ".claude/skills"].map(async (base) => {
            const path = resolve(home, base, name);
            return (await isOwnInHouseLink(path, root, name))
              ? path
              : undefined;
          }),
        ),
      )
    )
      .filter((path) => path !== undefined)
      .map((path) => resolve(path)),
  );
  const unsafe = (
    await Promise.all(
      [...new Set(paths)].map(async (path) =>
        !allowed.has(resolve(path)) &&
        (await resolvesIntoRepository(path, root))
          ? path
          : undefined,
      ),
    )
  ).filter((path) => path !== undefined);
  if (unsafe.length === 0) return [];
  const more =
    unsafe.length > 1 ? ` (and ${unsafe.length - 1} more path(s))` : "";
  return [
    `Refusing: ${unsafe[0]}${more} resolves into a repository; run mise run skills:migrate`,
  ];
}

export function toolLockPath(home: string): string {
  return resolve(home, ".agents/.skill-lock.json");
}

export async function readToolLock(
  home: string,
): Promise<Result<SkillLock, string>> {
  const path = toolLockPath(home);
  const contents = await fromAsyncThrowable(
    () => readFile(path, "utf8"),
    errorText,
  )();
  if (contents.isOk()) return parseSkillLock(contents.value);
  const code = z.object({ code: z.string() }).safeParse(contents.error);
  return code.success && code.data.code === "ENOENT"
    ? ok({ skills: {} })
    : err(`${path}: ${errorText(contents.error)}`);
}
