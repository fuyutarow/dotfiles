// oxlint exposes the ESLint-compatible context through its RuleTester contract.
import { matchesGlob, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuleTester } from "oxlint/plugins-dev";
import { z } from "../../shared/src/zod.ts";

type Rule = Parameters<RuleTester["run"]>[1];
type Context = Parameters<NonNullable<Rule["create"]>>[0];
type Source = Context["sourceCode"];
type Node = Parameters<Source["getScope"]>[0];
type Identifier = Extract<Node, { type: "Identifier" }>;
type Binding = { module: string; api: string | null };
// Exemptions belong to this checkout, even when its policy is rendered into another repo.
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));

const Options = z.strictObject({
  root: z.string().optional(),
  exclude: z.array(z.string().min(1)).default([]),
  apis: z
    .array(
      z.strictObject({
        modules: z.array(z.string()).min(1),
        api: z.string().min(1),
        replacement: z.string().min(1),
      }),
    )
    .min(1),
  allowlist: z.record(z.string(), z.string().min(1)),
});

function variable(source: Source, identifier: Identifier) {
  let scope: ReturnType<Source["getScope"]> | null =
    source.getScope(identifier);
  while (scope !== null) {
    const found = scope.set.get(identifier.name);
    if (found !== undefined) return found;
    scope = scope.upper;
  }
  return null;
}

function name(node: Node): string | null {
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal" && typeof node.value === "string")
    return node.value;
  return null;
}

function property(
  node: Extract<Node, { type: "MemberExpression" }>,
): string | null {
  if (node.computed && node.property.type !== "Literal") return null;
  return name(node.property);
}

function binding(source: Source, identifier: Identifier): Binding | null {
  const resolved = variable(source, identifier);
  const definition = resolved?.defs[0];
  if (
    definition?.type === "ImportBinding" &&
    definition.parent?.type === "ImportDeclaration"
  ) {
    const specifier = definition.node;
    if (definition.parent.importKind === "type") return null;
    const api =
      specifier.type === "ImportSpecifier" ? name(specifier.imported) : null;
    return { module: definition.parent.source.value, api };
  }
  if (definition?.node.type !== "VariableDeclarator") return null;
  const init = definition.node.init;
  if (
    init?.type !== "CallExpression" ||
    init.callee.type !== "Identifier" ||
    init.callee.name !== "require"
  )
    return null;
  if (variable(source, init.callee) !== null) return null;
  const argument = init.arguments[0];
  if (argument?.type !== "Literal" || typeof argument.value !== "string")
    return null;
  const module = argument.value;
  const pattern = definition.node.id;
  const member =
    pattern.type === "ObjectPattern"
      ? pattern.properties.find(
          (p) =>
            p.type === "Property" &&
            p.value.type === "Identifier" &&
            p.value.name === identifier.name,
        )
      : undefined;
  return { module, api: member?.type === "Property" ? name(member.key) : null };
}

function importedCall(
  source: Source,
  callee: Extract<Node, { type: "CallExpression" }>["callee"],
): Binding | null {
  if (callee.type === "Identifier") return binding(source, callee);
  if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier")
    return null;
  const imported = binding(source, callee.object);
  return imported === null
    ? null
    : { module: imported.module, api: property(callee) };
}

export const preferBunApi = {
  meta: {
    type: "suggestion",
    schema: [{ type: "object", additionalProperties: true }],
    messages: {
      replace: "{{api}} → {{replacement}} (Bun-first I/O policy).",
      stale:
        "Stale Bun API allowlist entry: {{path}} no longer calls a policy API; remove it.",
      invalid: "Invalid Bun API policy options: {{error}}",
    },
  },
  create(context: Context) {
    const checked = Options.safeParse(context.options[0]);
    if (!checked.success)
      return {
        Program(node: Extract<Node, { type: "Program" }>) {
          context.report({
            node,
            messageId: "invalid",
            data: { error: checked.error.message },
          });
        },
      };
    const options = checked.data;
    const path = relative(options.root ?? ROOT, context.filename).replaceAll(
      "\\",
      "/",
    );
    // Only this rule excludes tests; all other lint policies still govern them.
    if (options.exclude.some((pattern) => matchesGlob(path, pattern)))
      return {};
    const exempt = Object.hasOwn(options.allowlist, path);
    let hits = 0;
    return {
      CallExpression(node: Extract<Node, { type: "CallExpression" }>) {
        const imported = importedCall(context.sourceCode, node.callee);
        if (imported === null) return;
        const policy = options.apis.find(
          (entry) =>
            entry.modules.includes(imported.module) &&
            entry.api === imported.api,
        );
        if (policy === undefined) return;
        hits += 1;
        if (!exempt)
          context.report({
            node,
            messageId: "replace",
            data: { api: policy.api, replacement: policy.replacement },
          });
      },
      "Program:exit"(node: Extract<Node, { type: "Program" }>) {
        if (exempt && hits === 0)
          context.report({ node, messageId: "stale", data: { path } });
      },
    };
  },
} satisfies Rule;

export default {
  meta: { name: "dotfiles" },
  rules: { "prefer-bun-api": preferBunApi },
};
