// `bun agents/codex/codex-runtime.ts [deploy] [--check]` — reconcile WSL's
// explicit `codex.exe` Windows Desktop launcher while plain `codex` stays native.
import { cli } from "cleye";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { attempt, errorMessage } from "../hooks/attempt.ts";
import { z } from "../hooks/zod.ts";
import { deployWindowsAssets, windowsAssetsDrift } from "./windows-assets.ts";
import {
  hostKind,
  resolveDesktopRuntime,
  resolveRuntime,
  windowsPath,
} from "./runtime.ts";

const DEFAULT_DOTFILES = join(process.env.HOME ?? homedir(), "dotfiles");
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
      `codex-runtime: cannot inspect managed launcher ${target}: ${errorMessage(metadata.error)}\n`,
    );
    process.exit(2);
  }
  const destination = join(
    home,
    ".codex/dotfiles-retired-wsl-facade",
    timestamp(),
    relative(home, target),
  );
  await mkdir(dirname(destination), { recursive: true });
  await rename(target, destination);
}

export function launcherContents(bun: string, dotfiles: string): string {
  return `#!/usr/bin/env sh\n${MANAGED_LAUNCHER}\nexec ${quoteShellArgument(bun)} ${quoteShellArgument(join(dotfiles, "agents/codex/codex-wsl.ts"))} "$@"\n`;
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

export async function installDesktopFacade(
  home: string,
  contents: string,
): Promise<void> {
  const target = join(home, ".local/bin", "codex.exe");
  if (await Bun.file(target).exists()) {
    const stat = await attempt(() => lstat(target));
    const existing = await attempt(() => readFile(target, "utf8"));
    if (
      stat.ok &&
      stat.value.isFile() &&
      existing.ok &&
      existing.value === contents
    )
      return;
    await archive(home, target);
  }
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
  await chmod(target, 0o755);
}

export async function hasManagedDefaultFacade(home: string): Promise<boolean> {
  const target = join(home, ".local/bin/codex");
  const stat = await attempt(() => lstat(target));
  const existing = await attempt(() => readFile(target, "utf8"));
  return (
    stat.ok &&
    stat.value.isFile() &&
    existing.ok &&
    existing.value.includes(MANAGED_LAUNCHER) &&
    existing.value.includes("agents/codex/codex-wsl.ts")
  );
}

export async function retireManagedDefaultFacade(
  home: string,
): Promise<boolean> {
  const target = join(home, ".local/bin/codex");
  if (!(await hasManagedDefaultFacade(home))) return false;
  await archive(home, target);
  return true;
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

async function firstFailedConfig(
  config: (home: string) => Promise<{ code: number; output: string }>,
  homes: readonly string[],
): Promise<{ code: number; output: string } | undefined> {
  for (const home of homes) {
    const result = await config(home);
    if (result.code !== 0) return result;
  }
  return undefined;
}

async function converge(
  dotfiles: string,
  checkOnly: boolean,
): Promise<{ code: number; lines: string[] }> {
  const runtime = await resolveRuntime(dotfiles);
  const config = async (home: string) =>
    run(
      [
        process.execPath,
        join(dotfiles, "agents/codex/codex-config.ts"),
        ...(checkOnly ? ["--check"] : []),
      ],
      { DOTFILES: dotfiles, CODEX_CONFIG_HOME: home },
    );
  if (hostKind() !== "wsl") {
    const nativeConfig = await config(runtime.home);
    const version = await run([runtime.executable, "--version"], {});
    const lines = [
      "PASS native standalone provider retained",
      `${nativeConfig.code === 0 ? "PASS" : "FAIL"} config ${nativeConfig.output === "" ? "converged" : nativeConfig.output}`,
      `${version.code === 0 ? "PASS" : "FAIL"} standalone codex --version ${version.output}`,
    ];
    return {
      code: lines.some((line) => line.startsWith("FAIL")) ? 1 : 0,
      lines,
    };
  }
  if (runtime.provider !== "standalone")
    return {
      code: 2,
      lines: ["FAIL WSL plain codex must use the declared standalone provider"],
    };
  const desktop = await resolveDesktopRuntime(dotfiles);
  const home = process.env.HOME ?? homedir();
  const bun = process.execPath;
  const contents = launcherContents(bun, dotfiles);
  const distro = await wslDistroName();
  if (distro === undefined || distro === "")
    return { code: 2, lines: ["FAIL WSL distribution is unavailable"] };
  const lines: string[] = [];
  const launcher = join(home, ".local/bin/codex.exe");
  const launcherContentsAtPath = await attempt(() => Bun.file(launcher).text());
  if (checkOnly) {
    lines.push(
      `${launcherContentsAtPath.ok && launcherContentsAtPath.value === contents ? "PASS" : "FAIL"} launcher ${launcher}`,
      `${(await hasManagedDefaultFacade(home)) ? "FAIL" : "PASS"} plain codex managed desktop facade retired`,
    );
    const assets = await windowsAssetsDrift(desktop.home);
    lines.push(
      `${assets.length === 0 ? "PASS" : "FAIL"} native assets ${assets.join("; ") === "" ? "converged" : assets.join("; ")}`,
    );
    for (const [label, configHome] of [
      ["standalone", runtime.home],
      ["desktop", desktop.home],
    ] as const) {
      const result = await config(configHome);
      lines.push(
        `${result.code === 0 ? "PASS" : "FAIL"} ${label} config ${result.output === "" ? "converged" : result.output}`,
      );
    }
  } else {
    const assets = await deployWindowsAssets(
      dotfiles,
      desktop.home,
      home,
      distro,
    );
    if (!assets.ok)
      return {
        code: 2,
        lines: [`FAIL native assets ${errorMessage(assets.error)}`],
      };
    const configFailure = await firstFailedConfig(config, [
      runtime.home,
      desktop.home,
    ]);
    if (configFailure !== undefined)
      return { code: configFailure.code, lines: [configFailure.output] };
    await installDesktopFacade(home, contents);
    await retireManagedDefaultFacade(home);
    lines.push(
      "PASS native codex, explicit codex.exe launcher, assets, and both declared configs converged",
    );
  }
  const nativeVersion = await run([runtime.executable, "--version"], {});
  const nativePath = Bun.which(runtime.executable);
  const brew = Bun.which("brew");
  const brewPrefix =
    brew === null || nativePath === null
      ? undefined
      : await run([brew, "--prefix"], {});
  const nativeFromBrew =
    brewPrefix?.code === 0 &&
    nativePath?.startsWith(`${brewPrefix.output}/`) === true;
  lines.push(
    `${nativeFromBrew ? "PASS" : "FAIL"} standalone provider Homebrew codex ${nativePath ?? "not found"}`,
    `${nativeVersion.code === 0 ? "PASS" : "FAIL"} standalone codex --version ${nativeVersion.output}`,
  );
  const desktopVersion = await run([desktop.executable, "--version"], {
    CODEX_HOME: await windowsPath(join(desktop.home, ".codex")),
  });
  lines.push(
    `${desktopVersion.code === 0 ? "PASS" : "FAIL"} desktop codex --version ${desktopVersion.output}`,
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
          "Deploy or check WSL native codex plus explicit Windows codex.exe wiring.",
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
