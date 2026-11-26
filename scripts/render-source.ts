// Immutable render inputs, shared by link:dots, render-home and doctor's reference render.
// No live checkout dependencies or node_modules links enter an immutable export.
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Result, errorMessage } from "@dotfiles/shared/src/result.ts";
import { z } from "@dotfiles/hooks/zod.ts";

export const RENDER_INPUTS = [
  "agents/claude/settings.json",
  "agents/codex/hooks.json",
  "agents/claude/CLAUDE.md",
  "agents/hooks",
  "tools/shared/src",
  "tools/shared/package.json",
  "package.json",
  "bun.lock",
  "tsconfig.json",
  "standard-presets/typescript/tsconfig.json",
  "tools/tool-tiers/package.json",
  "tools/tool-tiers/src/tool-tiers.ts",
  "tools/tool-tiers/src/tool-commands.ts",
  "tools/tool-tiers/src/tool-commands.tsv",
  "Brewfile.core",
  "config/zsh/timezone",
  "config/roles/roles.toml",
  "scripts/package.json",
  "scripts/render-home.ts",
  "scripts/render-source.ts",
  "scripts/hook-registry.ts",
  "scripts/config-registry.ts",
  "scripts/core-tools.ts",
];

async function jj(root: string, args: string[]): Promise<string | Error> {
  const result = await Result.tryPromise({
    try: async () => {
      const signal = AbortSignal.timeout(10_000);
      const child = Bun.spawn(
        ["jj", "--no-pager", "--color", "never", ...args],
        {
          cwd: root,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          signal,
        },
      );
      const [out, err, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (signal.aborted || code !== 0 || err.includes("Refused to snapshot"))
        return new Error(
          `render source: jj ${args[0]} failed (${code}): ${err.trim()}`,
        );
      return out;
    },
    catch: (e: unknown) => e,
  });
  return result.isOk() ? result.value : new Error(errorMessage(result.error));
}

async function hasJj(root: string): Promise<boolean | Error> {
  const result = await Result.tryPromise({
    try: () => stat(join(root, ".jj")),
    catch: (e: unknown) => e,
  });
  if (result.isOk()) return true;
  const error = z.looseObject({ code: z.string() }).safeParse(result.error);
  return error.success && error.data.code === "ENOENT"
    ? false
    : new Error(errorMessage(result.error));
}

/** Check before link:dots changes any home path. Explicit working-copy rendering is local only. */
export async function renderRefusal(
  root: string,
  fromWorkingCopy = false,
  revision?: string,
): Promise<Error | undefined> {
  if (fromWorkingCopy && revision !== undefined)
    return new Error(
      "--from-working-copy cannot be combined with a deployment render revision",
    );
  const committed = await hasJj(root);
  if (committed instanceof Error) return committed;
  if (fromWorkingCopy || !committed) return undefined;
  // jj's first run in a copied checkout creates its per-repo config and exits 1; the second works.
  const first = await jj(root, ["status"]);
  const snapped = first instanceof Error ? await jj(root, ["status"]) : first;
  if (snapped instanceof Error) return snapped;
  const dirty = await jj(root, [
    "--ignore-working-copy",
    "diff",
    "--from",
    "@-",
    "--to",
    "@",
    "-T",
    'path ++ "\\0"',
    "--",
    ...RENDER_INPUTS,
  ]);
  if (dirty instanceof Error) return dirty;
  const paths = dirty.split("\0").filter(Boolean);
  if (paths.length === 0) return undefined;
  return new Error(
    `uncommitted render inputs: ${JSON.stringify(paths)}; refusing to render $HOME. Commit them first, or use mise run link:dots -- --from-working-copy for an explicit local render\nDOTFILES_RENDER_REFUSAL_V1=${JSON.stringify({ reason: "foreign-wip", paths })}`,
  );
}

/** Restore only inside a disposable export, using its own lockfile and the local cache.
 * Callers own cleanup and must not pass the real checkout. No network or lifecycle scripts. */
export async function restoreRenderDependencies(
  root: string,
): Promise<Error | undefined> {
  const installed = await Result.tryPromise({
    try: async () => {
      const child = Bun.spawn(
        [
          process.execPath,
          "install",
          "--frozen-lockfile",
          "--offline",
          "--production",
          "--ignore-scripts",
          "--no-progress",
        ],
        {
          timeout: 60_000,
          killSignal: "SIGKILL",
          cwd: root,
          // Doctor renders into a scratch HOME; package cache belongs to the operator.
          env: {
            ...process.env,
            BUN_INSTALL_CACHE_DIR:
              process.env["BUN_INSTALL_CACHE_DIR"] ??
              join(
                process.env["COMMAND_TARGET_HOME"] ?? homedir(),
                ".bun/install/cache",
              ),
          },
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      const [out, err, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      if (code !== 0)
        return new Error(
          `render dependencies: frozen install exited ${code}: ${(err + out).slice(0, 4000)}`,
        );
      return null;
    },
    catch: (e: unknown) => e,
  });
  if (!installed.isOk()) {
    return new Error(errorMessage(installed.error));
  }
  if (installed.value instanceof Error) {
    return installed.value;
  }
  return undefined;
}

export type RenderSource = {
  root: string;
  description: string;
  release: () => Promise<void>;
};

const PathsSchema = z.object({
  compilerOptions: z.object({
    paths: z.record(z.string(), z.array(z.string())).default({}),
  }),
});
const ImportsSchema = z.object({
  imports: z.record(z.string(), z.string()).default({}),
});

/** `@dotfiles/<name>/*` → its directory, from the root tsconfig `paths` that Bun resolves with. */
async function workspaceDirs(root: string): Promise<Map<string, string>> {
  const file = Bun.file(join(root, "tsconfig.json"));
  if (!(await file.exists())) return new Map();
  const parsed = PathsSchema.safeParse(Bun.JSONC.parse(await file.text()));
  if (!parsed.success) return new Map();
  return new Map(
    Object.entries(parsed.data.compilerOptions.paths).flatMap(
      ([pattern, [target]]) =>
        pattern.endsWith("/*") && target?.endsWith("/*") === true
          ? [[pattern.slice(0, -1), join(root, target.slice(0, -1))]]
          : [],
    ),
  );
}

/** A `#alias/…` specifier through the nearest package.json "imports" above `from`. */
function aliasPath(
  root: string,
  from: string,
  specifier: string,
): string | null {
  let dir = dirname(from);
  while (dir.startsWith(root) && !existsSync(join(dir, "package.json")))
    dir = dirname(dir);
  const parsed = Result.try(() =>
    ImportsSchema.safeParse(
      Bun.JSONC.parse(readFileSync(join(dir, "package.json"), "utf8")),
    ),
  );
  if (parsed.isErr() || !parsed.value.success) return null;
  const match = Object.entries(parsed.value.data.imports).find(
    ([key]) => key.endsWith("*") && specifier.startsWith(key.slice(0, -1)),
  );
  if (match === undefined) return null;
  const [key, target] = match;
  return join(dir, target.replace("*", specifier.slice(key.length - 1)));
}

const IMPORT_SCANNER = new Bun.Transpiler({ loader: "tsx" });

/** Only the renderer's reachable imports require dependencies; unused manifests do not. */
export async function renderNeedsDependencies(
  root: string,
  entries = ["scripts/render-home.ts"],
): Promise<boolean> {
  const pending = entries.map((entry) => join(root, entry));
  const visited = new Set<string>();
  const packages = await workspaceDirs(root);
  const localPath = (from: string, specifier: string): string | null => {
    if (specifier.startsWith(".")) return resolve(dirname(from), specifier);
    if (specifier.startsWith("#")) return aliasPath(root, from, specifier);
    const owner = [...packages].find(([prefix]) =>
      specifier.startsWith(prefix),
    );
    return owner === undefined
      ? null
      : join(owner[1], specifier.slice(owner[0].length));
  };
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined || visited.has(path)) continue;
    visited.add(path);
    const file = Bun.file(path);
    if (!(await file.exists()) || !/\.[cm]?[jt]sx?$/u.test(path)) continue;
    const source = await file.text();
    // The parser, not a regex: comments and strings that read like imports are not imports.
    const imports = IMPORT_SCANNER.scanImports(source)
      .map((entry) => entry.path)
      .filter((specifier) => !/^(?:node:|bun:|bun$)/u.test(specifier));
    // Workspace packages (@dotfiles/*, through the exported tsconfig `paths`) and package-internal
    // aliases (#…, through package.json "imports") need no install; only third-party packages do.
    if (
      imports.some(
        (specifier) =>
          !specifier.startsWith(".") &&
          !specifier.startsWith("#") &&
          !specifier.startsWith("@dotfiles/"),
      )
    )
      return true;
    pending.push(
      ...imports
        .map((specifier) => localPath(path, specifier))
        .filter((target) => target !== null),
    );
  }
  return false;
}

export async function prepareRenderSource(
  root: string,
  fromWorkingCopy = false,
  revision?: string,
): Promise<RenderSource | Error> {
  const refused = await renderRefusal(root, fromWorkingCopy, revision);
  if (refused !== undefined) return refused;
  const committed = await hasJj(root);
  if (committed instanceof Error) return committed;
  if (fromWorkingCopy || (!committed && revision === undefined))
    return { root, description: "working copy", release: async () => {} };
  const id = await jj(root, [
    "--ignore-working-copy",
    "log",
    "--no-graph",
    "-r",
    revision ?? "alpha",
    "-T",
    "commit_id",
  ]);
  if (id instanceof Error) return id;
  const commit = id.trim();
  if (!/^[0-9a-f]{40,64}$/u.test(commit))
    return new Error("render revision must resolve to exactly one commit");
  const listed = await jj(root, [
    "--ignore-working-copy",
    "file",
    "list",
    "-r",
    commit,
    "-T",
    'path ++ "\\0"',
    "--",
    ...RENDER_INPUTS,
  ]);
  if (listed instanceof Error) return listed;
  const scratch = await mkdtemp(join(tmpdir(), "dotfiles-render-"));
  const release = () => rm(scratch, { recursive: true, force: true });
  const paths = listed.split("\0").filter(Boolean);
  // Bound parallel jj readers; no full checkout, workspace registration or live-input copying.
  const copied = await Result.tryPromise({
    try: async () => {
      for (let offset = 0; offset < paths.length; offset += 8) {
        const results = await Promise.all(
          paths.slice(offset, offset + 8).map(async (path) => {
            const text = await jj(root, [
              "--ignore-working-copy",
              "file",
              "show",
              "-r",
              commit,
              "--",
              `root-file:${JSON.stringify(path)}`,
            ]);
            if (text instanceof Error) return text;
            const dest = join(scratch, path);
            await mkdir(dirname(dest), { recursive: true });
            await Bun.write(dest, text);
            return true;
          }),
        );
        const failure = results.find((value) => value instanceof Error);
        if (failure !== undefined) {
          return failure;
        }
      }
      return true;
    },
    catch: (e: unknown) => e,
  });
  const failure = copied.isOk()
    ? copied.value
    : new Error(errorMessage(copied.error));
  if (failure instanceof Error) {
    await release();
    return failure;
  }
  // Restore only dependencies actually imported by this revision's renderer.
  if (
    paths.includes("package.json") &&
    paths.includes("bun.lock") &&
    (await renderNeedsDependencies(scratch))
  ) {
    const dependencyError = await restoreRenderDependencies(scratch);
    if (dependencyError !== undefined) {
      await release();
      return dependencyError;
    }
  }
  return { root: scratch, description: `commit ${commit}`, release };
}
