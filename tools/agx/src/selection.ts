import { createHash } from "node:crypto";

type EscalationRow = Readonly<{
  id: string;
  model: string;
  effort: string;
  aa_index?: number | undefined;
  price_in?: number | undefined;
  price_out?: number | undefined;
}>;

const efforts = ["low", "medium", "high", "xhigh", "max"];
const escalationPrice = (row: EscalationRow): number =>
  (row.price_in ?? Infinity) + (row.price_out ?? Infinity);

/** No sampling or fallback below the failed row's measured capability. */
export function escalationRow<T extends EscalationRow>(
  rows: readonly T[],
  failed: EscalationRow,
  budgetUsd?: number,
): T | undefined {
  const minimum = failed.aa_index;
  if (minimum === undefined || !Number.isFinite(minimum)) return undefined;
  const nextEffort = efforts[efforts.indexOf(failed.effort) + 1];
  const preferred = (row: T): number =>
    row.model === failed.model && row.effort === nextEffort ? 0 : 1;
  const cheapest = Math.min(...rows.map((row) => escalationPrice(row)));
  return rows
    .filter(
      (row) =>
        row.id !== failed.id &&
        row.aa_index !== undefined &&
        Number.isFinite(row.aa_index) &&
        row.aa_index >= minimum &&
        Number.isFinite(escalationPrice(row)) &&
        (budgetUsd === undefined ||
          (escalationPrice(row) / cheapest) * 0.01 <= budgetUsd),
    )
    .toSorted((a, b) => {
      const comparisons = [
        escalationPrice(a) - escalationPrice(b),
        preferred(a) - preferred(b),
        (a.aa_index ?? Infinity) - (b.aa_index ?? Infinity),
        efforts.indexOf(a.effort) - efforts.indexOf(b.effort),
        a.id.localeCompare(b.id),
      ];
      return comparisons.find((comparison) => comparison !== 0) ?? 0;
    })[0];
}

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
  const entries = Object.entries(probabilities).filter(
    ([, probability]) => probability >= 0 && Number.isFinite(probability),
  );
  if (entries.length === 0 || !Number.isFinite(temperature) || temperature < 0)
    return undefined;
  const argmax = entries.toSorted((a, b) => b[1] - a[1])[0];
  if (argmax === undefined) return undefined;
  if (argmax[1] === 0) return undefined;
  if (temperature === 0)
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
