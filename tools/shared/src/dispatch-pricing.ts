export function formatCostUsd(value: number | undefined): string {
  if (value === undefined) return "";
  if (value === 0) return "$0";
  if (value > 0 && value < 0.01) return "<$0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
