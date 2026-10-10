// Deploy protocol: doctor findings never fail the landing, but missing/failed proof is visible.
// No argv boundary; land.ts owns execution and the host summary.
export const DOCTOR_TIMEOUT_S = 90;

export function doctorStep(begin: string, end: string): string {
  return ` && { printf '\\n${begin}_DOCTOR\\n'; DOCTOR_ONLY= timeout --kill-after=5s ${DOCTOR_TIMEOUT_S}s mise run doctor 2>&1; _land_doctor_status=$?; printf '\\n__LAND_DOCTOR_EXIT_%s__\\n${end}_DOCTOR\\n' "$_land_doctor_status"; true; }`;
}

export function doctorReport(output: string | undefined): {
  pass: number;
  fail: number;
  lines: string[];
  status: string;
} {
  const text = output ?? "";
  const rows = text
    .split("\n")
    .map((line) => line.replace(/^\[[^\]]+\]\s*/u, ""));
  const lines = rows.filter((line) => /^FAIL\s/u.test(line));
  const summary =
    /RESULT: [^\n]*? · FAIL (\d+) · WARN \d+ · PASS (\d+) · SKIP \d+/u.exec(
      text,
    );
  const exit = /__LAND_DOCTOR_EXIT_(\d+)__/u.exec(text)?.[1];
  const pass = Number(summary?.[2] ?? 0);
  let fail = Number(summary?.[1] ?? lines.length);
  // An execution/protocol error is one extra failed proof, rather than zero "healthy" findings.
  if (summary === null || exit === undefined || Number(exit) > 1) {
    fail++;
    const detail =
      exit === "124"
        ? `timeout after ${DOCTOR_TIMEOUT_S}s`
        : `missing/incomplete report (exit ${exit ?? "unknown"})`;
    lines.push(`FAIL doctor: ${detail}`);
  } else if (exit === "1" && fail === 0) {
    fail++;
    lines.push("FAIL doctor: exited 1 without a FAIL finding");
  }
  return {
    pass,
    fail,
    lines,
    status: fail === 0 ? "ok" : `ok (doctor FAIL ${fail})`,
  };
}
