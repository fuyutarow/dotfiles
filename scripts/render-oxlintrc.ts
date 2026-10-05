// render-oxlintrc — generate .oxlintrc.json from oxlint-policy.toml, the one home of the repo's
// TypeScript lint policy (rules, reasons, custom bans and their bad/good snippets).
// Consumers: `mise run oxlint:render` (--write), `mise run lint:oxlint-policy` (--check) and
// tests/oxlint-policy.test.ts (policyPath, loadPolicy).
//
// The JSON carries no reasons (it cannot hold comments), so it is generated and a gate fails when it
// drifts: edit the TOML, never the JSON.
//
// Modes: --write rewrites .oxlintrc.json · --check exits 1 on drift · neither prints the JSON.
// Exit: 0 ok / up to date · 1 drift (--check) · 2 FATAL (usage, unreadable or invalid policy).
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { z } from "../agents/hooks/zod.ts";

const ROOT = join(import.meta.dir, "..");
export const POLICY_PATH = join(ROOT, "oxlint-policy.toml");
export const OXLINTRC_PATH = join(ROOT, ".oxlintrc.json");

const Level = z.enum(["error", "off"]);
const RuleName = z.string().regex(/^[a-z-]+\/[a-z0-9-]+$/u);
const Reasoned = z.strictObject({ rule: RuleName, reason: z.string().min(1) });
const Custom = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  kind: z.enum(["global", "syntax", "import-path", "import-pattern"]),
  target: z.string().min(1),
  since: z.iso.date(),
  message: z.string().min(1),
  bad: z.string().min(1),
  good: z.string().min(1),
});
const PolicySchema = z
  .strictObject({
    schema: z.literal(1),
    plugins: z.array(z.string()).min(1),
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
        reason: z.string().min(1),
      }),
    ),
    on: z.array(Reasoned),
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
export type Policy = z.output<typeof PolicySchema>;
export type CustomRule = z.output<typeof Custom>;

/** The parsed policy; throws with zod's reason when the file is missing or malformed. */
export function loadPolicy(path = POLICY_PATH): Policy {
  return PolicySchema.parse(Bun.TOML.parse(readFileSync(path, "utf8")));
}

const ofKind = (p: Policy, kind: CustomRule["kind"]): CustomRule[] =>
  p.custom.filter((c) => c.kind === kind);

/** The .oxlintrc.json text for a policy (stable key order, trailing newline). */
export function renderOxlintrc(p: Policy): string {
  const rules: Record<string, unknown> = {};
  for (const r of p.off) rules[r.rule] = "off";
  for (const r of p.option) rules[r.rule] = ["error", r.value];
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
    plugins: p.plugins,
    jsPlugins: p.js_plugins,
    categories: p.categories,
    ignorePatterns: p.ignore.map((i) => i.pattern),
    rules,
  };
  return `${JSON.stringify(config, null, 2)}\n`;
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
          "Render .oxlintrc.json from oxlint-policy.toml (--write / --check).",
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
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (argv._.length > 0) fatal(`unexpected argument: ${argv._[0]}`);
  if (argv.flags.write && argv.flags.check)
    fatal("give --write or --check, not both");

  const loaded = await attempt(() => loadPolicy());
  if (!loaded.ok)
    fatal(`cannot read oxlint-policy.toml: ${errorMessage(loaded.error)}`);
  const next = renderOxlintrc(loaded.value);

  if (!argv.flags.write && !argv.flags.check) {
    process.stdout.write(next);
    process.exit(0);
  }
  const current = await attempt(() => readFileSync(OXLINTRC_PATH, "utf8"));
  const same = current.ok && current.value === next;
  if (argv.flags.check && same) {
    console.log("render-oxlintrc: up to date");
    process.exit(0);
  }
  if (argv.flags.check) {
    console.log(
      "render-oxlintrc: DRIFT — .oxlintrc.json is not a fresh render of oxlint-policy.toml; edit the TOML, then run `mise run oxlint:render`",
    );
    process.exit(1);
  }
  if (!same) writeFileSync(OXLINTRC_PATH, next);
  console.log(
    same
      ? "render-oxlintrc: up to date"
      : "render-oxlintrc: wrote .oxlintrc.json",
  );
}
