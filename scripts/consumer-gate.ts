// Consumer: land. Every subprocess runs with the host read-only and only its scratch tree writable.
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";

const Surface = z.string().regex(/^(presets\/[a-z0-9-]+|hooks|package-bins)$/u);
const RelativePath = z
  .string()
  .min(1)
  .refine(
    (path) => !isAbsolute(path) && !path.split(/[\\/]/u).includes(".."),
    "unsafe preset path",
  );
const ConsumerDeclaration = z.strictObject({
  name: z.string().min(1),
  root: z.string().min(1),
  trunk: z.string().min(1).optional(),
  setup: z.array(z.string().min(1)).min(1),
  bins: z.array(z.string().min(1)).optional(),
  full_gate_rule: z.string().optional(),
  surfaces: z.array(Surface).min(1),
  preset_dirs: z
    .strictObject({ typescript: RelativePath.optional() })
    .optional(),
  notify: z
    .array(
      z.strictObject({
        paths: z.array(z.string().min(1)).min(1),
        contact: z.string().min(1),
        check: z.string().min(1),
      }),
    )
    .optional(),
  command: z.array(z.string().min(1)).min(1),
  timeout_ms: z.number().int().positive().max(600_000),
});
export const ConsumerRegistry = z
  .strictObject({
    consumers: z.array(ConsumerDeclaration),
    pending: z
      .array(ConsumerDeclaration.extend({ reason: z.string().min(1) }))
      .default([]),
  })
  .refine((registry) => {
    const rows = [...registry.consumers, ...registry.pending];
    return new Set(rows.map((row) => row.name)).size === rows.length;
  }, "duplicate consumer name");
export type Consumer = z.output<typeof ConsumerRegistry>["consumers"][number];
export type ConsumerGateReport = {
  ok: boolean;
  checked: number;
  lines: string[];
};
const REGISTRY = "presets/consumers.toml";

/** Conservative dependency closure: shared executors and bin implementation changes affect consumers too. */
export function sharedSurfaces(changed: readonly string[]): string[] {
  const surfaces = new Set<string>();
  for (const path of changed) {
    const preset = /^presets\/([^/]+)\//u.exec(path)?.[1];
    if (preset !== undefined && preset !== "tests" && preset !== "src")
      surfaces.add(`presets/${preset}`);
    if (path.startsWith("agents/hooks/") || path.startsWith("agents/skills/"))
      surfaces.add("hooks");
    if (
      path === "package.json" ||
      path === "bun.lock" ||
      path.startsWith("tools/") ||
      path.startsWith("agents/skills/")
    )
      surfaces.add("package-bins");
    if (
      path.startsWith("presets/src/") ||
      path === "scripts/render-oxlintrc.ts" ||
      path === REGISTRY ||
      path === "scripts/config-registry.ts"
    )
      surfaces.add("*");
  }
  return [...surfaces];
}

async function tail(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) return (text + decoder.decode()).slice(-16_384);
    text = (text + decoder.decode(chunk.value, { stream: true })).slice(
      -16_384,
    );
  }
}

async function command(
  argv: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout: number,
) {
  const signal = AbortSignal.timeout(timeout);
  const child = Bun.spawn(argv, {
    cwd,
    env,
    signal,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, exit] = await Promise.all([
    tail(child.stdout),
    tail(child.stderr),
    child.exited,
  ]);
  return {
    ok: exit === 0 && !signal.aborted,
    stdout: out,
    reason: signal.aborted ? `timeout after ${timeout}ms` : `exit ${exit}`,
    output: `${out}${err}`.trim().split("\n").slice(-20).join("\n"),
  };
}

function diagnosticOutput(output: string): string {
  const lines =
    output.trim() === ""
      ? ["(command emitted no stdout or stderr)"]
      : output.split("\n").slice(-20);
  return lines.map((line) => `  ${line}`).join("\n");
}

// Preserve link text, including dangling links. The sandbox protects external targets.
// Exclude VCS metadata rather than copying .git files pointing at a shared worktree store.
async function copyTree(source: string, target: string): Promise<void> {
  await cp(source, target, {
    recursive: true,
    verbatimSymlinks: true,
    filter: (path) =>
      ![".git", ".jj", ".cocoindex_code"].includes(basename(path)),
  });
}

// Resolve the consumer's own revset without snapshotting its working copy.
async function resolveTrunk(source: string, trunk: string) {
  return command(
    [
      "jj",
      "--ignore-working-copy",
      "-R",
      source,
      "log",
      "-r",
      trunk,
      "--no-graph",
      "-T",
      "commit_id",
    ],
    source,
    process.env,
    30_000,
  );
}

async function exportTrunk(
  source: string,
  target: string,
  commit: string,
  scratch: string,
) {
  const archive = join(scratch, "consumer.tar");
  const archived = await command(
    [
      "git",
      "-C",
      source,
      "archive",
      "--format=tar",
      `--output=${archive}`,
      commit,
    ],
    source,
    process.env,
    30_000,
  );
  if (!archived.ok)
    return `archive ${commit}: ${archived.reason} ${archived.output}`;
  await mkdir(target);
  const extracted = await command(
    ["tar", "-xf", archive, "-C", target],
    scratch,
    process.env,
    30_000,
  );
  return extracted.ok
    ? undefined
    : `extract ${commit}: ${extracted.reason} ${extracted.output}`;
}

function expandRoot(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : resolve(path);
}

/** No subprocess may write outside scratch, even through an absolute path or a surviving symlink. */
function sandbox(
  scratch: string,
  home: string,
  candidate: string,
  source: string,
  copy: string,
  liveDotfiles: string | undefined,
  executableDirectories: readonly string[],
  linkedDotfiles: { source: string; target: string } | undefined,
  history: { source: string; target: string } | undefined,
): string[] | undefined {
  if (process.platform === "linux" && Bun.which("bwrap") !== null)
    return [
      "bwrap",
      "--die-with-parent",
      "--unshare-pid",
      "--ro-bind",
      "/",
      "/",
      ...executableDirectories.flatMap((path) => ["--ro-bind", path, path]),
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--bind",
      scratch,
      scratch,
      ...(history === undefined
        ? []
        : ["--ro-bind", history.source, history.target]),
      ...(linkedDotfiles === undefined
        ? []
        : ["--ro-bind", linkedDotfiles.source, linkedDotfiles.target]),
      "--ro-bind",
      candidate,
      candidate,
      "--bind",
      copy,
      source,
      ...(liveDotfiles === undefined
        ? []
        : ["--ro-bind", candidate, liveDotfiles]),
      "--setenv",
      "HOME",
      home,
      "--",
    ];
  if (process.platform === "darwin" && Bun.which("sandbox-exec") !== null)
    return [
      "sandbox-exec",
      "-p",
      `(version 1)(allow default)(deny file-write*)(allow file-write* (subpath ${JSON.stringify(scratch)}))(allow file-write* (literal "/dev/null"))${history === undefined ? "" : `(deny file-write* (subpath ${JSON.stringify(history.source)}))`}`,
    ];
  return undefined;
}

const JsonObject = z.record(z.string(), z.unknown());
async function objectFile(path: string) {
  // tsconfig permits comments; Bun's JSONC parser keeps that consumer contract.
  const raw = await attempt(async () =>
    Bun.JSONC.parse(await Bun.file(path).text()),
  );
  const parsed = raw.ok ? JsonObject.safeParse(raw.value) : undefined;
  return parsed?.success === true ? parsed.data : undefined;
}

async function preserveTypescript(
  copy: string,
  savedPackage: Record<string, unknown> | undefined,
  savedConfig: Record<string, unknown> | undefined,
): Promise<void> {
  const presetPackage = await objectFile(join(copy, "package.json"));
  if (savedPackage !== undefined && presetPackage !== undefined) {
    const merged = { ...savedPackage };
    for (const key of ["dependencies", "devDependencies"]) {
      const old = JsonObject.safeParse(savedPackage[key]);
      const next = JsonObject.safeParse(presetPackage[key]);
      merged[key] = {
        ...(old.success ? old.data : {}),
        ...(next.success ? next.data : {}),
      };
    }
    await writeFile(
      join(copy, "package.json"),
      JSON.stringify(merged, null, 2),
    );
  }
  if (savedConfig === undefined) return;
  const presetConfig = await objectFile(join(copy, "tsconfig.json"));
  const localOptions = JsonObject.safeParse(savedConfig.compilerOptions);
  const sharedOptions = JsonObject.safeParse(presetConfig?.compilerOptions);
  await writeFile(
    join(copy, "tsconfig.json"),
    JSON.stringify(
      {
        ...savedConfig,
        compilerOptions: {
          ...(localOptions.success ? localOptions.data : {}),
          ...(sharedOptions.success ? sharedOptions.data : {}),
        },
      },
      null,
      2,
    ),
  );
}

async function candidateBins(
  candidate: string,
  scratch: string,
): Promise<string | undefined> {
  const file = Bun.file(join(candidate, "package.json"));
  if (!(await file.exists())) return undefined;
  const manifest = jsonOf(
    z.looseObject({ bin: z.record(z.string(), z.string()).optional() }),
  ).safeParse(await file.text());
  if (!manifest.success) return "invalid candidate package manifest";
  await mkdir(join(scratch, "bin"), { recursive: true });
  for (const [name, target] of Object.entries(manifest.data.bin ?? {})) {
    if (
      !/^[a-z0-9-]+$/u.test(name) ||
      isAbsolute(target) ||
      relative(candidate, resolve(candidate, target)).startsWith("..")
    )
      return `invalid candidate bin ${name}`;
    await symlink(join(candidate, target), join(scratch, "bin", name));
  }
  return undefined;
}

const Mappings = z.looseObject({
  files: z.array(
    z.looseObject({
      source: RelativePath,
      destination: RelativePath,
      createOnly: z.boolean().optional(),
    }),
  ),
});
async function containsSymlink(root: string, path: string): Promise<boolean> {
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    const entryPath = current;
    const entry = await attempt(() => lstat(entryPath));
    if (entry.ok && entry.value.isSymbolicLink()) return true;
  }
  return false;
}

async function applySurface(
  candidate: string,
  copy: string,
  surface: string,
  changed: readonly string[],
  run: (argv: string[]) => ReturnType<typeof command>,
): Promise<string | undefined> {
  const manifest = join(candidate, surface, "preset.toml");
  const raw = await attempt(async () =>
    Bun.TOML.parse(await Bun.file(manifest).text()),
  );
  const parsed = raw.ok ? Mappings.safeParse(raw.value) : undefined;
  if (parsed?.success !== true)
    return `apply ${surface}: invalid or missing manifest`;
  // Parent-process writes must not traverse consumer links outside the isolated export.
  for (const path of [
    ...parsed.data.files.map((file) => file.destination),
    "package.json",
    "tsconfig.json",
  ]) {
    if (await containsSymlink(copy, path))
      return `apply ${surface}: refusing write through consumer symlink ${path}`;
  }
  const all = changed.includes(`${surface}/preset.toml`);
  const savedPackage =
    all || changed.includes(`${surface}/package.json`)
      ? await objectFile(join(copy, "package.json"))
      : undefined;
  const savedConfig =
    all || changed.includes(`${surface}/tsconfig.json`)
      ? await objectFile(join(copy, "tsconfig.json"))
      : undefined;
  for (const file of parsed.data.files) {
    const source = `${surface}/${file.source}`;
    if (!all && !changed.includes(source)) continue;
    const destination = join(copy, file.destination);
    if (file.createOnly === true && (await Bun.file(destination).exists()))
      continue;
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(candidate, source), destination, {
      recursive: true,
      dereference: true,
    });
  }
  if (surface !== "presets/typescript") return undefined;
  await preserveTypescript(copy, savedPackage, savedConfig);
  if (all || changed.includes(`${surface}/package.json`)) {
    const installed = await run([
      process.execPath,
      "install",
      "--ignore-scripts",
    ]);
    if (!installed.ok)
      return `install ${surface} ${installed.reason}\n${diagnosticOutput(installed.output)}`;
  }
  const rendered = await run([
    process.execPath,
    join(candidate, "scripts/render-oxlintrc.ts"),
    "--repo",
    copy,
    "--write",
  ]);
  return rendered.ok
    ? undefined
    : `render ${surface} ${rendered.reason}\n${diagnosticOutput(rendered.output)}`;
}

async function applyConsumerSurface(
  candidate: string,
  copy: string,
  consumer: Consumer,
  surface: string,
  changed: readonly string[],
  run: (argv: string[], cwd?: string) => ReturnType<typeof command>,
): Promise<string | undefined> {
  const directory =
    surface === "presets/typescript"
      ? consumer.preset_dirs?.typescript
      : undefined;
  const target = directory === undefined ? copy : join(copy, directory);
  if (directory !== undefined) {
    const rendered = join(directory, ".oxlintrc.json");
    if (await containsSymlink(copy, rendered))
      return `apply ${surface}: refusing write through consumer symlink ${rendered}`;
    if (!(await Bun.file(join(copy, rendered)).exists()))
      return `apply ${surface}: declared preset directory ${directory} has no rendered file ${rendered}`;
  }
  return applySurface(candidate, target, surface, changed, (argv) =>
    run(argv, target),
  );
}

function consumerNotices(
  consumer: Consumer,
  changed: readonly string[],
): string[] {
  return (consumer.notify ?? [])
    .filter((notice) =>
      notice.paths.some((pattern) =>
        changed.some((path) => new Bun.Glob(pattern).match(path)),
      ),
    )
    .map(
      (notice) =>
        `NOTICE ${consumer.name}: contact ${notice.contact}; gate cannot run check: ${notice.check}`,
    );
}

async function registerWorkspaceLinks(
  candidate: string,
  home: string,
): Promise<string | undefined> {
  if (!(await Bun.file(join(candidate, "package.json")).exists()))
    return undefined;
  const manifest = jsonOf(
    z.looseObject({ workspaces: z.array(RelativePath).optional() }),
  ).safeParse(await Bun.file(join(candidate, "package.json")).text());
  if (!manifest.success) return "invalid candidate workspace manifest";
  const paths: string[] = [];
  for (const pattern of manifest.data.workspaces ?? []) {
    const glob = new Bun.Glob(`${pattern}/package.json`);
    paths.push(
      ...(await Array.fromAsync(
        glob.scan({ cwd: candidate, onlyFiles: true }),
      )),
    );
  }
  for (const path of paths) {
    const workspace = jsonOf(
      z.looseObject({
        name: z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/u),
      }),
    ).safeParse(await Bun.file(join(candidate, path)).text());
    if (!workspace.success) return `invalid candidate workspace ${path}`;
    const destination = join(
      home,
      ".bun/install/global/node_modules",
      workspace.data.name,
    );
    await mkdir(dirname(destination), { recursive: true });
    await symlink(dirname(join(candidate, path)), destination);
  }
  return undefined;
}

// Reuse installed versions read-only; mise still selects only versions declared by the consumer.
// New installs and metadata stay in scratch, avoiding a cold multi-GB SDK download per gate.
async function seedMiseInstalls(home: string): Promise<void> {
  const source = join(
    process.env.MISE_DATA_DIR ?? join(homedir(), ".local/share/mise"),
    "installs",
  );
  const tools = await attempt(() => readdir(source));
  if (!tools.ok) return;
  for (const tool of tools.value) {
    const directory = join(source, tool);
    const versions = await attempt(() =>
      readdir(directory, { withFileTypes: true }),
    );
    if (!versions.ok) continue;
    const target = join(home, ".local/share/mise/installs", tool);
    await mkdir(target, { recursive: true });
    for (const version of versions.value.filter((entry) => entry.isDirectory()))
      await symlink(join(directory, version.name), join(target, version.name));
  }
}

// Resolve tools before any mount can shadow their symlink chain. Copies keep both
// execvp and nested /usr/bin/env lookups independent of the consumer's live paths.
async function captureExecutables(scratch: string, consumer: Consumer) {
  const directory = join(scratch, "runtime-bin");
  await mkdir(directory);
  const paths = new Map<string, string>();
  const captured = new Map<string, string>();
  for (const name of new Set([
    "mise",
    "bun",
    "git",
    "jj",
    "tar",
    consumer.setup[0],
    consumer.command[0],
  ])) {
    if (name === undefined) continue;
    const found = Bun.which(name);
    if (found === null) continue;
    const executable = await realpath(found);
    const known = captured.get(executable);
    const target = known ?? join(directory, basename(name));
    if (known === undefined) await cp(executable, target);
    captured.set(executable, target);
    paths.set(name, target);
  }
  const bun = paths.get("bun");
  if (bun !== undefined) paths.set(process.execPath, bun);
  return { directory, paths };
}

function inside(root: string, path: string): boolean {
  const local = relative(root, path);
  return local === "" || (!local.startsWith("..") && !isAbsolute(local));
}

async function linkedDotfilesNodeModules(
  root: string,
  scratch: string,
  liveDotfiles: string | undefined,
): Promise<{ source: string; target: string; link: string } | undefined> {
  if (
    process.platform !== "linux" ||
    Bun.which("bwrap") === null ||
    liveDotfiles === undefined
  )
    return undefined;
  const nodeModules = join(root, "node_modules");
  const link = await attempt(() => lstat(nodeModules));
  if (!link.ok || !link.value.isSymbolicLink()) return undefined;
  const [liveRoot, nodeModulesRoot] = await Promise.all([
    attempt(() => realpath(liveDotfiles)),
    attempt(() => realpath(nodeModules)),
  ]);
  if (
    !liveRoot.ok ||
    !nodeModulesRoot.ok ||
    !inside(liveRoot.value, nodeModulesRoot.value)
  )
    return undefined;
  const target = join(scratch, "live-dotfiles");
  await mkdir(target);
  return {
    source: liveRoot.value,
    target,
    link: join(target, relative(liveRoot.value, nodeModulesRoot.value)),
  };
}

async function redirectCandidateNodeModules(
  candidate: string,
  linkedDotfiles: Awaited<ReturnType<typeof linkedDotfilesNodeModules>>,
): Promise<void> {
  if (linkedDotfiles === undefined) return;
  const nodeModules = join(candidate, "node_modules");
  const link = await attempt(() => lstat(nodeModules));
  if (!link.ok || !link.value.isSymbolicLink()) return;
  await rm(nodeModules);
  await symlink(linkedDotfiles.link, nodeModules);
}

async function capturePathExecutable(
  path: string,
  target: string,
  shadowed: readonly string[],
) {
  const entry = await attempt(async () => {
    const executable = await realpath(path);
    const info = await stat(executable);
    return { executable, info };
  });
  if (
    !entry.ok ||
    !entry.value.info.isFile() ||
    (entry.value.info.mode & 0o111) === 0
  )
    return null;
  if (shadowed.some((root) => inside(root, entry.value.executable))) {
    await cp(entry.value.executable, target);
    return null;
  }
  await symlink(entry.value.executable, target);
  return dirname(entry.value.executable);
}

// Keep PATH order and argv[0] aliases (including mise shims), but remove every
// symlink chain from name lookup. Protect canonical target directories read-only.
async function capturePath(scratch: string, shadowed: readonly string[]) {
  const directories: string[] = [];
  const bindings = new Set<string>();
  for (const path of new Set((process.env.PATH ?? "").split(":"))) {
    const origin = await attempt(() => realpath(resolve(path)));
    if (!origin.ok) continue;
    const entries = await attempt(() => readdir(origin.value));
    if (!entries.ok) continue;
    const directory = join(
      scratch,
      "resolved-path",
      String(directories.length),
    );
    await mkdir(directory, { recursive: true });
    directories.push(directory);
    const captured = await capturePathDirectory(
      origin.value,
      directory,
      entries.value,
      shadowed,
    );
    captured.forEach((binding) => {
      bindings.add(binding);
    });
  }
  return { directories, bindings: [...bindings] };
}

async function capturePathDirectory(
  origin: string,
  directory: string,
  names: readonly string[],
  shadowed: readonly string[],
) {
  const bindings: string[] = [];
  for (const name of names) {
    const binding = await capturePathExecutable(
      join(origin, name),
      join(directory, name),
      shadowed,
    );
    if (binding !== null) bindings.push(binding);
  }
  return bindings;
}

async function checkConsumer(
  root: string,
  consumer: Consumer,
  changed: readonly string[],
): Promise<string[]> {
  const source = expandRoot(consumer.root);
  const scratch = await mkdtemp(join(tmpdir(), "consumer-gate-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(scratch, { recursive: true, force: true }),
  };
  const home = join(scratch, "home");
  const candidate = join(home, "dotfiles");
  const copy = join(scratch, "consumer");
  const dotfiles = join(homedir(), "dotfiles");
  const liveDotfiles = (await attempt(() => lstat(dotfiles))).ok
    ? dotfiles
    : undefined;
  const linkedDotfiles = await linkedDotfilesNodeModules(
    root,
    scratch,
    liveDotfiles,
  );
  const executables = await captureExecutables(scratch, consumer);
  const roots = await Promise.all(
    [source, root, dotfiles].map((path) => attempt(() => realpath(path))),
  );
  const shadowed = roots.flatMap((entry) => (entry.ok ? [entry.value] : []));
  const resolvedPath = await capturePath(scratch, shadowed);
  // A worktree's .git can be a pointer into the shared store. Resolve the
  // common directory before mounts shadow the live checkout, never copy it.
  let history: { source: string; target: string } | undefined;
  if ((await attempt(() => lstat(join(root, ".git")))).ok) {
    const resolved = await command(
      [
        "git",
        "--no-optional-locks",
        "-C",
        root,
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
      ],
      root,
      process.env,
      30_000,
    );
    if (!resolved.ok)
      return [
        `FAIL ${consumer.name}: dotfiles history ${resolved.reason}\n${diagnosticOutput(resolved.output)}`,
      ];
    const directory = await realpath(resolved.stdout.trim());
    const target =
      process.platform === "linux"
        ? join(scratch, "preset-history")
        : directory;
    if (process.platform === "linux") await mkdir(target);
    history = { source: directory, target };
  }
  const prefix = sandbox(
    scratch,
    home,
    candidate,
    source,
    copy,
    liveDotfiles,
    resolvedPath.bindings,
    linkedDotfiles,
    history,
  );
  if (prefix === undefined)
    return [
      `FAIL ${consumer.name}: isolation unavailable (requires bwrap on Linux or sandbox-exec on macOS)`,
    ];
  const trunk = consumer.trunk ?? "trunk()";
  const revision = await attempt(() => resolveTrunk(source, trunk));
  if (!revision.ok)
    return [
      `FAIL ${consumer.name}: no trunk (${trunk}): ${errorMessage(revision.error)}`,
    ];
  const commit = revision.value.stdout.trim();
  if (
    !revision.value.ok ||
    !/^[a-f0-9]{40,64}$/u.test(commit) ||
    /^0+$/u.test(commit)
  )
    return [
      `FAIL ${consumer.name}: no trunk (${trunk}): ${revision.value.reason} ${revision.value.output}`,
    ];
  const copied = await attempt(async () => {
    const failure = await exportTrunk(source, copy, commit, scratch);
    if (failure !== undefined) return failure;
    await mkdir(home, { recursive: true });
    await copyTree(root, candidate);
    await redirectCandidateNodeModules(candidate, linkedDotfiles);
    return null;
  });
  const copyFailure = copied.ok ? copied.value : errorMessage(copied.error);
  if (copyFailure !== null && copyFailure !== undefined)
    return [
      `FAIL ${consumer.name}: consumer copy failed: ${source}: ${copyFailure}`,
    ];
  const temporary = join(scratch, "tmp");
  await mkdir(temporary);
  const env = {
    ...process.env,
    HOME: home,
    DOTFILES: candidate,
    DOTFILES_PRESET_GIT_DIR: history?.target,
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    BUN_INSTALL: join(home, ".bun"),
    BUN_INSTALL_CACHE_DIR: join(home, ".bun/install/cache"),
    BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(home, ".bun/transpiler"),
    MISE_CACHE_DIR: join(home, ".cache/mise"),
    MISE_DATA_DIR: join(home, ".local/share/mise"),
    MISE_STATE_DIR: join(home, ".local/state/mise"),
    XDG_CACHE_HOME: join(home, ".cache"),
    XDG_CONFIG_HOME: join(home, ".config"),
    XDG_DATA_HOME: join(home, ".local/share"),
    MISE_TRUSTED_CONFIG_PATHS: scratch,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_COUNT: "0",
    GIT_DIR: join(copy, ".git"),
    GIT_WORK_TREE: copy,
    GIT_INDEX_FILE: join(copy, ".git/index"),
    PATH: [
      executables.directory,
      join(copy, "node_modules/.bin"),
      join(candidate, "node_modules/.bin"),
      ...resolvedPath.directories,
    ].join(":"),
  };
  const run = (argv: string[], cwd = copy) => {
    const executable = argv[0];
    const resolved =
      executable === undefined
        ? argv
        : [executables.paths.get(executable) ?? executable, ...argv.slice(1)];
    return command([...prefix, ...resolved], cwd, env, consumer.timeout_ms);
  };
  await seedMiseInstalls(home);
  const linked = await registerWorkspaceLinks(candidate, home);
  if (linked !== undefined) return [`FAIL ${consumer.name}: ${linked}`];
  const setup = await run(consumer.setup);
  const lines = [
    `${setup.ok ? "PASS" : "FAIL"} ${consumer.name}: setup ${consumer.setup.join(" ")} ${setup.reason}\n${diagnosticOutput(setup.output)}`,
  ];
  if (!setup.ok) return lines;
  // Consumer linters may read jj revisions. Give them a private committed baseline,
  // then overlay the candidate so their diff contains only the shared-surface change.
  for (const argv of [
    ["git", "-c", "core.hooksPath=/dev/null", "init", "--quiet"],
    ["git", "add", "--all", "--", "."],
    [
      "git",
      "-c",
      "core.hooksPath=/dev/null",
      "-c",
      "user.name=Consumer Gate",
      "-c",
      "user.email=consumer-gate@example.invalid",
      "commit",
      "--quiet",
      "--allow-empty",
      "-m",
      "consumer trunk export",
    ],
    ["jj", "git", "init", "--colocate"],
  ]) {
    const result = await run(argv);
    if (!result.ok)
      return [
        ...lines,
        `FAIL ${consumer.name}: independent VCS ${result.reason}\n${diagnosticOutput(result.output)}`,
      ];
  }
  const steps: { label: string; argv: string[] }[] = [];
  for (const surface of consumer.surfaces) {
    if (!surface.startsWith("presets/")) continue;
    const applied = await applyConsumerSurface(
      candidate,
      copy,
      consumer,
      surface,
      changed,
      run,
    );
    if (applied !== undefined)
      return [...lines, `FAIL ${consumer.name}: ${applied}`];
  }
  // Package bin names must resolve to the candidate, never to globally linked live files.
  const bins = await candidateBins(candidate, scratch);
  if (bins !== undefined) return [`FAIL ${consumer.name}: ${bins}`];
  env.PATH = `${join(scratch, "bin")}:${env.PATH}`;
  steps.push(
    { label: "stage copied tree", argv: ["git", "add", "--all", "--", "."] },
    { label: consumer.command.join(" "), argv: consumer.command },
  );
  for (const step of steps) {
    const result = await run(step.argv);
    if (!result.ok)
      return [
        ...lines,
        `FAIL ${consumer.name}: ${step.label} ${result.reason}\n${diagnosticOutput(result.output)}`,
      ];
  }
  return [
    ...lines,
    `PASS ${consumer.name}: ${consumer.command.join(" ")} exit 0`,
  ];
}

export async function runConsumerGates(
  root: string,
  changed: readonly string[],
): Promise<ConsumerGateReport> {
  const surfaces = sharedSurfaces(changed);
  if (surfaces.length === 0)
    return {
      ok: true,
      checked: 0,
      lines: ["SKIP consumer gates: no shared surface changed"],
    };
  const loaded = await attempt(async () =>
    Bun.TOML.parse(await Bun.file(join(root, REGISTRY)).text()),
  );
  const parsed = loaded.ok
    ? ConsumerRegistry.safeParse(loaded.value)
    : undefined;
  if (parsed?.success !== true)
    return {
      ok: false,
      checked: 0,
      lines: [
        `FAIL consumer registry ${REGISTRY}: ${loaded.ok ? parsed?.error.message : errorMessage(loaded.error)}`,
      ],
    };
  const selected = parsed.data.consumers.filter(
    (consumer) =>
      surfaces.includes("*") ||
      consumer.surfaces.some((surface) => surfaces.includes(surface)),
  );
  const lines: string[] = parsed.data.pending.map(
    (consumer) => `pending ${consumer.name}: ${consumer.reason}`,
  );
  lines.push(
    ...parsed.data.consumers.flatMap((consumer) =>
      consumerNotices(consumer, changed),
    ),
  );
  for (const consumer of selected) {
    const result = await attempt(() => checkConsumer(root, consumer, changed));
    lines.push(
      ...(result.ok
        ? result.value
        : [
            `FAIL ${consumer.name}: ${consumer.command.join(" ")}: ${errorMessage(result.error)}`,
          ]),
    );
  }
  if (selected.length === 0)
    lines.push(
      "SKIP consumer gates: no registered consumer uses changed surfaces",
    );
  return {
    ok: !lines.some((line) => line.startsWith("FAIL")),
    checked: selected.length,
    lines,
  };
}
