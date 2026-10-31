import { isAbsolute, join, relative } from "node:path";
import { z } from "../../agents/hooks/zod.ts";

const Directory = z
  .string()
  .min(1)
  .refine(
    (path) => !isAbsolute(path) && !path.split(/[\\/]/u).includes(".."),
    "must be a relative directory without '..'",
  );
export const DEFAULT_PLACEMENT = {
  scripts: "tools",
  oxlint: ".oxlint",
  source: "src",
};
export const Placement = z
  .strictObject({
    scripts: Directory.default("tools"),
    oxlint: Directory.default(".oxlint"),
    source: Directory.default("src"),
  })
  .default(DEFAULT_PLACEMENT);
export type Placement = z.output<typeof Placement>;

function specifier(from: string, to: string): string {
  const path = relative(from, to).replaceAll("\\", "/");
  return path.startsWith("../") || path.startsWith("./") ? path : `./${path}`;
}

export function placedDestination(
  surface: string,
  destination: string,
  placement: Placement,
): string {
  if (surface !== "typescript") return destination;
  if (["house-plugin.js", "house.oxlintrc.json"].includes(destination))
    return join(placement.oxlint, destination);
  if (destination === "zod.ts") return join(placement.source, destination);
  if (
    ["require-bun.ts", "lint-oxlint.ts", "lint-knip.ts"].includes(destination)
  )
    return join(placement.scripts, destination);
  return destination;
}

export function placedContent(
  surface: string,
  source: string,
  content: string,
  placement: Placement,
): string {
  if (surface !== "typescript") return content;
  if (source === ".oxlintrc.json")
    return content.replace(
      "./house.oxlintrc.json",
      specifier(".", join(placement.oxlint, "house.oxlintrc.json")),
    );
  if (source === "house.oxlintrc.json")
    return content.replace(
      "./node_modules/oxlint/configuration_schema.json",
      specifier(
        placement.oxlint,
        "node_modules/oxlint/configuration_schema.json",
      ),
    );
  if (["lint-oxlint.ts", "lint-knip.ts"].includes(source))
    return content.replace(
      '"./zod.ts"',
      JSON.stringify(
        specifier(placement.scripts, join(placement.source, "zod.ts")),
      ),
    );
  if (source === "mise-tasks.toml") {
    for (const script of ["lint-oxlint.ts", "lint-knip.ts", "require-bun.ts"])
      content = content.replaceAll(
        `bun ${script}`,
        `bun ${join(placement.scripts, script)}`,
      );
  }
  return content;
}
