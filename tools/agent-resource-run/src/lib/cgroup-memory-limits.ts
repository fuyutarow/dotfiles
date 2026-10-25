type EffectiveMemoryLimits = {
  memoryMax: string;
  memoryHigh: string;
  memorySwapMax: string;
  pidsPeak: string;
};

const integer = (value: string): number | undefined => {
  const text = value.trim();
  if (!/^\d+$/u.test(text)) return undefined;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

export function kernelPageSizeBytes(smaps: string): number | undefined {
  const kib = /^KernelPageSize:\s+(\d+)\s+kB$/mu.exec(smaps)?.[1];
  if (kib === undefined) return undefined;
  const bytes = Number(kib) * 1024;
  return Number.isSafeInteger(bytes) && bytes > 0 ? bytes : undefined;
}

const matchesPageAlignedReadback = (
  actual: number | undefined,
  requested: number,
  pageSizeBytes: number,
) =>
  actual === Math.floor(requested / pageSizeBytes) * pageSizeBytes ||
  actual === Math.ceil(requested / pageSizeBytes) * pageSizeBytes;

export function effectiveMemoryLimitsMatch(
  actual: EffectiveMemoryLimits,
  expected: { memoryMaxBytes: number; memoryHighBytes: number },
  pageSizeBytes: number,
): boolean {
  if (!Number.isSafeInteger(pageSizeBytes) || pageSizeBytes <= 0) return false;
  const max = integer(actual.memoryMax);
  const high = integer(actual.memoryHigh);
  const swap = integer(actual.memorySwapMax);
  const peak = integer(actual.pidsPeak);
  return (
    matchesPageAlignedReadback(max, expected.memoryMaxBytes, pageSizeBytes) &&
    matchesPageAlignedReadback(high, expected.memoryHighBytes, pageSizeBytes) &&
    high !== undefined &&
    max !== undefined &&
    high < max &&
    expected.memoryHighBytes < expected.memoryMaxBytes &&
    swap === 0 &&
    peak !== undefined &&
    peak >= 1
  );
}
