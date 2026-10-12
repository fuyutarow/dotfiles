import { describe, expect, test } from "bun:test";
import { z } from "../../hooks/zod.ts";
import { bridgeHooks, nativeGuidance } from "../windows-assets.ts";

const hooksSchema = z.object({
  hooks: z.object({
    nested: z.array(z.object({ command: z.string() })),
  }),
});

describe("Windows WSL assets", () => {
  test("keeps the invoking Linux user in guidance and nested command hooks", () => {
    const user = "fuyu";
    const guidance = nativeGuidance(
      "base guidance",
      "r99-u26",
      "/home/fuyu/dotfiles",
      user,
    );
    const hooks = bridgeHooks(
      {
        hooks: {
          nested: [{ type: "command", command: "bun hook.ts" }],
        },
      },
      "r99-u26",
      "/home/linuxbrew/.linuxbrew/bin/bun",
      "/home/fuyu/dotfiles/agents/codex/windows-hook.ts",
      user,
    );

    expect(guidance).toContain("--user fuyu");
    const decoded = hooksSchema.safeParse(hooks);
    expect(decoded.success).toBe(true);
    if (!decoded.success) return;

    const nestedCommand = decoded.data.hooks.nested.at(0)?.command;
    expect(nestedCommand).toBeDefined();
    if (nestedCommand === undefined) return;
    expect(nestedCommand).toContain('--user "fuyu"');
  });
});
