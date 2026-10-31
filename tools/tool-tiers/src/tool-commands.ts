import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type ToolCommandMap = ReadonlyMap<string, readonly string[]>;

export async function readToolCommandMap(
  path = join(import.meta.dir, "tool-commands.tsv"),
): Promise<ToolCommandMap> {
  const commandMap = new Map<string, readonly string[]>();
  for (const raw of (await readFile(path, "utf8")).split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const [formula, ...commands] = line.split(/\s+/u);
    if (formula !== undefined)
      commandMap.set(
        formula,
        commands.length === 1 && commands[0] === "-" ? [] : commands,
      );
  }
  return commandMap;
}

export async function commandsForFormula(
  formula: string,
  commandMap?: ToolCommandMap,
): Promise<readonly string[]> {
  const base = formula.split("/").at(-1) ?? formula;
  return (commandMap ?? (await readToolCommandMap())).get(base) ?? [base];
}
