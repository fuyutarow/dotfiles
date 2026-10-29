import { lstat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { fromAsyncThrowable } from "neverthrow";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import type { Plan } from "./model.ts";

export const Fingerprint = z.object({
  dev: z.number().nonnegative(),
  ino: z.number().nonnegative(),
  size: z.number().nonnegative(),
  mtime: z.number().nonnegative(),
});
export const ReclaimRecord = z.object({
  target: z.string().min(1),
  host: z.string().min(1),
  path: z
    .string()
    .refine(
      (path) => isAbsolute(path) || /^[A-Za-z]:[\\/]/u.test(path),
      "expected an absolute local or Windows path",
    ),
  bytes_allocated: z.number().nonnegative().nullable(),
  regen: z.boolean(),
  holders: z.array(z.string()),
  verdict: z.enum(["safe", "ask", "deny", "keep"]),
  reason: z.string(),
  fingerprint: Fingerprint.nullable(),
  owner_item: z.string().optional(),
});
export type ReclaimRecord = z.output<typeof ReclaimRecord>;

const regenTargets = new Set(["clean", "builds", "rust", "scratch"]);
const holdersOf = (candidate: Plan["targets"][number]["candidates"][number]) =>
  candidate.checks.flatMap((check) =>
    check.name === "not in use" && check.ok !== true ? [check.detail] : [],
  );
const verdictOf = (
  verdict: Plan["targets"][number]["candidates"][number]["verdict"],
): ReclaimRecord["verdict"] => {
  if (verdict === "RECLAIM") return "safe";
  if (verdict === "ASK") return "ask";
  return "keep";
};

export async function fingerprint(
  path: string,
): Promise<ReclaimRecord["fingerprint"]> {
  const stat = await lstat(path);
  return {
    dev: stat.dev,
    ino: stat.ino,
    size: stat.size,
    mtime: stat.mtimeMs,
  };
}

export async function recordsFromPlan(plan: Plan): Promise<ReclaimRecord[]> {
  const groups = await Promise.all(
    plan.targets.map(async (target) =>
      Promise.all(
        target.candidates.map(async (candidate) => {
          const path = candidate.host_lever?.path ?? candidate.path;
          if (path === null) return null;
          const remoteHostPath = candidate.host_lever !== undefined;
          const localFingerprint = remoteHostPath
            ? null
            : await fromAsyncThrowable(() => fingerprint(path))().then(
                (result) =>
                  result.match(
                    (value) => value,
                    () => null,
                  ),
              );
          if (!remoteHostPath && localFingerprint === null) return null;
          const trashItem =
            target.name === "purge" && candidate.id.startsWith("XDG trash:")
              ? "xdg-trash"
              : undefined;
          const hostItem = candidate.host_lever?.approval ?? trashItem;
          let recordTarget = target.name;
          if (remoteHostPath)
            recordTarget =
              candidate.host_lever?.tier === "orphan-swap"
                ? "orphan-swap"
                : candidate.id;
          const value = {
            target: recordTarget,
            host: plan.host,
            path: candidate.host_lever?.path ?? path,
            bytes_allocated: candidate.bytes,
            regen:
              regenTargets.has(target.name) ||
              (remoteHostPath && candidate.verdict === "RECLAIM"),
            holders: holdersOf(candidate),
            verdict:
              hostItem === undefined ? verdictOf(candidate.verdict) : "ask",
            reason:
              hostItem === undefined
                ? candidate.reason
                : `${candidate.reason}; requires --approve ${hostItem}`,
            fingerprint: localFingerprint,
            ...(hostItem === undefined ? {} : { owner_item: hostItem }),
          };
          const parsed = ReclaimRecord.safeParse(value);
          return parsed.success ? parsed.data : null;
        }),
      ),
    ),
  );
  return groups.flat().filter((record) => record !== null);
}

export type ApplyReceipt = {
  line: number;
  target: string | null;
  path: string | null;
  outcome: "deleted" | "skipped" | "failed";
  reason: string;
  bytes_freed: number | null;
};
export type ApplyOptions = {
  approve?: string[];
  currentFingerprint?: (
    path: string,
  ) => Promise<ReclaimRecord["fingerprint"] | null>;
  apply: (record: ReclaimRecord) => Promise<{
    ok: boolean;
    reason: string;
    bytes_freed?: number | null;
  }>;
};

const currentFingerprint = async (path: string) =>
  (await fromAsyncThrowable(() => fingerprint(path))()).match(
    (value) => value,
    () => null,
  );
const sameFingerprint = (
  left: NonNullable<ReclaimRecord["fingerprint"]>,
  right: ReclaimRecord["fingerprint"] | null,
) =>
  right !== null &&
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mtime === right.mtime;

export async function applyRecords(
  input: string,
  options: ApplyOptions,
): Promise<ApplyReceipt[]> {
  const invalid: ApplyReceipt[] = [];
  const groups = new Map<string, { line: number; record: ReclaimRecord }[]>();
  const lines = input.split("\n");
  for (const [index, line] of lines.entries()) {
    if (line.trim() === "") continue;
    const parsed = jsonOf(ReclaimRecord).safeParse(line);
    if (!parsed.success) {
      invalid.push({
        line: index + 1,
        target: null,
        path: null,
        outcome: "failed",
        reason: parsed.error.message,
        bytes_freed: null,
      });
      continue;
    }
    const record = parsed.data;
    const group = groups.get(record.path) ?? [];
    group.push({ line: index + 1, record });
    groups.set(record.path, group);
  }
  const receipts: ApplyReceipt[] = [...invalid];
  for (const [path, group] of groups) {
    const first = group[0];
    if (first === undefined) continue;
    const record = first.record;
    const disagreement = group.find(
      (item) =>
        item.record.verdict !== record.verdict ||
        item.record.target !== record.target ||
        JSON.stringify(item.record.fingerprint) !==
          JSON.stringify(record.fingerprint),
    );
    if (disagreement !== undefined) {
      const restrictive = group.find((item) => item.record.verdict !== "safe");
      receipts.push({
        line: first.line,
        target: record.target,
        path,
        outcome: "skipped",
        reason:
          restrictive === undefined
            ? "duplicate records disagree about target or fingerprint"
            : `duplicate records disagree; verdict is ${restrictive.record.verdict}`,
        bytes_freed: null,
      });
      continue;
    }
    if (record.fingerprint === null) {
      receipts.push({
        line: first.line,
        target: record.target,
        path,
        outcome: "skipped",
        reason:
          "record has no local fingerprint; remote host records cannot be applied here",
        bytes_freed: null,
      });
      continue;
    }
    const approvedOwnerItem =
      record.verdict === "ask" &&
      record.owner_item !== undefined &&
      options.approve?.includes(record.owner_item) === true;
    if (record.verdict !== "safe" && !approvedOwnerItem) {
      receipts.push({
        line: first.line,
        target: record.target,
        path,
        outcome: "skipped",
        reason: `verdict is ${record.verdict}`,
        bytes_freed: null,
      });
      continue;
    }
    if (
      record.owner_item !== undefined &&
      options.approve?.includes(record.owner_item) !== true
    ) {
      receipts.push({
        line: first.line,
        target: record.target,
        path,
        outcome: "skipped",
        reason: `requires --approve ${record.owner_item}`,
        bytes_freed: null,
      });
      continue;
    }
    const actual = await (options.currentFingerprint ?? currentFingerprint)(
      record.path,
    );
    if (!sameFingerprint(record.fingerprint, actual)) {
      receipts.push({
        line: first.line,
        target: record.target,
        path,
        outcome: "skipped",
        reason: "fingerprint changed since plan",
        bytes_freed: null,
      });
      continue;
    }
    const result = await options.apply(record);
    receipts.push({
      line: first.line,
      target: record.target,
      path,
      outcome: result.ok ? "deleted" : "failed",
      reason: result.reason,
      bytes_freed: result.bytes_freed ?? null,
    });
  }
  return receipts.toSorted((left, right) => left.line - right.line);
}
