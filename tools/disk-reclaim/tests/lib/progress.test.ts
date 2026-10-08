import { expect, test } from "bun:test";
import { ProgressReporter } from "../../src/lib/progress.ts";

test("non-TTY progress is line-based and throttled per target using the injected clock", () => {
  let time = 100;
  const output: string[] = [];
  const reporter = new ProgressReporter({
    tty: false,
    now: () => time,
    write: (text) => {
      output.push(text);
    },
  });
  reporter.report("clean", "scan", 1, 10);
  time = 1099;
  reporter.report("clean", "scan", 2, 20);
  time = 2100;
  reporter.report("clean", "scan", 3, 30);
  reporter.report("clean", "scan", 3, 30, true);
  expect(output).toHaveLength(3);
  expect(
    output.every((line) => line.endsWith("\n") && !line.includes("\r")),
  ).toBe(true);
  expect(output.join("")).toContain("scan complete");
  expect(output[0]).toContain("10 bytes");
});

test("TTY progress redraws active target rows and includes a total row", () => {
  let time = 100;
  const output: string[] = [];
  const reporter = new ProgressReporter({
    tty: true,
    now: () => time,
    write: (text) => {
      output.push(text);
    },
  });
  reporter.report("clean", "scan", 1, 10);
  time = 150;
  reporter.report("clean", "scan", 2, 20);
  time = 201;
  reporter.report("clean", "scan", 3, 30);
  expect(output.join("")).toContain("\u001B[2K");
  expect(output.join("")).toContain("[reclaim] total:");
  expect(output.join("")).toContain("\u001B[3A");
});
