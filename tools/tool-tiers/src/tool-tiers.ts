import { homedir, release } from "node:os";
import { join, resolve } from "node:path";
import { lstat, realpath, stat } from "node:fs/promises";
import { commandsForFormula, readToolCommandMap } from "./tool-commands.ts";

export type ToolTier = "core" | "ondemand";
const TOOL_TIERS: readonly ToolTier[] = ["core", "ondemand"];
export type BrewEntry = {
  tier: ToolTier;
  kind: "formula" | "cask";
  name: string;
};
export type ToolHost = {
  isMac: boolean;
  isLinux: boolean;
  isWsl: boolean;
};
export type ToolDeclaration = {
  command: string;
  tier: ToolTier;
  kind: BrewEntry["kind"];
  package: string;
};
export type ToolGetResult =
  | { status: "undeclared" }
  | { status: "present"; declaration: ToolDeclaration }
  | { status: "installed"; declaration: ToolDeclaration }
  | { status: "failed"; declaration: ToolDeclaration; exitCode: number };

export type ToolCommandShadow = {
  command: string;
  shadow: string;
  homebrew: string;
};

async function regularFile(path: string): Promise<boolean> {
  return stat(path).then(
    (result) => result.isFile(),
    () => false,
  );
}

async function sameDirectory(left: string, right: string): Promise<boolean> {
  return Promise.all([realpath(left), realpath(right)]).then(
    ([leftPath, rightPath]) => leftPath === rightPath,
    () => resolve(left) === resolve(right),
  );
}

/** Count command/path pairs that precede Homebrew or live in a user bin directory. */
export async function findToolCommandShadows(
  commands: readonly string[],
  path: string,
  homebrewBin: string,
  home: string = homedir(),
): Promise<ToolCommandShadow[]> {
  // An empty PATH component denotes cwd, just as it does during command lookup.
  const pathDirs = [...new Set(path.split(":").map((entry) => resolve(entry)))];
  const brewIndex = (
    await Promise.all(
      pathDirs.map((directory) => sameDirectory(directory, homebrewBin)),
    )
  ).indexOf(true);
  const userBins = [".local/bin", ".cargo/bin", ".bun/bin", "go/bin"].map(
    (directory) => join(home, directory),
  );
  const candidates = (
    await Promise.all(
      pathDirs.map(async (directory, index) => {
        if (await sameDirectory(directory, homebrewBin)) return null;
        const userBin = (
          await Promise.all(
            userBins.map((bin) => sameDirectory(directory, bin)),
          )
        ).some(Boolean);
        return (brewIndex !== -1 && index < brewIndex) || userBin
          ? directory
          : null;
      }),
    )
  ).filter((directory) => directory !== null);
  const grouped = await Promise.all(
    commands.map(async (command) => {
      const homebrew = join(homebrewBin, command);
      if (!(await regularFile(homebrew))) return [];
      return Promise.all(
        candidates.map(async (directory) => {
          const shadow = join(directory, command);
          const regular = await lstat(shadow).then(
            (entry) => entry.isFile(),
            () => false,
          );
          return regular ? { command, shadow, homebrew } : null;
        }),
      );
    }),
  );
  return grouped.flat().filter((shadow) => shadow !== null);
}

type ConditionalFrame = {
  parentActive: boolean;
  condition: boolean;
};

export function currentToolHost(): ToolHost {
  const isLinux = process.platform === "linux";
  return {
    isMac: process.platform === "darwin",
    isLinux,
    isWsl: isLinux && /microsoft/iu.test(release()),
  };
}

function conditionFor(line: string, host: ToolHost): boolean {
  if (/microsoft/iu.test(line)) return host.isWsl;
  if (line.includes("OS.mac?")) return host.isMac;
  if (line.includes("OS.linux?")) return host.isLinux;
  return true;
}

export function parseBrewEntries(
  text: string,
  tier: ToolTier,
  host: ToolHost = currentToolHost(),
): BrewEntry[] {
  const entries: BrewEntry[] = [];
  const conditions: ConditionalFrame[] = [];
  let active = true;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const branch = /^if\s+(.+)$/u.exec(trimmed)?.[1];
    if (branch !== undefined) {
      const condition = conditionFor(branch, host);
      conditions.push({ parentActive: active, condition });
      active = active && condition;
      continue;
    }
    if (trimmed === "else") {
      const frame = conditions.at(-1);
      active =
        frame === undefined ? active : frame.parentActive && !frame.condition;
      continue;
    }
    if (trimmed === "end") {
      const frame = conditions.pop();
      active = frame?.parentActive ?? active;
      continue;
    }
    if (!active) continue;
    const formula = /^brew\s+"([^"]+)"/u.exec(trimmed)?.[1];
    if (formula !== undefined) {
      entries.push({ tier, kind: "formula", name: formula });
      continue;
    }
    const cask = /^cask\s+"([^"]+)"/u.exec(trimmed)?.[1];
    if (cask !== undefined) entries.push({ tier, kind: "cask", name: cask });
  }
  return entries;
}

export async function brewEntries(
  root: string,
  host: ToolHost = currentToolHost(),
): Promise<BrewEntry[]> {
  const entries: BrewEntry[] = [];
  for (const tier of TOOL_TIERS) {
    const file = tier === "core" ? "Brewfile.core" : "Brewfile.ondemand";
    entries.push(
      ...parseBrewEntries(await Bun.file(join(root, file)).text(), tier, host),
    );
  }
  return entries;
}

export async function toolDeclaration(
  root: string,
  command: string,
  host: ToolHost = currentToolHost(),
): Promise<ToolDeclaration | undefined> {
  const commandMap = await readToolCommandMap();
  const entries = await brewEntries(root, host);
  const matching = await Promise.all(
    entries.map(async (candidate) => ({
      candidate,
      commands: await commandsForFormula(candidate.name, commandMap),
    })),
  );
  for (const tier of TOOL_TIERS) {
    const match = matching.find(
      ({ candidate, commands }) =>
        candidate.tier === tier &&
        (candidate.kind === "formula" || commandMap.has(candidate.name)) &&
        commands.includes(command),
    );
    if (match !== undefined)
      return {
        command,
        tier,
        kind: match.candidate.kind,
        package: match.candidate.name,
      };
  }
  return undefined;
}

export async function declaredToolCommands(
  root: string,
  host: ToolHost = currentToolHost(),
): Promise<ToolDeclaration[]> {
  const commandMap = await readToolCommandMap();
  const entries = await brewEntries(root, host);
  const declarations: ToolDeclaration[] = [];
  const seen = new Set<string>();
  const mapped = (
    await Promise.all(
      entries
        .filter(
          (entry) => entry.kind === "formula" || commandMap.has(entry.name),
        )
        .map(async (entry) =>
          (await commandsForFormula(entry.name, commandMap)).map((command) => ({
            command,
            tier: entry.tier,
            kind: entry.kind,
            package: entry.name,
          })),
        ),
    )
  ).flat();
  for (const declaration of mapped) {
    if (seen.has(declaration.command)) continue;
    seen.add(declaration.command);
    declarations.push(declaration);
  }
  return declarations;
}

export async function getTool(
  root: string,
  command: string,
  options: {
    host?: ToolHost;
    isInstalled?: (command: string) => boolean;
    install?: (kind: BrewEntry["kind"], packageName: string) => Promise<number>;
  } = {},
): Promise<ToolGetResult> {
  const declaration = await toolDeclaration(root, command, options.host);
  if (declaration === undefined) return { status: "undeclared" };
  const isInstalled =
    options.isInstalled ?? ((name) => Bun.which(name) !== null);
  if (isInstalled(command)) return { status: "present", declaration };
  const install =
    options.install ??
    (async (kind, packageName) =>
      kind === "cask"
        ? (await Bun.$`brew install --cask ${packageName}`.nothrow()).exitCode
        : (await Bun.$`brew install ${packageName}`.nothrow()).exitCode);
  const exitCode = await install(declaration.kind, declaration.package);
  return exitCode === 0
    ? { status: "installed", declaration }
    : { status: "failed", declaration, exitCode };
}
