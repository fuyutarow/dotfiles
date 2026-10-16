// render-oxlintrc — generate .oxlintrc.json from presets/typescript/policy.toml, the one home of the repo's
// TypeScript lint policy (rules, reasons, custom bans and their bad/good snippets).
// Consumers: `mise run oxlint:render` (--write), `mise run lint:oxlint-policy` (--check) and
// tests/oxlint-policy.test.ts (policyPath, loadPolicy).
//
// The JSON carries no reasons (it cannot hold comments), so it is generated and a gate fails when it
// drifts: edit the TOML, never the JSON.
//
// Modes: --write rewrites .oxlintrc.json · --check exits 1 on drift · neither prints the JSON.
// --repo DIR renders ANOTHER repo's .oxlintrc.json from this same policy plus that repo's own
// oxlint-policy.local.toml, which may ADD reasoned ignores and opt into React package globs: one policy for every
// repo of the owner (firedancer, 2026-10-06), and a consumer cannot quietly weaken a rule.
// Exit: 0 ok / up to date · 1 drift (--check) · 2 FATAL (usage, unreadable or invalid policy).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";

const ROOT = join(import.meta.dir, "..");
export const POLICY_PATH = join(ROOT, "presets", "typescript", "policy.toml");
export const OXLINTRC_PATH = join(ROOT, ".oxlintrc.json");

const Level = z.enum(["error", "off"]);
const RuleName = z.string().regex(/^[a-z-]+\/[a-z0-9-]+$/u);
const Reasoned = z.strictObject({ rule: RuleName, reason: z.string().min(1) });
const Custom = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  // Where the rule holds. "house": every repo of the owner — rendered here and by --repo.
  // "dotfiles": a fact of this repo's layout (zod comes from the vendored agents/hooks/zod.ts because
  // hooks run before `bun install`), so --repo leaves it out (firedancer, 2026-10-06: workers were
  // pushed to `../node_modules/zod/index.js` by a rule that had no meaning there). Required: every
  // rule is classified on purpose.
  scope: z.enum(["house", "dotfiles"]),
  kind: z.enum(["global", "syntax", "import-path", "import-pattern"]),
  target: z.string().min(1),
  since: z.iso.date(),
  message: z.string().min(1),
  bad: z.array(z.string().min(1)).min(1),
  good: z.array(z.string().min(1)).min(1),
});
const PolicySchema = z
  .strictObject({
    schema: z.literal(1),
    plugins: z.array(z.string()).min(1),
    react: z.strictObject({
      rules: z.record(RuleName, Level),
    }),
    js_plugins: z.array(
      z.strictObject({ name: z.string(), specifier: z.string() }),
    ),
    categories: z.strictObject({
      correctness: Level,
      suspicious: Level,
      pedantic: Level,
      perf: Level,
      restriction: Level,
      style: Level,
      nursery: Level,
    }),
    ignore: z.array(
      z.strictObject({ pattern: z.string().min(1), reason: z.string().min(1) }),
    ),
    off: z.array(Reasoned),
    option: z.array(
      z.strictObject({
        rule: RuleName,
        value: z.unknown(),
        level: Level.optional(),
        reason: z.string().min(1),
      }),
    ),
    on: z.array(Reasoned),
    overrides: z.array(
      z.strictObject({
        files: z.array(z.string()).min(1),
        plugins: z.array(z.string()).optional(),
        rules: z.record(RuleName, Level),
      }),
    ),
    custom: z.array(Custom).min(1),
  })
  .refine(
    (p) => {
      const names = [...p.off, ...p.option, ...p.on].map((r) => r.rule);
      return new Set(names).size === names.length;
    },
    { message: "a rule is listed twice across [[off]], [[option]] and [[on]]" },
  )
  .refine((p) => new Set(p.custom.map((c) => c.id)).size === p.custom.length, {
    message: "custom ids must be unique",
  });
export type Policy = z.output<typeof PolicySchema> & {
  presetRevision?: string;
  presetCommit?: string;
};

/** Content revision of the canonical policy, independent of unrelated owner commits. */
export function presetRevision(policy: Policy): string {
  return `sha256:${Bun.CryptoHasher.hash("sha256", JSON.stringify(Object.fromEntries(Object.entries(policy).filter(([key]) => key !== "presetRevision" && key !== "presetCommit"))), "hex")}`;
}

const LocalSchema = z.strictObject({
  schema: z.literal(1),
  react: z
    .array(
      z
        .string()
        .min(1)
        .refine((glob) => glob.trim().length > 0, "glob must not be blank"),
    )
    .optional(),
  ignore: z.array(
    z.strictObject({ pattern: z.string().min(1), reason: z.string().min(1) }),
  ),
});
export const LOCAL_POLICY = "oxlint-policy.local.toml";

/** The policy for a consumer repo: house rules, optional ignores and React package globs. */
export async function loadRepoPolicy(
  repo: string,
  base: Policy,
): Promise<PolicyLoad> {
  const path = join(repo, LOCAL_POLICY);
  const content = await attempt(() => Bun.file(path).text());
  const missing =
    !content.ok &&
    z.looseObject({ code: z.literal("ENOENT") }).safeParse(content.error)
      .success;
  if (!content.ok && !missing)
    return {
      ok: false,
      error: `${path}: ${errorMessage(content.error)}`,
    };
  const raw = await attempt(() =>
    content.ok ? Bun.TOML.parse(content.value) : { schema: 1, ignore: [] },
  );
  if (!raw.ok)
    return { ok: false, error: `${path}: ${errorMessage(raw.error)}` };
  const local = LocalSchema.safeParse(raw.value);
  if (!local.success)
    return { ok: false, error: `${path}: ${local.error.message}` };
  const react = local.data.react ?? [];
  // A consumer repo gets the house rules only (Custom.scope); dotfiles-scoped rules stay here.
  return {
    ok: true,
    value: {
      ...base,
      presetRevision: presetRevision(base),
      js_plugins: base.js_plugins,
      ignore: [...base.ignore, ...local.data.ignore],
      overrides: [
        ...base.overrides,
        ...(react.length > 0
          ? [
              {
                files: react,
                plugins: [...base.plugins, "react"],
                rules: base.react.rules,
              },
            ]
          : []),
      ],
      custom: base.custom.filter((c) => c.scope === "house"),
    },
  };
}
export type CustomRule = z.output<typeof Custom>;

export type PolicyLoad =
  | { readonly ok: true; readonly value: Policy }
  | { readonly ok: false; readonly error: string };

/** The parsed policy, or why not (missing file, bad TOML, or zod's reason) — never a throw. */
export async function loadPolicy(path = POLICY_PATH): Promise<PolicyLoad> {
  const raw = await attempt(() => Bun.TOML.parse(readFileSync(path, "utf8")));
  if (!raw.ok) return { ok: false, error: errorMessage(raw.error) };
  return parsePolicy(raw.value);
}

function parsePolicy(raw: unknown): PolicyLoad {
  const r = PolicySchema.safeParse(raw);
  return r.success
    ? { ok: true, value: r.data }
    : { ok: false, error: r.error.message };
}

/** Read committed policy bytes without snapshotting or consulting working-copy files. */
export async function loadCommittedPolicy(
  revision = "alpha",
  root = ROOT,
): Promise<PolicyLoad> {
  const run = async (
    command: string[],
  ): Promise<{ ok: true; value: string } | { ok: false; error: string }> => {
    const result = await attempt(async () => {
      const child = Bun.spawn(command, {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      });
      const [stdout, stderr, exit] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stdout, stderr, exit };
    });
    if (!result.ok) return { ok: false, error: errorMessage(result.error) };
    if (result.value.exit !== 0)
      return { ok: false, error: result.value.stderr.trim() };
    return { ok: true, value: result.value.stdout };
  };
  // Pin the operation as well as skipping snapshots: even read commands may
  // otherwise reconcile operation heads in a read-only owner repository.
  const jj = (args: string[]) =>
    run([
      "jj",
      "--ignore-working-copy",
      "--at-operation",
      "@",
      "-R",
      root,
      ...args,
    ]);
  let commit = await jj([
    "log",
    "-r",
    revision,
    "--no-graph",
    "-T",
    "commit_id",
  ]);
  // Some jj versions also write while determining secure config. Colocated
  // Git can read the same committed objects without touching jj's metadata.
  if (
    !commit.ok &&
    (revision === "alpha" || /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(revision))
  )
    commit = await run([
      "git",
      "--no-optional-locks",
      "-C",
      root,
      "rev-parse",
      "--verify",
      `${revision === "alpha" ? "refs/heads/alpha" : revision}^{commit}`,
    ]);
  if (!commit.ok) return commit;
  commit = { ok: true, value: commit.value.trim() };
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(commit.value))
    return { ok: false, error: "preset revision must resolve to one commit" };
  let content = await jj([
    "file",
    "show",
    "-r",
    commit.value,
    "root:presets/typescript/policy.toml",
  ]);
  if (!content.ok)
    content = await run([
      "git",
      "--no-optional-locks",
      "-C",
      root,
      "show",
      `${commit.value}:presets/typescript/policy.toml`,
    ]);
  if (!content.ok) return content;
  const raw = await attempt(() => Bun.TOML.parse(content.value));
  if (!raw.ok) return { ok: false, error: errorMessage(raw.error) };
  const policy = parsePolicy(raw.value);
  return policy.ok
    ? { ok: true, value: { ...policy.value, presetCommit: commit.value } }
    : policy;
}

const ofKind = (p: Policy, kind: CustomRule["kind"]): CustomRule[] =>
  p.custom.filter((c) => c.kind === kind);

/** The .oxlintrc.json text for a policy (stable key order, trailing newline). */
export function renderOxlintrc(p: Policy): string {
  const rules: Record<string, unknown> = {};
  for (const r of p.off) rules[r.rule] = "off";
  for (const r of p.option) rules[r.rule] = [r.level ?? "error", r.value];
  for (const r of p.on) rules[r.rule] = "error";
  rules["eslint/no-restricted-globals"] = [
    "error",
    ...ofKind(p, "global").map((c) => ({ name: c.target, message: c.message })),
  ];
  rules["eslint-js/no-restricted-syntax"] = [
    "error",
    ...ofKind(p, "syntax").map((c) => ({
      selector: c.target,
      message: c.message,
    })),
  ];
  rules["eslint/no-restricted-imports"] = [
    "error",
    {
      paths: ofKind(p, "import-path").map((c) => ({
        name: c.target,
        message: c.message,
      })),
      patterns: ofKind(p, "import-pattern").map((c) => ({
        group: [c.target],
        message: c.message,
      })),
    },
  ];
  const config = {
    $schema: "./node_modules/oxlint/configuration_schema.json",
    ...(p.presetRevision === undefined
      ? {}
      : {
          settings: {
            dotfiles: {
              presetRevision: p.presetRevision,
              presetCommit: p.presetCommit,
            },
          },
        }),
    plugins: p.plugins,
    jsPlugins: p.js_plugins,
    categories: p.categories,
    ignorePatterns: p.ignore.map((i) => i.pattern),
    rules,
    overrides: p.overrides,
  };
  return `${JSON.stringify(config, null, 2)}\n`;
}

function recordedPresetCommit(text: string): string | undefined {
  const metadata = jsonOf(
    z.looseObject({
      settings: z.looseObject({
        dotfiles: z.looseObject({
          presetCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u),
        }),
      }),
    }),
  ).safeParse(text);
  return metadata.success
    ? metadata.data.settings.dotfiles.presetCommit
    : undefined;
}

function fatal(message: string): never {
  console.error(`render-oxlintrc: ${message}`);
  return process.exit(2);
}

if (import.meta.main) {
  const rejectPrototypeFlag = (type: string, flag: string): void => {
    if (type === "unknown-flag" && flag === "__proto__")
      fatal(`unknown option '--${flag}'`);
  };
  const argv = cli(
    {
      name: "render-oxlintrc",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Render .oxlintrc.json from presets/typescript/policy.toml (--write / --check).",
      },
      flags: {
        write: {
          type: Boolean,
          default: false,
          description: "rewrite .oxlintrc.json",
        },
        check: {
          type: Boolean,
          default: false,
          description: "exit 1 when .oxlintrc.json is stale",
        },
        repo: {
          type: String,
          description: `render DIR/.oxlintrc.json instead: this policy + DIR/${LOCAL_POLICY}`,
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (argv._.length > 0) fatal(`unexpected argument: ${argv._[0]}`);
  if (argv.flags.write && argv.flags.check)
    fatal("give --write or --check, not both");

  const repo = argv.flags.repo;
  if (repo === "") fatal("--repo needs a directory");
  const target =
    repo === undefined ? OXLINTRC_PATH : join(repo, ".oxlintrc.json");
  const current = await attempt(() => readFileSync(target, "utf8"));
  const missing =
    !current.ok &&
    z.looseObject({ code: z.literal("ENOENT") }).safeParse(current.error)
      .success;
  if (repo !== undefined && !current.ok && !missing)
    fatal(`cannot read ${target}: ${errorMessage(current.error)}`);
  const commit = current.ok ? recordedPresetCommit(current.value) : undefined;
  // Legacy consumers cannot be compared to an identified source. Preserve their
  // bytes until an explicit preset sync adopts alpha and records its commit.
  if (repo !== undefined && current.ok && commit === undefined) {
    console.log(
      "render-oxlintrc: rendered from an unrecorded revision; run preset sync",
    );
    process.exit(0);
  }
  const sourceCommit = argv.flags.check ? commit : undefined;
  // First adoption also works in exported copies without repository metadata.
  // It retains the historical local render; only preset sync adopts a commit.
  if (repo !== undefined && missing)
    console.error(
      "render-oxlintrc: no revision recorded; rendering local preset files; run preset sync",
    );
  const loaded =
    repo === undefined || missing
      ? await loadPolicy()
      : await loadCommittedPolicy(sourceCommit);
  if (!loaded.ok)
    fatal(`cannot read presets/typescript/policy.toml: ${loaded.error}`);
  const policy =
    repo === undefined ? loaded : await loadRepoPolicy(repo, loaded.value);
  if (!policy.ok) fatal(policy.error);
  const next = renderOxlintrc(policy.value);

  if (!argv.flags.write && !argv.flags.check) {
    process.stdout.write(next);
    process.exit(0);
  }
  const same = current.ok && current.value === next;
  if (argv.flags.check && same) {
    console.log("render-oxlintrc: up to date");
    process.exit(0);
  }
  if (argv.flags.check) {
    const metadata = current.ok
      ? jsonOf(
          z.looseObject({
            settings: z.looseObject({
              dotfiles: z.looseObject({ presetRevision: z.string() }),
            }),
          }),
        ).safeParse(current.value)
      : undefined;
    const previous =
      metadata?.success === true
        ? metadata.data.settings.dotfiles.presetRevision
        : "unknown (unversioned render)";
    const revision =
      policy.value.presetRevision ?? presetRevision(loaded.value);
    console.log(
      previous === revision
        ? `render-oxlintrc: ${target} differs from preset ${revision}; run preset sync (mise run preset -- sync typescript --to ${repo ?? ROOT})`
        : `render-oxlintrc: preset moved from ${previous} to ${revision}; run preset sync (mise run preset -- sync typescript --to ${repo ?? ROOT})`,
    );
    process.exit(1);
  }
  if (!same) writeFileSync(target, next);
  console.log(
    same ? "render-oxlintrc: up to date" : `render-oxlintrc: wrote ${target}`,
  );
}
