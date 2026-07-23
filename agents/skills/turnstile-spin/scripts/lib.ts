import { existsSync } from "node:fs";

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
    throw new Error(`${option} required`);
  return value;
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
  const child = Bun.spawn(commandLine, {
    cwd,
    stdin: stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (stdin !== undefined && child.stdin !== null) {
    child.stdin.write(stdin);
    child.stdin.end();
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { exitCode, output: `${stdout}${stderr}` };
}

export function requireFile(path: string): void {
  if (!existsSync(path)) throw new Error(`missing expected file: ${path}`);
}
