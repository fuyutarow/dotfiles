// Copy skill resources, then bundle each direct script entry for standalone deployment.
import { cp, readdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { err, fromAsyncThrowable, ok, type Result } from "neverthrow";
import { skillLayoutRefusal } from "./skills-declaration.ts";

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
    const result = await fromAsyncThrowable(async () => {
      const hash = createHash("sha256").update(
        `skill-copy-v2\0${Bun.version}\0`,
      );
      const visit = async (path: string, name: string): Promise<void> => {
        const info = await stat(path); // Follow resource links just as prepareSkillCopy does.
        hash.update(`${name}\0${info.mode}\0`);
        if (info.isDirectory()) {
          for (const entry of (await readdir(path)).toSorted())
            await visit(join(path, entry), `${name}/${entry}`);
        } else hash.update(await fileDigest(path));
      };
      await visit(source, ".");
      for (const path of [...new Set(inputs)].toSorted()) {
        hash.update(`${path}\0`);
        hash.update(await fileDigest(path));
      }
      return hash.digest("hex");
    }, errorText)();
    return result.unwrapOr(undefined);
  };
}

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
  const prepared = await fromAsyncThrowable(async () => {
    const sourceRefusal = await skillLayoutRefusal(source);
    if (sourceRefusal !== undefined) return err(sourceRefusal);
    const inputs = new Set<string>();
    await cp(source, target, { recursive: true, dereference: true });
    const stagedRefusal = await skillLayoutRefusal(target);
    if (stagedRefusal !== undefined) return err(stagedRefusal);
    for (const entry of await skillEntries(source)) {
      const path = join(source, entry);
      const build = await Bun.build({
        entrypoints: [path],
        target: "bun",
        throw: false,
        metafile: true,
      });
      if (!build.success)
        return err(`${path}: ${build.logs.map(String).join("\n")}`);
      for (const input of Object.keys(build.metafile?.inputs ?? {}))
        inputs.add(resolve(input));
      const output = build.outputs[0];
      if (output === undefined)
        return err(`${path}: bundler produced no output`);
      await writeFile(join(target, entry), await output.text());
    }
    return ok({ inputs: [...inputs].toSorted() });
  }, errorText)();
  return prepared.isErr() ? err(prepared.error) : prepared.value;
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
