import { existsSync, statSync } from "node:fs";
import { cli } from "cleye";
import { jsonText, z } from "../../../hooks/zod.ts";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error(`Unknown option '--${flag}'`);
  }
}

function nonEmptyString(flag: string): (value: string) => string {
  return (value) => {
    if (value === "") throw new Error(`${flag} requires a value`);
    return value;
  };
}

const permissionModes = new Set([
  "acceptEdits",
  "auto",
  "bypassPermissions",
  "manual",
  "dontAsk",
  "plan",
]);

const relayTextLimit = 16_000;
const relayJsonLimit = 32_000;

export type RunConfig = Readonly<{
  target: string;
  prompt: string;
  model: string;
  permissionMode: string;
  maxTurns: number;
  timeoutMs: number;
  maxBudgetUsd?: number | undefined;
  safeMode: boolean;
  bare: boolean;
  allowedTools?: string | undefined;
  jsonSchema?: string | undefined;
  claudeBin: string;
}>;

export type RunResult = Readonly<{
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  claude: unknown;
  parseError: string | undefined;
}>;

type Relay = Readonly<{
  exit_code: number;
  timed_out: boolean;
  result?: string | undefined;
  session_id?: string | number | boolean | null | undefined;
  total_cost_usd?: string | number | boolean | null | undefined;
  usage?: unknown;
  structured_output?: unknown;
  stdout?: string | undefined;
  stderr?: string | undefined;
  parse_error?: string | undefined;
}>;

const RecordSchema = z.record(z.string(), z.unknown());

/** The value as a plain string-keyed record, or undefined for any other JSON shape. */
export function asRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = RecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

type ParsedStdout = Readonly<{
  claude: unknown;
  parseError: string | undefined;
}>;

export async function runClaude(config: RunConfig): Promise<RunResult> {
  const args = [
    "-p",
    config.prompt,
    "--model",
    config.model,
    "--permission-mode",
    config.permissionMode,
    "--output-format",
    "json",
    "--max-turns",
    String(config.maxTurns),
    "--no-session-persistence",
  ];

  if (config.safeMode) args.push("--safe-mode");
  if (config.bare) args.push("--bare");
  if (config.maxBudgetUsd !== undefined)
    args.push("--max-budget-usd", String(config.maxBudgetUsd));
  if (config.allowedTools !== undefined)
    args.push("--allowed-tools", config.allowedTools);
  if (config.jsonSchema !== undefined)
    args.push("--json-schema", config.jsonSchema);

  const signal = AbortSignal.timeout(config.timeoutMs);
  const child = Bun.spawn([config.claudeBin, ...args], {
    cwd: config.target,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal: signal,
    killSignal: "SIGTERM",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    readStream(child.stdout),
    readStream(child.stderr),
    child.exited,
  ]);
  const timedOut = signal.aborted;

  // A JSON syntax error is a zod issue (never a throw); its message is "not valid JSON: <parser text>"; the prefix is dropped to keep the old parseError.
  const decoded = jsonText.safeParse(stdout);
  const parsed: ParsedStdout = decoded.success
    ? { claude: decoded.data, parseError: undefined }
    : {
        claude: undefined,
        parseError: (decoded.error.issues[0]?.message ?? "").replace(/^not valid JSON: /, ""),
      };
  const claude = parsed.claude;
  const parseError = parsed.parseError;

  return {
    exitCode: timedOut ? 124 : exitCode,
    timedOut,
    stdout,
    stderr,
    claude,
    parseError,
  };
}

function readStream(
  stream: ReadableStream<Uint8Array> | null,
): Promise<string> {
  return stream === null ? Promise.resolve("") : new Response(stream).text();
}

function boundedText(value: string): string {
  if (value.length <= relayTextLimit) return value;
  return `${value.slice(0, relayTextLimit)}\n[truncated: ${value.length} chars total]`;
}

function boundedJson(value: unknown): unknown {
  if (value === undefined) return undefined;
  const encoded = JSON.stringify(value);
  if (encoded.length <= relayJsonLimit) return value;
  return { truncated: true, chars: encoded.length };
}

function primitive(
  value: unknown,
): string | number | boolean | null | undefined {
  return typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
    ? value
    : undefined;
}

export function toRelay(run: RunResult): Relay {
  const claude = asRecord(run.claude);
  if (claude === undefined) {
    return {
      exit_code: run.exitCode,
      timed_out: run.timedOut,
      stdout: boundedText(run.stdout),
      stderr: boundedText(run.stderr),
      parse_error: run.parseError,
    };
  }

  const result = claude.result;
  return {
    exit_code: run.exitCode,
    timed_out: run.timedOut,
    result: typeof result === "string" ? boundedText(result) : undefined,
    session_id: primitive(claude.session_id),
    total_cost_usd: primitive(claude.total_cost_usd),
    usage: boundedJson(claude.usage),
    structured_output: boundedJson(claude.structured_output),
    stderr: boundedText(run.stderr),
  };
}

function requiredValue(value: string | undefined, option: string): string {
  if (value === undefined || value === "") {
    throw new Error(`${option} is required`);
  }
  return value;
}

// Cleye's Number flag parser never throws on malformed input: it hands back a non-finite
// number (NaN/Infinity — surfaces as `null` through JSON.stringify, which is how this was
// first measured) instead of raising, unlike the old hand-rolled `Number(value)` + throw.
// Every Number flag is routed through this null-or-not-positive check before use (W11).
function positiveNumber(
  value: number | null | undefined,
  label: string,
): number {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value) ||
    value <= 0
  )
    throw new Error(`${label} must be a positive number`);
  return value;
}

function positiveInteger(
  value: number | null | undefined,
  label: string,
): number {
  const parsed = positiveNumber(value, label);
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`);
  return parsed;
}

function directory(path: string): string {
  if (!existsSync(path) || !statSync(path).isDirectory())
    throw new Error(`target is not a directory: ${path}`);
  return path;
}

async function configFromCli(): Promise<RunConfig> {
  // Schema keys are camelCase; Cleye accepts the kebab-case spelling on the command
  // line (e.g. `promptFile` here is set by `--prompt-file`) — the CLI spelling is unchanged.
  const parsed = cli(
    {
      name: "run-claude.ts",
      parameters: [],
      flags: {
        target: nonEmptyString("--target"),
        promptFile: nonEmptyString("--prompt-file"),
        model: nonEmptyString("--model"),
        permissionMode: nonEmptyString("--permission-mode"),
        maxTurns: Number,
        timeoutMs: Number,
        maxBudgetUsd: Number,
        allowedTools: nonEmptyString("--allowed-tools"),
        jsonSchemaFile: nonEmptyString("--json-schema-file"),
        claudeBin: nonEmptyString("--claude-bin"),
        safeMode: Boolean,
        bare: Boolean,
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );

  if (parsed._.length > 0) {
    throw new Error(
      `Unexpected argument '${parsed._[0]}'. This command does not take positional arguments`,
    );
  }

  const values = parsed.flags;
  const target = directory(requiredValue(values.target, "--target"));
  const promptFile = requiredValue(values.promptFile, "--prompt-file");
  if (!existsSync(promptFile))
    throw new Error(`prompt file does not exist: ${promptFile}`);
  const model = requiredValue(values.model, "--model");
  const permissionMode = values.permissionMode ?? "plan";
  if (!permissionModes.has(permissionMode))
    throw new Error(`unsupported permission mode: ${permissionMode}`);
  const maxTurns = positiveInteger(values.maxTurns ?? 12, "--max-turns");
  const timeoutMs = positiveInteger(values.timeoutMs ?? 300_000, "--timeout-ms");
  const maxBudgetUsd =
    values.maxBudgetUsd === undefined
      ? undefined
      : positiveNumber(values.maxBudgetUsd, "--max-budget-usd");
  const jsonSchemaFile = values.jsonSchemaFile;
  const jsonSchema =
    jsonSchemaFile === undefined
      ? undefined
      : await Bun.file(jsonSchemaFile).text();
  const claudeBin = values.claudeBin ?? "claude";
  if (Bun.which(claudeBin) === null)
    throw new Error(`claude binary is not runnable: ${claudeBin}`);
  const bare = values.bare ?? false;
  const safeMode = values.safeMode ?? false;
  if (bare && safeMode)
    throw new Error("--bare and --safe-mode are mutually exclusive");

  return {
    target,
    prompt: await Bun.file(promptFile).text(),
    model,
    permissionMode,
    maxTurns,
    timeoutMs,
    maxBudgetUsd,
    safeMode,
    bare,
    allowedTools: values.allowedTools,
    jsonSchema,
    claudeBin,
  };
}

async function main(): Promise<void> {
  const config = await configFromCli();
  const run = await runClaude(config);
  const relay = toRelay(run);
  process.stdout.write(`${JSON.stringify(relay)}\n`);
  process.exit(
    run.exitCode === 0 && asRecord(run.claude) !== undefined ? 0 : run.exitCode || 1,
  );
}

if (import.meta.main) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      `${JSON.stringify({ exit_code: 2, error: message })}\n`,
    );
    process.exit(2);
  });
}
