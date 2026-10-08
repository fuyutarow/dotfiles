import { createHash } from "node:crypto";

export type SampledRow = Readonly<{
  row: string;
  argmaxRow: string;
  probability: number;
  epsilon: number;
  mode: "sample" | "argmax";
}>;

/** Draw one row from already-masked Jev mass, using a deterministic seed. */
export function sampleRow(
  probabilities: Readonly<Record<string, number>>,
  temperature: number,
  seed: string,
  epsilon = 0.1,
): SampledRow | undefined {
  const entries = Object.entries(probabilities).filter(
    ([, probability]) => probability >= 0 && Number.isFinite(probability),
  );
  if (entries.length === 0 || epsilon < 0 || epsilon > 1) return undefined;
  const smoothed = entries.map(
    ([row, probability]) =>
      [row, (1 - epsilon) * probability + epsilon / entries.length] as const,
  );
  const argmax = entries.toSorted((a, b) => b[1] - a[1])[0];
  if (argmax === undefined) return undefined;
  if (temperature < 0.01)
    return {
      row: argmax[0],
      argmaxRow: argmax[0],
      probability: 1,
      epsilon,
      mode: "argmax",
    };

  const maxLogProbability = Math.log(Math.max(...smoothed.map(([, p]) => p)));
  const weighted = smoothed.map(
    ([row, p]) =>
      [row, Math.exp((Math.log(p) - maxLogProbability) / temperature)] as const,
  );
  const total = weighted.reduce((sum, [, p]) => sum + p, 0);
  let random =
    Number.parseInt(
      createHash("sha256").update(seed).digest("hex").slice(0, 13),
      16,
    ) / 0x10000000000000;
  const last = weighted.at(-1);
  if (last === undefined) return undefined;
  let selected = last[0];
  for (const [row, probability] of weighted) {
    random -= probability / total;
    if (random < 0) {
      selected = row;
      break;
    }
  }
  return {
    row: selected,
    argmaxRow: argmax[0],
    probability: (weighted.find(([row]) => row === selected)?.[1] ?? 0) / total,
    epsilon,
    mode: "sample",
  };
}
