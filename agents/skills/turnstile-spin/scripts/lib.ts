import { existsSync } from "node:fs";

export class UsageError extends Error {
  override readonly name = "UsageError";
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "")
    throw new Error(`${name} must be set`);
  return value;
}

export function requiredValue(
  value: string | undefined,
  option: string,
): string {
  if (value === undefined || value === "")
    throw new UsageError(`${option} required`);
  return value;
}

export function nonEmptyString(value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new UsageError("option value required");
  }
  return value;
}

export function rejectUnknownFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag") {
    throw new UsageError(`unknown option '--${flag}'`);
  }
}

export function rejectUnexpectedArguments(
  unknownFlags: Record<string, (string | boolean)[]>,
  positionals: readonly string[],
): void {
  if (Object.getPrototypeOf(unknownFlags) !== Object.prototype) {
    throw new UsageError("unknown option '--__proto__'");
  }
  const unknownFlag = Object.keys(unknownFlags)[0];
  if (unknownFlag !== undefined) {
    throw new UsageError(`unknown option '--${unknownFlag}'`);
  }
  if (positionals.length > 0) {
    throw new UsageError(`unexpected positional argument '${positionals[0]}'`);
  }
}

export function output(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

export function diagnostic(message: string): void {
  process.stderr.write(`${message}\n`);
}

export async function responseJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  return isRecord(body) ? body : {};
}

export async function cloudflare(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: Record<string, unknown> }> {
  const token = requiredEnv("CLOUDFLARE_API_TOKEN");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers,
  });
  return { response, body: await responseJson(response) };
}

export function apiSuccess(body: Record<string, unknown>): boolean {
  return body.success === true;
}

export function apiError(body: Record<string, unknown>): {
  code: number;
  message: string;
} {
  const errors = asRecords(body.errors);
  const first = errors[0];
  return {
    code: typeof first?.code === "number" ? first.code : 0,
    message: typeof first?.message === "string" ? first.message : "unknown",
  };
}

export async function command(
  commandLine: string[],
  cwd?: string,
  stdin?: string,
): Promise<{ exitCode: number; output: string }> {
  // bounded: wrangler/degit calls are bounded operations; timeout hardening tracked in the
  // behavior-hat commit. `< ${new Blob([stdin ?? ""])}` always supplies an explicit stdin
  // source (empty when `stdin` is undefined) so the child never inherits our own real stdin
  // and blocks on it — this reproduces the old `stdin: "ignore"` immediate-EOF guarantee.
  let shell = Bun.$`${commandLine} < ${new Blob([stdin ?? ""])}`
    .quiet()
    .nothrow();
  if (cwd !== undefined) shell = shell.cwd(cwd);
  const { exitCode, stdout, stderr } = await shell;
  return { exitCode, output: `${stdout}${stderr}` };
}

export function requireFile(path: string): void {
  if (!existsSync(path)) throw new Error(`missing expected file: ${path}`);
}
