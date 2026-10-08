// The one way agent-dispatch reaches Jev (TypeSafe System One, or the reseller in front of it): the
// routing pick, the grade and `ask` all POST through here. One home for the key lookup, the time
// bound, the failure reasons and the trace that runs.jsonl keeps — before 2026-10-06 the same
// transport was written twice (here and a separate jev CLI, now retired) and the two drifted (key
// sources, reasons). What a caller asks and how it reads the answer stay with the caller.
import { attempt } from "../../shared/src/attempt.ts";
import { typesafeKey } from "../../shared/src/typesafe-key.ts";

/** What runs.jsonl keeps about one Jev call (never the key). */
export interface JevTrace {
  endpoint: string;
  request: unknown;
  key_source?: string;
  status?: number;
  response?: unknown;
  error?: string;
  latency_ms: number;
}

/** ok = an HTTP answer arrived (any status; the caller judges it); otherwise why none did. */
export type JevPost =
  | { ok: true; status: number; text: string; trace: JevTrace }
  | { ok: false; reason: string; trace: JevTrace };

function errorDetail(error: unknown, depth = 0): string {
  if (depth > 3) return "";
  if (error instanceof Error)
    return [
      error.name,
      error.message,
      error.cause === undefined ? "" : errorDetail(error.cause, depth + 1),
    ]
      .filter((part) => part !== "")
      .join(" ");
  return String(error);
}

function transportFailure(error: unknown): string {
  const detail = errorDetail(error);
  const normalized = detail.toLowerCase();
  if (normalized.includes("timeout") || normalized.includes("timed out"))
    return "timeout";
  if (
    normalized.includes("enotfound") ||
    normalized.includes("eai_again") ||
    normalized.includes("getaddrinfo")
  )
    return "DNS lookup failed";
  if (
    normalized.includes("econnreset") ||
    normalized.includes("connection reset")
  )
    return "connection reset";
  if (normalized.includes("socket") && normalized.includes("closed"))
    return "connection closed";
  if (normalized.includes("abort")) return "timeout or aborted request";
  return error instanceof Error
    ? `network error (${error.name})`
    : "network error";
}

/** POST `request` to `url` with the TypeSafe key, bounded by `timeoutMs`. */
export async function postJev(
  url: string,
  request: unknown,
  timeoutMs: number,
): Promise<JevPost> {
  const trace: JevTrace = { endpoint: url, request, latency_ms: 0 };
  const key = typesafeKey();
  if (!key.ok)
    return { ok: false, reason: `jev unavailable: ${key.reason}`, trace };
  trace.key_source = key.source;
  const started = performance.now();
  const res = await attempt(() =>
    fetch(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key.key}`,
        "content-type": "application/json",
        // Jev's gateway can close idle keep-alive sockets. Avoid reusing one so a stale
        // pooled connection cannot hide the HTTP status that the server sent.
        connection: "close",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs),
    }),
  );
  if (!res.ok) {
    trace.latency_ms = Math.round(performance.now() - started);
    trace.error = transportFailure(res.error);
    return { ok: false, reason: `jev transport failed: ${trace.error}`, trace };
  }
  trace.status = res.value.status;
  const body = await attempt(() => res.value.text());
  trace.latency_ms = Math.round(performance.now() - started);
  if (!body.ok) {
    trace.error = transportFailure(body.error);
    return {
      ok: false,
      reason: `jev HTTP ${res.value.status}; response body failed: ${trace.error}`,
      trace,
    };
  }
  const text = body.value.replaceAll(key.key, "[REDACTED]");
  return { ok: true, status: res.value.status, text, trace };
}
