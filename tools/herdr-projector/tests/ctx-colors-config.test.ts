import { expect, test } from "bun:test";
import { attempt } from "@dotfiles/shared/src/attempt.ts";
import { z } from "@dotfiles/shared/src/zod.ts";
import { CTX_TOKENS } from "../src/herdr-projector.ts";

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

// xterm-256 names: Turquoise4 (30), DarkSeaGreen4 (71), Gold3 (178), IndianRed (167), Grey39 (241).
const EXPECTED = new Map([
  ["$agent_detail", "#008787"],
  ["$ctx_lo", "#5faf5f"],
  ["$ctx_mid", "#d7af00"],
  ["$ctx_hi", "#d75f5f"],
  ["$ctx_off", "#626262"],
]);

test("herdr/config.toml styles row 2's ctx tokens like cpu in the default, claude and codex layouts", async () => {
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
    // The cpu tokens on row 3 carry the same three level colors as the ctx tokens.
    const row3 = layout[2]?.flatMap((entry) =>
      typeof entry === "string" ? [] : [entry],
    );
    const levels = ["lo", "mid", "hi"];
    expect(
      levels.map(
        (level) => row3?.find((entry) => entry.token === `$cpu_${level}`)?.fg,
      ),
    ).toEqual(levels.map((level) => EXPECTED.get(`$ctx_${level}`)));
  }
  // Every token the projector can report has a style.
  expect(CTX_TOKENS.map((name) => `$${name}`)).toEqual(
    [...EXPECTED.keys()].slice(1),
  );
});
