import { readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { attempt, errorMessage } from "../../agents/hooks/attempt.ts";
import { jsonOf, z } from "../../agents/hooks/zod.ts";

/** Dot-separated object keys; own properties only, never inherited values. */
export function jsonKey(value: unknown, key: string): unknown {
  let current = value;
  for (const part of key.split(".")) {
    const object = z.record(z.string(), z.unknown()).safeParse(current);
    if (!object.success || !Object.hasOwn(object.data, part)) return undefined;
    current = object.data[part];
  }
  return current;
}

const RelativePath = z
  .string()
  .min(1)
  .refine(
    (path) => !isAbsolute(path) && !path.split(/[\\/]/u).includes(".."),
    "must be a relative path without '..'",
  );
const Manifest = z.strictObject({
  name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  description: z.string().min(1),
  files: z
    .array(
      z.strictObject({
        source: RelativePath,
        destination: RelativePath,
        createOnly: z.boolean().optional(),
        requiredJsonKeys: z
          .array(z.string().regex(/^[^.]+(?:\.[^.]+)*$/u))
          .min(1)
          .optional(),
      }),
    )
    .min(1),
  check: z.array(z.string().min(1)).optional(),
});

async function packageRequirements(
  directory: string,
  files: z.infer<typeof Manifest>["files"],
) {
  const requirements = [];
  for (const file of files) {
    if (file.requiredJsonKeys === undefined) continue;
    const source = join(directory, file.source);
    const json = jsonOf(z.record(z.string(), z.unknown())).safeParse(
      await Bun.file(source).text(),
    );
    if (!json.success)
      return {
        ok: false,
        error: `${source}: requiredJsonKeys needs a JSON object`,
      } as const;
    const selected = file.requiredJsonKeys.map((key) => ({
      destination: file.destination,
      key,
      expected: jsonKey(json.data, key),
    }));
    const missing = selected.find((item) => item.expected === undefined);
    if (missing !== undefined)
      return {
        ok: false,
        error: `${source}: missing required JSON key: ${missing.key}`,
      } as const;
    requirements.push(...selected);
  }
  return { ok: true, requirements } as const;
}

/** Immediate preset directories are the catalog; support directories need no manifest. */
export async function discoverPresets(root: string) {
  const entries = await readdir(root, { withFileTypes: true });
  const presets = [];
  for (const entry of entries.toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isDirectory()) continue;
    const directory = join(root, entry.name);
    const path = join(directory, "preset.toml");
    if (!(await Bun.file(path).exists())) continue;
    const raw = await attempt(async () =>
      Bun.TOML.parse(await Bun.file(path).text()),
    );
    if (!raw.ok)
      return {
        ok: false,
        error: `${path}: ${errorMessage(raw.error)}`,
      } as const;
    const parsed = Manifest.safeParse(raw.value);
    if (!parsed.success)
      return { ok: false, error: `${path}: ${parsed.error.message}` } as const;
    if (parsed.data.name !== entry.name)
      return {
        ok: false,
        error: `${path}: name must match directory '${entry.name}'`,
      } as const;
    const destinations = parsed.data.files.map((file) =>
      relative(directory, resolve(directory, file.destination)),
    );
    if (new Set(destinations).size !== destinations.length)
      return { ok: false, error: `${path}: duplicate destination` } as const;
    const sources = await Promise.all(
      parsed.data.files.map(async (file) => {
        const source = join(directory, file.source);
        return { source, exists: await Bun.file(source).exists() };
      }),
    );
    const missing = sources.find((file) => !file.exists);
    if (missing !== undefined)
      return {
        ok: false,
        error: `${path}: missing source: ${missing.source}`,
      } as const;
    const required = await packageRequirements(directory, parsed.data.files);
    if (!required.ok) return required;
    presets.push({
      ...parsed.data,
      directory,
      requirements: required.requirements,
    });
  }
  return { ok: true, presets } as const;
}
