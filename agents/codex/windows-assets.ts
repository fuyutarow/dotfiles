import { lstat, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { userInfo } from "node:os";
import { dirname, join, relative } from "node:path";
import { attempt, type Attempt } from "../../tools/shared/src/attempt.ts";
import { obj } from "../hooks/narrow.ts";
import { jsonText } from "../hooks/zod.ts";
import { windowsPath } from "./runtime.ts";

const MANIFEST = "dotfiles-wsl-assets.json";
const BEGIN = "<!-- dotfiles-wsl-codex:begin -->";
const END = "<!-- dotfiles-wsl-codex:end -->";
const CONPTY_SOURCE = "windows-conpty.cs";
const CONPTY_EXE = "codex-conpty.exe";
const CONPTY_HASH = "source.sha256";

const quote = (value: string) =>
  `"${value.replaceAll(/(\\*)"/gu, '$1$1\\"').replaceAll(/(\\*)$/gu, "$1$1")}"`;
const digest = (value: string | Uint8Array) =>
  new Bun.CryptoHasher("sha256").update(value).digest("hex");

const exists = async (path: string): Promise<boolean> =>
  (await attempt(() => lstat(path))).ok;

async function copyContents(source: string, target: string): Promise<void> {
  const sourceStats = await stat(source);
  if (!sourceStats.isDirectory()) {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await Bun.file(source).bytes());
    return;
  }
  await mkdir(target, { recursive: true });
  for (const entry of await readdir(source))
    await copyContents(join(source, entry), join(target, entry));
}

async function backup(target: string, home: string): Promise<void> {
  if (!(await exists(target))) return;
  const stamp = Temporal.Now.instant()
    .toString({ fractionalSecondDigits: 3 })
    .replaceAll(/[:.]/gu, "-");
  const destination = join(
    home,
    ".codex/dotfiles-backups",
    stamp,
    relative(home, target),
  );
  await copyContents(target, destination);
}

async function writeAsset(
  target: string,
  contents: string,
  home: string,
): Promise<string> {
  const current = await attempt(() => Bun.file(target).text());
  if (!current.ok || current.value !== contents) {
    await backup(target, home);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, "utf8");
  }
  return digest(contents);
}

async function entryDigest(path: string): Promise<string> {
  const stats = await stat(path);
  if (!stats.isDirectory()) return digest(await Bun.file(path).bytes());
  const entries = (await readdir(path, { withFileTypes: true })).toSorted(
    (a, b) => a.name.localeCompare(b.name),
  );
  const children = await Promise.all(
    entries.map(async (entry) => ({
      name: entry.name,
      digest: await entryDigest(join(path, entry.name)),
    })),
  );
  const hash = new Bun.CryptoHasher("sha256");
  for (const child of children) {
    hash.update(child.name);
    hash.update(child.digest);
  }
  return hash.digest("hex");
}

async function copyEntry(
  source: string,
  target: string,
  home: string,
): Promise<string> {
  const sourceDigest = await entryDigest(source);
  if ((await exists(target)) && (await entryDigest(target)) === sourceDigest)
    return sourceDigest;
  await backup(target, home);
  await rm(target, { recursive: true, force: true });
  await mkdir(dirname(target), { recursive: true });
  await copyContents(source, target);
  return sourceDigest;
}

async function conptyBridge(
  dotfiles: string,
  nativeHome: string,
): Promise<string> {
  const source = join(dotfiles, "agents/codex", CONPTY_SOURCE);
  const sourceHash = await entryDigest(source);
  const cache = join(nativeHome, "runtime/conpty");
  const executable = join(cache, CONPTY_EXE);
  const sourceHashPath = join(cache, CONPTY_HASH);
  const currentHash = await attempt(() => Bun.file(sourceHashPath).text());
  if (
    currentHash.ok &&
    currentHash.value.trim() === sourceHash &&
    (await exists(executable))
  )
    return entryDigest(executable);
  await mkdir(cache, { recursive: true });
  const compiler =
    "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe";
  const powershell =
    Bun.which("powershell.exe") ??
    "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";
  const [windowsSource, windowsExecutable] = await Promise.all([
    windowsPath(source),
    windowsPath(executable),
  ]);
  const compilerVariables = [
    "CODEX_CONPTY_CSC",
    "CODEX_CONPTY_SOURCE",
    "CODEX_CONPTY_OUTPUT",
  ];
  const inheritedWslEnv = (process.env["WSLENV"] ?? "")
    .split(":")
    .filter((entry) => entry !== "");
  const wslEnv = [
    ...compilerVariables,
    ...inheritedWslEnv.filter(
      (entry) => !compilerVariables.includes(entry.split("/")[0] ?? ""),
    ),
  ].join(":");
  const signal = AbortSignal.timeout(60_000);
  const proc = Bun.spawn(
    [
      powershell,
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$compiler=$env:CODEX_CONPTY_CSC; $source=$env:CODEX_CONPTY_SOURCE; $output=$env:CODEX_CONPTY_OUTPUT; if (!(Test-Path -LiteralPath $compiler)) { exit 127 }; & $compiler '/nologo' '/target:exe' ('/out:' + $output) '/r:System.Web.Extensions.dll' $source; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; if (!(Test-Path -LiteralPath $output)) { Write-Error \"compiler did not create $output\"; exit 1 }; exit 0",
    ],
    {
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
      env: {
        ...process.env,
        CODEX_CONPTY_CSC: compiler,
        CODEX_CONPTY_SOURCE: windowsSource,
        CODEX_CONPTY_OUTPUT: windowsExecutable,
        WSLENV: wslEnv,
      },
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (signal.aborted || code !== 0) {
    process.stderr.write(
      `codex: ConPTY bridge compile failed${signal.aborted ? " (timed out)" : ""}: ${(stdout + stderr).trim()}\n`,
    );
    process.exit(2);
  }
  await writeFile(sourceHashPath, `${sourceHash}\n`, "utf8");
  return entryDigest(executable);
}

export function nativeGuidance(
  guidance: string,
  distro: string,
  dotfiles: string,
  user: string,
): string {
  return `${BEGIN}\n${guidance}\n## Windows Codex with WSL development\n\nThis CLI runs on Windows. Development tools and repositories live in WSL distribution ${distro}. Run Linux tooling through wsl.exe --distribution ${distro} --user ${user} --cd <Linux-workspace-path> --exec zsh -lc <command>. Use Windows/UNC paths for native file tools and Linux paths inside WSL commands. Do not replace Linux development tools with Windows installations.\n\nRepo-owned skills copied into this native home are discovery assets only. Execute a skill script from its canonical WSL source at ${dotfiles}/agents/skills/<skill>/..., through wsl.exe in ${distro} as ${user}; do not run the copied script, whose relative imports resolve only in that checkout.\n${END}\n`;
}

function mergeGuidance(existing: string, managed: string): string {
  const start = existing.indexOf(BEGIN);
  const end = existing.indexOf(END);
  if (start >= 0 && end >= start)
    return `${existing.slice(0, start)}${managed}${existing.slice(end + END.length).replace(/^\n/u, "")}`;
  return `${existing}${existing.endsWith("\n") || existing === "" ? "" : "\n"}${managed}`;
}

export async function windowsAssetsDrift(home: string): Promise<string[]> {
  const nativeHome = join(home, ".codex");
  const manifest = join(nativeHome, MANIFEST);
  const guidance = join(nativeHome, "AGENTS.md");
  const hooks = join(nativeHome, "hooks.json");
  const conpty = join(nativeHome, "runtime/conpty", CONPTY_EXE);
  const drift: string[] = [];
  if (!(await exists(manifest))) drift.push(`${manifest} is missing`);
  const currentGuidance = await attempt(() => Bun.file(guidance).text());
  if (!currentGuidance.ok) drift.push(`${guidance} is missing`);
  if (currentGuidance.ok) {
    const content = currentGuidance.value;
    if (!content.includes(BEGIN) || !content.includes(END))
      drift.push(`${guidance} lacks the managed WSL guidance block`);
  }
  const currentHooks = await attempt(() => Bun.file(hooks).text());
  if (!currentHooks.ok) drift.push(`${hooks} is missing`);
  if (currentHooks.ok && !jsonText.safeParse(currentHooks.value).success)
    drift.push(`${hooks} is invalid JSON`);
  if (!(await exists(conpty))) drift.push(`${conpty} is missing`);
  return drift;
}

export function bridgeHooks(
  value: unknown,
  distro: string,
  bun: string,
  runner: string,
  user = userInfo().username,
): unknown {
  if (Array.isArray(value))
    return value.map((item) => bridgeHooks(item, distro, bun, runner, user));
  const record = obj(value);
  if (record === undefined) return value;
  if (record["type"] === "command" && typeof record["command"] === "string")
    return {
      ...record,
      command: [
        "wsl.exe",
        "--distribution",
        quote(distro),
        "--user",
        quote(user),
        "--cd",
        "~",
        "--exec",
        quote(bun),
        quote(runner),
        quote(record["command"]),
      ].join(" "),
    };
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [
      key,
      bridgeHooks(item, distro, bun, runner, user),
    ]),
  );
}

export async function deployWindowsAssets(
  dotfiles: string,
  home: string,
  linuxHome: string,
  distro: string,
): Promise<Attempt<void>> {
  const guidance = await attempt(() =>
    Bun.file(join(dotfiles, "agents/codex/AGENTS.md")).text(),
  );
  if (!guidance.ok) return guidance;
  const sourceHooks = await attempt(() =>
    Bun.file(join(linuxHome, ".codex/hooks.json")).text(),
  );
  if (!sourceHooks.ok) return sourceHooks;
  const decoded = jsonText.safeParse(sourceHooks.value);
  if (!decoded.success)
    return { ok: false, error: "Linux Codex hooks.json is invalid JSON" };
  return attempt(async () => {
    const user = userInfo().username;
    const nativeHome = join(home, ".codex");
    await mkdir(nativeHome, { recursive: true });
    const existingGuidance = await attempt(() =>
      Bun.file(join(nativeHome, "AGENTS.md")).text(),
    );
    const assets: Record<string, string> = {
      "AGENTS.md": await writeAsset(
        join(nativeHome, "AGENTS.md"),
        mergeGuidance(
          existingGuidance.ok ? existingGuidance.value : "",
          nativeGuidance(guidance.value, distro, dotfiles, user),
        ),
        home,
      ),
    };
    const adapted = bridgeHooks(
      decoded.data,
      distro,
      process.execPath,
      join(dotfiles, "agents/codex/windows-hook.ts"),
      user,
    );
    assets["hooks.json"] = await writeAsset(
      join(nativeHome, "hooks.json"),
      `${JSON.stringify(adapted, null, 2)}\n`,
      home,
    );
    assets["runtime/conpty"] = await conptyBridge(dotfiles, nativeHome);
    // Mirror only repo-owned skill names. Plugin and user skill names remain alongside them.
    const source = join(dotfiles, "agents/skills");
    const target = join(home, ".agents/skills");
    await mkdir(target, { recursive: true });
    for (const name of await readdir(source)) {
      if (!(await exists(join(source, name, "SKILL.md")))) continue;
      assets[`skills/${name}`] = await copyEntry(
        join(source, name),
        join(target, name),
        home,
      );
    }
    const commands = join(dotfiles, "agents/commands");
    const prompts = join(nativeHome, "prompts");
    await mkdir(prompts, { recursive: true });
    for (const name of await readdir(commands))
      assets[`prompts/${name}`] = await copyEntry(
        join(commands, name),
        join(prompts, name),
        home,
      );
    await writeAsset(
      join(nativeHome, MANIFEST),
      `${JSON.stringify({ schema: 1, assets }, null, 2)}\n`,
      home,
    );
  });
}
