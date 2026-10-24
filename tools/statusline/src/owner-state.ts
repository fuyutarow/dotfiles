// The sampler is the only writer. A render reads one small snapshot, never refreshes it.
import { dirname, join, resolve } from "node:path";
import { readFile, realpath, stat } from "node:fs/promises";
import { err, ok } from "neverthrow";
import { jsonOf, z } from "./zod.ts";
import { MemReadingSchema } from "./host-model.ts";
import { RecoverHealthSchema } from "./recover-health.ts";
import type { Sources } from "./build-dataframe.ts";
import {
  AgentSessionSchema,
  sessionProcessMatches,
} from "./session-discovery.ts";

export const ownerStatePath = (env: NodeJS.ProcessEnv = process.env) =>
  env.STATUSLINE_OWNER_STATE ??
  join(join(env.HOME ?? "", ".local/state"), "statusline", "owner.json");
export const OwnerFieldSchema = z.object({
  at: z.number(),
  value: z.unknown(),
  error: z.string().optional(),
});
export const OwnerStateSchema = z.object({
  schema: z.literal(1),
  fields: z.record(z.string(), OwnerFieldSchema),
});
export type OwnerState = z.output<typeof OwnerStateSchema>;
const ErrorTextSchema = z.string();
const ResultWireSchema = z.record(z.string(), z.unknown());
export const resultSchema = <T extends z.ZodType>(value: T) =>
  ResultWireSchema.transform((wire, context) => {
    if (Object.hasOwn(wire, "error")) {
      const failure = ErrorTextSchema.safeParse(wire.error);
      if (failure.success) return err(failure.data);
      context.addIssue({ code: "custom", message: "invalid owner error" });
      return z.NEVER;
    }
    const parsed = value.safeParse(
      wire.value === null ? undefined : wire.value,
    );
    if (!parsed.success) {
      context.addIssue({ code: "custom", message: "invalid owner value" });
      return z.NEVER;
    }
    return ok<z.output<T>, string>(parsed.data);
  });
const DiskSchema = z.union([
  z.object({ kind: z.literal("miss"), label: z.string(), why: z.string() }),
  z
    .object({
      kind: z.literal("reading"),
      label: z.string(),
      usedG: z.number(),
      totalG: z.number().optional(),
      freeG: z.number().optional(),
      path: z.string().optional(),
      rateGibPerMin: z.number().optional(),
      rateRedMinutes: z.number().optional(),
      rateYellowMinutes: z.number().optional(),
    })
    .transform(({ path, ...v }) => ({
      ...v,
      totalG: v.totalG,
      freeG: v.freeG,
      ...(path === undefined ? {} : { path }),
    })),
]);
const TmpSchema = z.union([
  z.object({ kind: z.literal("miss"), label: z.string(), why: z.string() }),
  z
    .object({
      kind: z.literal("reading"),
      label: z.string(),
      freeG: z.number(),
      totalG: z.number(),
      inodeUsedPct: z.number().optional(),
    })
    .transform((v) => ({ ...v, inodeUsedPct: v.inodeUsedPct })),
]);
const IdentitySchema = z.lazy(() =>
  z
    .object({
      email: z.string().optional(),
      accountWhy: z.string().optional(),
      rlModel: z.array(
        z
          .object({
            name: z.string(),
            pct: z.number(),
            resetEpoch: z.number().optional(),
          })
          .transform((v) => ({ ...v, resetEpoch: v.resetEpoch })),
      ),
      modelCapsWhy: z.string().optional(),
      wfOn: z.boolean(),
      workflowWhy: z.string().optional(),
    })
    .transform((v) => ({
      ...v,
      email: v.email,
      accountWhy: v.accountWhy,
      modelCapsWhy: v.modelCapsWhy,
    })),
);
const HostSchema = z.lazy(() =>
  z
    .object({
      cpuPct: resultSchema(z.number()),
      ram: resultSchema(MemReadingSchema),
      vram: resultSchema(MemReadingSchema).optional(),
      tmpfs: resultSchema(
        z.object({ availableBytes: z.number(), freeInodes: z.number() }),
      ).optional(),
      tmp: z.array(TmpSchema).optional(),
    })
    .transform((v) => ({ ...v, vram: v.vram })),
);
export const RepoSchema = z
  .object({
    branch: z.string().optional(),
    branchWhy: z.string().optional(),
    workspace: z.string().optional(),
    add: z.number().optional(),
    del: z.number().optional(),
  })
  .transform((v) => ({ ...v, branch: v.branch, branchWhy: v.branchWhy }));
const RateSchema = z
  .object({
    windows: z.array(
      z
        .object({
          minutes: z.number(),
          percent: z.number(),
          reset: z.number().optional(),
        })
        .transform(({ reset, ...v }) => ({
          ...v,
          ...(reset === undefined ? {} : { reset }),
        })),
    ),
    mtimeMs: z.number(),
    credits: z.string().optional(),
  })
  .transform(({ credits, ...v }) => ({
    ...v,
    ...(credits === undefined ? {} : { credits }),
  }));

export async function readOwnerState(
  env: NodeJS.ProcessEnv = process.env,
): Promise<OwnerState | undefined> {
  const path = ownerStatePath(env);
  for (const candidate of [path, `${path}.last-good`]) {
    const text = await readFile(candidate, "utf8").catch(() => null);
    const parsed =
      text === null ? undefined : jsonOf(OwnerStateSchema).safeParse(text);
    if (parsed?.success !== true) continue;
    if (candidate === path) return parsed.data;
    return {
      schema: 1,
      fields: Object.fromEntries(
        Object.entries(parsed.data.fields).map(([key, field]) => [
          key,
          { ...field, error: field.error ?? "owner snapshot unreadable" },
        ]),
      ),
    };
  }
  return undefined;
}

/** Discovery is sampled once; rendering accepts only the recorded process generation. */
export async function readRenderSessions(
  cwd: string,
  pending = readOwnerState(),
) {
  const snapshot = await pending;
  const parsed = z
    .array(AgentSessionSchema)
    .safeParse(snapshot?.fields.sessions?.value);
  if (!parsed.success) return [];
  const canonical =
    cwd === process.cwd() ? cwd : await realpath(cwd).catch(() => cwd);
  const selected = parsed.data.filter((session) => session.cwd === canonical);
  const alive = await Promise.all(
    selected.map(async (session) =>
      (await sessionProcessMatches(session)) ? session : undefined,
    ),
  );
  return alive.filter((session) => session !== undefined);
}

/** Resolve repository membership with metadata reads only, including jj workspaces. */
export async function repositoryRoot(cwd: string): Promise<string | undefined> {
  let path = await realpath(cwd).catch(() => resolve(cwd));
  for (;;) {
    const entries = await Promise.all([
      stat(join(path, ".jj")).catch(() => null),
      stat(join(path, ".git")).catch(() => null),
    ]);
    if (entries.some((entry) => entry !== null)) return path;
    const parent = dirname(path);
    if (parent === path) return undefined;
    path = parent;
  }
}

export function ownerSources(
  pending = readOwnerState(),
): Sources & { snapshot: Promise<OwnerState | undefined> } {
  // Per-frame memo only: watch mode reads again for every frame.
  const read = async <T extends z.ZodType>(
    key: string,
    schema: T,
  ): Promise<z.output<T> | undefined> => {
    const field = (await pending)?.fields[key];
    if (field === undefined) return undefined;
    const parsed = schema.safeParse(field.value);
    return parsed.success ? parsed.data : undefined;
  };
  return {
    snapshot: pending,
    identity: async () =>
      (await read("identity", IdentitySchema)) ?? {
        email: undefined,
        accountWhy: "sampler unavailable",
        rlModel: [],
        modelCapsWhy: "sampler unavailable",
        wfOn: false,
      },
    agentName: async (sid) =>
      (await read(`name:${sid}`, resultSchema(z.string().optional()))) ??
      ok(undefined),
    rcState: async () =>
      (process.env.CLAUDE_CODE_BRIDGE_SESSION_ID ?? "") !== ""
        ? "on"
        : ((await read("rcState", z.enum(["on", "off", "unknown"]))) ??
          "unknown"),
    repoState: async (cwd) => {
      const path = resolve(cwd);
      const key = Object.keys((await pending)?.fields ?? {})
        .filter(
          (candidate) =>
            candidate.startsWith("repo:") &&
            (path === candidate.slice(5) ||
              path.startsWith(`${candidate.slice(5)}/`)),
        )
        .toSorted((a, b) => b.length - a.length)[0];
      if (key === undefined) return { branch: undefined, branchWhy: undefined };
      return (
        (await read(key, RepoSchema)) ?? {
          branch: undefined,
          branchWhy: "repository not sampled",
        }
      );
    },
    jobScan: async () =>
      (await read(
        "jobScan",
        z.object({
          jobs: z.array(z.object({ name: z.string(), secs: z.number() })),
          orphans: z.number(),
          failed: z.string().optional(),
        }),
      )) ?? { jobs: [], orphans: 0, failed: "sampler unavailable" },
    hostLoad: async () => {
      const legacy =
        (await pending)?.fields.cpuPct === undefined
          ? await read("hostLoad", HostSchema)
          : undefined;
      return {
        cpuPct:
          (await read("cpuPct", resultSchema(z.number()))) ??
          legacy?.cpuPct ??
          err("sampler unavailable"),
        ram:
          (await read("ram", resultSchema(MemReadingSchema))) ??
          legacy?.ram ??
          err("sampler unavailable"),
        vram:
          (await read("vram", resultSchema(MemReadingSchema))) ?? legacy?.vram,
        tmpfs:
          (await read(
            "tmpfs",
            resultSchema(
              z.object({ availableBytes: z.number(), freeInodes: z.number() }),
            ),
          )) ?? legacy?.tmpfs,
        tmp: (await read("tmp", z.array(TmpSchema))) ?? legacy?.tmp,
      };
    },
    storage: async () =>
      (await read("storage", resultSchema(z.array(DiskSchema)))) ??
      err("sampler unavailable"),
    codexRate: async () =>
      (await read("codexRate", resultSchema(RateSchema.optional()))) ??
      ok(undefined),
    jevUsage: async () =>
      (await read(
        "jevUsage",
        resultSchema(
          z
            .object({ costUsd: z.number().optional() })
            .transform((v) => ({ costUsd: v.costUsd }))
            .optional(),
        ),
      )) ?? ok(undefined),
    recoverHealth: async () =>
      (await read(
        "recoverHealth",
        resultSchema(RecoverHealthSchema.optional()),
      )) ?? err("sampler unavailable"),
    dispatchWarning: async () => {
      const error = (await pending)?.fields.dispatchWarning?.error;
      if (error !== undefined) return err(error);
      return (
        (await read("dispatchWarning", resultSchema(z.string().optional()))) ??
        ok(undefined)
      );
    },
    routes: () => Promise.resolve(undefined), // The builder adapts agx data from this owner cache.
    herdrReport: () => Promise.resolve(),
  };
}
