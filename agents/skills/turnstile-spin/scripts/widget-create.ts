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
    options: {
      "account-id": { type: "string" },
      name: { type: "string" },
      domains: { type: "string" },
      mode: { type: "string" },
    },
    strict: true,
  });
  const accountId = requiredValue(values["account-id"], "--account-id");
  const name = requiredValue(values.name, "--name");
  const domains = requiredValue(values.domains, "--domains")
    .split(",")
    .map((domain) => domain.trim())
    .filter(Boolean);
  const mode = values.mode ?? "managed";
  const { body } = await cloudflare(
    `/accounts/${accountId}/challenges/widgets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, domains, mode }),
    },
  );
  const result = isRecord(body.result) ? body.result : {};
  if (
    apiSuccess(body) &&
    typeof result.sitekey === "string" &&
    typeof result.secret === "string"
  ) {
    output({ status: "ok", sitekey: result.sitekey, secret: result.secret });
    return;
  }
  const error = apiError(body);
  diagnostic(`widget-create: failed (code=${error.code}): ${error.message}`);
  output({ status: "error", code: error.code, message: error.message });
  process.exit(1);
}

main().catch((error) => {
  diagnostic(
    `widget-create: ${error instanceof Error ? error.message : String(error)}`,
  );
  output({ status: "error", code: 0, message: "unknown" });
  process.exit(1);
});
