import { existsSync } from "node:fs";
import { cli } from "cleye";

// Consumer: agent/human verdict lines.
// Mechanical structural floor only: this cannot prove semantics, target behavior, or receipt truth.

const headings = [
  "C0 CONSUMERS",
  "C1 INVOCATION",
  "C2 EFFECTS",
  "C3 CHANNELS",
  "C4 OUTCOMES",
  "C5 EVOLUTION",
] satisfies readonly string[];

const fieldLabels = [
  "Consumer regimes",
  "Parser profile",
  "Ambiguous / invalid cases",
  "Effects / recovery",
  "Machine mode",
  "Machine framing",
  "Machine compatibility",
  "Waits / liveness",
  "Fallbacks / handoffs",
  "Positive receipt",
  "Negative receipt",
] satisfies readonly string[];

const meaningfulFields = [
  ["Parser profile", "C1"],
  ["Ambiguous / invalid cases", "C1"],
  ["Effects / recovery", "C2"],
  ["Positive receipt", "C5"],
  ["Negative receipt", "C5"],
] satisfies readonly (readonly [string, string])[];

const consumerRegimes = [
  "human-interactive",
  "shell-pipeline",
  "ci",
  "agent",
  "other-caller",
] satisfies readonly string[];

type ArgvType = "known-flag" | "unknown-flag" | "argument";
type Severity = "PASS" | "FAIL" | "MISSING";
type VisibleLine = Readonly<{ text: string; number: number }>;
type RegimeParse = Readonly<{ malformed: boolean; values: readonly string[] }>;
type Attempt<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: string }>;

function closesFence(
  marker: ReturnType<typeof markdownFence>,
  active: string,
): boolean {
  return (
    marker !== undefined &&
    marker.marker[0] === active[0] &&
    marker.marker.length >= active.length &&
    marker.suffix.trim() === ""
  );
}

function stripCommentContinuation(line: string): string | undefined {
  const end = line.indexOf("-->");
  return end === -1 ? undefined : line.slice(end + 3);
}

function stripInlineComment(
  line: string,
): Readonly<{ line: string; open: boolean }> {
  const start = line.indexOf("<!--");
  if (start === -1) return { line, open: false };
  const end = line.indexOf("-->", start + 4);
  return end === -1
    ? { line: line.slice(0, start), open: true }
    : { line: line.slice(0, start) + line.slice(end + 3), open: false };
}

const backtick = String.fromCodePoint(96);

function rejectPrototypeFlag(
  type: ArgvType,
  flag: string,
  _value?: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

function markdownFence(
  line: string,
): Readonly<{ marker: string; suffix: string }> | undefined {
  const match = line.match(
    new RegExp("^(" + backtick + "{3,}|~{3,})(.*)$", "u"),
  );
  if (match?.[1] === undefined || match[2] === undefined) return undefined;
  return { marker: match[1], suffix: match[2] };
}

function visibleLines(text: string): readonly VisibleLine[] {
  const result: VisibleLine[] = [];
  let activeFence: string | undefined;
  let inComment = false;
  for (const [index, original] of text.split("\n").entries()) {
    let line = original;
    const marker = markdownFence(line.trim());
    if (activeFence !== undefined) {
      activeFence = closesFence(marker, activeFence) ? undefined : activeFence;
      continue;
    }
    if (marker !== undefined) {
      activeFence = marker.marker;
      continue;
    }
    const remainder = inComment ? stripCommentContinuation(line) : line;
    if (remainder === undefined) continue;
    if (inComment) inComment = false;
    line = remainder;
    const comment = stripInlineComment(line);
    line = comment.line;
    inComment = comment.open;
    if (comment.open) continue;
    if (/^(?: {4}|\t)/u.test(line)) continue;
    result.push({ text: line, number: index + 1 });
  }
  return result;
}

function fieldValue(line: string, label: string): string | undefined {
  const normalized = line
    .trim()
    .replace(/^[-*+]\s+/u, "")
    .replace(/^(?:\*\*|__)/u, "")
    .replaceAll("：", ":");
  if (!normalized.toLowerCase().startsWith(label.toLowerCase()))
    return undefined;
  const suffix = normalized
    .slice(label.length)
    .replace(/^(?:\*\*|__)/u, "")
    .trimStart();
  if (!suffix.startsWith(":")) return undefined;
  return suffix
    .slice(1)
    .trim()
    .replace(/^(?:\*\*|__)/u, "")
    .trim();
}

function collectFields(result: Map<string, string[]>, line: VisibleLine): void {
  for (const label of fieldLabels) {
    const value = fieldValue(line.text, label);
    if (value === undefined) continue;
    const values = result.get(label) ?? [];
    values.push(value);
    result.set(label, values);
  }
}

function fields(
  lines: readonly VisibleLine[],
): ReadonlyMap<string, readonly string[]> {
  const result = new Map<string, string[]>();
  for (const line of lines) collectFields(result, line);
  return result;
}

function isPlaceholder(value: string | undefined): boolean {
  if (value === undefined || value.trim() === "") return true;
  return /\{\{[^}]*\}\}|^(?:tbd|todo|unknown|unresolved|未定|未記入|\?+)$/iu.test(
    value.trim(),
  );
}

function isMeaningful(value: string | undefined): boolean {
  if (isPlaceholder(value)) return false;
  return !/^(?:n\/?a|none|not applicable|なし|不要)(?:\b|\s|[(:：])/iu.test(
    value?.trim() ?? "",
  );
}

function sectionHeading(line: string): string | undefined {
  const match = line.trim().match(/^#{1,6}\s+(C[0-5]\s+[A-Z]+)\s*$/u);
  return match?.[1];
}

function sectionHasTable(
  lines: readonly VisibleLine[],
  heading: string,
): boolean {
  const start = lines.findIndex(
    (line) => sectionHeading(line.text) === heading,
  );
  if (start === -1) return false;
  const boundary = lines.findIndex(
    (line, index) => index > start && sectionHeading(line.text) !== undefined,
  );
  const end = boundary === -1 ? lines.length : boundary;
  const section = lines.slice(start + 1, end).map((line) => line.text.trim());
  const divider = section.findIndex((line) =>
    /^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|$/u.test(line),
  );
  if (divider === -1) return false;
  return section.slice(divider + 1).some((line) => /^\|.*\|$/u.test(line));
}

function parseRegimes(value: string | undefined): RegimeParse {
  if (value === undefined) return { malformed: false, values: [] };
  const values = value.split(",").map((entry) => entry.trim().toLowerCase());
  return {
    malformed: values.some((entry) => entry === ""),
    values: values.filter((entry) => entry !== ""),
  };
}

function inputPath(): Attempt<string> {
  const parsed = cli(
    {
      name: "cli-contract-check.ts",
      parameters: ["<contract>"],
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length !== 1 || parsed._.contract === undefined) {
    return {
      ok: false,
      error: "cli-contract-check.ts requires exactly one contract path",
    };
  }
  return { ok: true, value: parsed._.contract };
}

function reportMachineMode(
  machineMode: string | undefined,
  declared: ReadonlyMap<string, readonly string[]>,
  report: (gate: string, severity: Severity, message: string) => void,
): void {
  if (isMeaningful(machineMode)) {
    for (const label of ["Machine framing", "Machine compatibility"].filter(
      (name) => !isMeaningful(declared.get(name)?.[0]),
    ))
      report(
        "C3",
        "FAIL",
        "machine mode requires a named " + label.toLowerCase(),
      );
  } else if (!/^none$/iu.test(machineMode?.trim() ?? "")) {
    report("C3", "FAIL", "Machine mode must be none or a named mode");
  }
}

async function main(): Promise<void> {
  const path = inputPath();
  if (!path.ok) {
    process.stderr.write("FATAL: " + path.error + "\n");
    process.exitCode = 2;
    return;
  }
  if (!existsSync(path.value)) {
    process.stderr.write(
      "FATAL: contract file not found: " + path.value + "\n",
    );
    process.exitCode = 2;
    return;
  }
  const lines = visibleLines(await Bun.file(path.value).text());
  const declared = fields(lines);
  let failures = 0;
  const report = (gate: string, severity: Severity, message: string): void => {
    process.stdout.write(
      gate + "  " + severity.padEnd(7) + "  " + message + "\n",
    );
    if (severity !== "PASS") failures += 1;
  };

  for (const heading of headings) {
    const occurrences = lines.filter(
      (line) => sectionHeading(line.text) === heading,
    ).length;
    if (occurrences === 0)
      report(heading.slice(0, 2), "MISSING", "required section: " + heading);
    if (occurrences > 1)
      report(heading.slice(0, 2), "FAIL", "duplicate section: " + heading);
    if (occurrences === 1 && !sectionHasTable(lines, heading)) {
      report(
        heading.slice(0, 2),
        "FAIL",
        "nonempty Markdown table required in " + heading,
      );
    }
  }

  for (const label of fieldLabels) {
    const values = declared.get(label) ?? [];
    if (values.length === 0) {
      report("C0", "MISSING", "required field: " + label);
      continue;
    }
    if (values.length > 1) {
      report("C0", "FAIL", "duplicate field: " + label);
      continue;
    }
    if (isPlaceholder(values[0]))
      report("C0", "MISSING", "placeholder value: " + label);
  }

  for (const line of lines) {
    if (/\{\{[^}]*\}\}/u.test(line.text)) {
      report("C0", "FAIL", "visible placeholder at line " + line.number);
    }
  }

  for (const [label, gate] of meaningfulFields) {
    const values = declared.get(label) ?? [];
    if (values.length === 1 && !isMeaningful(values[0])) {
      report(gate, "FAIL", "meaningful value required: " + label);
    }
  }

  const parsedRegimes = parseRegimes(declared.get("Consumer regimes")?.[0]);
  const unknown = parsedRegimes.values.filter(
    (regime) => !consumerRegimes.includes(regime),
  );
  if (parsedRegimes.malformed) {
    report(
      "C0",
      "FAIL",
      "consumer regimes contain an empty comma-separated entry",
    );
  } else if (parsedRegimes.values.length === 0) {
    report(
      "C0",
      "FAIL",
      "consumer regimes must name at least one known regime",
    );
  } else if (unknown.length > 0) {
    report("C0", "FAIL", "unknown consumer regime: " + unknown.join(", "));
  } else {
    report(
      "C0",
      "PASS",
      "consumer regimes: " + parsedRegimes.values.join(", "),
    );
  }

  reportMachineMode(declared.get("Machine mode")?.[0], declared, report);

  process.stdout.write("----\n");
  process.stdout.write(
    "CLI CONTRACT: FAIL=" +
      failures +
      " (structural floor only; does not prove semantics, target behavior, or receipt truth)\n",
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

await main().then(undefined, (error: unknown) => {
  process.stderr.write(
    "FATAL: " + (error instanceof Error ? error.message : String(error)) + "\n",
  );
  process.exitCode = 2;
});
