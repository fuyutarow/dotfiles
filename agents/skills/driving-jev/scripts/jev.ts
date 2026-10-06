import { existsSync } from "node:fs";
import { cli } from "cleye";
import { jsonText, z } from "../../../hooks/zod.ts";

// Consumer: machine. Success is one JSON value on stdout; diagnostics stay on stderr.

const officialBaseUrl = "https://api.typesafe.ai";
const maximumDiagnosticChars = 8_000;

type ExitCode = 2 | 3 | 4 | 5;
type Outcome<T> = { ok: true; value: T } | { ok: false; error: JevCliError };
const success = <T>(value: T): Outcome<T> => ({ ok: true, value });
const failure = (message: string, exitCode: ExitCode = 2): Outcome<never> => ({
  ok: false,
  error: new JevCliError(exitCode, message),
});

class JevCliError extends Error {
  readonly exitCode: ExitCode;

  constructor(exitCode: ExitCode, message: string) {
    super(message);
    this.name = "JevCliError";
    this.exitCode = exitCode;
  }
}

function positiveInteger(
  value: number | null | undefined,
  label: string,
  fallback: number,
): Outcome<number> {
  if (value === undefined) return success(fallback);
  if (
    value === null ||
    !Number.isFinite(value) ||
    !Number.isInteger(value) ||
    value <= 0
  ) {
    return failure(`${label} must be a positive integer`);
  }
  return success(value);
}

const RecordSchema = z.record(z.string(), z.unknown());

function asRecord(value: unknown): Record<string, unknown> | undefined {
  const parsed = RecordSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function isStructuredText(value: unknown): boolean {
  return (
    typeof value === "string" ||
    Array.isArray(value) ||
    asRecord(value) !== undefined
  );
}

function validateQuestion(id: string, question: unknown): Outcome<void> {
  const value = asRecord(question);
  if (value === undefined) return failure(`question '${id}' must be an object`);
  const type = value.type;
  if (type !== "noul" && type !== "choice" && type !== "score") {
    return failure(`question '${id}' has unsupported type`);
  }
  if (!isStructuredText(value.instructions)) {
    return failure(
      `question '${id}' requires string/object/array instructions`,
    );
  }

  if (type === "choice") {
    const criteria = asRecord(value.criteria);
    if (criteria === undefined) {
      return failure(`choice question '${id}' requires object criteria`);
    }
    const options = Object.keys(criteria);
    if (options.length < 2 || options.length > 255) {
      return failure(`choice question '${id}' requires 2..255 options`);
    }
  }

  if (
    type === "score" &&
    (!Array.isArray(value.criteria) ||
      value.criteria.length < 2 ||
      value.criteria.length > 10)
  ) {
    return failure(`score question '${id}' requires 2..10 ordered levels`);
  }

  if (
    type === "noul" &&
    value.criteria !== undefined &&
    asRecord(value.criteria) === undefined
  ) {
    return failure(
      `noul question '${id}' criteria must be an object when present`,
    );
  }
  return success(undefined);
}

// Returns the original parsed value (not the zod copy): it is forwarded verbatim to the provider.
function validateRequest(raw: unknown): Outcome<unknown> {
  const value = asRecord(raw);
  if (value === undefined) return failure("request must be a JSON object");
  if (!isStructuredText(value.state)) {
    return failure("request requires string/object/array state");
  }
  if (typeof value.model !== "string" || value.model.trim() === "") {
    return failure("request requires an explicit non-empty model");
  }
  const questions = asRecord(value.questions);
  if (questions === undefined || Object.keys(questions).length === 0) {
    return failure("request requires a non-empty questions object");
  }
  for (const [id, question] of Object.entries(questions)) {
    const checked = validateQuestion(id, question);
    if (!checked.ok) return checked;
  }
  return success(raw);
}

function validateBaseUrl(raw: string, allowCustom: boolean): Outcome<URL> {
  if (!URL.canParse(raw)) {
    return failure("--base-url must be a valid absolute URL");
  }
  const url = new URL(raw);
  const normalized = url.origin;
  if (normalized !== officialBaseUrl && !allowCustom) {
    return failure("custom --base-url requires --allow-custom-base-url");
  }
  const isLoopback =
    url.hostname === "127.0.0.1" ||
    url.hostname === "localhost" ||
    url.hostname === "::1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
    return failure("--base-url requires HTTPS except for loopback testing");
  }
  return success(url);
}

async function readRequest(path: string): Promise<Outcome<unknown>> {
  if (path === "-") {
    if (process.stdin.isTTY)
      return failure("request '-' requires non-interactive stdin");
    const text = await new Response(Bun.stdin.stream()).text();
    return parseRequestJson(text);
  }
  if (!existsSync(path)) return failure(`request file not found: ${path}`);
  return parseRequestJson(await Bun.file(path).text());
}

function parseRequestJson(text: string): Outcome<unknown> {
  const decoded = jsonText.safeParse(text);
  if (!decoded.success) {
    const message = (decoded.error.issues[0]?.message ?? "").replace(
      /^not valid JSON: /u,
      "",
    );
    return failure(`request is not valid JSON: ${message}`);
  }
  const parsed = decoded.data;
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

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

async function main(): Promise<Outcome<void>> {
  const parsed = cli(
    {
      name: "jev.ts",
      parameters: ["<request>"],
      flags: {
        timeoutMs: Number,
        baseUrl: String,
        allowCustomBaseUrl: Boolean,
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed.flags.baseUrl === "")
    return failure("--base-url requires a value");

  if (parsed._.length !== 1 || parsed._.request === undefined) {
    return failure("exactly one request path or '-' is required");
  }
  const timeoutResult = positiveInteger(
    parsed.flags.timeoutMs,
    "--timeout-ms",
    15_000,
  );
  if (!timeoutResult.ok) return timeoutResult;
  const baseUrlResult = validateBaseUrl(
    parsed.flags.baseUrl ?? officialBaseUrl,
    parsed.flags.allowCustomBaseUrl ?? false,
  );
  if (!baseUrlResult.ok) return baseUrlResult;
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (apiKey === undefined || apiKey === "") {
    return failure("TYPESAFE_API_KEY is not set");
  }
  const requestResult = await readRequest(parsed._.request);
  if (!requestResult.ok) return requestResult;
  const endpoint = new URL("/v1/systemone", baseUrlResult.value);
  const timeoutMs = timeoutResult.value;
  const signal = AbortSignal.timeout(timeoutMs);

  const responseResult = await Promise.try(() =>
    fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestResult.value),
      signal,
    }),
  ).then(
    (value): Outcome<Response> => success(value),
    (error: unknown): Outcome<Response> => {
      if (signal.aborted)
        return failure(`request timed out after ${timeoutMs} ms`, 4);
      const detail = error instanceof Error ? error.message : String(error);
      return failure(`network request failed: ${detail}`, 4);
    },
  );
  if (!responseResult.ok) return responseResult;
  const response = responseResult.value;

  const bodyResult = await Promise.try(() => response.text()).then(
    (value): Outcome<string> => success(value),
    (error: unknown): Outcome<string> =>
      failure(error instanceof Error ? error.message : String(error), 4),
  );
  if (!bodyResult.ok) return bodyResult;
  const body = bodyResult.value;
  if (!response.ok) {
    return failure(
      `provider HTTP ${response.status}: ${boundedDiagnostic(body)}`,
      providerExit(response.status),
    );
  }

  const decodedResult = jsonText.safeParse(body);
  if (!decodedResult.success) {
    const message = (decodedResult.error.issues[0]?.message ?? "").replace(
      /^not valid JSON: /u,
      "",
    );
    return failure(`provider returned invalid JSON: ${message}`, 5);
  }
  const result = decodedResult.data;
  const resultRecord = asRecord(result);
  if (
    resultRecord === undefined ||
    typeof resultRecord.model !== "string" ||
    asRecord(resultRecord.answers) === undefined ||
    asRecord(resultRecord.usage) === undefined
  ) {
    return failure("provider response is missing model, answers, or usage", 5);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return success(undefined);
}

const outcome = await Promise.try(main).then(
  (value) => value,
  (error: unknown): Outcome<void> =>
    failure(error instanceof Error ? error.message : String(error)),
);
if (!outcome.ok) {
  const exitCode = outcome.error.exitCode;
  const message = outcome.error.message;
  process.stderr.write(`FATAL: ${boundedDiagnostic(message)}\n`);
  process.exit(exitCode);
}
