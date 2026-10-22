import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "../../../../agents/hooks/zod.ts";

const RouteSchema = z.enum(["codex", "claude"]);
const ChoiceSchema = z.strictObject({
  id: z.string().regex(/^[a-z]+[0-9]*-[a-z]+$/u),
  route: RouteSchema,
  model: z.string(),
  effort: z.enum(["low", "medium", "high", "xhigh", "max"]),
  aa_index: z.number().optional(),
  tb4: z.number().optional(),
  tb4_source: z.url().optional(),
  scicode: z.number().optional(),
  scicode_source: z.url().optional(),
  coding_agent: z.number().optional(),
  price_in: z.number().optional(),
  price_cached_in: z.number().optional(),
  price_out: z.number().optional(),
  use_for: z.string(),
});
export type Choice = z.output<typeof ChoiceSchema>;

const JevPricesSchema = z.strictObject({
  price_per_mtok_input: z.number().nonnegative().optional(),
  price_per_mtok_output: z.number().nonnegative().optional(),
});

const CatalogSchema = z
  .strictObject({
    schema: z.literal(1),
    as_of: z.iso.date(),
    jev: JevPricesSchema,
    sources: z.record(z.string(), z.url()),
    choice: z.array(ChoiceSchema).min(1),
  })
  .refine(
    (catalog) =>
      new Set(catalog.choice.map((row) => row.id)).size ===
      catalog.choice.length,
    {
      message: "choice ids must be unique",
    },
  );

const JevEndpointPolicySchema = z.discriminatedUnion("api", [
  z.strictObject({
    api: z.literal("typesafe"),
    url: z.url(),
    model: z.string().min(1),
  }),
  z.strictObject({ api: z.literal("reseller"), url: z.url() }),
]);

const PolicySchema = z.strictObject({
  schema: z.literal(1),
  route: z.strictObject({
    allow: z.array(RouteSchema).min(1).optional(),
    on_window_exhausted: z
      .strictObject({
        codex: z.enum(["continue", "stop"]).optional(),
        claude: z.enum(["continue", "stop"]).optional(),
      })
      .optional(),
    default: z.string(),
    exclude: z.array(z.string()).default([]),
    max_task_chars: z.number().int().positive(),
    timeout_ms: z.number().int().positive(),
    no_egress: z.array(z.string()),
    pick_temperature: z.number().min(0).max(5),
    jev: JevEndpointPolicySchema,
  }),
  claude_run: z.strictObject({
    max_budget_usd: z.number().gt(0),
    max_turns: z.number().int().positive(),
    reason: z.string().min(20),
  }),
});

const AutoSchema = z.strictObject({
  routes: z.array(RouteSchema).min(1).optional(),
  on_window_exhausted: z
    .strictObject({
      codex: z.enum(["continue", "stop"]).optional(),
      claude: z.enum(["continue", "stop"]).optional(),
    })
    .optional(),
  max_task_chars: z.number().int().positive(),
  timeout_ms: z.number().int().positive(),
  max_codex_workers: z.number().int().positive().optional(),
  no_egress: z.array(z.string()),
  pick_temperature: z.number().min(0).max(5),
  jev: z.discriminatedUnion("api", [
    z.strictObject({
      api: z.literal("typesafe"),
      url: z.url(),
      model: z.string().min(1),
      price_per_mtok_input: z.number().nonnegative().optional(),
      price_per_mtok_output: z.number().nonnegative().optional(),
    }),
    z.strictObject({
      api: z.literal("reseller"),
      url: z.url(),
      price_per_mtok_input: z.number().nonnegative().optional(),
      price_per_mtok_output: z.number().nonnegative().optional(),
    }),
  ]),
});

const RosterSchema = z
  .strictObject({
    schema: z.literal(1),
    as_of: z.iso.date(),
    default: z.string(),
    auto: AutoSchema,
    claude_run: PolicySchema.shape.claude_run,
    sources: z.record(z.string(), z.url()),
    choice: z.array(ChoiceSchema).min(1),
  })
  .refine(
    (roster) =>
      roster.choice.some(
        (row) => row.id === roster.default && row.route === "codex",
      ),
    {
      message: "default must name a codex-route choice id",
    },
  );

export type Roster = z.output<typeof RosterSchema>;

export type RosterLoad =
  | { readonly ok: true; readonly value: Roster }
  | { readonly ok: false; readonly error: string };

export type LoadRosterOptions = Readonly<{
  catalogPath?: string;
  policyPath?: string;
}>;

function policyPathFromEnvironment(): string {
  const explicit = Bun.env.AGX_CONFIG;
  if (explicit !== undefined && explicit.length > 0) return explicit;
  const xdg = Bun.env.XDG_CONFIG_HOME;
  const configHome =
    xdg !== undefined && xdg.length > 0 ? xdg : join(homedir(), ".config");
  return join(configHome, "agx", "agx.toml");
}

async function parseToml(path: string): Promise<unknown> {
  return Bun.TOML.parse(await readFile(path, "utf8"));
}

/** Reads the shipped catalog and one user policy, returning the legacy roster shape. */
export async function loadRoster(
  options: LoadRosterOptions = {},
): Promise<RosterLoad> {
  return Promise.try(async (): Promise<RosterLoad> => {
    const catalogRaw = await parseToml(
      options.catalogPath ?? join(import.meta.dir, "catalog.toml"),
    );
    const policyRaw = await parseToml(
      options.policyPath ?? policyPathFromEnvironment(),
    );
    const catalogResult = CatalogSchema.safeParse(catalogRaw);
    if (!catalogResult.success)
      return { ok: false, error: catalogResult.error.message };
    const policyResult = PolicySchema.safeParse(policyRaw);
    if (!policyResult.success)
      return { ok: false, error: policyResult.error.message };

    const catalog = catalogResult.data;
    const policy = policyResult.data;
    const ids = new Set(catalog.choice.map((row) => row.id));
    if (!ids.has(policy.route.default)) {
      return {
        ok: false,
        error: `default must name a catalog row: ${policy.route.default}`,
      };
    }
    const unknownExcluded = policy.route.exclude.find((id) => !ids.has(id));
    if (unknownExcluded !== undefined) {
      return {
        ok: false,
        error: `exclude must name catalog rows: ${unknownExcluded}`,
      };
    }

    const choice = catalog.choice.filter(
      (row) => !policy.route.exclude.includes(row.id),
    );
    if (
      !choice.some(
        (row) => row.id === policy.route.default && row.route === "codex",
      )
    ) {
      return {
        ok: false,
        error: "default must name a non-excluded codex-route catalog row",
      };
    }
    const value = {
      schema: catalog.schema,
      as_of: catalog.as_of,
      default: policy.route.default,
      auto: {
        ...(policy.route.allow === undefined
          ? {}
          : { routes: policy.route.allow }),
        ...(policy.route.on_window_exhausted === undefined
          ? {}
          : { on_window_exhausted: policy.route.on_window_exhausted }),
        max_task_chars: policy.route.max_task_chars,
        timeout_ms: policy.route.timeout_ms,
        no_egress: policy.route.no_egress,
        pick_temperature: policy.route.pick_temperature,
        jev: { ...policy.route.jev, ...catalog.jev },
      },
      claude_run: policy.claude_run,
      sources: catalog.sources,
      choice,
    };
    const rosterResult = RosterSchema.safeParse(value);
    if (!rosterResult.success)
      return { ok: false, error: rosterResult.error.message };
    return { ok: true, value: rosterResult.data };
  }).then(
    (result) => result,
    (error: unknown): RosterLoad => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}
