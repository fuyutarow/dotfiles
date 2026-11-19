// The one verdict line `mise run doctor` and the tool probes print: PASS/FAIL/WARN/SKIP/INFO, a
// name, a detail, optional sub-lines and a repairing command. Shared so a tool's probe
// (tools/<name>/src) and scripts/doctor.ts print the same format without one importing the other.

export type Verdict = "PASS" | "FAIL" | "WARN" | "SKIP" | "INFO";
export type Finding = {
  name: string;
  verdict: Verdict;
  detail: string;
  lines?: string[];
  fix?: string;
};

export function render(findings: Finding[]): string {
  const width = Math.max(...findings.map((f) => f.name.length));
  const out: string[] = [];
  for (const f of findings) {
    out.push(`${f.verdict.padEnd(4)}  ${f.name.padEnd(width)}  ${f.detail}`);
    for (const l of f.lines ?? []) out.push(`${" ".repeat(width + 8)}- ${l}`);
    if (f.fix !== undefined && f.fix !== "")
      out.push(`${" ".repeat(width + 8)}fix: ${f.fix}`);
  }
  const count = (v: Verdict) => findings.filter((f) => f.verdict === v).length;
  out.push(
    `RESULT: ${count("FAIL") > 0 ? "FAIL" : "PASS"} · FAIL ${count("FAIL")} · WARN ${count("WARN")} · PASS ${count("PASS")} · SKIP ${count("SKIP")}`,
  );
  return `${out.join("\n")}\n`;
}
