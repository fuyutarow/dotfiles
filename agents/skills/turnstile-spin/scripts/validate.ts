import { parseArgs } from "node:util";
import {
  cloudflare,
  diagnostic,
  isRecord,
  output,
  requiredValue,
} from "./lib.ts";

function fail(check: string, detail: string): never {
  diagnostic(`validate: ${detail}`);
  output({ status: "error", check, detail });
  process.exit(1);
}

async function json(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json().catch(() => undefined);
  return isRecord(body) ? body : {};
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      "worker-url": { type: "string" },
      "account-id": { type: "string" },
      sitekey: { type: "string" },
      "expected-domains": { type: "string" },
    },
    strict: true,
  });
  const workerUrl = requiredValue(values["worker-url"], "--worker-url").replace(
    /\/$/,
    "",
  );
  const accountId = requiredValue(values["account-id"], "--account-id");
  const sitekey = requiredValue(values.sitekey, "--sitekey");
  const expectedDomains = requiredValue(
    values["expected-domains"],
    "--expected-domains",
  )
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);

  const health = await fetch(`${workerUrl}/health`);
  const healthBody = await json(health);
  if (!health.ok || healthBody.ok !== true)
    fail("health", "worker /health did not respond ok:true");

  const dummy = await fetch(`${workerUrl}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "XXXX.DUMMY.TOKEN.XXXX" }),
  });
  const dummyBody = await json(dummy);
  if (
    dummyBody.success !== false ||
    !Array.isArray(dummyBody["error-codes"]) ||
    dummyBody["error-codes"].length === 0
  ) {
    fail("dummy_siteverify", "unexpected response shape");
  }
  const worker = isRecord(dummyBody._worker) ? dummyBody._worker : undefined;
  if (typeof worker?.worker_version !== "string")
    fail(
      "worker_metadata",
      "_worker field missing; user may have deployed a custom Worker",
    );

  const widget = await cloudflare(
    `/accounts/${accountId}/challenges/widgets/${sitekey}`,
  );
  const result = isRecord(widget.body.result) ? widget.body.result : {};
  const registered = Array.isArray(result.domains)
    ? result.domains.filter(
        (domain): domain is string => typeof domain === "string",
      )
    : [];
  const missing = expectedDomains.filter(
    (domain) => !registered.includes(domain),
  );
  if (missing.length > 0)
    fail("hostname", `missing domains: ${missing.join(" ")}`);
  output({ status: "ok" });
}

main().catch((error) =>
  fail("health", error instanceof Error ? error.message : String(error)),
);
