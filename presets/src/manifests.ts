import { readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { attempt, errorMessage } from "../../agents/hooks/attempt.ts";
import { z } from "../../agents/hooks/zod.ts";

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
      }),
    )
    .min(1),
  check: z.array(z.string().min(1)).optional(),
});

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
    presets.push({ ...parsed.data, directory });
  }
  return { ok: true, presets } as const;
}
