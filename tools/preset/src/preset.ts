#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { cli as cleyeCli } from "cleye";
import {
  mkdir,
  lstat,
  readFile,
  readdir,
  realpath,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { jsonOf, z } from "../../../agents/hooks/zod.ts";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import { bundleEntry } from "@dotfiles/shared/src/bundle-entry.ts";
import { embedHousePin } from "@dotfiles/shared/src/house-pin.ts";
import pkg from "../package.json" with { type: "json" };

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, pkg, cliArgv);
const sourceRoot = resolve(import.meta.dir, "../../..");
const names = [
  "jj-commit",
  "jj-push",
  "jj-precommit",
  "fmt-staged",
  "mise-contract",
  "wiring-check",
  "lint-ts-candidate",
  "tex-oracle",
] as const;
type ToolName = (typeof names)[number];
type FileMapping = readonly [source: string, destination: string];
const tools = {
  "jj-commit": [
    [
      "agents/skills/wiring-mise-tasks/scripts/jj-commit.ts",
      "scripts/jj-commit.ts",
    ],
    [
      "agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts",
      "scripts/jj-precommit.ts",
    ],
    [
      "agents/skills/wiring-mise-tasks/tests/jj-commit.test.ts",
      "tests/jj-commit.test.ts",
    ],
    ["tools/shared/src/zod.ts", "support/zod.ts"],
    ["agents/hooks/vendor/deps.js", "support/deps.js"],
  ],
  "jj-push": [
    [
      "agents/skills/wiring-mise-tasks/scripts/jj-push.ts",
      "scripts/jj-push.ts",
    ],
    [
      "agents/skills/wiring-mise-tasks/tests/jj-push.test.ts",
      "tests/jj-push.test.ts",
    ],
  ],
  "jj-precommit": [
    [
      "agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts",
      "scripts/jj-precommit.ts",
    ],
    ["tools/shared/src/zod.ts", "support/zod.ts"],
    ["agents/hooks/vendor/deps.js", "support/deps.js"],
  ],
  "fmt-staged": [
    [
      "agents/skills/wiring-mise-tasks/scripts/fmt-staged.ts",
      "scripts/fmt-staged.ts",
    ],
    [
      "agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts",
      "scripts/jj-precommit.ts",
    ],
    ["tools/shared/src/zod.ts", "support/zod.ts"],
    ["agents/hooks/vendor/deps.js", "support/deps.js"],
  ],
  "mise-contract": [
    [
      "agents/skills/wiring-mise-tasks/scripts/mise-contract.ts",
      "scripts/mise-contract.ts",
    ],
    [
      "agents/skills/wiring-mise-tasks/tests/mise-contract-tools.test.ts",
      "tests/mise-contract-tools.test.ts",
    ],
    [
      "agents/skills/wiring-mise-tasks/tests/fixtures/template-interpolation-counterexample.json",
      "tests/fixtures/template-interpolation-counterexample.json",
    ],
    ["tools/shared/src/zod.ts", "support/zod.ts"],
    ["agents/hooks/vendor/deps.js", "support/deps.js"],
  ],
  "wiring-check": [
    [
      "agents/skills/wiring-repositories/scripts/wiring-check.ts",
      "scripts/wiring-check.ts",
    ],
    [
      "agents/skills/wiring-repositories/tests/wiring-check.test.ts",
      "tests/wiring-check.test.ts",
    ],
    ["tools/shared/src/zod.ts", "support/zod.ts"],
    ["agents/hooks/vendor/deps.js", "support/deps.js"],
  ],
  "lint-ts-candidate": [
    [
      "agents/skills/wiring-mise-tasks/scripts/lint-ts-candidate.ts",
      "scripts/lint-ts-candidate.ts",
    ],
    [
      "agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts",
      "scripts/jj-precommit.ts",
    ],
  ],
  "tex-oracle": [
    [
      "agents/skills/compiling-latex/scripts/tex-oracle.ts",
      "scripts/tex-oracle.ts",
    ],
    [
      "agents/skills/compiling-latex/tests/tex-oracle-lint.test.ts",
      "tests/tex-oracle-lint.test.ts",
    ],
    ["agents/skills/compiling-latex/assets/NOTATION.md", "assets/NOTATION.md"],
    [
      "agents/skills/compiling-latex/tests/fixtures/lint/clean/main.tex",
      "tests/fixtures/lint/clean/main.tex",
    ],
    [
      "agents/skills/compiling-latex/tests/fixtures/lint/clean/notation.tex",
      "tests/fixtures/lint/clean/notation.tex",
    ],
    [
      "agents/skills/compiling-latex/tests/fixtures/lint/dirty/main.tex",
      "tests/fixtures/lint/dirty/main.tex",
    ],
    [
      "agents/skills/compiling-latex/tests/fixtures/lint/dirty/notation.tex",
      "tests/fixtures/lint/dirty/notation.tex",
    ],
    [
      "agents/skills/compiling-latex/tests/fixtures/lint/dirty/sections/body.tex",
      "tests/fixtures/lint/dirty/sections/body.tex",
    ],
  ],
} as const satisfies Record<ToolName, readonly FileMapping[]>;
const legacyMappings: Partial<
  Record<ToolName, readonly { commit: string; mapping: FileMapping }[]>
> = {
  "jj-precommit": [
    {
      commit: "5b83352e6562d39c9ff3d3697625ceb0122d7075",
      mapping: [
        "agents/skills/wiring-mise-tasks/tests/jj-commit.test.ts",
        "tests/jj-commit.test.ts",
      ],
    },
  ],
  "fmt-staged": [
    {
      commit: "5b83352e6562d39c9ff3d3697625ceb0122d7075",
      mapping: [
        "agents/skills/wiring-mise-tasks/tests/fmt-staged.test.ts",
        "tests/fmt-staged.test.ts",
      ],
    },
  ],
  "mise-contract": [
    {
      commit: "5b83352e6562d39c9ff3d3697625ceb0122d7075",
      mapping: [
        "agents/skills/wiring-mise-tasks/tests/mise-contract-pins.test.ts",
        "tests/mise-contract-pins.test.ts",
      ],
    },
  ],
};
const toolNameSchema = z.enum(names);
const fileMappingSchema = z.object({
  source: z.string(),
  destination: z.string(),
  sha256: z.string().optional(),
});
const toolManifestSchema = z.object({
  sourceCommit: z.string(),
  localChanges: z.boolean().optional(),
  files: z.array(fileMappingSchema),
});
const registrySchema = z.object({ tools: z.array(z.string()) });
const managedScopeSchema = z.object({ paths: z.array(z.string()) });
const marker = (commit: string, source: string) =>
  `preset-sync source ${commit} ${source}`;
const toolsRoot = (repo: string) => join(repo, "tools");
type Outcome<T> = { ok: true; value: T } | { ok: false; error: Error };
const success = <T>(value: T): Outcome<T> => ({ ok: true, value });
const failure = <T>(error: unknown): Outcome<T> => ({
  ok: false,
  error: error instanceof Error ? error : new Error(String(error)),
});
const fsResult = <T>(fn: () => T | Promise<T>): Promise<Outcome<T>> =>
  Promise.try(fn).then(
    (value): Outcome<T> => success(value),
    (error): Outcome<T> => failure(error),
  );
const inside = (root: string, path: string) => {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel))
  );
};

function rendered(bytes: Buffer, mapping: FileMapping, commit: string): Buffer {
  let text = bytes.toString("utf8");
  text = text.replaceAll("../../../hooks/zod.ts", "../support/zod.ts");
  if (mapping[1] === "support/zod.ts")
    text = text.replace("../../../agents/hooks/vendor/deps.js", "./deps.js");
  const header = marker(commit, mapping[0]);
  if (mapping[1].endsWith(".json")) return Buffer.from(text);
  if (mapping[1].endsWith(".md"))
    return Buffer.from(`${text}\n<!-- ${header} -->\n`);
  if (mapping[1].endsWith(".tex")) return Buffer.from(`${text}\n% ${header}\n`);
  const firstLineEnd = text.indexOf("\n");
  if (text.startsWith("#!") && firstLineEnd >= 0)
    return Buffer.from(
      `${text.slice(0, firstLineEnd + 1)}// ${header}\n${text.slice(firstLineEnd + 1)}`,
    );
  return Buffer.from(`// ${header}\n${text}`);
}

async function runJj(
  args: string[],
): Promise<Outcome<{ code: number; stdout: Buffer; stderr: string }>> {
  return fsResult(async () => {
    const child = Bun.spawn(["jj", "--repository", sourceRoot, ...args], {
      cwd: sourceRoot,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
      killSignal: "SIGTERM",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).arrayBuffer(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { code, stdout: Buffer.from(stdout), stderr };
  });
}

async function currentCommit(): Promise<Outcome<string>> {
  const result = await runJj([
    "log",
    "--no-graph",
    "-r",
    "@",
    "-T",
    "commit_id",
  ]);
  if (!result.ok) return result;
  const commit = result.value.stdout.toString().trim();
  return result.value.code === 0 && /^[0-9a-f]{40,64}$/u.test(commit)
    ? success(commit)
    : failure(
        `cannot identify the dotfiles source commit: ${result.value.stderr.trim()}`,
      );
}

async function sourceBytes(
  commit: string,
  source: string,
): Promise<Outcome<Buffer>> {
  const result = await runJj(["file", "show", "-r", commit, "--", source]);
  if (!result.ok) return result;
  return result.value.code === 0
    ? success(result.value.stdout)
    : failure(
        `cannot read ${source} at ${commit}: ${result.value.stderr.trim()}`,
      );
}

async function outputBytes(
  mapping: FileMapping,
  commit: string,
  headerCommit = commit,
): Promise<Outcome<Buffer>> {
  if (!mapping[1].startsWith("scripts/") || !mapping[1].endsWith(".ts")) {
    const source = await sourceBytes(commit, mapping[0]);
    return source.ok
      ? success(rendered(source.value, mapping, headerCommit))
      : source;
  }
  let houseToml: unknown;
  if (
    mapping[0] === "agents/skills/wiring-mise-tasks/scripts/mise-contract.ts"
  ) {
    const toml = await sourceBytes(commit, "mise.toml");
    if (!toml.ok) return toml;
    const parsed = await fsResult(() =>
      Bun.TOML.parse(toml.value.toString("utf8")),
    );
    if (!parsed.ok) return parsed;
    houseToml = parsed.value;
  }
  let loadError: Error | undefined;
  const plugin: Bun.BunPlugin = {
    name: "preset-recorded-source",
    setup(build) {
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/u }, async (args) => {
        if (
          !inside(sourceRoot, args.path) ||
          args.path.includes(`${sep}node_modules${sep}`)
        )
          // Bun treats undefined as a request to use its normal loader.
          return void 0;
        const source = await sourceBytes(
          commit,
          relative(sourceRoot, args.path),
        );
        if (!source.ok) {
          loadError = source.error;
          return { contents: "", loader: "ts" };
        }
        let contents = source.value.toString("utf8");
        if (
          houseToml !== undefined &&
          relative(sourceRoot, args.path) === mapping[0]
        ) {
          const embedded = embedHousePin(contents, houseToml);
          if (!embedded.ok) {
            loadError = new Error(embedded.error);
            return { contents: "", loader: "ts" };
          }
          contents = embedded.value;
        }
        return {
          contents,
          loader: args.path.endsWith(".ts") ? "ts" : "js",
        };
      });
    },
  };
  const result = await fsResult(() =>
    bundleEntry(join(sourceRoot, mapping[0]), [plugin]),
  );
  if (loadError !== undefined) return failure(loadError);
  if (!result.ok) return result;
  if (!result.value.ok) return failure(result.value.error);
  return success(
    rendered(Buffer.from(result.value.text), mapping, headerCommit),
  );
}

async function pathInfo(
  path: string,
): Promise<Outcome<Awaited<ReturnType<typeof lstat>> | undefined>> {
  const result = await fsResult(() => lstat(path));
  if (result.ok) return success(result.value);
  const absent = z
    .object({ code: z.literal("ENOENT") })
    .safeParse(result.error);
  return absent.success ? success(undefined) : result;
}

async function checkDirectory(
  root: string,
  destination: string,
): Promise<Outcome<void>> {
  if (!inside(root, destination))
    return failure(`destination escapes tools/: ${destination}`);
  let cursor = root;
  for (const part of [
    "",
    ...relative(root, destination).split(sep).filter(Boolean),
  ]) {
    if (part !== "") cursor = join(cursor, part);
    const info = await pathInfo(cursor);
    if (!info.ok) return failure(info.error);
    if (
      info.value !== undefined &&
      (info.value.isSymbolicLink() || !info.value.isDirectory())
    )
      return failure(`refusing non-directory or symlink path: ${cursor}`);
  }
  return success(undefined);
}

async function ensureSafeFile(path: string): Promise<Outcome<void>> {
  const result = await pathInfo(path);
  if (!result.ok) return failure(result.error);
  if (
    result.value !== undefined &&
    (result.value.isSymbolicLink() || !result.value.isFile())
  )
    return failure(`refusing non-file or symlink destination: ${path}`);
  return success(undefined);
}

type PlannedWrite = { path: string; bytes: Buffer };
type Plan = {
  writes: PlannedWrite[];
  stale: StaleFile[];
  files: { source: string; destination: string; sha256: string }[];
};
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

async function planTool(
  repo: string,
  name: ToolName,
  revision: string,
  commit: string,
  localChanges: boolean,
): Promise<Outcome<Plan>> {
  const root = join(toolsRoot(repo), name);
  const directory = await checkDirectory(toolsRoot(repo), root);
  if (!directory.ok) return directory;
  const previous = await readJSON(
    join(root, ".preset-sync.json"),
    toolManifestSchema,
  );
  const stale = await staleFiles(
    repo,
    name,
    previous.ok ? previous.value.files : [],
  );
  if (!stale.ok) return stale;
  const writes: PlannedWrite[] = [];
  const files: Plan["files"] = [];
  for (const mapping of tools[name]) {
    const path = join(root, mapping[1]);
    if (!inside(root, path))
      return failure(`invalid destination ${mapping[1]}`);
    const dir = await checkDirectory(toolsRoot(repo), dirname(path));
    if (!dir.ok) return dir;
    const safe = await ensureSafeFile(path);
    if (!safe.ok) return safe;
    const output = await outputBytes(mapping, revision, commit);
    if (!output.ok) return output;
    writes.push({ path, bytes: output.value });
    files.push({
      source: mapping[0],
      destination: mapping[1],
      sha256: hash(output.value),
    });
  }
  const manifest = join(root, ".preset-sync.json");
  const safe = await ensureSafeFile(manifest);
  if (!safe.ok) return safe;
  writes.push({
    path: manifest,
    bytes: Buffer.from(
      `${JSON.stringify({ sourceCommit: commit, localChanges, files }, null, 2)}\n`,
    ),
  });
  return success({ writes, stale: stale.value, files });
}

async function readJSON<T>(
  path: string,
  schema: z.ZodType<T>,
): Promise<Outcome<T>> {
  const text = await fsResult(() => Bun.file(path).text());
  if (!text.ok) return text;
  const parsed = jsonOf(schema).safeParse(text.value);
  return parsed.success ? success(parsed.data) : failure(parsed.error);
}

type StaleFile = {
  absolutePath: string;
  displayPath: string;
  managed: boolean;
};

async function filesUnder(root: string): Promise<Outcome<string[]>> {
  return fsResult(async () => {
    const files: string[] = [];
    const visit = async (directory: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) await visit(path);
        else if (entry.isFile()) files.push(path);
      }
    };
    await visit(root);
    return files;
  });
}

async function staleFiles(
  repo: string,
  name: ToolName,
  previousFiles: readonly {
    source: string;
    destination: string;
    sha256?: string | undefined;
  }[],
): Promise<Outcome<StaleFile[]>> {
  const destinationRoot = join(toolsRoot(repo), name);
  const currentPaths = new Set<string>(
    tools[name].map((mapping) => mapping[1]),
  );
  const listed = await filesUnder(destinationRoot);
  if (!listed.ok) {
    const info = await pathInfo(destinationRoot);
    return info.ok && info.value === undefined ? success([]) : listed;
  }
  const stale: StaleFile[] = [];
  for (const absolutePath of listed.value) {
    const destination = relative(destinationRoot, absolutePath);
    if (destination === ".preset-sync.json" || currentPaths.has(destination))
      continue;
    const actual = await fsResult(() => readFile(absolutePath));
    if (!actual.ok) return actual;
    const previous = previousFiles.find(
      (file) => file.destination === destination,
    );
    const text = actual.value.toString("utf8");
    const source =
      previous?.source ??
      (legacyMappings[name] ?? []).find(
        (item) => item.mapping[1] === destination,
      )?.mapping[0];
    const hasHeader =
      source !== undefined &&
      /preset-sync source [0-9a-f]{40,64} /u.test(text) &&
      text.includes(` ${source}`);
    const managed =
      previous?.sha256 !== undefined
        ? hash(actual.value) === previous.sha256
        : hasHeader;
    stale.push({
      absolutePath,
      displayPath: join("tools", name, destination),
      managed,
    });
  }
  return success(stale);
}

function validNames(values: string[]): ToolName[] {
  return values.flatMap((name) => {
    const valid = toolNameSchema.safeParse(name);
    if (valid.success) return [valid.data];
    return [];
  });
}

async function matchesRecorded(
  actual: Buffer,
  mapping: FileMapping,
  commit: string,
  sha256: string | undefined,
): Promise<boolean> {
  if (sha256 !== undefined)
    return /^[0-9a-f]{64}$/u.test(sha256) && hash(actual) === sha256;
  const text = actual.toString("utf8");
  if (text.includes(marker(commit, mapping[0]))) return true;
  const current = await outputBytes(mapping, "@", commit);
  return current.ok && actual.equals(current.value);
}

async function checkTool(
  repo: string,
  name: ToolName,
): Promise<Outcome<string[]>> {
  const destinationRoot = join(toolsRoot(repo), name);
  const manifestPath = join(destinationRoot, ".preset-sync.json");
  const manifest = await readJSON(manifestPath, toolManifestSchema);
  if (!manifest.ok) return success([join("tools", name, ".preset-sync.json")]);
  const commit = manifest.value.sourceCommit;
  if (!/^[0-9a-f]{40,64}$/u.test(commit))
    return success([join("tools", name, ".preset-sync.json")]);
  const expectedMappings = tools[name];
  const matchesMapping = expectedMappings.every(
    (mapping, index) =>
      manifest.value.files[index]?.source === mapping[0] &&
      manifest.value.files[index]?.destination === mapping[1],
  );
  const changed: string[] = [];
  if (
    !matchesMapping ||
    manifest.value.files.length !== expectedMappings.length
  )
    changed.push(join("tools", name, ".preset-sync.json"));
  for (const mapping of expectedMappings) {
    const [, destination] = mapping;
    const path = join(destinationRoot, destination);
    const info = await pathInfo(path);
    if (
      !info.ok ||
      info.value === undefined ||
      info.value.isSymbolicLink() ||
      !info.value.isFile()
    ) {
      changed.push(join("tools", name, destination));
      continue;
    }
    const actual = await fsResult(() => readFile(path));
    if (!actual.ok) {
      changed.push(join("tools", name, destination));
      continue;
    }
    const recorded = manifest.value.files.find(
      (file) => file.destination === destination && file.source === mapping[0],
    );
    const matches = await matchesRecorded(
      actual.value,
      mapping,
      commit,
      recorded?.sha256,
    );
    if (!matches) changed.push(join("tools", name, destination));
  }
  const stale = await staleFiles(repo, name, manifest.value.files);
  if (!stale.ok) return stale;
  for (const file of stale.value.filter((item) => !item.managed))
    process.stdout.write(`unmanaged: ${file.displayPath}\n`);
  changed.push(
    ...stale.value
      .filter((file) => file.managed)
      .map((file) => file.displayPath),
  );
  return success(changed);
}

async function main(): Promise<Outcome<number>> {
  const parsed = cli({
    name: "preset",
    parameters: ["<command>", "<repo>"],
    flags: {
      check: {
        type: Boolean,
        default: false,
        description: "check copied tools against their recorded hashes",
      },
      tool: {
        type: [String],
        default: [],
        description: "tool to sync (repeatable; default: all)",
      },
    },
    strictFlags: true,
    help: {
      description:
        "Copy repository contract tools into a repository-local tools/ directory.",
    },
  });
  if (parsed._[0] !== "sync") return failure("expected `preset sync <repo>`");
  const rawRepo = parsed._[1];
  if (rawRepo === undefined || rawRepo === "") return failure("missing <repo>");
  const canonicalRepo = await fsResult(() => realpath(resolve(rawRepo)));
  if (!canonicalRepo.ok) return canonicalRepo;
  const repo = canonicalRepo.value;
  const repoInfo = await pathInfo(repo);
  if (!repoInfo.ok) return repoInfo;
  if (repoInfo.value === undefined || !repoInfo.value.isDirectory())
    return failure(`<repo> is not a directory: ${repo}`);
  const requested = parsed.flags.tool.length > 0 ? parsed.flags.tool : names;
  const decodedNames = requested.map((name) => toolNameSchema.safeParse(name));
  const unknown = decodedNames.flatMap((result, index) =>
    result.success ? [] : [requested[index] ?? ""],
  );
  if (unknown.length > 0)
    return failure(
      `unknown tool${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
    );
  const selected = [
    ...new Set(
      decodedNames.flatMap((result) => (result.success ? [result.data] : [])),
    ),
  ];
  if (parsed.flags.check) {
    let checkNames: ToolName[] = selected;
    if (parsed.flags.tool.length === 0) {
      const registryPath = join(toolsRoot(repo), ".preset-sync.json");
      const registry = await readJSON(registryPath, registrySchema);
      checkNames = registry.ok
        ? [...new Set(validNames(registry.value.tools))]
        : [];
    }
    const outcomes = await Promise.all(
      checkNames.map((name) => checkTool(repo, name)),
    );
    const failed = outcomes.find((outcome) => !outcome.ok);
    if (failed?.ok === false) return failure(failed.error);
    const changedPaths = outcomes.flatMap((outcome) =>
      outcome.ok ? outcome.value : [],
    );
    for (const path of changedPaths) process.stdout.write(`DIFF ${path}\n`);
    const count = changedPaths.length;
    process.stdout.write(
      count === 0 ? "PRESET CLEAN\n" : `PRESET DIFF ${count} file(s)\n`,
    );
    return success(count === 0 ? 0 : 1);
  }
  const revision = await currentCommit();
  if (!revision.ok) return revision;
  const published = await runJj([
    "log",
    "--no-graph",
    "-r",
    "heads(ancestors(@) & ancestors(alpha@origin))",
    "-T",
    "commit_id",
  ]);
  if (!published.ok) return published;
  const commit = published.value.stdout.toString().trim();
  if (published.value.code !== 0 || !/^[0-9a-f]{40,64}$/u.test(commit))
    return failure("cannot identify published source ancestor");
  const diff = await runJj([
    "diff",
    "--summary",
    "--from",
    commit,
    "--to",
    revision.value,
  ]);
  if (!diff.ok) return diff;
  if (diff.value.code !== 0) return failure(diff.value.stderr);
  const localChanges = diff.value.stdout.length > 0;
  const plans = new Map<ToolName, Plan>();
  for (const name of selected) {
    const plan = await planTool(
      repo,
      name,
      revision.value,
      commit,
      localChanges,
    );
    if (!plan.ok) return plan;
    plans.set(name, plan.value);
  }
  const registryPath = join(toolsRoot(repo), ".preset-sync.json");
  const safeRegistry = await ensureSafeFile(registryPath);
  if (!safeRegistry.ok) return safeRegistry;
  const registry = await readJSON(registryPath, registrySchema);
  const existing = registry.ok ? validNames(registry.value.tools) : [];
  const writes: PlannedWrite[] = [...plans.values()].flatMap(
    (plan) => plan.writes,
  );
  writes.push({
    path: registryPath,
    bytes: Buffer.from(
      `${JSON.stringify({ tools: [...new Set([...existing, ...selected])] }, null, 2)}\n`,
    ),
  });
  const count = [...plans.values()].reduce(
    (sum, plan) => sum + plan.files.length,
    0,
  );
  const scopePath = join(repo, "tsconfig.vendored.json");
  const safeScope = await ensureSafeFile(scopePath);
  if (!safeScope.ok) return safeScope;
  const desired: string[] = [];
  for (const name of new Set([...existing, ...selected])) {
    const planned = plans.get(name);
    const manifest =
      planned === undefined
        ? await readJSON(
            join(toolsRoot(repo), name, ".preset-sync.json"),
            toolManifestSchema,
          )
        : success({ sourceCommit: commit, files: planned.files });
    if (!manifest.ok) return failure(manifest.error);
    const paths = manifest.value.files.map((file) =>
      join("tools", name, file.destination),
    );
    const invalid = paths.find(
      (path) => !inside(join(toolsRoot(repo), name), resolve(repo, path)),
    );
    if (invalid !== undefined)
      return failure(`invalid manifest destination: ${invalid}`);
    desired.push(...paths);
  }
  const ownershipPath = join(toolsRoot(repo), ".preset-sync-vendored.json");
  const safeOwnership = await ensureSafeFile(ownershipPath);
  if (!safeOwnership.ok) return safeOwnership;
  const ownershipInfo = await pathInfo(ownershipPath);
  if (!ownershipInfo.ok) return ownershipInfo;
  const ownership =
    ownershipInfo.value === undefined
      ? success({ paths: new Array<string>() })
      : await readJSON(ownershipPath, managedScopeSchema);
  if (!ownership.ok) return ownership;
  const scopeInfo = await pathInfo(scopePath);
  if (!scopeInfo.ok) return scopeInfo;
  const original =
    scopeInfo.value === undefined
      ? success('{\n  "exclude": ["node_modules"]\n}\n')
      : await fsResult(() => readFile(scopePath, "utf8"));
  if (!original.ok) return original;
  const parsedScope = jsonOf(z.record(z.string(), z.unknown())).safeParse(
    original.value,
  );
  if (!parsedScope.success)
    return failure(
      `invalid tsconfig.vendored.json: ${parsedScope.error.message}`,
    );
  const scope = parsedScope.data;
  const decodedExclusions = z
    .array(z.string())
    .optional()
    .safeParse(scope["exclude"]);
  if (!decodedExclusions.success)
    return failure(
      "invalid tsconfig.vendored.json: exclude must be an array of strings",
    );
  const existingExclusions = decodedExclusions.data ?? [];
  const oldPaths = new Set(ownership.value.paths);
  const wanted = new Set(desired);
  const exclusions: string[] = existingExclusions.filter(
    (path: string) => !oldPaths.has(path) || wanted.has(path),
  );
  const managed = ownership.value.paths.filter(
    (path) => wanted.has(path) && exclusions.includes(path),
  );
  for (const path of wanted) {
    if (!exclusions.includes(path)) {
      exclusions.push(path);
      managed.push(path);
    }
  }
  if (
    scopeInfo.value === undefined ||
    JSON.stringify(existingExclusions) !== JSON.stringify(exclusions)
  ) {
    scope["exclude"] = exclusions;
    const indent = original.value.match(/\n([ \t]+)"/u)?.[1] ?? "  ";
    writes.push({
      path: scopePath,
      bytes: Buffer.from(`${JSON.stringify(scope, null, indent)}\n`),
    });
  }
  writes.push({
    path: ownershipPath,
    bytes: Buffer.from(`${JSON.stringify({ paths: managed }, null, 2)}\n`),
  });
  // Snapshot every affected file before mutation, then restore it if a write fails.
  const removals = [...plans.values()].flatMap((plan) =>
    plan.stale.filter((file) => file.managed),
  );
  const before = new Map<string, Buffer | undefined>();
  for (const path of [
    ...writes.map((write) => write.path),
    ...removals.map((file) => file.absolutePath),
  ]) {
    const info = await pathInfo(path);
    if (!info.ok) return info;
    if (info.value === undefined) {
      before.set(path, undefined);
      continue;
    }
    const bytes = await fsResult(() => readFile(path));
    if (!bytes.ok) return bytes;
    before.set(path, bytes.value);
  }
  const applied = await fsResult(async () => {
    for (const write of writes) {
      if (before.get(write.path)?.equals(write.bytes) === true) continue;
      await mkdir(dirname(write.path), { recursive: true });
      await writeFile(write.path, write.bytes);
    }
    for (const file of removals) await unlink(file.absolutePath);
  });
  if (!applied.ok) {
    const rollback = await fsResult(async () => {
      for (const [path, bytes] of before) {
        if (bytes === undefined) await unlink(path).catch(() => {});
        else await writeFile(path, bytes);
      }
    });
    return rollback.ok
      ? applied
      : failure(
          `${applied.error.message}; rollback failed: ${rollback.error.message}`,
        );
  }
  for (const plan of plans.values())
    for (const file of plan.stale)
      process.stdout.write(
        `${file.managed ? "REMOVE" : "unmanaged:"} ${file.displayPath}\n`,
      );
  process.stdout.write(
    `PRESET SYNC ${selected.length} tool(s), ${count} file(s) from ${commit}\n`,
  );
  return success(0);
}

if (import.meta.main) {
  const result = await main();
  process.exitCode = result.ok ? result.value : 2;
  if (!result.ok)
    process.stderr.write(`preset: FATAL: ${result.error.message}\n`);
}
