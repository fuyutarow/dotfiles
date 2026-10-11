import { expect, test } from "bun:test";
import { stripVTControlCharacters } from "node:util";
import { TerminalProgress } from "../src/terminal-progress.ts";

// Minimal screen for Clack's erase-line, cursor-up and cursor-column sequences.
function screen(transcript: string): string {
  const lines = [""];
  let row = 0;
  for (const token of transcript
    .replaceAll(String.fromCodePoint(27), "<ESC>")
    .split(/(<ESC>\[[\d;]*[A-Za-z]|\n|\r)/u)) {
    if (token === "\n") {
      row++;
      lines[row] ??= "";
    } else if (token === "\r" || token.endsWith("G")) {
      /* Clack writes whole lines. */
    } else if (/^<ESC>\[\d*A$/u.test(token))
      row = Math.max(0, row - Number(token.slice(6, -1)));
    else if (token.endsWith("K")) lines[row] = "";
    else if (!token.startsWith("<ESC>["))
      lines[row] = (lines[row] ?? "") + token;
  }
  return lines.join("\n");
}

test("Clack fake TTY frames retain counters and collapse concurrent completed rows", () => {
  let now = 0;
  const frames: string[] = [];
  const progress = new TerminalProgress({
    tty: true,
    now: () => now,
    columns: () => 160,
    write: (text) => {
      frames.push(text);
    },
  });
  progress.update({ id: "a", task: "scan", entries: 4, bytes: 40 });
  progress.update({ id: "b", task: "waiting for SSH", entries: 0, bytes: 0 });
  now = 1000;
  progress.update({ id: "a", task: "scan", entries: 0, bytes: 0 });
  expect(screen(frames.join(""))).toContain("40 B");
  expect(screen(frames.join(""))).toContain("waiting for SSH");
  progress.update({ id: "a", task: "scan", entries: 4, bytes: 40, done: true });
  const finalRow = screen(frames.join(""))
    .split("\n")
    .filter((line) => line.includes("a:"));
  expect(finalRow).toHaveLength(1);
  expect(finalRow[0]).toContain("done a: scan");
  expect(screen(frames.join(""))).not.toContain("Progress finished");
  progress.finish();
  expect(screen(frames.join(""))).toContain("Progress interrupted");
  // taskLog owns no raw-mode or cursor-hide state to leak on abort.
  expect(frames.join("")).not.toContain("?25l");
  expect(stripVTControlCharacters(frames.join("")).endsWith("\n")).toBe(true);
  const count = frames.length;
  progress.finish();
  expect(frames).toHaveLength(count);
});

test("completed preflight and later work share one region until finish", () => {
  const frames: string[] = [];
  const progress = new TerminalProgress({
    tty: true,
    now: () => 0,
    write: (text) => {
      frames.push(text);
    },
  });
  progress.update({ id: "preflight", task: "inventory", entries: 0, bytes: 0 });
  progress.update({
    id: "preflight",
    task: "inventory",
    entries: 0,
    bytes: 0,
    done: true,
  });
  expect(screen(frames.join(""))).not.toContain("Progress finished");
  progress.update({ id: "scan", task: "scan", entries: 1, bytes: 42 });
  progress.update({
    id: "scan",
    task: "scan",
    entries: 1,
    bytes: 42,
    done: true,
  });
  expect(screen(frames.join(""))).not.toContain("Progress finished");
  progress.finish();
  const final = screen(frames.join(""));
  expect(final.split("Progress finished")).toHaveLength(2);
  expect(final.split("done preflight:")).toHaveLength(2);
  expect(final.split("done scan:")).toHaveLength(2);
});

test("off-TTY progress is silent; Clack frames fit a narrow pane", () => {
  for (const tty of [false, true]) {
    const frames: string[] = [];
    const progress = new TerminalProgress({
      tty,
      columns: () => 20,
      write: (text) => {
        frames.push(text);
      },
    });
    progress.update({
      id: "unit",
      task: "waiting for external command",
      entries: 1,
      bytes: 42,
    });
    if (tty)
      expect(
        stripVTControlCharacters(frames.at(-1) ?? "").trimEnd().length,
      ).toBeLessThanOrEqual(19);
    progress.finish();
    if (!tty) expect(frames).toEqual([]);
  }
});
