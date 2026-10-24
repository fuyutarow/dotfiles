// Static liveness check for deployed $HOME surfaces that execute or link into this checkout.
// Consumer: humans/CI running `mise run lint:live-refs`; output is verdict lines.
import { constants } from "node:fs";
import {
  access,
  lstat,
  readFile,
  readlink,
  realpath,
  readdir,
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
  chmod,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import { cli } from "cleye";
import { fromPromise, fromThrowable } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import { LINKS, type When } from "./config-registry.ts";
import {
  jjContext,
  jjCandidate,
  selected,
  type JjPrecommit,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";
import { RENDER_INPUTS, restoreRenderDependencies } from "./render-source.ts";

type Os = "mac" | "wsl" | "linux";
type Roots = { repo: string; home: string; os: Os };

const REPAIR =
  "restore the file or remove the reference in the same commit; after landing declarations, run `mise run deps && mise run link:dots` to refresh deployed files";

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("unknown flag(s): --__proto__\n");
    process.exit(2);
  }
}

function applies(when: When, os: Os): boolean {
  return (
    when === "all" ||
    (when === "mac" && os === "mac") ||
    (when === "wsl" && os === "wsl") ||
    (when === "linux" && os === "linux") ||
    (when === "not-mac" && os !== "mac")
  );
}

async function under(path: string, root: string): Promise<boolean> {
  // macOS exposes /var as a symlink to /private/var. Missing targets cannot be passed directly
  // to realpath, so canonicalize through their nearest existing parent before comparing.
  const rel = relative(
    await resolveMissingPath(resolve(root)),
    await resolveMissingPath(resolve(path)),
  );
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`));
}

async function attempt<T>(operation: () => Promise<T>) {
  return fromPromise(Promise.resolve().then(operation), (error) => error);
}

async function lstatMaybe(path: string) {
  const stat = await attempt(() => lstat(path));
  return stat.isOk() ? stat.value : undefined;
}

async function pointsIntoRepo(path: string, repo: string): Promise<boolean> {
  if (await under(path, repo)) return true;
  const canonical = await attempt(() => realpath(path, { encoding: "utf8" }));
  if (canonical.isOk()) return under(canonical.value, repo);
  const stat = await attempt(() => lstat(path));
  if (stat.isErr()) return false;
  if (stat.value.isSymbolicLink()) {
    const raw = await readlink(path);
    return pointsIntoRepo(
      isAbsolute(raw) ? raw : resolve(dirname(path), raw),
      repo,
    );
  }
  const parent = dirname(path);
  if (parent === path) return false;
  const parentRealpath = await attempt(() =>
    realpath(parent, { encoding: "utf8" }),
  );
  return parentRealpath.isOk()
    ? under(parentRealpath.value, repo)
    : pointsIntoRepo(parent, repo);
}

async function resolveMissingPath(path: string): Promise<string> {
  const stat = await lstatMaybe(path);
  if (stat?.isSymbolicLink() === true) {
    const raw = await readlink(path);
    return resolveMissingPath(
      isAbsolute(raw) ? raw : resolve(dirname(path), raw),
    );
  }
  const canonical = await attempt(() => realpath(path, { encoding: "utf8" }));
  if (canonical.isOk()) return canonical.value;
  const parent = dirname(path);
  if (parent === path) return path;
  return join(await resolveMissingPath(parent), path.slice(parent.length + 1));
}

function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return path;
}

async function checkRepoPath(
  surface: string,
  path: string,
  roots: Roots,
  out: string[],
): Promise<void> {
  const expanded = expandHome(path, roots.home);
  const absolute = isAbsolute(expanded)
    ? expanded
    : resolve(roots.repo, expanded);
  const resolved = await resolveMissingPath(absolute);
  if (!(await pointsIntoRepo(resolved, roots.repo))) return;
  const present = await attempt(() => access(absolute, constants.F_OK));
  if (present.isErr()) {
    out.push(`FAIL ${surface} → missing target ${resolved}; ${REPAIR}`);
  }
}

async function checkLinkedPath(
  surface: string,
  path: string,
  roots: Roots,
  out: string[],
): Promise<void> {
  const stat = await lstatMaybe(path);
  if (stat?.isSymbolicLink() !== true) return;
  const raw = await readlink(path);
  const target = isAbsolute(raw) ? raw : resolve(dirname(path), raw);
  if (await pointsIntoRepo(target, roots.repo)) {
    await checkRepoPath(surface, target, roots, out);
  }
}

async function checkCommand(
  surface: string,
  command: string,
  roots: Roots,
  out: string[],
): Promise<void> {
  const tokens = command.match(/"(?:[^"\\]|\\.)*"|'[^']*'|[^\s]+/gu) ?? [];
  const words = tokens.map((token) =>
    token.replace(/^(?:"(.*)"|'(.*)')$/u, "$1$2"),
  );
  let runnerDir: string | undefined;
  for (const word of words) {
    runnerDir = await checkCommandWord(word, runnerDir, surface, roots, out);
  }
}

async function checkCommandWord(
  word: string,
  runnerDir: string | undefined,
  surface: string,
  roots: Roots,
  out: string[],
): Promise<string | undefined> {
  if (word.startsWith("~") || isAbsolute(word)) {
    const expanded = expandHome(word, roots.home);
    const absolute = isAbsolute(expanded)
      ? expanded
      : resolve(roots.repo, expanded);
    if (!(await pointsIntoRepo(absolute, roots.repo))) return runnerDir;
    await checkRepoPath(surface, absolute, roots, out);
    return absolute.endsWith("/run.sh") ? dirname(absolute) : runnerDir;
  }
  if (runnerDir !== undefined && /^[\w.-]+\.ts$/u.test(word)) {
    await checkRepoPath(surface, join(runnerDir, word), roots, out);
  }
  return runnerDir;
}

async function commandsIn(
  value: unknown,
  surface: string,
  roots: Roots,
  out: string[],
  source?: { text: string; offset: number },
): Promise<void> {
  if (Array.isArray(value)) {
    for (const [index, entry] of value.entries())
      await commandsIn(entry, `${surface}[${index}]`, roots, out, source);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "command" && typeof child === "string") {
      await checkCommand(
        commandReference(surface, child, source),
        child,
        roots,
        out,
      );
    } else {
      await commandsIn(child, `${surface}.${key}`, roots, out, source);
    }
  }
}

function commandReference(
  surface: string,
  command: string,
  source?: { text: string; offset: number },
): string {
  const encoded = JSON.stringify(command);
  const offset = source?.text.indexOf(encoded, source.offset) ?? -1;
  const line =
    offset < 0 ? 1 : (source?.text.slice(0, offset).split("\n").length ?? 1);
  if (source !== undefined && offset >= 0)
    source.offset = offset + encoded.length;
  return `${surface.replace(/(\.json).*$/u, "$1")}:${line} (${surface})`;
}

function referenceLine(source: string | undefined, value: string): number {
  const offset = source?.indexOf(JSON.stringify(value)) ?? -1;
  return offset < 0 ? 1 : (source?.slice(0, offset).split("\n").length ?? 1);
}

async function readJson(path: string): Promise<unknown> {
  const parsed = jsonOf(z.unknown()).safeParse(await readFile(path, "utf8"));
  if (parsed.success) return parsed.data;
  process.stderr.write(
    `FATAL: ${path}: cannot read JSON: ${parsed.error.message}\n`,
  );
  return process.exit(2);
}

async function checkLinks(roots: Roots, out: string[]): Promise<void> {
  for (const [when, , destination] of LINKS) {
    if (applies(when, roots.os)) {
      await checkLinkedPath(
        `deployed link ~/${destination}`,
        join(roots.home, destination),
        roots,
        out,
      );
    }
  }

  const skillLinks = [
    ".claude/commands",
    ".codex/AGENTS.md",
    ".codex/prompts",
    ".agents/skills",
    ".gemini/antigravity/global_workflows",
  ];
  for (const destination of skillLinks) {
    await checkLinkedPath(
      `deployed link ~/${destination}`,
      join(roots.home, destination),
      roots,
      out,
    );
  }
  const claudeSkills = join(roots.home, ".claude/skills");
  const skillEntries = await readdir(claudeSkills, {
    withFileTypes: true,
  }).catch(() => []);
  if (skillEntries.length > 0) {
    for (const name of skillEntries
      .filter((entry) => entry.isSymbolicLink())
      .map((entry) => entry.name)) {
      await checkLinkedPath(
        `deployed skill ~/${join(".claude/skills", name)}`,
        join(claudeSkills, name),
        roots,
        out,
      );
    }
  }
}

async function checkHookRegistry(roots: Roots, out: string[]): Promise<void> {
  const raw = await readFile(
    join(roots.repo, "agents/hooks/hooks.toml"),
    "utf8",
  );
  const decoded = fromThrowable(() => Bun.TOML.parse(raw))();
  if (decoded.isErr()) {
    process.stderr.write(
      `FATAL: agents/hooks/hooks.toml: cannot parse registry: ${decoded.error instanceof Error ? decoded.error.message : String(decoded.error)}\n`,
    );
    process.exit(2);
  }
  const parsed = z
    .object({
      hook: z
        .array(
          z.object({
            script: z.unknown().optional(),
            vendors: z.unknown().optional(),
          }),
        )
        .optional(),
    })
    .safeParse(decoded.value);
  if (!parsed.success) {
    process.stderr.write(
      `FATAL: agents/hooks/hooks.toml: cannot validate registry: ${parsed.error.message}\n`,
    );
    process.exit(2);
  }
  for (const [index, hook] of (parsed.data.hook ?? []).entries()) {
    if (typeof hook.script !== "string") continue;
    const script = join(roots.repo, "agents/hooks", hook.script);
    if (Array.isArray(hook.vendors) && hook.vendors.length > 0) {
      await checkRepoPath(
        `declared agents/hooks/hooks.toml:${referenceLine(raw, hook.script)} hook[${index}]`,
        script,
        roots,
        out,
      );
    }
  }
}

export async function findings(roots: Roots): Promise<string[]> {
  const out: string[] = [];
  await checkLinks(roots, out);

  for (const [surface, path] of [
    [
      "deployed ~/.claude/settings.json",
      join(roots.home, ".claude/settings.json"),
    ],
    ["deployed ~/.codex/hooks.json", join(roots.home, ".codex/hooks.json")],
  ] as const) {
    const content = await attempt(() => readFile(path, "utf8"));
    if (content.isOk())
      await commandsIn(await readJson(path), surface, roots, out, {
        text: content.value,
        offset: 0,
      });
  }
  for (const [surface, path] of [
    [
      "declared agents/claude/settings.json",
      join(roots.repo, "agents/claude/settings.json"),
    ],
    [
      "declared agents/codex/hooks.json",
      join(roots.repo, "agents/codex/hooks.json"),
    ],
  ] as const) {
    const content = await attempt(() => readFile(path, "utf8"));
    if (content.isOk())
      await commandsIn(await readJson(path), surface, roots, out, {
        text: content.value,
        offset: 0,
      });
  }
  await checkHookRegistry(roots, out);

  const packagePath = join(roots.repo, "package.json");
  const packageText = await readFile(packagePath, "utf8");

  const parsedPkg = z
    .object({ bin: z.record(z.string(), z.unknown()).optional() })
    .safeParse(await readJson(packagePath));
  const pkg = parsedPkg.success ? parsedPkg.data : {};
  for (const [name, target] of Object.entries(pkg.bin ?? {})) {
    if (typeof target === "string") {
      await checkRepoPath(
        `package.json bin ${name}:${referenceLine(packageText, target)}`,
        join(roots.repo, target),
        roots,
        out,
      );
    }
  }
  return out;
}

// A commit is BASE plus selected REV paths. Render that view in a disposable HOME;
// deployment is deliberately later, and must never be a prerequisite for retirement.
async function candidateContent(
  context: JjPrecommit,
  path: string,
  revision: string,
): Promise<Buffer> {
  const child = Bun.spawn(
    [
      "jj",
      "--ignore-working-copy",
      "file",
      "show",
      "-r",
      revision,
      "--",
      `root-file:${JSON.stringify(path)}`,
    ],
    { cwd: context.root, stdout: "pipe", stderr: "pipe", timeout: 120_000 },
  );
  const [content, error, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0) {
    process.stderr.write(`FATAL: precommit: jj show failed: ${error.trim()}\n`);
    process.exit(2);
  }
  return Buffer.from(content);
}

async function exportCandidate(
  context: JjPrecommit,
  destination: string,
  entries: ReadonlyMap<string, string>,
): Promise<void> {
  const executable = new Map(
    await Promise.all(
      [...new Set(entries.values())].map(async (revision) => {
        const child = Bun.spawn(
          [
            "jj",
            "--ignore-working-copy",
            "file",
            "list",
            "-r",
            revision,
            "-T",
            'if(executable, path ++ "\\0")',
          ],
          {
            cwd: context.root,
            stdout: "pipe",
            stderr: "pipe",
            timeout: 120_000,
          },
        );
        const [output, error, code] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        if (code !== 0) {
          process.stderr.write(
            `FATAL: precommit: jj file failed: ${error.trim()}\n`,
          );
          process.exit(2);
        }
        return [revision, new Set(output.split("\0"))] as const;
      }),
    ),
  );
  const files = [...entries];
  const batchSize = 8;
  for (let start = 0; start < files.length; start += batchSize) {
    await Promise.all(
      files.slice(start, start + batchSize).map(async ([path, revision]) => {
        const target = join(destination, path);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(
          target,
          await candidateContent(context, path, revision),
        );
        if (executable.get(revision)?.has(path) === true)
          await chmod(target, 0o755);
      }),
    );
  }
}

export async function candidateFindings(
  context: JjPrecommit,
  home: string,
  os: Os,
): Promise<string[]> {
  const scratch = await mkdtemp(join(tmpdir(), "live-refs-candidate-"));
  const repo = join(scratch, "repo");
  const targetHome = join(scratch, "home");
  await using _cleanup = {
    [Symbol.asyncDispose]: async () => {
      await rm(scratch, { recursive: true, force: true });
    },
  };
  const entries = await Promise.resolve(jjCandidate(context));
  const copied = new Map(
    [...entries].filter(
      ([path]) =>
        selected(RENDER_INPUTS, path) ||
        ["mise.toml", "mise.lock", "mise/dotfiles.toml"].includes(path) ||
        path.endsWith("package.json"),
    ),
  );
  const candidates = new Set(entries.keys());
  const pending = [...copied.keys()].filter((path) =>
    /\.(?:[cm]?[jt]sx?)$/u.test(path),
  );
  const resolveCandidateImport = (
    importer: string,
    specifier: string,
  ): string | undefined => {
    if (!specifier.startsWith(".")) return undefined;
    const target = posix.normalize(
      posix.join(posix.dirname(importer), specifier),
    );
    if (target.startsWith("../") || target === ".." || target.startsWith("/"))
      return undefined;
    const options =
      posix.extname(target) !== ""
        ? [target]
        : [
            target,
            `${target}.ts`,
            `${target}.tsx`,
            `${target}.mts`,
            `${target}.cts`,
            `${target}.js`,
            `${target}.jsx`,
            `${target}.mjs`,
            `${target}.cjs`,
            `${target}.json`,
            `${target}/index.ts`,
            `${target}/index.tsx`,
            `${target}/index.mts`,
            `${target}/index.cts`,
            `${target}/index.js`,
            `${target}/index.jsx`,
            `${target}/index.mjs`,
            `${target}/index.cjs`,
          ];
    return options.find((path) => candidates.has(path));
  };
  const includeImports = (importer: string, source: string): void => {
    const imports = source.matchAll(
      /\b(?:import|export)\s+(?:type\s+)?[\w$*{},\s]*?\s+from\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    );
    for (const item of imports) {
      const dependency = resolveCandidateImport(
        importer,
        item[1] ?? item[2] ?? item[3] ?? "",
      );
      if (dependency === undefined || copied.has(dependency)) continue;
      const dependencyRevision = entries.get(dependency);
      if (dependencyRevision === undefined) continue;
      copied.set(dependency, dependencyRevision);
      if (/\.(?:[cm]?[jt]sx?)$/u.test(dependency)) pending.push(dependency);
    }
  };
  for (let index = 0; index < pending.length;) {
    const batch = pending.slice(index, index + 8);
    index += batch.length;
    const sources = await Promise.all(
      batch.map(async (path) => {
        const revision = entries.get(path);
        return revision === undefined
          ? undefined
          : ([path, await candidateContent(context, path, revision)] as const);
      }),
    );
    sources.forEach((source) => {
      if (source !== undefined) includeImports(source[0], source[1].toString());
    });
  }
  // Liveness needs existence for the rest; export candidate contents for render inputs and their imports.
  for (const path of entries.keys()) {
    const dest = join(repo, path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, "");
  }
  await exportCandidate(context, repo, copied);
  // The candidate owns these manifests and lockfile; never borrow live node_modules.
  if (copied.has("tools/agx-worker/src/next/cli.ts")) {
    const dependencyError = await restoreRenderDependencies(repo);
    if (dependencyError !== undefined)
      return [`FATAL: live-refs candidate ${dependencyError.message}`];
  }
  const link = async (source: string, destination: string): Promise<void> => {
    const dest = join(targetHome, destination);
    if ((await lstatMaybe(dest)) !== undefined) return;
    await mkdir(dirname(dest), { recursive: true });
    await symlink(join(repo, source), dest);
  };
  for (const [when, source, destination] of LINKS)
    if (applies(when, os) && !source.startsWith("@google-drive/"))
      await link(source, destination);
  await link("agents/skills", ".agents/skills");
  await link("agents/commands", ".claude/commands");
  await link("agents/codex/AGENTS.md", ".codex/AGENTS.md");
  await link("agents/commands", ".codex/prompts");
  const linkPackageBins = async (path: string): Promise<void> => {
    const pkg = z
      .object({ bin: z.record(z.string(), z.string()).optional() })
      .safeParse(await readJson(join(repo, path)));
    if (!pkg.success) return;
    for (const [name, target] of Object.entries(pkg.data.bin ?? {}))
      await link(join(dirname(path), target), `.bun/bin/${name}`);
  };
  for (const path of entries.keys())
    if (path.endsWith("package.json")) await linkPackageBins(path);
  // bounded: native 60s timeout on the immutable candidate renderer.
  const rendered = Bun.spawn(
    [process.execPath, join(repo, "scripts/render-home.ts")],
    {
      env: {
        ...process.env,
        HOME: targetHome,
        // The candidate's pins must reactivate tools after mise removes the
        // caller's PATH activation. Its disposable HOME owns outputs, not installs.
        MISE_DATA_DIR:
          process.env.MISE_DATA_DIR ??
          join(process.env.XDG_DATA_HOME ?? join(home, ".local/share"), "mise"),
        MISE_TRUSTED_CONFIG_PATHS: repo,
        AGX_CONFIG: join(repo, "agents/agx/agx.toml"),
        DOTFILES: repo,
        COMMAND_TARGET_HOME: targetHome,
        CLAUDE_SETTINGS_PRIVATE:
          process.env.CLAUDE_SETTINGS_PRIVATE ??
          join(home, ".claude/settings.private.json"),
        DOTFILES_RENDER_REV: undefined,
        DOTFILES_RENDER_FROM_WORKING_COPY: "1",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 60_000,
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(rendered.stdout).text(),
    new Response(rendered.stderr).text(),
    rendered.exited,
  ]);
  const diagnostic = [stderr.trim(), stdout.trim()]
    .filter((text) => text !== "")
    .join("\n");
  if (exitCode !== 0)
    return [
      `FATAL: live-refs candidate render could not run (exit ${exitCode}, signal ${rendered.signalCode ?? "none"}): ${diagnostic === "" ? "no child diagnostics" : diagnostic}`,
    ];
  return await findings({ repo, home: targetHome, os });
}

async function systemOs(): Promise<Os | undefined> {
  if (process.platform === "darwin") return "mac";
  if (process.platform !== "linux") return undefined;
  return /microsoft/iu.test(
    await readFile("/proc/sys/kernel/osrelease", "utf8"),
  )
    ? "wsl"
    : "linux";
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "live-refs.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    process.stderr.write(`unexpected positional argument: ${parsed._[0]}\n`);
    process.exitCode = 2;
    return;
  }
  const home = process.env.HOME ?? homedir();
  const repo = process.env.DOTFILES ?? resolve(import.meta.dir, "..");
  const os = await systemOs();
  if (os === undefined) {
    process.stderr.write(`FATAL: unsupported platform: ${process.platform}\n`);
    process.exitCode = 2;
    return;
  }
  const context = await Promise.resolve(jjContext());
  const result =
    context === undefined
      ? await findings({ home, repo, os })
      : await candidateFindings(context, home, os);
  if (result.length > 0) {
    result.forEach((line) => {
      process.stderr.write(`${line}\n`);
    });
    process.exitCode = 1;
    return;
  }
  process.stdout.write("PASS live repo references resolve\n");
}

if (import.meta.main) {
  const result = await attempt(main);
  result.match(
    () => {},
    (error) => {
      process.stderr.write(
        `FATAL: live-refs check could not run: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    },
  );
}
