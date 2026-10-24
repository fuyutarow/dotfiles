// Copy skill resources, then bundle each direct script entry for standalone deployment.
import { cp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { err, fromAsyncThrowable, ok, type Result } from "neverthrow";

const errorText = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function skillEntries(skill: string): Promise<string[]> {
  const entries: string[] = [];
  for await (const entry of new Bun.Glob("scripts/*.ts").scan({ cwd: skill }))
    entries.push(entry);
  return entries.toSorted();
}

export async function prepareSkillCopy(
  source: string,
  target: string,
): Promise<Result<void, string>> {
  const prepared = await fromAsyncThrowable(async () => {
    await cp(source, target, { recursive: true, dereference: true });
    for (const entry of await skillEntries(source)) {
      const path = join(source, entry);
      const build = await Bun.build({
        entrypoints: [path],
        target: "bun",
        throw: false,
      });
      if (!build.success)
        return err(`${path}: ${build.logs.map(String).join("\n")}`);
      const output = build.outputs[0];
      if (output === undefined)
        return err(`${path}: bundler produced no output`);
      await writeFile(join(target, entry), await output.text());
    }
    return ok(undefined);
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
