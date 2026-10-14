import { existsSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { err, fromThrowable, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";

const MarketplaceSchema = z.strictObject({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  owner: z.strictObject({ name: z.string() }),
  plugins: z.array(z.strictObject({ name: z.string(), source: z.string() })),
});

const PluginSchema = z.strictObject({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  author: z.strictObject({ name: z.string() }),
  skills: z.array(z.string()),
});

const VERSION = /^\d+\.\d+\.\d+$/u;
const MARKETPLACE_FILE = ".claude-plugin/marketplace.json";
const SKILLS_PLUGIN_FILE = "agents/skills/.claude-plugin/plugin.json";
const PLUGIN_ROOT = "agents/skills";

export type DotfilesPlugin = {
  marketplaceName: string;
  pluginName: string;
  pluginRoot: string;
  skillsRoot: string;
  skillNames: string[];
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseJsonText<T>(
  path: string,
  text: string,
  schema: z.ZodType<T>,
): Result<T, string> {
  const checked = jsonOf(schema).safeParse(text);
  if (!checked.success)
    return err(
      `${path}: invalid manifest: ${checked.error.issues.map((issue) => issue.message).join("; ")}`,
    );
  return ok(checked.data);
}

function isWithin(root: string, path: string): boolean {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
  );
}

export function validateDotfilesPluginFiles(
  root: string,
  marketplaceText: string,
  pluginText: string,
  skillNames: readonly string[],
): Result<DotfilesPlugin, string> {
  const marketplace = parseJsonText(
    MARKETPLACE_FILE,
    marketplaceText,
    MarketplaceSchema,
  );
  if (marketplace.isErr()) return err(marketplace.error);
  if (marketplace.value.name !== "dotfiles")
    return err(`${MARKETPLACE_FILE}: marketplace name must be dotfiles`);
  if (!VERSION.test(marketplace.value.version))
    return err(`${MARKETPLACE_FILE}: version must use MAJOR.MINOR.PATCH`);
  if (marketplace.value.plugins.length !== 1)
    return err(`${MARKETPLACE_FILE}: expected exactly one plugin`);

  const entry = marketplace.value.plugins[0];
  if (entry === undefined || entry.name !== "dotfiles")
    return err(`${MARKETPLACE_FILE}: plugin name must be dotfiles`);
  const pluginRoot = resolve(root, entry.source);
  if (!isWithin(resolve(root), pluginRoot))
    return err(
      `${MARKETPLACE_FILE}: plugin source escapes the marketplace root`,
    );
  if (resolve(pluginRoot) !== resolve(root, PLUGIN_ROOT))
    return err(
      `${MARKETPLACE_FILE}: dotfiles plugin source must be ./agents/skills`,
    );

  const plugin = parseJsonText(SKILLS_PLUGIN_FILE, pluginText, PluginSchema);
  if (plugin.isErr()) return err(plugin.error);
  if (plugin.value.name !== entry.name)
    return err(
      `${SKILLS_PLUGIN_FILE}: name must match the marketplace plugin entry`,
    );
  if (!VERSION.test(plugin.value.version))
    return err(`${SKILLS_PLUGIN_FILE}: version must use MAJOR.MINOR.PATCH`);
  if (!plugin.value.skills.includes("./"))
    return err(`${SKILLS_PLUGIN_FILE}: skills must include ./`);

  const skillsRoot = resolve(pluginRoot);
  const names = skillNames.toSorted();
  if (names.length === 0)
    return err(`${PLUGIN_ROOT}: no skill folders with SKILL.md`);

  return ok({
    marketplaceName: marketplace.value.name,
    pluginName: plugin.value.name,
    pluginRoot,
    skillsRoot,
    skillNames: names,
  });
}

export function readDotfilesPlugin(
  root: string,
): Result<DotfilesPlugin, string> {
  const marketplacePath = resolve(root, MARKETPLACE_FILE);
  const marketplaceText = fromThrowable((path: string) =>
    readFileSync(path, "utf8"),
  )(marketplacePath);
  if (marketplaceText.isErr())
    return err(`${marketplacePath}: ${errorMessage(marketplaceText.error)}`);
  const pluginPath = resolve(root, SKILLS_PLUGIN_FILE);
  const pluginText = fromThrowable((path: string) =>
    readFileSync(path, "utf8"),
  )(pluginPath);
  if (pluginText.isErr())
    return err(`${pluginPath}: ${errorMessage(pluginText.error)}`);

  const skillsRoot = resolve(root, PLUGIN_ROOT);
  const names = readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .filter((entry) => existsSync(resolve(skillsRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .toSorted();
  return validateDotfilesPluginFiles(
    root,
    marketplaceText.value,
    pluginText.value,
    names,
  );
}
