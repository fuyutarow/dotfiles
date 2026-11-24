import { isAbsolute, relative, resolve, sep } from "node:path";
import { Result } from "@dotfiles/shared/src/result.ts";

/** Line sets preserve names exactly; CRLF and blank lines are framing, not names. */
export function lines(text: string): Set<string> {
  return new Set(
    text
      .replaceAll("\r\n", "\n")
      .split("\n")
      .filter((line) => line !== ""),
  );
}

export function newFailures(base: string, head: string): string[] {
  const known = lines(base);
  return [...lines(head)].filter((line) => !known.has(line)).toSorted();
}

export function render(names: readonly string[]): string {
  return names.length === 0 ? "" : `${names.join("\n")}\n`;
}

/** Bun's default reporter (including suite names); fail closed on incomplete runs. */
export function parseFailures(
  output: string,
  cwd: string,
): Result<string[], string> {
  const text = Bun.stripANSI(output).replaceAll("\r\n", "\n");
  const summary = /^\s*(\d+) fail$/mu.exec(text);
  if (!/^Ran \d+ tests? across \d+ files?\./mu.test(text) || summary === null)
    return Result.err(
      "expected a completed Bun test run with the default reporter",
    );
  if (/^\s*[1-9]\d* errors?\b/mu.test(text))
    return Result.err("Bun reported errors outside named test failures");
  let file: string | undefined;
  const failures: string[] = [];
  for (const line of text.split("\n")) {
    const heading = /^(.+\.[cm]?[jt]sx?):$/u.exec(line);
    if (heading?.[1] !== undefined) file = heading[1];
    const failed = /^\(fail\) (.+?)(?: \[\d+(?:\.\d+)?m?s\])?$/u.exec(line);
    if (failed === null) continue;
    if (file === undefined || failed[1] === undefined)
      return Result.err("failure without a test file or name");
    const path = relative(cwd, resolve(cwd, file));
    if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`))
      return Result.err(`test file is outside the checkout: ${file}`);
    if (/[\t\r\n]/u.test(path + failed[1]))
      return Result.err(
        "test file and name must fit on one tab-separated line",
      );
    failures.push(`${path.split(sep).join("/")}\t${failed[1]}`);
  }
  if (failures.length !== Number(summary[1]))
    return Result.err("named failures do not match Bun's failure count");
  return Result.ok([...new Set(failures)].toSorted());
}
