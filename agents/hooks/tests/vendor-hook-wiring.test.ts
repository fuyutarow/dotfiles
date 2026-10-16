import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HooksConfigSchema } from "../../../scripts/hook-registry.ts";
import { decoded } from "./decode.ts";
import { jsonOf, z } from "../zod.ts";

const ROOT = join(import.meta.dir, "../../..");
const Registry = z.object({
  vendor_hook: z.array(
    z.object({ slug: z.string(), commands: z.array(z.string()).min(1) }),
  ),
});
const Settings = z.object({ hooks: HooksConfigSchema });

// Only commands beneath an event count: registry metadata or unrelated settings
// containing a command cannot make a declared hook reachable.
async function unwiredVendorHooks(registryPath: string, vendorPaths: string[]) {
  const registry = decoded(
    Registry,
    Bun.TOML.parse(await Bun.file(registryPath).text()),
  );
  const configs = await Promise.all(
    vendorPaths.map(async (path) =>
      decoded(jsonOf(Settings), await Bun.file(path).text()),
    ),
  );
  const commands = new Set(
    configs
      .flatMap((config) => Object.values(config.hooks).flat())
      .flatMap((group) => group.hooks)
      .flatMap((hook) =>
        hook.type === "command" && typeof hook.command === "string"
          ? [hook.command]
          : [],
      ),
  );
  return registry.vendor_hook
    .filter(
      (hook) =>
        !hook.commands.some((command) =>
          commands.has(`HOOK_SLUG=dotfiles:${hook.slug} ${command}`),
        ),
    )
    .map((hook) => hook.slug);
}

describe("vendor hook event wiring", () => {
  test("every real vendor_hook is referenced by a Claude or Codex event", async () => {
    expect(
      await unwiredVendorHooks(join(ROOT, "agents/hooks/hooks.toml"), [
        join(ROOT, "agents/claude/settings.json"),
        join(ROOT, "agents/codex/hooks.json"),
      ]),
    ).toEqual([]);
  });

  test("an unregistered fixture vendor_hook is rejected, including a command outside events", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vendor-hook-wiring-"));
    const registry = join(dir, "hooks.toml");
    const claude = join(dir, "settings.json");
    const codex = join(dir, "hooks.json");
    const command = "HOOK_SLUG=dotfiles:fixture sh ~/.codex/hooks/fixture.sh";
    await Bun.write(
      registry,
      '[[vendor_hook]]\nslug = "fixture"\nscript = "codex/hooks/fixture.ts"\ncommands = ["sh ~/.codex/hooks/fixture.sh"]\n',
    );
    await Bun.write(claude, JSON.stringify({ hooks: {}, command }));
    await Bun.write(codex, JSON.stringify({ hooks: {} }));
    expect(await unwiredVendorHooks(registry, [claude, codex])).toEqual([
      "fixture",
    ]);
    // A Codex-only event registration satisfies the same structural check.
    await Bun.write(
      codex,
      JSON.stringify({
        hooks: { Stop: [{ hooks: [{ type: "command", command }] }] },
      }),
    );
    expect(await unwiredVendorHooks(registry, [claude, codex])).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });
});
