// Consumer: land. Every subprocess runs with the host read-only and only its scratch tree writable.
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  realpath,
  rm,
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
const Registry = z.strictObject({
  consumers: z
    .array(
      z.strictObject({
        name: z.string().min(1),
        root: z.string().min(1),
        surfaces: z.array(Surface).min(1),
        command: z.array(z.string().min(1)).min(1),
        timeout_ms: z.number().int().positive().max(600_000),
      }),
    )
    .refine(
      (rows) => new Set(rows.map((row) => row.name)).size === rows.length,
      "duplicate consumer name",
    ),
});
export type Consumer = z.output<typeof Registry>["consumers"][number];
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
    reason: signal.aborted ? `timeout after ${timeout}ms` : `exit ${exit}`,
    output: `${out}${err}`.trim().split("\n").slice(-15).join("\n"),
  };
}

// Do not preserve links back into live checkouts (including node_modules workspace links).
// Exclude VCS metadata rather than copying .git files pointing at a shared worktree store.
async function copyTree(source: string, target: string): Promise<void> {
  const origin = await realpath(source);
  await cp(origin, target, {
    recursive: true,
    verbatimSymlinks: true,
    filter: async (path, destination) => {
      if ([".git", ".jj", ".cocoindex_code"].includes(basename(path)))
        return false;
      if (!(await lstat(path)).isSymbolicLink()) return true;
      const actual = await realpath(path);
      const local = relative(origin, actual);
      await mkdir(dirname(destination), { recursive: true });
      if (!local.startsWith("..") && !isAbsolute(local)) {
        await symlink(
          relative(dirname(destination), join(target, local)),
          destination,
        );
      } else {
        await copyTree(actual, destination);
      }
      return false;
    },
  });
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
): string[] | undefined {
  if (process.platform === "linux" && Bun.which("bwrap") !== null)
    return [
      "bwrap",
      "--die-with-parent",
      "--unshare-pid",
      "--ro-bind",
      "/",
      "/",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--bind",
      scratch,
      scratch,
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
      `(version 1)(allow default)(deny file-write*)(allow file-write* (subpath ${JSON.stringify(scratch)}))(allow file-write* (literal "/dev/null"))`,
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

const RelativePath = z
  .string()
  .min(1)
  .refine(
    (path) => !isAbsolute(path) && !path.split(/[\\/]/u).includes(".."),
    "unsafe preset path",
  );
const Mappings = z.looseObject({
  files: z.array(
    z.looseObject({
      source: RelativePath,
      destination: RelativePath,
      createOnly: z.boolean().optional(),
    }),
  ),
});
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
      return `install ${surface} ${installed.reason}\n${installed.output}`;
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
    : `render ${surface} ${rendered.reason}\n${rendered.output}`;
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
  const prefix = sandbox(scratch, home, candidate, source, copy, liveDotfiles);
  if (prefix === undefined)
    return [
      `FAIL ${consumer.name}: isolation unavailable (requires bwrap on Linux or sandbox-exec on macOS)`,
    ];
  await copyTree(source, copy);
  await mkdir(home, { recursive: true });
  await copyTree(root, candidate);
  const temporary = join(scratch, "tmp");
  await mkdir(temporary);
  const env = {
    ...process.env,
    HOME: home,
    DOTFILES: candidate,
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
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
    PATH: `${join(copy, "node_modules/.bin")}:${join(candidate, "node_modules/.bin")}:${process.env.PATH ?? ""}`,
  };
  const run = (argv: string[]) =>
    command([...prefix, ...argv], copy, env, consumer.timeout_ms);
  const steps: { label: string; argv: string[] }[] = [];
  for (const surface of consumer.surfaces) {
    if (!surface.startsWith("presets/")) continue;
    const applied = await applySurface(candidate, copy, surface, changed, run);
    if (applied !== undefined) return [`FAIL ${consumer.name}: ${applied}`];
  }
  // Package bin names must resolve to the candidate, never to globally linked live files.
  const bins = await candidateBins(candidate, scratch);
  if (bins !== undefined) return [`FAIL ${consumer.name}: ${bins}`];
  env.PATH = `${join(scratch, "bin")}:${env.PATH}`;
  steps.push(
    {
      label: "independent Git index",
      argv: ["git", "-c", "core.hooksPath=/dev/null", "init", "--quiet"],
    },
    { label: "stage copied tree", argv: ["git", "add", "--all", "--", "."] },
    { label: consumer.command.join(" "), argv: consumer.command },
  );
  for (const step of steps) {
    const result = await run(step.argv);
    if (!result.ok)
      return [
        `FAIL ${consumer.name}: ${step.label} ${result.reason}\n${result.output}`,
      ];
  }
  return [`PASS ${consumer.name}: ${consumer.command.join(" ")}`];
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
  const parsed = loaded.ok ? Registry.safeParse(loaded.value) : undefined;
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
  const lines: string[] = [];
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
