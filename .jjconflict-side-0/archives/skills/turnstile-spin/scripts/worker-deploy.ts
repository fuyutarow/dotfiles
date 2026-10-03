import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { cli } from "cleye";
import {
  command,
  diagnostic,
  nonEmptyString,
  output,
  rejectUnexpectedArguments,
  requiredEnv,
  UsageError,
} from "./lib.ts";

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    throw new UsageError("unknown option '--__proto__'");
  }
}

function randomSuffix(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(3)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

function workerUrl(log: string): string | undefined {
  const workersDev = log.match(/https:\/\/[a-zA-Z0-9._-]+\.workers\.dev/)?.[0];
  if (workersDev !== undefined) return workersDev;
  return log
    .match(/https:\/\/[a-zA-Z0-9.-]+(?:\/[^\s]*)?/g)
    ?.find((url) => !/cloudflare\.com|workers-sdk|github\.com/.test(url));
}

async function deploy(
  name: string,
  directory: string,
): Promise<{ exitCode: number; output: string }> {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const extract = await command([
    "bunx",
    "--yes",
    "degit@3.6.1",
    "cloudflare/skills/skills/turnstile-spin/templates/worker",
    directory,
  ]);
  if (extract.exitCode !== 0) return extract;
  return command(
    ["bunx", "wrangler@4.113.0", "deploy", "--name", name],
    directory,
  );
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "worker-deploy.ts",
      parameters: [],
      flags: { name: nonEmptyString, deployDir: nonEmptyString },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  rejectUnexpectedArguments(parsed.unknownFlags, parsed._);
  const values = parsed.flags;
  let name = values.name ?? process.env.WORKER_NAME ?? "turnstile-siteverify";
  const directory = resolve(
    values.deployDir ?? "/tmp/turnstile-siteverify-deploy",
  );
  const secret = requiredEnv("WIDGET_SECRET");
  requiredEnv("CLOUDFLARE_API_TOKEN");

  let deployed = await deploy(name, directory);
  if (
    deployed.exitCode !== 0 &&
    deployed.output.includes("script name already in use")
  ) {
    name = `${name}-${randomSuffix()}`;
    diagnostic(`worker-deploy: name conflict; retrying as ${name}`);
    deployed = await deploy(name, directory);
    if (deployed.exitCode !== 0) {
      diagnostic("worker-deploy: deploy failed even with new name");
      process.stderr.write(deployed.output);
      output({ status: "error", reason: "name_conflict_after_retry" });
      process.exit(1);
    }
  } else if (deployed.exitCode !== 0) {
    process.stderr.write(deployed.output);
    output({ status: "error", reason: "deploy_failed" });
    process.exit(1);
  }

  const secretResult = await command(
    [
      "bunx",
      "wrangler@4.113.0",
      "secret",
      "put",
      "TURNSTILE_SECRET_KEY",
      "--name",
      name,
    ],
    directory,
    `${secret}\n`,
  );
  if (secretResult.exitCode !== 0) {
    diagnostic(`worker-deploy: failed to set TURNSTILE_SECRET_KEY on ${name}`);
    process.stderr.write(secretResult.output);
    output({
      status: "error",
      reason: "set_secret_failed",
      worker_name: name,
      detail: secretResult.output.replaceAll("\n", " ").slice(-200),
    });
    process.exit(1);
  }
  await Bun.sleep(5_000);

  const url = workerUrl(deployed.output);
  if (url === undefined) {
    diagnostic(
      "worker-deploy: deployed but could not parse Worker URL from wrangler output",
    );
    diagnostic(
      "worker-deploy: ask the user for the URL printed by wrangler deploy and pass it to validate.ts manually",
    );
    output({ status: "error", reason: "url_parse_failed", worker_name: name });
    process.exit(1);
  }
  output({ status: "ok", worker_url: url, worker_name: name });
}

main().catch((error) => {
  if (error instanceof UsageError) {
    diagnostic(`worker-deploy: ${error.message}`);
    process.exit(2);
  }
  diagnostic(
    `worker-deploy: ${error instanceof Error ? error.message : String(error)}`,
  );
  output({ status: "error", reason: "deploy_failed" });
  process.exit(1);
});
