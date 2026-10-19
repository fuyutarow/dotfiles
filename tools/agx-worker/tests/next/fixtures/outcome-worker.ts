import { writeFileSync } from "node:fs";

const mode = process.env.AGX_OUTCOME_FIXTURE;
const report = {
  summary: `fixture ${mode}`,
  // Deliberately lie: workspace evidence, rather than this list, controls the outcome.
  changes:
    mode === "no-change" ? [{ path: "work.txt", what: "claimed change" }] : [],
  checks: [],
  open: [],
  for_coordinator: [],
};
if (mode !== "no-change") writeFileSync("work.txt", `changed by ${mode}\n`);
let receipt: unknown = report;
if (mode === "string-wrapped")
  receipt = { exit_code: 0, result: JSON.stringify(report) };
if (mode === "malformed") receipt = { summary: "missing required fields" };
if (mode === "timeout") {
  const child = Bun.spawn([process.execPath, "-e", "await Bun.sleep(5000)"], {
    timeout: 20,
    stdout: "ignore",
    stderr: "ignore",
  });
  await child.exited;
  receipt = { timed_out: child.signalCode === "SIGTERM", exit_code: 0, report };
}
if (mode === "refused") receipt = { outcome: "refused", report };
if (mode === "structured") receipt = { structured_output: report };
if (mode === "last-message") receipt = { last_message: JSON.stringify(report) };
if (mode === "string-report") receipt = { report: JSON.stringify(report) };
if (mode === "trailing-text")
  receipt = { last_message: `${JSON.stringify(report)}\nextra text` };
process.stdout.write(`${JSON.stringify(receipt)}\n`);
