import { readdirSync, type Dirent } from "node:fs";
import { join } from "node:path";
import { fromThrowable } from "../../../shared/src/zod.ts";

export function countEntries(dir: string): number {
  let n = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const d = stack.pop();
    if (d === undefined) continue;
    const result = fromThrowable(() =>
      readdirSync(d, { withFileTypes: true }),
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

export const newlines = (chunk: Uint8Array): number =>
  chunk.reduce((n, b) => n + Number(b === 10), 0);
