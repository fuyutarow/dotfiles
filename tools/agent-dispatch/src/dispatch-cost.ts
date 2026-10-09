export type TokenUsage = Readonly<{
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
  reasoning_output_tokens?: number;
}>;

export type TokenPrices = Readonly<{
  price_in?: number | undefined;
  price_cached_in?: number | undefined;
  price_out?: number | undefined;
}>;

/** Calculate list price for a Codex receipt; undefined means usage or a required price is unknown. */
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
