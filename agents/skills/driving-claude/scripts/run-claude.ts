import { existsSync, statSync } from "node:fs";
import { parseArgs } from "node:util";

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
  maxBudgetUsd?: number;
  safeMode: boolean;
  bare: boolean;
  allowedTools?: string;
  jsonSchema?: string;
  claudeBin: string;
}>;

export type RunResult = Readonly<{
  exitCode: number;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  claude: unknown | undefined;
  parseError: string | undefined;
}>;

type Relay = Readonly<{
  exit_code: number;
  timed_out: boolean;
  result?: string;
  session_id?: string | number | boolean | null;
  total_cost_usd?: string | number | boolean | null;
  usage?: unknown;
  structured_output?: unknown;
  stdout?: string;
  stderr?: string;
  parse_error?: string;
}>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

  let claude: unknown | undefined;
  let parseError: string | undefined;
  try {
    claude = JSON.parse(stdout);
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }

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
  if (!isRecord(run.claude)) {
    return {
      exit_code: run.exitCode,
      timed_out: run.timedOut,
      stdout: boundedText(run.stdout),
      stderr: boundedText(run.stderr),
      parse_error: run.parseError,
    };
  }

  const result = run.claude.result;
  return {
    exit_code: run.exitCode,
    timed_out: run.timedOut,
    result: typeof result === "string" ? boundedText(result) : undefined,
    session_id: primitive(run.claude.session_id),
    total_cost_usd: primitive(run.claude.total_cost_usd),
    usage: boundedJson(run.claude.usage),
    structured_output: boundedJson(run.claude.structured_output),
    stderr: boundedText(run.stderr),
  };
}

function requiredValue(value: string | undefined, option: string): string {
  if (value === undefined || value === "") {
    throw new Error(`${option} is required`);
  }
  return value;
}

function positiveNumber(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0)
    throw new Error(`${label} must be a positive number`);
  return parsed;
}

function positiveInteger(value: string, label: string): number {
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
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      target: { type: "string" },
      "prompt-file": { type: "string" },
      model: { type: "string" },
      "permission-mode": { type: "string" },
      "max-turns": { type: "string" },
      "timeout-ms": { type: "string" },
      "max-budget-usd": { type: "string" },
      "allowed-tools": { type: "string" },
      "json-schema-file": { type: "string" },
      "claude-bin": { type: "string" },
      "safe-mode": { type: "boolean" },
      bare: { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  });
  const target = directory(requiredValue(values.target, "--target"));
  const promptFile = requiredValue(values["prompt-file"], "--prompt-file");
  if (!existsSync(promptFile))
    throw new Error(`prompt file does not exist: ${promptFile}`);
  const model = requiredValue(values.model, "--model");
  const permissionMode = values["permission-mode"] ?? "plan";
  if (!permissionModes.has(permissionMode))
    throw new Error(`unsupported permission mode: ${permissionMode}`);
  const maxTurns =
    values["max-turns"] === undefined
      ? 12
      : positiveInteger(values["max-turns"], "--max-turns");
  const timeoutMs =
    values["timeout-ms"] === undefined
      ? 300_000
      : positiveInteger(values["timeout-ms"], "--timeout-ms");
  const maxBudgetUsd =
    values["max-budget-usd"] === undefined
      ? undefined
      : positiveNumber(values["max-budget-usd"], "--max-budget-usd");
  const jsonSchemaFile = values["json-schema-file"];
  const jsonSchema =
    jsonSchemaFile === undefined
      ? undefined
      : await Bun.file(jsonSchemaFile).text();
  const claudeBin = values["claude-bin"] ?? "claude";
  if (Bun.which(claudeBin) === null)
    throw new Error(`claude binary is not runnable: ${claudeBin}`);
  const bare = values.bare ?? false;
  const safeMode = values["safe-mode"] ?? false;
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
    allowedTools: values["allowed-tools"],
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
    run.exitCode === 0 && isRecord(run.claude) ? 0 : run.exitCode || 1,
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
