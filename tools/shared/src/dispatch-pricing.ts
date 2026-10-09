import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fromThrowable, z } from "./zod.ts";

export type TokenUsage = Readonly<{
  input_tokens?: number | undefined;
  cached_input_tokens?: number | undefined;
  output_tokens?: number | undefined;
  reasoning_output_tokens?: number | undefined;
}>;

export type TokenPrices = Readonly<{
  price_in?: number | undefined;
  price_cached_in?: number | undefined;
  price_out?: number | undefined;
}>;

export function formatCostUsd(value: number | undefined): string {
  if (value === undefined) return "";
  if (value === 0) return "$0";
  if (value < 0.01) return "<$0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    minimumSignificantDigits: 3,
    maximumSignificantDigits: 3,
  })
    .format(value)
    .replace(/K$/u, "k");
}

export function costUsd(
  prices: TokenPrices,
  usage: TokenUsage,
): number | undefined {
  if (
    prices.price_in === undefined ||
    prices.price_out === undefined ||
    usage.input_tokens === undefined ||
    usage.output_tokens === undefined
  )
    return undefined;
  const cached = usage.cached_input_tokens ?? 0;
  return (
    ((usage.input_tokens - cached) * prices.price_in +
      cached * (prices.price_cached_in ?? prices.price_in) +
      (usage.output_tokens + (usage.reasoning_output_tokens ?? 0)) *
        prices.price_out) /
    1_000_000
  );
}

export type DispatchRowPrice = TokenPrices & Readonly<{ route: string }>;
const ROSTER_PRICES = z.object({
  choice: z.array(
    z.object({
      id: z.string(),
      route: z.string(),
      price_in: z.number().optional(),
      price_cached_in: z.number().optional(),
      price_out: z.number().optional(),
    }),
  ),
});

/** Read the chosen row's route and token prices from the same roster agx uses. */
export function dispatchRowPrice(
  choice: string,
  path = process.env.DISPATCH_ROSTER_PATH ??
    join(import.meta.dir, "../../../agents/models/dispatch-roster.toml"),
): DispatchRowPrice | undefined {
  const raw = fromThrowable(() => Bun.TOML.parse(readFileSync(path, "utf8")))();
  if (raw.isErr()) return undefined;
  const parsed = ROSTER_PRICES.safeParse(raw.value);
  if (!parsed.success) return undefined;
  const row = parsed.data.choice.find((candidate) => candidate.id === choice);
  if (row === undefined) return undefined;
  return {
    route: row.route,
    ...(row.price_in === undefined ? {} : { price_in: row.price_in }),
    ...(row.price_cached_in === undefined
      ? {}
      : { price_cached_in: row.price_cached_in }),
    ...(row.price_out === undefined ? {} : { price_out: row.price_out }),
  };
}
