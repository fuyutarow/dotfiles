/** Facts recorded for a completed run and the one coordinator-facing verdict derived from them. */
export type RunResult = "delivered" | "returned" | "failed" | "abandoned";

export type RunFacts = Readonly<{
  vendor_exit: number | undefined;
  vendor_status?: string;
  verify: ReadonlyArray<{ exit: number; timed_out?: boolean }>;
  verify_required: boolean;
  verify_required_count?: number;
  changed_files: ReadonlyArray<string>;
  valid_return: boolean;
  return_findings: number;
  turns: number;
  output_chars: number;
  scope_warning?: ReadonlyArray<string>;
  timed_out?: boolean;
  abandoned?: boolean;
}>;

/** Scope warnings, historical grades, and acknowledgements deliberately do not affect this result. */
export function deriveRunResult(facts: RunFacts): RunResult {
  if (facts.abandoned === true) return "abandoned";
  if (
    facts.vendor_exit === undefined ||
    facts.vendor_exit !== 0 ||
    facts.timed_out === true ||
    facts.turns <= 0 ||
    facts.output_chars <= 0
  )
    return "failed";
  if (facts.verify.some((item) => item.exit !== 0 || item.timed_out === true))
    return "failed";
  if (
    facts.verify_required &&
    facts.verify.length < (facts.verify_required_count ?? 1)
  )
    return facts.valid_return ? "returned" : "failed";
  if (facts.valid_return && facts.return_findings > 0) return "delivered";
  if (facts.valid_return) return "returned";
  return facts.changed_files.length > 0 ? "delivered" : "failed";
}
