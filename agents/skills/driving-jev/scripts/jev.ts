import { existsSync } from "node:fs";
import { cli } from "cleye";

// Consumer: machine. Success is one JSON value on stdout; diagnostics stay on stderr.

const officialBaseUrl = "https://api.typesafe.ai";
const maximumDiagnosticChars = 8_000;

type ArgvType = "known-flag" | "unknown-flag" | "argument";
type ExitCode = 2 | 3 | 4 | 5;

class JevCliError extends Error {
  readonly exitCode: ExitCode;

  constructor(exitCode: ExitCode, message: string) {
    super(message);
    this.name = "JevCliError";
    this.exitCode = exitCode;
  }
}

function rejectPrototypeFlag(
  type: ArgvType,
  flag: string,
  _value?: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new Error("unknown option '--__proto__'");
  }
}

function nonEmptyString(flag: string): (value: string) => string {
  return (value) => {
    if (value === "") throw new Error(`${flag} requires a value`);
    return value;
  };
}

function positiveInteger(
  value: number | null | undefined,
  label: string,
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (
    value === null ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    throw new JevCliError(2, `${label} must be a positive integer`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStructuredText(value: unknown): boolean {
  return typeof value === "string" || Array.isArray(value) || isRecord(value);
}

function validateQuestion(id: string, value: unknown): void {
  if (!isRecord(value))
    throw new JevCliError(2, `question '${id}' must be an object`);
  const type = value.type;
  if (type !== "noul" && type !== "choice" && type !== "score") {
    throw new JevCliError(2, `question '${id}' has unsupported type`);
  }
  if (!isStructuredText(value.instructions)) {
    throw new JevCliError(
      2,
      `question '${id}' requires string/object/array instructions`,
    );
  }

  if (type === "choice") {
    if (!isRecord(value.criteria)) {
      throw new JevCliError(
        2,
        `choice question '${id}' requires object criteria`,
      );
    }
    const options = Object.keys(value.criteria);
    if (options.length < 2 || options.length > 255) {
      throw new JevCliError(
        2,
        `choice question '${id}' requires 2..255 options`,
      );
    }
  }

  if (type === "score") {
    if (
      !Array.isArray(value.criteria) ||
      value.criteria.length < 2 ||
      value.criteria.length > 10
    ) {
      throw new JevCliError(
        2,
        `score question '${id}' requires 2..10 ordered levels`,
      );
    }
  }

  if (
    type === "noul" &&
    value.criteria !== undefined &&
    !isRecord(value.criteria)
  ) {
    throw new JevCliError(
      2,
      `noul question '${id}' criteria must be an object when present`,
    );
  }
}

function validateRequest(value: unknown): Record<string, unknown> {
  if (!isRecord(value))
    throw new JevCliError(2, "request must be a JSON object");
  if (!("state" in value) || !isStructuredText(value.state)) {
    throw new JevCliError(2, "request requires string/object/array state");
  }
  if (typeof value.model !== "string" || value.model.trim() === "") {
    throw new JevCliError(2, "request requires an explicit non-empty model");
  }
  if (!isRecord(value.questions) || Object.keys(value.questions).length === 0) {
    throw new JevCliError(2, "request requires a non-empty questions object");
  }
  for (const [id, question] of Object.entries(value.questions))
    validateQuestion(id, question);
  return value;
}

function validateBaseUrl(raw: string, allowCustom: boolean): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new JevCliError(2, "--base-url must be a valid absolute URL");
  }
  const normalized = url.origin;
  if (normalized !== officialBaseUrl && !allowCustom) {
    throw new JevCliError(
      2,
      "custom --base-url requires --allow-custom-base-url",
    );
  }
  const isLoopback =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    throw new JevCliError(
      2,
      "--base-url requires HTTPS except for loopback testing",
    );
  }
  return url;
}

async function readRequest(path: string): Promise<Record<string, unknown>> {
  if (path === "-") {
    if (process.stdin.isTTY)
      throw new JevCliError(2, "request '-' requires non-interactive stdin");
    const text = await new Response(Bun.stdin.stream()).text();
    return parseRequestJson(text);
  }
  if (!existsSync(path))
    throw new JevCliError(2, `request file not found: ${path}`);
  return parseRequestJson(await Bun.file(path).text());
}

function parseRequestJson(text: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JevCliError(2, `request is not valid JSON: ${message}`);
  }
  return validateRequest(parsed);
}

function boundedDiagnostic(text: string): string {
  const compact = text.replaceAll("\n", " ").trim();
  return compact.length <= maximumDiagnosticChars
    ? compact
    : `${compact.slice(0, maximumDiagnosticChars)} [truncated: ${compact.length} chars]`;
}

function providerExit(status: number): ExitCode {
  if (status === 401 || status === 403) return 3;
  if (status === 429 || status === 529) return 4;
  return 5;
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "jev.ts",
      parameters: ["<request>"],
      flags: {
        timeoutMs: Number,
        baseUrl: nonEmptyString("--base-url"),
        allowCustomBaseUrl: Boolean,
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );

  if (parsed._.length !== 1 || parsed._.request === undefined) {
    throw new JevCliError(2, "exactly one request path or '-' is required");
  }
  const timeoutMs = positiveInteger(
    parsed.flags.timeoutMs,
    "--timeout-ms",
    15_000,
  );
  const baseUrl = validateBaseUrl(
    parsed.flags.baseUrl ?? officialBaseUrl,
    parsed.flags.allowCustomBaseUrl ?? false,
  );
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    throw new JevCliError(2, "TYPESAFE_API_KEY is not set");
  }
  const request = await readRequest(parsed._.request);
  const endpoint = new URL("/v1/systemone", baseUrl);
  const signal = AbortSignal.timeout(timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal,
    });
  } catch (error) {
    const message = signal.aborted
      ? `request timed out after ${timeoutMs} ms`
      : `network request failed: ${error instanceof Error ? error.message : String(error)}`;
    throw new JevCliError(4, message);
  }

  const body = await response.text();
  if (!response.ok) {
    throw new JevCliError(
      providerExit(response.status),
      `provider HTTP ${response.status}: ${boundedDiagnostic(body)}`,
    );
  }

  let result: unknown;
  try {
    result = JSON.parse(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new JevCliError(5, `provider returned invalid JSON: ${message}`);
  }
  if (
    !isRecord(result) ||
    typeof result.model !== "string" ||
    !isRecord(result.answers) ||
    !isRecord(result.usage)
  ) {
    throw new JevCliError(
      5,
      "provider response is missing model, answers, or usage",
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error) => {
  const exitCode = error instanceof JevCliError ? error.exitCode : 2;
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`FATAL: ${boundedDiagnostic(message)}\n`);
  process.exit(exitCode);
});
