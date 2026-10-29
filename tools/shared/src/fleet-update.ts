import { jsonOf, z } from "./zod.ts";

/** Schema 2 is deliberately an in-memory contract: readers, locks, and writers live elsewhere. */
export const FleetFields = [
  "name",
  "model",
  "effort",
  "ctx",
  "rate",
  "cwd",
  "pane_id",
] as const;

export const FleetOwners = [
  "claude-statusline",
  "codex-rollout",
  "codex-thread-identity",
  "codex-provider-status",
  "codex-native-viewport",
  "native-pane-binding",
] as const;

export type FleetField = (typeof FleetFields)[number];
export type FleetOwner = (typeof FleetOwners)[number];
export type FleetVendor = "claude" | "codex";

const IsoDateTimeSchema = z.iso.datetime();
const SessionIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/u);

export const FleetUnavailableSchema = z.strictObject({
  na: z.literal(true),
  why: z.string().min(1),
});

const FleetValueSchemas = {
  name: z.string().min(1),
  model: z.string().min(1),
  effort: z.string().min(1),
  ctx: z.strictObject({
    tokens: z.number().int().nonnegative(),
    pct: z.number().min(0).max(100),
  }),
  rate: z.strictObject({
    five_h_pct: z.number().min(0).max(100),
    seven_d_pct: z.number().min(0).max(100),
    resets: z.string().min(1),
  }),
  cwd: z.string().min(1),
  pane_id: z.string().nullable(),
};

export type FleetUnavailable = z.output<typeof FleetUnavailableSchema>;
export type FleetValues = {
  [K in FleetField]: z.output<(typeof FleetValueSchemas)[K]>;
};

export type FleetCell<T> = Readonly<{
  value: T | FleetUnavailable;
  observedAt: string | null;
}>;

function cellSchema<S extends z.ZodType>(value: S) {
  return z.strictObject({
    value: z.union([value, FleetUnavailableSchema]),
    observedAt: IsoDateTimeSchema.nullable(),
  });
}

function observedCellSchema<S extends z.ZodType>(value: S) {
  return z.strictObject({
    value: z.union([value, FleetUnavailableSchema]),
    observedAt: IsoDateTimeSchema,
  });
}

const FleetFieldsSchema = z.strictObject({
  name: cellSchema(FleetValueSchemas.name),
  model: cellSchema(FleetValueSchemas.model),
  effort: cellSchema(FleetValueSchemas.effort),
  ctx: cellSchema(FleetValueSchemas.ctx),
  rate: cellSchema(FleetValueSchemas.rate),
  cwd: cellSchema(FleetValueSchemas.cwd),
  pane_id: cellSchema(FleetValueSchemas.pane_id),
});

export const FleetSessionV2Schema = z.strictObject({
  schema: z.literal(2),
  session_id: SessionIdSchema,
  vendor: z.enum(["claude", "codex"]),
  revision: z.number().int().nonnegative(),
  fields: FleetFieldsSchema,
  updated_at: IsoDateTimeSchema,
});

export type FleetSessionV2 = z.output<typeof FleetSessionV2Schema>;

export const FleetIdentitySchema = z.strictObject({
  session_id: SessionIdSchema,
  vendor: z.enum(["claude", "codex"]),
});

const FleetPatchSchema = z
  .strictObject({
    name: observedCellSchema(FleetValueSchemas.name).optional(),
    model: observedCellSchema(FleetValueSchemas.model).optional(),
    effort: observedCellSchema(FleetValueSchemas.effort).optional(),
    ctx: observedCellSchema(FleetValueSchemas.ctx).optional(),
    rate: observedCellSchema(FleetValueSchemas.rate).optional(),
    cwd: observedCellSchema(FleetValueSchemas.cwd).optional(),
    pane_id: observedCellSchema(FleetValueSchemas.pane_id).optional(),
  })
  .refine(
    (patch) => FleetFields.some((field) => patch[field] !== undefined),
    "patch must contain an observed cell",
  );

/** This admits known fields only; field authority is checked again by mergeFleetUpdate. */
export const FleetPatchRequestSchema = z.strictObject({
  kind: z.literal("patch"),
  target: FleetIdentitySchema,
  owner: z.enum(FleetOwners),
  patch: FleetPatchSchema,
});

export type FleetIdentity = z.output<typeof FleetIdentitySchema>;
export type FleetPatchRequest = z.output<typeof FleetPatchRequestSchema>;

const OwnerFields: Readonly<Record<FleetOwner, readonly FleetField[]>> = {
  "claude-statusline": ["name", "model", "effort", "ctx", "rate", "cwd"],
  "codex-rollout": ["model", "effort"],
  "codex-thread-identity": ["name"],
  "codex-provider-status": ["ctx", "cwd"],
  "codex-native-viewport": ["cwd"],
  "native-pane-binding": ["pane_id"],
};

const OwnerVendors: Readonly<Record<FleetOwner, readonly FleetVendor[]>> = {
  "claude-statusline": ["claude"],
  "codex-rollout": ["codex"],
  "codex-thread-identity": ["codex"],
  "codex-provider-status": ["codex"],
  "codex-native-viewport": ["codex"],
  "native-pane-binding": ["claude", "codex"],
};

const FleetUpdateErrorSchema = z.union([
  z.strictObject({ code: z.literal("INVALID_REQUEST") }),
  z.strictObject({ code: z.literal("IDENTITY_MISMATCH") }),
  z.strictObject({ code: z.literal("OWNER_FORBIDDEN") }),
  z.strictObject({ code: z.literal("VENDOR_FORBIDDEN") }),
  z.strictObject({
    code: z.literal("STALE_OBSERVATION"),
    field: z.enum(FleetFields),
  }),
]);

export type FleetUpdateError = z.output<typeof FleetUpdateErrorSchema>;
export type FleetUpdateResult =
  | Readonly<{
      ok: true;
      value: FleetSessionV2;
      changed: readonly FleetField[];
    }>
  | Readonly<{ ok: false; error: FleetUpdateError }>;

export const FleetUpdateResultSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    value: FleetSessionV2Schema,
    changed: z.array(z.enum(FleetFields)),
  }),
  z.strictObject({ ok: z.literal(false), error: FleetUpdateErrorSchema }),
]);

/** Decode a complete serialized schema-2 value; no legacy compatibility view is implied. */
export function parseFleetSessionV2(text: string) {
  return jsonOf(FleetSessionV2Schema).safeParse(text);
}

/** Decode one raw owner patch. Unknown keys and null observation ages are rejected. */
export function parseFleetPatchRequest(text: string) {
  return jsonOf(FleetPatchRequestSchema).safeParse(text);
}

function refused(error: FleetUpdateError): FleetUpdateResult {
  return { ok: false, error };
}

function isOlderOrEqual(incoming: string, existing: string): boolean {
  return (
    Temporal.Instant.compare(
      Temporal.Instant.from(incoming),
      Temporal.Instant.from(existing),
    ) <= 0
  );
}

/**
 * Merge one validated owner observation into a schema-2 record without I/O.
 * A caller must supply the reread record and execute any resulting persistence separately.
 */
export function mergeFleetUpdate(
  current: unknown,
  request: unknown,
  commitAt: string,
): FleetUpdateResult {
  const parsedCurrent = FleetSessionV2Schema.safeParse(current);
  const parsedRequest = FleetPatchRequestSchema.safeParse(request);
  if (!parsedCurrent.success || !parsedRequest.success)
    return refused({ code: "INVALID_REQUEST" });
  if (!IsoDateTimeSchema.safeParse(commitAt).success)
    return refused({ code: "INVALID_REQUEST" });

  const record = parsedCurrent.data;
  const patchRequest = parsedRequest.data;
  if (
    record.session_id !== patchRequest.target.session_id ||
    record.vendor !== patchRequest.target.vendor
  )
    return refused({ code: "IDENTITY_MISMATCH" });
  if (!OwnerVendors[patchRequest.owner].includes(record.vendor))
    return refused({ code: "VENDOR_FORBIDDEN" });

  const changed = FleetFields.filter(
    (field) => patchRequest.patch[field] !== undefined,
  );
  for (const field of changed) {
    if (!OwnerFields[patchRequest.owner].includes(field))
      return refused({ code: "OWNER_FORBIDDEN" });
    const incoming = patchRequest.patch[field];
    const existing = record.fields[field];
    if (
      incoming !== undefined &&
      existing.observedAt !== null &&
      isOlderOrEqual(incoming.observedAt, existing.observedAt)
    )
      return refused({ code: "STALE_OBSERVATION", field });
  }

  const fields = {
    name: patchRequest.patch.name ?? record.fields.name,
    model: patchRequest.patch.model ?? record.fields.model,
    effort: patchRequest.patch.effort ?? record.fields.effort,
    ctx: patchRequest.patch.ctx ?? record.fields.ctx,
    rate: patchRequest.patch.rate ?? record.fields.rate,
    cwd: patchRequest.patch.cwd ?? record.fields.cwd,
    pane_id: patchRequest.patch.pane_id ?? record.fields.pane_id,
  };
  return {
    ok: true,
    value: {
      ...record,
      revision: record.revision + 1,
      fields,
      updated_at: commitAt,
    },
    changed,
  };
}
