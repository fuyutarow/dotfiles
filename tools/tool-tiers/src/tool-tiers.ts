import { release } from "node:os";
import { join } from "node:path";
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
  const commandMap = readToolCommandMap();
  const entries = await brewEntries(root, host);
  for (const tier of TOOL_TIERS) {
    const entry = entries.find(
      (candidate) =>
        candidate.tier === tier &&
        (candidate.kind === "formula" || commandMap.has(candidate.name)) &&
        commandsForFormula(candidate.name, commandMap).includes(command),
    );
    if (entry !== undefined)
      return { command, tier, kind: entry.kind, package: entry.name };
  }
  return undefined;
}

export async function declaredToolCommands(
  root: string,
  host: ToolHost = currentToolHost(),
): Promise<ToolDeclaration[]> {
  const commandMap = readToolCommandMap();
  const entries = await brewEntries(root, host);
  const declarations: ToolDeclaration[] = [];
  const seen = new Set<string>();
  const mapped = entries
    .filter((entry) => entry.kind === "formula" || commandMap.has(entry.name))
    .flatMap((entry) =>
      commandsForFormula(entry.name, commandMap).map((command) => ({
        command,
        tier: entry.tier,
        kind: entry.kind,
        package: entry.name,
      })),
    );
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
