import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import { Result } from "../../../shared/src/result.ts";

export async function countEntries(dir: string): Promise<number> {
  let n = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const d = stack.pop();
    if (d === undefined) continue;
    const result = await Result.tryPromise({
      try: () => readdir(d, { withFileTypes: true }),
      catch: (e: unknown) => e,
    });
    if (result.isErr()) continue;
    const ents: Dirent[] = result.value;
    n += ents.length;
    stack.push(
      ...ents.filter((e) => e.isDirectory()).map((e) => join(d, e.name)),
    );
  }
  return n;
}
