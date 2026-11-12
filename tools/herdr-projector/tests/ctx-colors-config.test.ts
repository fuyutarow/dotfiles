import { expect, test } from "bun:test";
import { attempt } from "@dotfiles/shared/src/attempt.ts";
import { z } from "@dotfiles/shared/src/zod.ts";
import { CPU_TOKENS, CTX_TOKENS } from "../src/herdr-projector.ts";

const Style = z.object({ token: z.string(), fg: z.string() });
const Row = z.array(z.union([z.string(), Style]));
const Config = z.object({
  ui: z.object({
    sidebar: z.object({
      agents: z.object({
        rows: z.array(Row),
        rows_by_agent: z.object({ claude: z.array(Row), codex: z.array(Row) }),
      }),
    }),
  }),
});

// xterm-256 names: Turquoise4 (30), DarkGoldenrod (136), IndianRed (131), Grey39 (241).
const EXPECTED = new Map([
  ["$agent_detail", "#008787"],
  ["$ctx_lo", "#626262"],
  ["$ctx_mid", "#af8700"],
  ["$ctx_hi", "#af5f5f"],
  ["$ctx_off", "#626262"],
]);

test("herdr/config.toml greys ctx below the red level and colors only ctx_hi, in the default, claude and codex layouts", async () => {
  const text = await Bun.file(
    new URL("../../../herdr/config.toml", import.meta.url),
  ).text();
  const toml = await attempt(() => Bun.TOML.parse(text));
  expect(toml.ok).toBe(true);
  const config = Config.safeParse(toml.ok ? toml.value : undefined);
  expect(config.success).toBe(true);
  if (!config.success) return;
  const { rows, rows_by_agent } = config.data.ui.sidebar.agents;
  for (const layout of [rows, rows_by_agent.claude, rows_by_agent.codex]) {
    const row2 = layout[1]?.flatMap((entry) =>
      typeof entry === "string" ? [] : [entry],
    );
    expect(row2?.map((entry) => [entry.token, entry.fg])).toEqual([
      ...EXPECTED,
    ]);
    // cpu on row 3: idle (below 10%) is Grey30 (quiet), lo is DarkSeaGreen4 (71), mid / hi are
    // Gold3 / IndianRed 167, and idle sits before lo.
    const row3 = layout[2]?.flatMap((entry) =>
      typeof entry === "string" ? [] : [entry],
    );
    expect(
      row3
        ?.filter((entry) => entry.token.startsWith("$cpu_"))
        .map((entry) => [entry.token, entry.fg]),
    ).toEqual([
      ["$cpu_idle", "#4e4e4e"],
      ["$cpu_lo", "#5faf5f"],
      ["$cpu_mid", "#d7af00"],
      ["$cpu_hi", "#d75f5f"],
    ]);
    // Every token the projector can report as cpu has a style in this layout.
    expect(
      CPU_TOKENS.every((name) =>
        (row3 ?? []).some((entry) => entry.token === `$${name}`),
      ),
    ).toBe(true);
  }
  // Every token the projector can report has a style.
  expect(CTX_TOKENS.map((name) => `$${name}`)).toEqual(
    [...EXPECTED.keys()].slice(1),
  );
});
