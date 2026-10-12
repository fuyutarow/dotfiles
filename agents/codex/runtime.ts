import { homedir, release } from "node:os";
import { join, resolve } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { attempt } from "../hooks/attempt.ts";
import { jsonOf, z } from "../hooks/zod.ts";

export type RuntimeProvider = "standalone" | "windows-desktop";
export type HostKind = "mac" | "linux" | "wsl";
export type CodexRuntime = {
  provider: RuntimeProvider;
  home: string;
  executable: string;
};

const Declaration = z.object({
  providers: z.object({
    mac: z.literal("standalone"),
    linux: z.literal("standalone"),
    wsl: z.enum(["standalone", "windows-desktop"]),
  }),
});
const WindowsRuntime = z.object({
  executable: z.string().min(1),
  home: z.string().min(1),
});

export function hostKind(
  platform = process.platform,
  kernel = release(),
): HostKind {
  if (platform === "darwin") return "mac";
  return /microsoft/iu.test(kernel) ? "wsl" : "linux";
}

export async function declaredProvider(
  dotfiles: string,
  kind = hostKind(),
): Promise<Result<RuntimeProvider, Error>> {
  const path = join(dotfiles, "agents/codex/runtime.toml");
  if (!(await Bun.file(path).exists()))
    return err(new Error(`${path}: missing runtime declaration`));
  const source = await attempt(() => Bun.file(path).text());
  if (!source.ok)
    return err(new Error(`${path}: invalid TOML: ${String(source.error)}`));
  const decoded = await attempt(() => Bun.TOML.parse(source.value));
  if (!decoded.ok)
    return err(new Error(`${path}: invalid TOML: ${String(decoded.error)}`));
  const parsed = Declaration.safeParse(decoded.value);
  return parsed.success
    ? ok(parsed.data.providers[kind])
    : err(
        new Error(
          `${path}: invalid runtime declaration: ${parsed.error.message}`,
        ),
      );
}

async function translatePath(
  path: string,
  direction: "-w" | "-u",
): Promise<string> {
  const signal = AbortSignal.timeout(5_000);
  const proc = Bun.spawn(["wslpath", direction, path], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code === 0 && !signal.aborted) return stdout.trim();
  process.stderr.write(
    `codex: wslpath ${direction} failed${stderr.trim() === "" ? "" : `: ${stderr.trim()}`}\n`,
  );
  return process.exit(2);
}

export async function windowsPath(path: string): Promise<string> {
  if (/^(?:[a-z]:[\\/]|\\\\)/iu.test(path)) return path;
  return translatePath(resolve(path), "-w");
}

function linuxPath(path: string): Promise<string> {
  return translatePath(path, "-u");
}

export async function resolveRuntime(
  dotfiles: string,
  home = homedir(),
  selected?: RuntimeProvider,
): Promise<CodexRuntime> {
  if (selected === undefined) {
    const declared = await declaredProvider(dotfiles);
    if (declared.isErr()) {
      process.stderr.write(`codex: ${declared.error.message}\n`);
      process.exit(2);
    }
    selected = declared.value;
  }
  if (selected === "standalone")
    return { provider: selected, home, executable: "codex" };
  if (hostKind() !== "wsl") {
    process.stderr.write(
      "codex: windows-desktop Codex provider requires WSL\n",
    );
    process.exit(2);
  }
  const powershell =
    Bun.which("powershell.exe") ??
    "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
  const signal = AbortSignal.timeout(15_000);
  const probe = Bun.spawn(
    [
      powershell,
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      '$ErrorActionPreference="Stop"; $pkg=Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1; if (!$pkg) { throw "Install the Codex desktop app on Windows first" }; @{ executable=(Join-Path $pkg.InstallLocation "app\\resources\\codex.exe"); home=$env:USERPROFILE } | ConvertTo-Json -Compress',
    ],
    { stdin: "ignore", stdout: "pipe", stderr: "pipe", signal },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(probe.stdout).text(),
    new Response(probe.stderr).text(),
    probe.exited,
  ]);
  const parsed = jsonOf(WindowsRuntime).safeParse(stdout);
  if (code !== 0 || signal.aborted || !parsed.success) {
    process.stderr.write(
      `codex: cannot locate Windows desktop Codex: ${stderr.trim() === "" ? "Windows interop is unavailable" : stderr.trim()}\n`,
    );
    process.exit(2);
  }
  return {
    provider: selected,
    executable: await linuxPath(parsed.data.executable),
    home: await linuxPath(parsed.data.home),
  };
}

/** The dedicated `codex.exe` launcher always targets Windows Desktop on WSL. */
export function resolveDesktopRuntime(
  dotfiles: string,
  home = homedir(),
): Promise<CodexRuntime> {
  return resolveRuntime(dotfiles, home, "windows-desktop");
}

export async function configHome(
  dotfiles: string,
  home = process.env.HOME ?? homedir(),
): Promise<string> {
  return (
    process.env.CODEX_CONFIG_HOME ?? (await resolveRuntime(dotfiles, home)).home
  );
}

/** Translate only path operands; prompts, config values, token order, and `--` stay intact. */
export async function windowsArguments(
  args: readonly string[],
  translate: (path: string) => string | Promise<string> = windowsPath,
): Promise<string[]> {
  const paths = new Set([
    "-C",
    "--cd",
    "--add-dir",
    "-i",
    "--image",
    "-o",
    "--output-last-message",
    "--output-schema",
  ]);
  const result: string[] = [];
  let pathNext = false;
  let operands = false;
  for (const arg of args) {
    if (operands) {
      result.push(arg);
      continue;
    }
    if (pathNext) {
      result.push(await translate(arg));
      pathNext = false;
      continue;
    }
    if (arg === "--") {
      operands = true;
      result.push(arg);
      continue;
    }
    const equal = arg.indexOf("=");
    if (equal > 0 && paths.has(arg.slice(0, equal))) {
      result.push(
        `${arg.slice(0, equal)}=${await translate(arg.slice(equal + 1))}`,
      );
      continue;
    }
    result.push(arg);
    pathNext = paths.has(arg);
  }
  return result;
}

export function hasExplicitWorkingDirectory(args: readonly string[]): boolean {
  for (const arg of args) {
    if (arg === "--") return false;
    if (
      arg === "-C" ||
      arg === "--cd" ||
      arg.startsWith("-C=") ||
      arg.startsWith("--cd=")
    )
      return true;
  }
  return false;
}
