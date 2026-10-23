import type { Roster } from "./load.ts";

type ModelGeneration = Readonly<{ family: string; generation: string }>;
type ModelGenerationParse =
  | { readonly ok: true; readonly value: ModelGeneration | undefined }
  | { readonly ok: false; readonly error: string };

function normalizeGeneration(parts: string[]): string {
  const normalized = parts.map((part) => BigInt(part).toString());
  while (normalized.length > 1 && normalized.at(-1) === "0") normalized.pop();
  return normalized.join(".");
}

/** Recognize only the provider slug shapes represented in the committed catalog. */
function parseModelGeneration(model: string): ModelGenerationParse {
  const gpt = /^gpt-(\d+(?:\.\d+)?)-([a-z]+)$/u.exec(model);
  if (gpt !== null) {
    const family = gpt[2];
    const generation = gpt[1];
    if (family === undefined || generation === undefined)
      return {
        ok: false,
        error: `cannot read model slug ${JSON.stringify(model)}`,
      };
    return {
      ok: true,
      value: {
        family,
        generation: normalizeGeneration(generation.split(".")),
      },
    };
  }

  const malformedGptFamily = /^gpt-[\d.]+-([a-z]+)(?:-.+)?$/u.exec(model);
  if (malformedGptFamily !== null) {
    const family = malformedGptFamily[1];
    return {
      ok: false,
      error:
        `model slug ${JSON.stringify(model)} names supported family ${family} ` +
        `but must use gpt-<numeric-generation>-${family}`,
    };
  }

  const claude = /^claude-([a-z]+)-(\d+)-(\d+)$/u.exec(model);
  if (claude !== null) {
    const family = claude[1];
    const major = claude[2];
    const minor = claude[3];
    if (family === undefined || major === undefined || minor === undefined)
      return {
        ok: false,
        error: `cannot read model slug ${JSON.stringify(model)}`,
      };
    return {
      ok: true,
      value: {
        family: `claude-${family}`,
        generation: normalizeGeneration([major, minor]),
      },
    };
  }

  const malformedClaudeFamily = /^claude-([a-z]+)-(?=.*\d).+$/u.exec(model);
  if (malformedClaudeFamily !== null) {
    const family = malformedClaudeFamily[1];
    return {
      ok: false,
      error:
        `model slug ${JSON.stringify(model)} names supported family claude-${family} ` +
        `but must use claude-${family}-<major>-<minor>`,
    };
  }

  return { ok: true, value: undefined };
}

export function generationExclusivityError(roster: Roster): string | undefined {
  const families = new Map<string, Map<string, Set<string>>>();
  for (const row of roster.choice) {
    const parsed = parseModelGeneration(row.model);
    if (!parsed.ok) return parsed.error;
    if (parsed.value === undefined) continue;
    const generations =
      families.get(parsed.value.family) ?? new Map<string, Set<string>>();
    const models =
      generations.get(parsed.value.generation) ?? new Set<string>();
    models.add(row.model);
    generations.set(parsed.value.generation, models);
    families.set(parsed.value.family, generations);
  }

  const conflicts = [...families].flatMap(([family, generations]) => {
    if (generations.size < 2) return [];
    const versions = [...generations].map(
      ([generation, models]) =>
        `${[...models].join(", ")} (generation ${generation})`,
    );
    return [
      `model family ${family} has multiple generations: ${versions.join("; ")}`,
    ];
  });
  return conflicts.length === 0
    ? undefined
    : `${conflicts.join(". ")}. Keep one generation for each family by removing or ` +
        "updating the conflicting roster rows.";
}
