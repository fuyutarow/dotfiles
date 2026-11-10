import { readFile, rename, writeFile } from "node:fs/promises";
import { fromAsyncThrowable } from "neverthrow";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import type { Candidate } from "../model.ts";

// The checkpoint affects scheduling only. It never supplies candidates or safety facts.
export async function resumeCandidateOrder(
  order: number[],
  candidates: Candidate[],
  path: string | undefined,
): Promise<number[]> {
  if (path === undefined) return order;
  const stored = await fromAsyncThrowable(() => readFile(path, "utf8"))();
  if (stored.isErr()) return order;
  const parsed = jsonOf(z.object({ after: z.string() })).safeParse(
    stored.value,
  );
  if (!parsed.success) return order;
  const previous = order.findIndex(
    (index) => candidates[index]?.id === parsed.data.after,
  );
  const start =
    previous < 0
      ? order.findIndex(
          (index) => (candidates[index]?.id ?? "") > parsed.data.after,
        )
      : previous + 1;
  return start > 0 ? [...order.slice(start), ...order.slice(0, start)] : order;
}

export async function checkpointCandidate(
  path: string | undefined,
  id: string,
): Promise<string | null> {
  if (path === undefined) return null;
  const saved = await fromAsyncThrowable(async () => {
    const pending = `${path}.${process.pid}.tmp`;
    await writeFile(pending, JSON.stringify({ after: id }), { mode: 0o600 });
    await rename(pending, path);
  })();
  return saved.isErr() ? String(saved.error) : null;
}
