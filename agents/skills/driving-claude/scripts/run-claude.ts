import { existsSync, statSync } from "node:fs";
import { cli } from "cleye";
import { err, ok, type Result } from "neverthrow";
import { jsonText, z } from "../../../hooks/zod.ts";
import { progressWriter } from "../../driving-codex/scripts/codex-progress.ts";
import { foldClaudeEvent, resultEvent } from "./claude-progress.ts";

let emptyStringFlag: string | undefined;

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stdout.write(
      `${JSON.stringify({ exit_code: 2, error: `Unknown option '--${flag}'` })}\n`,
    );
    process.exit(2);
  }
}

function nonEmptyString(flag: string): (value: string) => string {
  return (value) => {
    if (value === "") emptyStringFlag = flag;
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
  // claude --effort; undefined = the session default (settings effortLevel)
  effort?: string | undefined;
  safeMode: boolean;
  bare: boolean;
  allowedTools?: string | undefined;
  jsonSchema?: string | undefined;
  // When set, claude runs with stream-json and what it is doing is kept in this file (the
  // statusline Run rows read it; agent-router passes it); its `result` event is the answer.
  progressFile?: string | undefined;
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
    ...(config.progressFile === undefined
      ? ["json"]
      : ["stream-json", "--verbose"]),
    "--max-turns",
    String(config.maxTurns),
    "--no-session-persistence",
  ];

  if (config.safeMode) args.push("--safe-mode");
  if (config.bare) args.push("--bare");
  if (config.maxBudgetUsd !== undefined)
    args.push("--max-budget-usd", String(config.maxBudgetUsd));
  if (config.effort !== undefined) args.push("--effort", config.effort);
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

  const progress =
    config.progressFile === undefined
      ? undefined
      : progressWriter(config.progressFile, foldClaudeEvent);
  const [stdout, stderr, exitCode] = await Promise.all([
    progress === undefined
      ? readStream(child.stdout)
      : readLines(child.stdout, progress.feed),
    readStream(child.stderr),
    child.exited,
  ]);
  const timedOut = signal.aborted;
  progress?.flush();
  if (config.progressFile !== undefined) {
    const result = resultEvent(stdout);
    return {
      exitCode: timedOut ? 124 : exitCode,
      timedOut,
      stdout,
      stderr,
      claude: result,
      parseError:
        result === undefined
          ? "no result event in the stream-json output"
          : undefined,
    };
  }

  // A JSON syntax error is a zod issue (never a throw); its message is "not valid JSON: <parser text>"; the prefix is dropped to keep the old parseError.
  const decoded = jsonText.safeParse(stdout);
  const parsed: ParsedStdout = decoded.success
    ? { claude: decoded.data, parseError: undefined }
    : {
        claude: undefined,
        parseError: (decoded.error.issues[0]?.message ?? "").replace(
          /^not valid JSON: /u,
          "",
        ),
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

/** The whole stream as text, handing each complete line to `onLine` as it arrives. */
async function readLines(
  stream: ReadableStream<Uint8Array> | null,
  onLine: (line: string) => void,
): Promise<string> {
  if (stream === null) return "";
  const decoder = new TextDecoder();
  let text = "";
  let pending = "";
  for await (const chunk of stream) {
    const piece = decoder.decode(chunk, { stream: true });
    text += piece;
    const lines = (pending + piece).split("\n");
    pending = lines.pop() ?? "";
    lines.forEach((l) => {
      onLine(l);
    });
  }
  if (pending !== "") onLine(pending);
  return text;
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

function requiredValue(
  value: string | undefined,
  option: string,
): Result<string, Error> {
  if (value === "") return err(new Error(`${option} requires a value`));
  if (value === undefined) {
    return err(new Error(`${option} is required`));
  }
  return ok(value);
}

// Cleye's Number flag parser never throws on malformed input: it hands back a non-finite
// number (NaN/Infinity — surfaces as `null` through JSON.stringify, which is how this was
// first measured) instead of raising, unlike the old hand-rolled `Number(value)` + throw.
// Every Number flag is routed through this null-or-not-positive check before use (W11).
function positiveNumber(
  value: number | null | undefined,
  label: string,
): Result<number, Error> {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value) ||
    value <= 0
  )
    return err(new Error(`${label} must be a positive number`));
  return ok(value);
}

function positiveInteger(
  value: number | null | undefined,
  label: string,
): Result<number, Error> {
  const parsed = positiveNumber(value, label);
  if (parsed.isErr()) return parsed;
  if (!Number.isInteger(parsed.value))
    return err(new Error(`${label} must be an integer`));
  return parsed;
}

function directory(path: string): Result<string, Error> {
  if (!existsSync(path) || !statSync(path).isDirectory())
    return err(new Error(`target is not a directory: ${path}`));
  return ok(path);
}

async function configFromCli(): Promise<Result<RunConfig, Error>> {
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
        effort: nonEmptyString("--effort"),
        maxTurns: String,
        timeoutMs: String,
        maxBudgetUsd: String,
        allowedTools: nonEmptyString("--allowed-tools"),
        jsonSchemaFile: nonEmptyString("--json-schema-file"),
        claudeBin: nonEmptyString("--claude-bin"),
        progressFile: nonEmptyString("--progress-file"),
        safeMode: Boolean,
        bare: Boolean,
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );

  if (emptyStringFlag !== undefined)
    return err(new Error(`${emptyStringFlag} requires a value`));

  if (parsed._.length > 0) {
    return err(
      new Error(
        `Unexpected argument '${parsed._[0]}'. This command does not take positional arguments`,
      ),
    );
  }

  const values = parsed.flags;
  const targetValue = requiredValue(values.target, "--target");
  if (targetValue.isErr()) return err(targetValue.error);
  const target = directory(targetValue.value);
  if (target.isErr()) return err(target.error);
  const promptFileValue = requiredValue(values.promptFile, "--prompt-file");
  if (promptFileValue.isErr()) return err(promptFileValue.error);
  const promptFile = promptFileValue.value;
  if (!existsSync(promptFile))
    return err(new Error(`prompt file does not exist: ${promptFile}`));
  const modelValue = requiredValue(values.model, "--model");
  if (modelValue.isErr()) return err(modelValue.error);
  const model = modelValue.value;
  const permissionMode = values.permissionMode ?? "plan";
  if (!permissionModes.has(permissionMode))
    return err(new Error(`unsupported permission mode: ${permissionMode}`));
  const maxTurnsResult = positiveInteger(
    Number(values.maxTurns ?? "12"),
    "--max-turns",
  );
  if (maxTurnsResult.isErr()) return err(maxTurnsResult.error);
  const timeoutResult = positiveInteger(
    Number(values.timeoutMs ?? "300000"),
    "--timeout-ms",
  );
  if (timeoutResult.isErr()) return err(timeoutResult.error);
  const maxBudgetResult =
    values.maxBudgetUsd === undefined
      ? undefined
      : positiveNumber(Number(values.maxBudgetUsd), "--max-budget-usd");
  if (maxBudgetResult !== undefined && maxBudgetResult.isErr())
    return err(maxBudgetResult.error);
  const jsonSchemaFile = values.jsonSchemaFile;
  const jsonSchema =
    jsonSchemaFile === undefined
      ? undefined
      : await Bun.file(jsonSchemaFile).text();
  const claudeBin = values.claudeBin ?? "claude";
  if (Bun.which(claudeBin) === null)
    return err(new Error(`claude binary is not runnable: ${claudeBin}`));
  const bare = values.bare ?? false;
  const safeMode = values.safeMode ?? false;
  if (bare && safeMode)
    return err(new Error("--bare and --safe-mode are mutually exclusive"));

  const prompt = await Bun.file(promptFile).text();
  return ok({
    target: target.value,
    prompt,
    model,
    permissionMode,
    maxTurns: maxTurnsResult.value,
    timeoutMs: timeoutResult.value,
    ...(maxBudgetResult !== undefined
      ? { maxBudgetUsd: maxBudgetResult.value }
      : {}),
    safeMode,
    bare,
    allowedTools: values.allowedTools,
    ...(values.effort === undefined ? {} : { effort: values.effort }),
    jsonSchema,
    ...(values.progressFile === undefined
      ? {}
      : { progressFile: values.progressFile }),
    claudeBin,
  });
}

async function main(): Promise<void> {
  const configResult = await configFromCli();
  if (configResult.isErr()) {
    process.stdout.write(
      `${JSON.stringify({ exit_code: 2, error: configResult.error.message })}\n`,
    );
    process.exit(2);
  }
  const config = configResult.value;
  const run = await runClaude(config);
  const relay = toRelay(run);
  process.stdout.write(`${JSON.stringify(relay)}\n`);
  let exitCode = run.exitCode;
  if (exitCode === 0 && asRecord(run.claude) !== undefined) exitCode = 0;
  else if (exitCode === 0) exitCode = 1;
  process.exit(exitCode);
}

async function runMain(): Promise<void> {
  await Promise.try(main).then(undefined, (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(
      `${JSON.stringify({ exit_code: 2, error: message })}\n`,
    );
    process.exit(2);
  });
}

if (import.meta.main) await runMain();
