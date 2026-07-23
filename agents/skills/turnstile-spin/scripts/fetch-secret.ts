import { parseArgs } from "node:util";
import {
  apiError,
  apiSuccess,
  cloudflare,
  diagnostic,
  isRecord,
  output,
  requiredValue,
} from "./lib.ts";

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: { "account-id": { type: "string" }, sitekey: { type: "string" } },
    strict: true,
  });
  const accountId = requiredValue(values["account-id"], "--account-id");
  const sitekey = requiredValue(values.sitekey, "--sitekey");
  const { response, body } = await cloudflare(
    `/accounts/${accountId}/challenges/widgets/${sitekey}`,
  );
  const result = isRecord(body.result) ? body.result : {};
  const secret = typeof result.secret === "string" ? result.secret : undefined;
  if (response.status === 200 && secret !== undefined && secret !== "") {
    output({
      status: "ok",
      secret,
      clearance_level:
        typeof result.clearance_level === "string"
          ? result.clearance_level
          : "no_clearance",
      domains: Array.isArray(result.domains) ? result.domains : [],
    });
    return;
  }
  if (response.status === 403 && apiError(body).code === 10_000) {
    diagnostic(
      "fetch-secret: token can edit Turnstile widgets but cannot read this one's secret.",
    );
    diagnostic(
      "fetch-secret: add Account.Turnstile:Read to the token, or fall back to user paste.",
    );
    output({
      status: "missing_read_scope",
      detail: "token lacks Account.Turnstile:Read",
    });
    process.exit(1);
  }
  diagnostic(`fetch-secret: widget lookup failed (HTTP ${response.status}).`);
  output({
    status: "error",
    reason: "widget_not_found",
    http_code: response.status,
    api_success: apiSuccess(body),
  });
  process.exit(1);
}

main().catch((error) => {
  diagnostic(
    `fetch-secret: ${error instanceof Error ? error.message : String(error)}`,
  );
  output({ status: "error", reason: "widget_not_found" });
  process.exit(1);
});
