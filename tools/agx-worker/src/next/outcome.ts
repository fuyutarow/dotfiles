import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readlinkSync } from "node:fs";
import { join } from "node:path";
import { fromThrowable } from "neverthrow";
import { z } from "../../../shared/src/zod.ts";
import { verifyKind, type VerifyKind } from "./verify.ts";

export const Outcome = z.enum([
  "stopped",
  "lost",
  "ok",
  "no-change",
  "verify-failed",
  "verify-unrunnable",
  "verify-killed",
  "timeout",
  "capacity",
  "refused",
  "malformed",
]);
export type Outcome = z.output<typeof Outcome>;

/** Compare actual contents and modes in the promised write surface, even after a commit. */
export const workspaceSnapshot = (cwd: string, writes: readonly string[]) =>
  fromThrowable(() => {
    const files = new Map<string, string>();
    const paths = writes.flatMap((pattern) => [
      ...new Bun.Glob(pattern).scanSync({
        cwd,
        dot: true,
        onlyFiles: false,
        followSymlinks: false,
      }),
    ]);
    for (const path of new Set(paths)) {
      if (
        path
          .split("/")
          .some((part) => [".git", ".jj", "node_modules"].includes(part))
      )
        continue;
      const absolute = join(cwd, path);
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) continue;
      const content = stat.isSymbolicLink()
        ? readlinkSync(absolute)
        : readFileSync(absolute);
      files.set(
        path,
        `${stat.mode}:${createHash("sha256").update(content).digest("hex")}`,
      );
    }
    return files;
  })();

export function changedFiles(
  before: Map<string, string>,
  after: Map<string, string>,
): number {
  return [...new Set([...before.keys(), ...after.keys()])].filter(
    (path) => before.get(path) !== after.get(path),
  ).length;
}

export function deriveOutcome(input: {
  capacity?: boolean;
  timedOut: boolean;
  refused: boolean;
  verify: readonly { exit: number; kind?: VerifyKind }[];
  reportValid: boolean;
  changed: number | undefined;
}): Outcome {
  if (input.capacity === true) return "capacity";
  if (input.timedOut) return "timeout";
  if (input.refused || input.changed === undefined) return "refused";
  const kinds = new Set(
    input.verify.map((check) => check.kind ?? verifyKind(check.exit)),
  );
  if (kinds.has("killed")) return "verify-killed";
  if (kinds.has("unrunnable")) return "verify-unrunnable";
  if (kinds.has("failed")) return "verify-failed";
  if (!input.reportValid) return "malformed";
  if (input.changed === 0) return "no-change";
  return "ok";
}
