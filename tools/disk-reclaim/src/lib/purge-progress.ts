import { readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import { fromAsyncThrowable } from "neverthrow";

export async function countEntries(dir: string): Promise<number> {
  let n = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const d = stack.pop();
    if (d === undefined) continue;
    const result = await fromAsyncThrowable(() =>
      readdir(d, { withFileTypes: true }),
    )();
    if (result.isErr()) continue;
    const ents: Dirent[] = result.value;
    n += ents.length;
    stack.push(
      ...ents.filter((e) => e.isDirectory()).map((e) => join(d, e.name)),
    );
  }
  return n;
}
