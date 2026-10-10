import { chmodSync, writeFileSync } from "node:fs";

/** Fake native commands must not spend their one-second production budget starting Bun. */
type CommandFixture = {
  stdout?: string;
  exit?: number;
  argv?: string[];
  appendPath?: string;
  sleepMs?: number;
  match?: { arg: string; stdout: string };
};

// Data is single-quoted; printf uses a fixed format, so quotes and shell syntax stay literal.
const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

export function commandFixture(
  path: string,
  options: CommandFixture = {},
): void {
  const lines = ["#!/bin/sh"];
  if (options.appendPath !== undefined)
    lines.push(`printf '%s' x >> ${shellQuote(options.appendPath)}`);
  for (const [index, arg] of (options.argv ?? []).entries())
    lines.push(`[ "$${index + 1}" = ${shellQuote(arg)} ] || exit 1`);
  if (options.sleepMs !== undefined)
    lines.push(
      `${Object.keys(options).length === 1 ? "exec " : ""}/bin/sleep ${options.sleepMs / 1000} >/dev/null 2>&1`,
    );
  if (options.match !== undefined)
    lines.push(
      `for arg do`,
      `  if [ "$arg" = ${shellQuote(options.match.arg)} ]; then`,
      `    printf '%s' ${shellQuote(options.match.stdout)}`,
      `    exit 0`,
      `  fi`,
      `done`,
    );
  lines.push(
    `printf '%s' ${shellQuote(options.stdout ?? "")}`,
    `exit ${options.exit ?? 0}`,
    "",
  );
  writeFileSync(path, lines.join("\n"));
  chmodSync(path, 0o755);
}
