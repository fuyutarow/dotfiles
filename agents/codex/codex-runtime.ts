// `bun agents/codex/codex-runtime.ts [deploy] [--check]` — reconcile the WSL
// launcher with the Windows desktop Codex package. It never updates the package itself.
import { cli } from "cleye";
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { attempt, errorMessage } from "../hooks/attempt.ts";
import { z } from "../hooks/zod.ts";
import { deployWindowsAssets, windowsAssetsDrift } from "./windows-assets.ts";
import { hostKind, resolveRuntime, windowsPath } from "./runtime.ts";

const DEFAULT_DOTFILES = join(process.env.HOME ?? homedir(), "dotfiles");
const FACADE_NAMES = ["codex", "codex.exe"];
const MANAGED_LAUNCHER =
  "# Managed by codex-runtime.ts; no shell alias is required.";
const MissingPathError = z.looseObject({ code: z.literal("ENOENT") });

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("codex-runtime: unknown option '--__proto__'\n");
    process.exit(2);
  }
}

function timestamp(): string {
  return Temporal.Now.instant().toString().replaceAll(/[:.]/gu, "-");
}

function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
}

async function archive(home: string, target: string): Promise<void> {
  const metadata = await attempt(() => lstat(target));
  if (!metadata.ok) {
    if (MissingPathError.safeParse(metadata.error).success) return;
    process.stderr.write(
      `codex-runtime: cannot inspect standalone payload ${target}: ${errorMessage(metadata.error)}\n`,
    );
    process.exit(2);
  }
  const destination = join(
    home,
    ".codex/dotfiles-retired-standalone",
    timestamp(),
    relative(home, target),
  );
  await mkdir(dirname(destination), { recursive: true });
  await rename(target, destination);
}

export function launcherContents(bun: string, dotfiles: string): string {
  return `#!/usr/bin/env sh\n${MANAGED_LAUNCHER}\nexec ${quoteShellArgument(bun)} ${quoteShellArgument(join(dotfiles, "agents/codex/codex-wsl.ts"))} "$@"\n`;
}

async function standaloneRelease(
  home: string,
  target: string,
): Promise<string | undefined> {
  const resolved = await attempt(() => realpath(target));
  if (!resolved.ok) return undefined;
  const releases = join(home, ".codex/packages/standalone/releases");
  const prefix = `${releases}/`;
  if (!resolved.value.startsWith(prefix)) return undefined;
  const version = resolved.value.slice(prefix.length).split("/")[0];
  return version === undefined || version === ""
    ? undefined
    : join(releases, version);
}

export async function wslDistroName(
  inherited = process.env.WSL_DISTRO_NAME,
  windowsRoot = async (): Promise<string | undefined> => {
    const signal = AbortSignal.timeout(5_000);
    const mapped = Bun.spawn(["wslpath", "-w", "/"], {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      signal,
    });
    const [stdout, code] = await Promise.all([
      new Response(mapped.stdout).text(),
      mapped.exited,
    ]);
    return code === 0 && !signal.aborted ? stdout.trim() : undefined;
  },
): Promise<string | undefined> {
  if (inherited !== undefined && inherited !== "") return inherited;
  const root = (await windowsRoot())?.replaceAll(/\\+$/gu, "");
  if (root === undefined || !root.startsWith("\\\\")) return undefined;
  const distro = root.split("\\").at(-1);
  return distro === undefined || distro === "" ? undefined : distro;
}

async function installFacade(
  home: string,
  name: string,
  contents: string,
): Promise<string | undefined> {
  const target = join(home, ".local/bin", name);
  if (!(await Bun.file(target).exists())) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
    await chmod(target, 0o755);
    return undefined;
  }
  const stat = await attempt(() => lstat(target));
  const existing = await attempt(() => readFile(target, "utf8"));
  if (
    stat.ok &&
    stat.value.isFile() &&
    existing.ok &&
    existing.value === contents
  )
    return undefined;
  const release = await standaloneRelease(home, target);
  if (release === undefined) return undefined;
  await archive(home, target);
  await writeFile(target, contents, "utf8");
  await chmod(target, 0o755);
  return release;
}

async function activeStandaloneReleases(home: string): Promise<string[]> {
  const releases = join(home, ".codex/packages/standalone/releases");
  const entries = await attempt(() => readdir(releases));
  return entries.ok ? entries.value.map((name) => join(releases, name)) : [];
}

export async function deferredStandaloneReleases(
  home: string,
  procRoot = "/proc",
): Promise<string[]> {
  const releases = await activeStandaloneReleases(home);
  const processes = await attempt(() => readdir(procRoot));
  if (!processes.ok) return [];
  const supported = await Promise.all(
    releases.map(async (release) => {
      const marker = `${relative(home, release)}/`;
      const paths = await Promise.all(
        processes.value
          .filter((pid) => /^\d+$/u.test(pid))
          .flatMap((pid) => [
            attempt(() => realpath(join(procRoot, pid, "exe"))),
            attempt(() => readFile(join(procRoot, pid, "maps"), "utf8")),
          ]),
      );
      return paths.some((path) => path.ok && path.value.includes(marker));
    }),
  );
  return releases.filter((_, index) => supported[index] === true);
}

export async function installFacades(
  home: string,
  contents: string,
): Promise<string[]> {
  const installed = await Promise.all(
    FACADE_NAMES.map((name) => installFacade(home, name, contents)),
  );
  const releases = installed.flatMap((release) =>
    release === undefined ? [] : [release],
  );
  return [...new Set(releases)];
}

export async function retireStandaloneReleases(
  home: string,
  known: readonly string[] = [],
  procRoot = "/proc",
): Promise<number> {
  const releases = new Set([
    ...known,
    ...(await activeStandaloneReleases(home)),
  ]);
  const deferred = new Set(await deferredStandaloneReleases(home, procRoot));
  const retired = [...releases].filter((release) => !deferred.has(release));
  for (const release of retired) await archive(home, release);
  return retired.length;
}

async function run(
  command: string[],
  env: Record<string, string | undefined>,
): Promise<{ code: number; output: string }> {
  const signal = AbortSignal.timeout(30_000);
  const proc = Bun.spawn(command, {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal,
    env: { ...process.env, ...env },
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code: signal.aborted ? 124 : code, output: `${out}${err}`.trim() };
}

async function converge(
  dotfiles: string,
  checkOnly: boolean,
): Promise<{ code: number; lines: string[] }> {
  const runtime = await resolveRuntime(dotfiles);
  if (runtime.provider === "standalone") {
    const config = await run(
      [
        process.execPath,
        join(dotfiles, "agents/codex/codex-config.ts"),
        ...(checkOnly ? ["--check"] : []),
      ],
      { DOTFILES: dotfiles },
    );
    const version = await run([runtime.executable, "--version"], {});
    const lines = [
      "PASS standalone provider retained without WSL migration",
      `${config.code === 0 ? "PASS" : "FAIL"} config ${config.output === "" ? "converged" : config.output}`,
      `${version.code === 0 ? "PASS" : "FAIL"} standalone codex --version ${version.output}`,
    ];
    return {
      code: lines.some((line) => line.startsWith("FAIL")) ? 1 : 0,
      lines,
    };
  }
  if (hostKind() !== "wsl")
    return { code: 2, lines: ["FAIL windows-desktop provider requires WSL"] };
  const home = process.env.HOME ?? homedir();
  const bun = process.execPath;
  const contents = launcherContents(bun, dotfiles);
  const distro = await wslDistroName();
  if (distro === undefined || distro === "")
    return { code: 2, lines: ["FAIL WSL distribution is unavailable"] };
  const lines: string[] = [];
  const launcherMatches = await Promise.all(
    FACADE_NAMES.map(async (name) => {
      const launcher = join(home, ".local/bin", name);
      const contentsAtLauncher = await attempt(() => Bun.file(launcher).text());
      return contentsAtLauncher.ok && contentsAtLauncher.value === contents;
    }),
  );
  if (checkOnly) {
    for (const [index, name] of FACADE_NAMES.entries())
      lines.push(
        `${launcherMatches[index] === true ? "PASS" : "FAIL"} launcher ${join(home, ".local/bin", name)}`,
      );
    const standalone = await activeStandaloneReleases(home);
    const deferred = await deferredStandaloneReleases(home);
    lines.push(
      `${standalone.every((release) => deferred.includes(release)) ? "PASS" : "FAIL"} standalone payload ${standalone.length === 0 ? "retired" : `deferred active support ${deferred.join(", ")}`}`,
    );
    const assets = await windowsAssetsDrift(runtime.home);
    lines.push(
      `${assets.length === 0 ? "PASS" : "FAIL"} native assets ${assets.join("; ") === "" ? "converged" : assets.join("; ")}`,
    );
    const config = await run(
      [bun, join(dotfiles, "agents/codex/codex-config.ts"), "--check"],
      { DOTFILES: dotfiles },
    );
    lines.push(
      `${config.code === 0 ? "PASS" : "FAIL"} config ${config.output === "" ? "converged" : config.output}`,
    );
  } else {
    const assets = await deployWindowsAssets(
      dotfiles,
      runtime.home,
      home,
      distro,
    );
    if (!assets.ok)
      return {
        code: 2,
        lines: [`FAIL native assets ${errorMessage(assets.error)}`],
      };
    const config = await run(
      [bun, join(dotfiles, "agents/codex/codex-config.ts")],
      {
        DOTFILES: dotfiles,
      },
    );
    if (config.code !== 0) return { code: config.code, lines: [config.output] };
    // Retirement is deliberately last: a native configuration failure must leave the
    // existing standalone CLI callable, and open standalone sessions are never killed.
    await retireStandaloneReleases(home, await installFacades(home, contents));
    lines.push(
      "PASS dual launcher façades, native assets, and declared config converged",
    );
  }
  const version = await run([runtime.executable, "--version"], {
    CODEX_HOME: await windowsPath(join(runtime.home, ".codex")),
  });
  lines.push(
    `${version.code === 0 ? "PASS" : "FAIL"} desktop codex --version ${version.output}`,
  );
  return { code: lines.some((line) => line.startsWith("FAIL")) ? 1 : 0, lines };
}

async function main(): Promise<number> {
  const parsed = cli(
    {
      name: "codex-runtime.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["[mode]"],
      flags: { check: { type: Boolean, default: false } },
      help: {
        description:
          "Deploy or check WSL Windows-desktop Codex runtime wiring.",
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (
    parsed._.length > 1 ||
    (parsed._[0] !== undefined && parsed._[0] !== "deploy")
  ) {
    process.stderr.write(
      "codex-runtime: usage: codex-runtime.ts [deploy] [--check]\n",
    );
    return 2;
  }
  if (parsed.flags.check && parsed._[0] === "deploy") {
    process.stderr.write("codex-runtime: choose deploy or --check, not both\n");
    return 2;
  }
  const result = await converge(
    process.env.DOTFILES ?? DEFAULT_DOTFILES,
    parsed.flags.check,
  );
  for (const line of result.lines) process.stdout.write(`${line}\n`);
  return result.code;
}

if (import.meta.main) {
  const result = await attempt(main);
  if (!result.ok) {
    process.stderr.write(`codex-runtime: ${errorMessage(result.error)}\n`);
    process.exit(2);
  }
  process.exit(result.value);
}
