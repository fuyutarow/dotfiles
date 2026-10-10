// Consumer: lint aggregate. No argv; DOTFILES optionally selects a fixture checkout.
// Fail closed: malformed registry, missing/duplicate identities or raw visible emission fail.
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { loadSlugs } from "../agents/hooks/slugs.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import {
  HooksConfigSchema,
  commandFor,
  loadRegistry,
} from "./hook-registry.ts";

function commandError(
  hook: { type: string; command?: unknown },
  owned: Set<string>,
  external: Set<string>,
): string | undefined {
  if (hook.type !== "command" || typeof hook.command !== "string")
    return "hook lacks an owned command and slug";
  if (!owned.has(hook.command) && !external.has(hook.command))
    return `unlisted unowned command: ${hook.command}`;
  return undefined;
}

/** Static channel check: JSON stdout must use the protocol encoder, stderr its line emitter. */
export function lintHookSource(source: string): string[] {
  const text = source.replaceAll(/\/\*[\s\S]*?\*\/|^\s*\/\/.*$/gmu, "");
  const errors: string[] = [];
  if (/\b(?:process\.stderr\.write|console\.error)\s*\(/u.test(text))
    errors.push("raw stderr diagnostic: use hookStderr");
  for (const call of text.matchAll(
    /\b(?:process\.stdout\.write|console\.log)\s*\(/gu,
  )) {
    const start = (call.index ?? 0) + call[0].length;
    // Emission statements in hooks end in a semicolon. Inspect the entire statement so
    // shorthand/variable reasons and template-string JSON cannot bypass the check.
    const end = text.indexOf(";", start);
    const body = text.slice(start, end === -1 ? undefined : end);
    if (!body.includes("hookJson("))
      errors.push("raw protocol message: use hookJson");
  }
  return errors;
}

export function lintHookLauncher(source: string): string[] {
  const text = source.replaceAll(/^\s*#.*$/gmu, "");
  if (
    /permissionDecisionReason|additionalContext|systemMessage|stopReason|["']reason["']|(?:echo|printf)\b[^\n]*>&2/u.test(
      text,
    )
  )
    return ["raw launcher message: use hook_deny or hook_stderr"];
  return [];
}

export function lintHookSlugs(root: string): string[] {
  const registry = loadSlugs(join(root, "agents/hooks/hooks.toml"));
  if (registry instanceof Error)
    return [`missing or invalid slug: ${registry.message}`];
  const errors: string[] = [];
  // Exercise the actual shared emitters, including the missing-Bun shell fallback.
  const emitter = Bun.spawnSync(
    [
      process.execPath,
      "--eval",
      `import { hookJson, hookMessage } from ${JSON.stringify(join(root, "agents/hooks/lib.ts"))}; console.log(hookMessage("probe", "lint-probe")); console.log(hookJson({reason:"probe"}, "lint-probe"));`,
    ],
    { timeout: 5_000 },
  );
  if (
    emitter.exitCode !== 0 ||
    emitter.stdout.toString() !==
      '[dotfiles:lint-probe] probe\n{"reason":"[dotfiles:lint-probe] probe"}\n'
  )
    errors.push("shared emitter lacks namespaced [dotfiles:<slug>] prefix");
  const shell = Bun.spawnSync(
    [
      "sh",
      "-c",
      '. "$1"; HOOK_SLUG=lint-probe; hook_stderr probe; hook_deny probe',
      "sh",
      join(root, "agents/hooks/slug.sh"),
    ],
    { timeout: 5_000 },
  );
  if (
    shell.exitCode !== 0 ||
    shell.stderr.toString() !== "[dotfiles:lint-probe] probe\n" ||
    !shell.stdout
      .toString()
      .includes('"permissionDecisionReason":"[dotfiles:lint-probe] probe"')
  )
    errors.push("shell emitter lacks namespaced [dotfiles:<slug>] prefix");
  const slugs = new Set<string>();
  const scripts = new Set<string>();
  for (const identity of registry.identities) {
    if (slugs.has(identity.slug))
      errors.push(`duplicate slug: ${identity.slug}`);
    if (scripts.has(identity.script))
      errors.push(`duplicate hook script: ${identity.script}`);
    slugs.add(identity.slug);
    scripts.add(identity.script);
    const path = join(root, "agents", identity.script);
    if (!existsSync(path)) errors.push(`missing hook: ${identity.script}`);
    else
      errors.push(
        ...lintHookSource(readFileSync(path, "utf8")).map(
          (e) => `${identity.script}: ${e}`,
        ),
      );
  }
  const external = new Set(registry.external.map((h) => h.command));
  const owned = new Set(registry.identities.flatMap((h) => h.commands));
  const launchers = new Set(["agents/hooks/run.sh"]);
  for (const command of owned) {
    const match = /~\/\.(claude|codex)\/hooks\/([\w-]+\.sh)/u.exec(command);
    if (match !== null) launchers.add(`agents/${match[1]}/hooks/${match[2]}`);
  }
  for (const path of launchers) {
    if (!existsSync(join(root, path))) errors.push(`missing launcher: ${path}`);
    else
      errors.push(
        ...lintHookLauncher(readFileSync(join(root, path), "utf8")).map(
          (e) => `${path}: ${e}`,
        ),
      );
  }
  const shared = loadRegistry(join(root, "agents/hooks"));
  errors.push(...shared.errors);
  for (const hook of shared.specs) owned.add(commandFor(hook));
  const Config = z.object({ hooks: HooksConfigSchema });
  for (const path of [
    "agents/claude/settings.json",
    "agents/codex/hooks.json",
  ]) {
    const config = jsonOf(Config).safeParse(
      readFileSync(join(root, path), "utf8"),
    );
    if (!config.success) {
      errors.push(`invalid hook config: ${path}`);
      continue;
    }
    for (const hook of Object.values(config.data.hooks).flatMap((groups) =>
      groups.flatMap((g) => g.hooks),
    )) {
      const error = commandError(hook, owned, external);
      errors.push(...(error === undefined ? [] : [`${path}: ${error}`]));
    }
  }
  return errors;
}

async function main(): Promise<void> {
  const result = await attempt(() =>
    lintHookSlugs(process.env.DOTFILES ?? join(import.meta.dir, "..")),
  );
  if (!result.ok) {
    process.stderr.write(`FATAL: hook-slug: ${errorMessage(result.error)}\n`);
    process.exitCode = 2;
  } else {
    for (const error of result.value)
      process.stdout.write(`FAIL hook-slug: ${error}\n`);
    if (result.value.length === 0)
      process.stdout.write(
        "OK hook-slug: all owned hooks have unique bare slugs and namespaced emitters\n",
      );
    process.exitCode = result.value.length === 0 ? 0 : 1;
  }
}
if (import.meta.main) await main();
