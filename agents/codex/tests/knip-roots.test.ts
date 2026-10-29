import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { roots } from "../../../scripts/knip-gate.ts";

test("Codex prompt and shell hook expose their production entries", async () => {
  const entries = await roots(resolve(import.meta.dir, "../../.."));
  expect(entries).toContain("agents/codex/hooks/quote-command.ts");
  expect(entries).toContain("agents/codex/hooks/enforce-reply-language.ts");
});
