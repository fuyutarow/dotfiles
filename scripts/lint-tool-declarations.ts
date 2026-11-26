// `mise run lint:tool-declarations` — every hand-written list about a tool that opted in
// (tools/<name>/tool.toml) is compared with that declaration; the tools that did not opt in are
// counted against a ratchet. Contract: tools/README.md.
//
// Consumer: gate:land through `lint`. Output: one line per finding. Exit 0 clean, 1 findings,
// 2 the check itself could not run.
//
// Checked, per declared tool:
//   bins        root package.json `bin` and tools/<name>/package.json `bin` carry exactly the
//               declared commands, pointing at the declared files
//   README      a table row keyed by the tool name has the declared Kind and Reason (= purpose);
//               every other declared bin has a row too
//   registry    scripts/config-registry.ts lists tools/<name>/package.json and tool.toml as sources
//   shell       the file exists, and config/zsh/aliases.zsh TOOL_SHELL_FRAGMENTS lists exactly the
//               declared fragments (no more, no fewer)
//   probes      the file exists and mise.toml's task runs it through scripts/tool-probe.ts
//   consumers   each file exists and still mentions a declared bin or a function the fragment defines
//   undeclared  a *.zsh file or a src/doctor-*.ts under the tool that its declaration does not name
// Ratchet: scripts/lint/tool-declarations-baseline.txt lists the tools without tool.toml; a tool outside
// the list without a declaration, or a listed tool that declares (or is gone), fails.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { consola } from "consola";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import { Result, errorMessage } from "@dotfiles/shared/src/result.ts";
import {
  loadToolDeclarations,
  type LoadedTool,
} from "@dotfiles/shared/src/tool-declaration.ts";

export const BASELINE = "scripts/lint/tool-declarations-baseline.txt";
export const FRAGMENT_LIST = "config/zsh/aliases.zsh";

const Manifest = jsonOf(
  z.looseObject({
    bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
  }),
);

export type CheckOptions = {
  /** Every `sources` entry of scripts/config-registry.ts. */
  registrySources: ReadonlySet<string>;
};

async function text(root: string, path: string): Promise<string | undefined> {
  const read = await Result.tryPromise({
    try: () => readFile(join(root, path), "utf8"),
    catch: (e: unknown) => e,
  });
  return read.isOk() ? read.value : undefined;
}

async function binsOf(
  root: string,
  manifest: string,
): Promise<Record<string, string> | string> {
  const body = await text(root, manifest);
  if (body === undefined) return `${manifest} is missing`;
  const parsed = Manifest.safeParse(body);
  if (!parsed.success) return `${manifest} is not valid package JSON`;
  const bin = parsed.data.bin;
  return typeof bin === "object" ? bin : {};
}

/** `| \`name\` | A | reason |` rows of the README tool table, by first-column name. */
export function readmeRows(
  readme: string,
): Map<string, { kind: string; reason: string }> {
  const rows = new Map<string, { kind: string; reason: string }>();
  for (const line of readme.split("\n")) {
    const match = /^\| `([^`]+)` \| ([^|]+?) \| (.*) \|$/u.exec(line);
    if (match?.[1] !== undefined)
      rows.set(match[1], { kind: match[2] ?? "", reason: match[3] ?? "" });
  }
  return rows;
}

/** The entries of `TOOL_SHELL_FRAGMENTS=( … )` in config/zsh/aliases.zsh; undefined if the list is absent. */
export function fragmentList(zsh: string): string[] | undefined {
  const match = /^TOOL_SHELL_FRAGMENTS=\(([^)]*)\)/mu.exec(zsh);
  if (match?.[1] === undefined) return undefined;
  return match[1]
    .split("\n")
    .map((line) => line.replace(/#.*$/u, "").trim())
    .filter((line) => line !== "")
    .flatMap((line) => line.split(/\s+/u));
}

async function filesBelow(root: string, dir: string): Promise<string[]> {
  const found = await Result.tryPromise({
    try: () =>
      readdir(join(root, dir), { recursive: true, withFileTypes: true }),
    catch: (e: unknown) => e,
  });
  if (!found.isOk()) return [];
  return found.value
    .filter(
      (entry) => entry.isFile() && !entry.parentPath.includes("node_modules"),
    )
    .map((entry) =>
      relative(root, join(entry.parentPath, entry.name)).split("\\").join("/"),
    );
}

function binProblems(
  label: string,
  have: Record<string, string> | string,
  expected: readonly (readonly [string, string])[],
): string[] {
  if (typeof have === "string") return [have];
  return expected.flatMap(([name, file]) => {
    const actual = have[name];
    if (actual === undefined)
      return [`bin "${name}" is declared but missing from ${label}`];
    return actual === file
      ? []
      : [`bin "${name}" is ${actual} in ${label}, declared ${file}`];
  });
}

/** Bins that root or tool package.json point into the tool, or list for it, but tool.toml omits. */
function undeclaredBinProblems(
  at: string,
  declared: Record<string, string>,
  rootBins: Record<string, string> | string,
  localBins: Record<string, string> | string,
): string[] {
  const root =
    typeof rootBins === "string"
      ? []
      : Object.entries(rootBins)
          .filter(
            ([name, file]) =>
              file.startsWith(`${at}/`) && declared[name] === undefined,
          )
          .map(
            ([name]) =>
              `root package.json bin "${name}" points into the tool but is not declared`,
          );
  const local =
    typeof localBins === "string"
      ? []
      : Object.keys(localBins)
          .filter((name) => declared[name] === undefined)
          .map((name) => `${at}/package.json bin "${name}" is not declared`);
  return [...root, ...local];
}

async function checkTool(
  root: string,
  { dir, declaration: d }: LoadedTool,
  context: {
    rootBins: Record<string, string> | string;
    readme: string;
    aliases: string | undefined;
    mise: Record<string, { run?: unknown }>;
    options: CheckOptions;
  },
): Promise<string[]> {
  const problems: string[] = [];
  const at = `tools/${dir}`;
  const say = (message: string): number => problems.push(`${at}: ${message}`);
  if (d.name !== dir) say(`name "${d.name}" must equal the directory "${dir}"`);

  // bins
  const declared = Object.entries(d.bins).map(
    ([name, file]) => [name, `${at}/${file}`] as const,
  );
  const localBins = await binsOf(root, `${at}/package.json`);
  for (const [label, have, expected] of [
    ["root package.json", context.rootBins, declared],
    [
      `${at}/package.json`,
      localBins,
      Object.entries(d.bins).map(([name, file]) => [name, file] as const),
    ],
  ] as const)
    for (const message of binProblems(label, have, expected)) say(message);
  for (const message of undeclaredBinProblems(
    at,
    d.bins,
    context.rootBins,
    localBins,
  ))
    say(message);

  // README rows
  const rows = readmeRows(context.readme);
  const row = rows.get(d.name);
  if (row === undefined) say(`no README tool-table row for \`${d.name}\``);
  else {
    if (row.kind !== d.kind)
      say(`README row Kind is "${row.kind}", declared "${d.kind}"`);
    if (row.reason !== d.purpose)
      say(
        `README row Reason differs from the declared purpose:\n    README:   ${row.reason}\n    declared: ${d.purpose}`,
      );
  }
  for (const name of Object.keys(d.bins))
    if (!rows.has(name)) say(`no README tool-table row for bin \`${name}\``);

  // registry
  for (const source of [`${at}/package.json`, `${at}/tool.toml`])
    if (!context.options.registrySources.has(source))
      say(`${source} is a source of no scripts/config-registry.ts row`);

  // shell
  const fragments: string[] = [];
  if (d.shell !== undefined) {
    const fragment = `${at}/${d.shell}`;
    fragments.push(fragment);
    if ((await text(root, fragment)) === undefined)
      say(`declared shell fragment ${fragment} does not exist`);
    const list =
      context.aliases === undefined ? undefined : fragmentList(context.aliases);
    if (list === undefined)
      say(`${FRAGMENT_LIST} has no TOOL_SHELL_FRAGMENTS list`);
    else if (!list.includes(fragment))
      say(
        `${fragment} is declared but not in ${FRAGMENT_LIST} TOOL_SHELL_FRAGMENTS`,
      );
  }

  // probes
  for (const [name, probe] of Object.entries(d.probes)) {
    const file = `${at}/${probe.file}`;
    if ((await text(root, file)) === undefined)
      say(`probe "${name}" file ${file} does not exist`);
    const run = context.mise[probe.task]?.run;
    if (context.mise[probe.task] === undefined)
      say(`probe "${name}" task "${probe.task}" is not in mise.toml`);
    else if (
      typeof run !== "string" ||
      !run.includes(`tool-probe.ts ${d.name} ${name}`)
    )
      say(
        `mise task "${probe.task}" must run \`scripts/tool-probe.ts ${d.name} ${name}\``,
      );
  }

  // consumers
  const fragmentText =
    d.shell === undefined ? "" : ((await text(root, `${at}/${d.shell}`)) ?? "");
  const tokens = [
    ...Object.keys(d.bins),
    ...[...fragmentText.matchAll(/^([A-Za-z_][\w-]*)\(\)/gmu)].map(
      (m) => m[1] ?? "",
    ),
  ].filter((token) => token !== "");
  for (const consumer of d.consumers) {
    const body = await text(root, consumer);
    if (body === undefined) say(`consumer ${consumer} does not exist`);
    else if (!tokens.some((token) => body.includes(token)))
      say(`consumer ${consumer} mentions none of: ${tokens.join(", ")}`);
  }

  // undeclared
  const named = new Set<string>([
    ...fragments,
    ...Object.values(d.probes).map((probe) => `${at}/${probe.file}`),
  ]);
  for (const file of await filesBelow(root, at)) {
    const isShell = file.endsWith(".zsh");
    const isProbe = /^tools\/[^/]+\/src\/doctor-[^/]+\.ts$/u.test(file);
    if ((isShell || isProbe) && !named.has(file))
      say(
        `${file} is a ${isShell ? "shell fragment" : "probe"} that tool.toml does not declare`,
      );
  }
  return problems;
}

export function ratchetProblems(
  undeclared: readonly string[],
  recorded: readonly string[],
): string[] {
  return [
    ...undeclared
      .filter((dir) => !recorded.includes(dir))
      .map(
        (dir) =>
          `tools/${dir} has no tool.toml and is not in ${BASELINE} (a new tool ships its declaration)`,
      ),
    ...recorded
      .filter((dir) => !undeclared.includes(dir))
      .map(
        (dir) =>
          `${BASELINE} lists ${dir}, which now declares itself or is gone: delete the line (count ${recorded.length} → ${recorded.length - 1})`,
      ),
  ];
}

export async function toolDeclarationProblems(
  root: string,
  options: CheckOptions,
): Promise<{ problems: string[]; undeclared: string[] }> {
  const { declared, broken, undeclared } = await loadToolDeclarations(root);
  const problems = broken.map(
    ({ dir, problem }) => `tools/${dir}/tool.toml: ${problem}`,
  );

  const miseText = await text(root, "mise.toml");
  const mise = ((): Record<string, { run?: unknown }> => {
    if (miseText === undefined) return {};
    const parsed = z
      .looseObject({
        tasks: z
          .record(z.string(), z.looseObject({ run: z.unknown().optional() }))
          .default({}),
      })
      .safeParse(Bun.TOML.parse(miseText));
    return parsed.success ? parsed.data.tasks : {};
  })();
  const context = {
    rootBins: await binsOf(root, "package.json"),
    readme: (await text(root, "README.md")) ?? "",
    aliases: await text(root, FRAGMENT_LIST),
    mise,
    options,
  };
  for (const tool of declared)
    problems.push(...(await checkTool(root, tool, context)));

  // The list in config/zsh/aliases.zsh may hold nothing a declaration does not name.
  const list =
    context.aliases === undefined ? [] : (fragmentList(context.aliases) ?? []);
  const named = new Set(
    declared.flatMap(({ dir, declaration }) =>
      declaration.shell === undefined
        ? []
        : [`tools/${dir}/${declaration.shell}`],
    ),
  );
  for (const entry of list)
    if (!named.has(entry))
      problems.push(
        `${FRAGMENT_LIST} TOOL_SHELL_FRAGMENTS lists ${entry}, which no tool.toml declares`,
      );

  // ratchet
  const recorded = (await text(root, BASELINE))
    ?.split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
  if (recorded === undefined) problems.push(`${BASELINE} is missing`);
  else problems.push(...ratchetProblems(undeclared, recorded));
  return { problems, undeclared };
}

async function registrySources(): Promise<Set<string>> {
  const { surfaces } = await import("#root/config-registry.ts");
  return new Set(surfaces().flatMap((surface) => surface.sources));
}

function report(
  problems: readonly string[],
  undeclared: readonly string[],
): number {
  if (problems.length > 0) consola.error(problems.join("\n"));
  consola.info(
    `${undeclared.length} tool(s) without tool.toml (ratchet ${BASELINE}): ${undeclared.join(", ")}`,
  );
  return problems.length === 0 ? 0 : 1;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  const result = await Result.tryPromise({
    try: async () =>
      toolDeclarationProblems(root, {
        registrySources: await registrySources(),
      }),
    catch: (e: unknown) => e,
  });
  if (result.isOk())
    process.exitCode = report(result.value.problems, result.value.undeclared);
  else {
    consola.error(`lint:tool-declarations: ${errorMessage(result.error)}`);
    process.exitCode = 2;
  }
}
