import { z } from "./zod.ts";

export function embedHousePin(source: string, parsed: unknown) {
  const pin = z
    .object({ tools: z.object({ bun: z.string().min(1) }) })
    .safeParse(parsed);
  if (!pin.success)
    return {
      ok: false as const,
      error: "cannot determine the house bun pin from mise.toml",
    };
  const declaration = "const embeddedHousePin: string | undefined = undefined;";
  if (!source.includes(declaration))
    return {
      ok: false as const,
      error: "mise-contract house pin declaration missing",
    };
  return {
    ok: true as const,
    value: source.replace(
      declaration,
      `const embeddedHousePin: string | undefined = ${JSON.stringify(pin.data.tools.bun)};`,
    ),
  };
}
