// Copy skill resources, then bundle each direct script entry for standalone deployment.
import { cp, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { Result } from "@dotfiles/shared/src/result.ts";
import { skillLayoutRefusal } from "#root/skills-declaration.ts";
import { bundleEntry } from "@dotfiles/shared/src/bundle-entry.ts";

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Hash resources and the last successful bundler's resolved inputs before preparing a copy.
 * Missing inputs force preparation; the bundler then discovers the new dependency graph.
 * The per-run file cache avoids rereading modules shared by many skills.
 */
export function sourceDigester() {
  const files = new Map<string, Promise<string>>();
  const fileDigest = (path: string): Promise<string> => {
    let digest = files.get(path);
    if (digest === undefined) {
      digest = Bun.file(path)
        .arrayBuffer()
        .then((bytes) =>
          createHash("sha256").update(new Uint8Array(bytes)).digest("hex"),
        );
      files.set(path, digest);
    }
    return digest;
  };
  return async (
    source: string,
    inputs: readonly string[],
  ): Promise<string | undefined> => {
    const result = await Result.tryPromise({
      try: async () => {
        const hash = createHash("sha256").update(
          `skill-copy-v2\0${Bun.version}\0`,
        );
        const visit = async (path: string, name: string): Promise<void> => {
          const info = await stat(path); // Follow resource links just as prepareSkillCopy does.
          hash.update(`${name}\0${info.mode}\0`);
          if (!info.isDirectory()) {
            hash.update(await fileDigest(path));
            return;
          }
          const entries = (await readdir(path)).toSorted();
          for (const entry of entries.filter((e) => e !== "node_modules"))
            await visit(join(path, entry), `${name}/${entry}`);
        };
        await visit(source, ".");
        for (const path of [...new Set(inputs)].toSorted()) {
          hash.update(`${path}\0`);
          hash.update(await fileDigest(path));
        }
        return hash.digest("hex");
      },
      catch: errorText,
    });
    return result.unwrapOr(undefined);
  };
}

/** Deployed entries are bundles, so a copy never needs node_modules — and workspace links there
 * form cycles (`@dotfiles/hooks` → `@dotfiles/shared` → `@dotfiles/hooks`) that a dereferencing
 * copy cannot finish. */
export const withoutNodeModules = (path: string): boolean =>
  !path.split("/").includes("node_modules");

export async function skillEntries(skill: string): Promise<string[]> {
  const entries: string[] = [];
  for await (const entry of new Bun.Glob("scripts/*.ts").scan({ cwd: skill }))
    entries.push(entry);
  return entries.toSorted();
}

export async function prepareSkillCopy(
  source: string,
  target: string,
): Promise<Result<{ inputs: string[] }, string>> {
  const prepared = await Result.tryPromise({
    try: async () => {
      const sourceRefusal = await skillLayoutRefusal(source);
      if (sourceRefusal !== undefined) return Result.err(sourceRefusal);
      const inputs = new Set<string>();
      await cp(source, target, {
        recursive: true,
        dereference: true,
        filter: withoutNodeModules,
      });
      const stagedRefusal = await skillLayoutRefusal(target);
      if (stagedRefusal !== undefined) return Result.err(stagedRefusal);
      for (const entry of await skillEntries(source)) {
        const path = join(source, entry);
        const build = await bundleEntry(path);
        if (!build.ok) return Result.err(build.error);
        for (const input of build.inputs) inputs.add(input);
        await writeFile(join(target, entry), build.text);
      }
      return Result.ok({ inputs: [...inputs].toSorted() });
    },
    catch: errorText,
  });
  return prepared.isErr() ? Result.err(prepared.error) : prepared.value;
}

/** Pure module-load check: resolve the staged entry's graph without running CLI or hook effects. */
export async function unresolvedSkillImports(skill: string): Promise<string[]> {
  const failures: string[] = [];
  for (const entry of await skillEntries(skill)) {
    const path = join(skill, entry);
    const build = await Bun.build({
      entrypoints: [path],
      target: "bun",
      throw: false,
    });
    if (!build.success)
      failures.push(`${path}: ${build.logs.map(String).join("\n")}`);
  }
  return failures;
}
