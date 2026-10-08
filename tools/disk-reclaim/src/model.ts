import { isAbsolute } from "node:path";
import { z } from "../../shared/src/zod.ts";

const absolute = z.string().refine(isAbsolute, "expected an absolute path");
const bytes = z.number().nonnegative().nullable();
export const Tier = z.enum([
  "blind",
  "sudo",
  "owner",
  "irreversible",
  "interactive",
  "plan-only",
]);
export type Tier = z.output<typeof Tier>;
export const Verdict = z.enum(["RECLAIM", "KEEP", "ASK"]);
export const ActionKind = z.enum([
  "delete",
  "jj-forget+delete",
  "jj-forget",
  "cargo-clean",
  "rip",
  "command",
]);
export const ActionResult = z.object({
  ok: z.boolean(),
  bytes_freed: bytes,
  error: z.string().nullable(),
});
export type ActionResult = z.output<typeof ActionResult>;
export const Candidate = z
  .object({
    id: z.string().min(1),
    path: absolute.nullable(),
    verdict: Verdict,
    reason: z.string(),
    checks: z.array(
      z.object({
        name: z.string(),
        ok: z.boolean().nullable(),
        detail: z.string(),
      }),
    ),
    bytes,
    bytes_kind: z.enum(["freed_now", "to_graveyard", "estimate"]),
    action: z.object({ kind: ActionKind, argv: z.array(z.string()) }),
    result: ActionResult.nullable(),
  })
  .refine(
    (c) =>
      !c.checks.some((check) => check.ok === null) ||
      c.verdict === "ASK" ||
      (c.verdict === "KEEP" &&
        (c.reason.startsWith("protected: ") ||
          c.checks.some(
            (check) =>
              (check.name === "no conflicts" && check.ok === false) ||
              (check.name === "not in use" &&
                check.ok === false &&
                !check.detail.startsWith("unreadable:")),
          ))),
    "an unknown check requires ASK unless a conflict or positive in-use fact requires KEEP",
  );
export type Candidate = z.output<typeof Candidate>;
export const TargetPlan = z.object({
  name: z.string(),
  tier: Tier,
  available: z.boolean(),
  skip_reason: z.string().nullable(),
  exit: z.number().int().nullable(),
  candidates: z.array(Candidate),
  totals: z.object({
    reclaim: z.number().int().nonnegative(),
    ask: z.number().int().nonnegative(),
    keep: z.number().int().nonnegative(),
  }),
});
export type TargetPlan = z.output<typeof TargetPlan>;
export const Headroom = z.object({
  drives: z.array(
    z.object({
      label: z.string(),
      path: absolute,
      free: z.number().nonnegative(),
      total: bytes,
      deny_line: z.number().nonnegative(),
      warn_line: bytes,
      stop_line: bytes,
      state: z.enum(["ok", "warn", "deny"]),
    }),
  ),
});
export type Headroom = z.output<typeof Headroom>;
export const Plan = z.object({
  schema: z.literal("reclaim.plan/1"),
  host: z.string(),
  generated_at: z.string(),
  mode: z.enum(["plan", "run"]),
  headroom: Headroom,
  targets: z.array(TargetPlan),
  totals: z.object({
    reclaim_bytes: z.number().nonnegative(),
    ask_bytes: z.number().nonnegative(),
    freed_bytes: bytes,
  }),
  receipt: absolute.nullable(),
});
export type Plan = z.output<typeof Plan>;
export const ReceiptV1 = z.object({
  name: z.string(),
  command: z.array(z.string()),
  host: z.string(),
  pid: z.number().int(),
  started: z.string(),
  ended: z.string(),
  exit: z.number().int(),
  free_before: z.number(),
  free_after: z.number(),
  output: absolute.nullable(),
});
export type ReceiptV1 = z.output<typeof ReceiptV1>;
export const ReceiptAction = z.object({
  id: z.string(),
  path: absolute.nullable(),
  kind: ActionKind,
  verdict_at_act: Verdict,
  bytes_planned: bytes,
  bytes_freed: bytes,
  ok: z.boolean(),
  error: z.string().nullable(),
  recovery: z
    .object({
      repo: absolute,
      workspace: z.string(),
      commit_id: z.string(),
      op_id: z.string(),
    })
    .nullable(),
  refused: z
    .array(
      z.object({
        path: absolute,
        reason: z.string(),
        owner_uid: z.number().int().nonnegative(),
        owner_name: z.string(),
        repair: z.string(),
      }),
    )
    .optional(),
});
export type ReceiptAction = z.output<typeof ReceiptAction>;
export const ReceiptV2 = ReceiptV1.extend({
  schema: z.literal(2),
  target: z.string(),
  tier: Tier,
  actions: z.array(ReceiptAction),
  headroom: Headroom.optional(),
  under_pressure: z.boolean().optional(),
});
export type ReceiptV2 = z.output<typeof ReceiptV2>;
// A schema-bearing future version must never silently fall back to v1.
export const Receipt = z.union([
  ReceiptV2,
  ReceiptV1.extend({ schema: z.undefined().optional() }),
]);
export const Config = z.object({
  repo_roots: z.array(absolute),
  repos: z.array(absolute),
  scratch_roots: z.array(absolute),
  delete_roots: z.array(absolute),
  regenerable_ignored: z.array(z.string()),
  ignore_unreadable_procs: z.array(z.string().min(1)).default(["sshd"]),
  protected: z.array(absolute).optional(),
  session_grace_hours: z.number().nonnegative(),
  graveyard_min_age_hours: z.number().nonnegative().default(24),
  graveyard_pressure_undo_minutes: z.number().nonnegative().default(10),
});
export type Config = Omit<
  z.output<typeof Config>,
  "graveyard_min_age_hours" | "graveyard_pressure_undo_minutes"
> & {
  graveyard_min_age_hours?: number;
  graveyard_pressure_undo_minutes?: number;
};
