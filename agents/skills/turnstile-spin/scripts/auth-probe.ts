import {
  apiSuccess,
  asRecords,
  cloudflare,
  diagnostic,
  isRecord,
  output,
} from "./lib.ts";

async function main(): Promise<void> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (token === undefined || token === "") {
    diagnostic("auth-probe: $CLOUDFLARE_API_TOKEN is not set.");
    output({ status: "missing_token", reason: "no_env_var" });
    return;
  }

  const whoami = Bun.spawn(["bunx", "wrangler", "whoami", "--json"], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([
    new Response(whoami.stdout).text(),
    whoami.exited,
  ]);
  let body: unknown;
  try {
    body = JSON.parse(stdout);
  } catch {
    body = undefined;
  }
  if (exitCode !== 0 || !isRecord(body)) {
    diagnostic(
      "auth-probe: wrangler whoami returned no JSON. Token may be invalid or expired.",
    );
    output({ status: "missing_token", reason: "whoami_failed" });
    return;
  }
  const accounts = asRecords(body.accounts);
  if (accounts.length === 0) {
    diagnostic(
      "auth-probe: wrangler whoami succeeded but no accounts found on the token.",
    );
    output({ status: "missing_token", reason: "no_accounts" });
    return;
  }
  const declared = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accountIds = accounts
    .map((account) => account.id)
    .filter((id): id is string => typeof id === "string");
  if (declared !== undefined && !accountIds.includes(declared)) {
    diagnostic(
      `auth-probe: $CLOUDFLARE_ACCOUNT_ID (${declared}) is not one of the token's accounts.`,
    );
    output({ status: "account_mismatch", declared, accounts });
    return;
  }
  if (declared === undefined && accounts.length !== 1) {
    diagnostic(
      `auth-probe: token covers ${accounts.length} accounts; ask the user to pick one, then export $CLOUDFLARE_ACCOUNT_ID and re-run.`,
    );
    output({ status: "multiple_accounts", accounts });
    return;
  }
  const accountId = declared ?? accountIds[0];
  if (accountId === undefined) throw new Error("account response has no id");

  const widgets = await cloudflare(`/accounts/${accountId}/challenges/widgets`);
  if (!apiSuccess(widgets.body)) {
    diagnostic(
      `auth-probe: token cannot read /challenges/widgets on account ${accountId} (HTTP ${widgets.response.status}). Missing Account.Turnstile:Edit.`,
    );
    output({
      status: "missing_scope",
      account_id: accountId,
      http_code: widgets.response.status,
    });
    return;
  }
  const workers = await cloudflare(`/accounts/${accountId}/workers/scripts`);
  if (!apiSuccess(workers.body)) {
    diagnostic(
      `auth-probe: token cannot read /workers/scripts on account ${accountId} (HTTP ${workers.response.status}). Missing Account.Workers Scripts:Edit.`,
    );
    output({
      status: "missing_workers_scope",
      account_id: accountId,
      http_code: workers.response.status,
    });
    return;
  }
  output({ status: "ok", account_id: accountId, accounts });
}

main().catch((error) => {
  diagnostic(
    `auth-probe: ${error instanceof Error ? error.message : String(error)}`,
  );
  output({ status: "missing_token", reason: "whoami_failed" });
});
