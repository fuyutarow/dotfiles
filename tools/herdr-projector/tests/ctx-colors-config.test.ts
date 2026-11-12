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

// xterm-256 names: Turquoise4 (30), IndianRed (131), Grey39 (241). ctx is colored only when high.
const EXPECTED = new Map([
  ["$agent_detail", "#008787"],
  ["$ctx_lo", "#626262"],
  ["$ctx_mid", "#626262"],
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
    // cpu on row 3: lo is Grey30 (quiet), mid / hi keep Gold3 / IndianRed 167.
    const row3 = layout[2]?.flatMap((entry) =>
      typeof entry === "string" ? [] : [entry],
    );
    expect(
      ["lo", "mid", "hi"].map(
        (level) => row3?.find((entry) => entry.token === `$cpu_${level}`)?.fg,
      ),
    ).toEqual(["#4e4e4e", "#d7af00", "#d75f5f"]);
  }
  // Every token the projector can report has a style.
  expect(CTX_TOKENS.map((name) => `$${name}`)).toEqual(
    [...EXPECTED.keys()].slice(1),
  );
});
