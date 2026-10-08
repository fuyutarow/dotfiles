import { createHash } from "node:crypto";

export type SampledRow = Readonly<{
  row: string;
  argmaxRow: string;
  probability: number;
  mode: "sample" | "argmax";
}>;

/** Draw one row from already-masked Jev mass, using a deterministic seed. */
export function sampleRow(
  probabilities: Readonly<Record<string, number>>,
  temperature: number,
  seed: string,
): SampledRow | undefined {
  const entries = Object.entries(probabilities);
  const argmax = entries.toSorted((a, b) => b[1] - a[1])[0];
  if (argmax === undefined) return undefined;
  if (temperature < 0.01)
    return {
      row: argmax[0],
      argmaxRow: argmax[0],
      probability: 1,
      mode: "argmax",
    };

  const maxLogProbability = Math.log(argmax[1]);
  const weighted = entries.map(
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
    mode: "sample",
  };
}
