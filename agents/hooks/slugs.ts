// One identity registry for shared and vendor hooks, plus explicit third-party exclusions.
// Zero-install; consumers are hook emitters, render-home and lint:hook-slug.
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { z } from "./zod.ts";

const Identity = z.object({
  slug: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u),
  script: z.string(),
  commands: z.array(z.string()).default([]),
});
const Registry = z.object({
  hook: z.array(Identity),
  vendor_hook: z.array(Identity).default([]),
  external: z
    .array(
      z.object({
        command: z.string().min(1),
        owner: z.string().min(1),
        reason: z.string().min(1),
      }),
    )
    .default([]),
});
export type HookIdentity = z.output<typeof Identity>;

export function loadSlugs(path = join(import.meta.dir, "hooks.toml")) {
  const result = Registry.safeParse(Bun.TOML.parse(readFileSync(path, "utf8")));
  if (!result.success) return result.error;
  return {
    identities: [
      ...result.data.hook.map((h) => ({ ...h, script: `hooks/${h.script}` })),
      ...result.data.vendor_hook,
    ],
    external: result.data.external,
  };
}

export function slugForScript(script: string): string {
  const registry = loadSlugs();
  if (registry instanceof Error) return "hook-registry";
  const normalized = (
    existsSync(script) ? realpathSync(script) : script
  ).replaceAll("\\", "/");
  return (
    registry.identities.find((h) => normalized.endsWith(`/agents/${h.script}`))
      ?.slug ?? "hook-registry"
  );
}
