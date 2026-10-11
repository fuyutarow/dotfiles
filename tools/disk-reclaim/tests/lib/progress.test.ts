import { expect, test } from "bun:test";
import { ProgressReporter } from "../../src/lib/progress.ts";

test("non-TTY progress is silent", () => {
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
  expect(output).toEqual([]);
});

test("TTY progress redraws active target rows in place", () => {
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
  expect(output.join("")).toContain("\u001B[");
  expect(output.join("")).toContain("30 B");
  expect(output.join("")).toContain("\u001B[1A");
  reporter.finish();
});
