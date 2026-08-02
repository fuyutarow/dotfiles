import { cli } from "cleye";
import {
  apiError,
  apiSuccess,
  cloudflare,
  diagnostic,
  isRecord,
  nonEmptyString,
  output,
  rejectUnexpectedArguments,
  requiredValue,
  UsageError,
} from "./lib.ts";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError("unknown option '--__proto__'");
  }
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "widget-create.ts",
      parameters: [],
      flags: {
        accountId: nonEmptyString,
        name: nonEmptyString,
        domains: nonEmptyString,
        mode: nonEmptyString,
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  rejectUnexpectedArguments(parsed.unknownFlags, parsed._);
  const values = parsed.flags;
  const accountId = requiredValue(values.accountId, "--account-id");
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
  if (error instanceof UsageError) {
    diagnostic(`widget-create: ${error.message}`);
    process.exit(2);
  }
  diagnostic(
    `widget-create: ${error instanceof Error ? error.message : String(error)}`,
  );
  output({ status: "error", code: 0, message: "unknown" });
  process.exit(1);
});
