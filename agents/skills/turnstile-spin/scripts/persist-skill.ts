import { existsSync } from "node:fs";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { typeFlag } from "type-flag";
import {
  command,
  diagnostic,
  nonEmptyString,
  output,
  rejectUnknownFlag,
  rejectUnexpectedArguments,
  requiredValue,
  UsageError,
} from "./lib.ts";

async function main(): Promise<void> {
  const parsed = typeFlag({ path: nonEmptyString }, Bun.argv.slice(2), {
    ignore: rejectUnknownFlag,
  });
  rejectUnexpectedArguments(parsed.unknownFlags, parsed._);
  const values = parsed.flags;
  const destination = resolve(requiredValue(values.path, "--path"));
  const target = dirname(destination);
  await mkdir(target, { recursive: true });
  const result = await command([
    "bunx",
    "--yes",
    "degit@3.6.1",
    "cloudflare/skills/skills/turnstile-spin",
    target,
  ]);
  if (result.exitCode !== 0) {
    diagnostic(
      "persist-skill: degit failed; cannot fetch cloudflare/skills/skills/turnstile-spin.",
    );
    diagnostic(
      "persist-skill: ensure your network can reach github.com and try again, or install manually.",
    );
    output({ status: "error", reason: "degit_failed" });
    process.exit(1);
  }
  const skillPath = join(target, "SKILL.md");
  if (!existsSync(skillPath)) {
    diagnostic(
      `persist-skill: bundle extracted but SKILL.md is missing at ${skillPath}.`,
    );
    output({ status: "error", reason: "skill_missing" });
    process.exit(1);
  }
  const scriptsDirectory = join(target, "scripts");
  const scripts = existsSync(scriptsDirectory)
    ? await readdir(scriptsDirectory)
    : [];
  diagnostic(`persist-skill: wrote bundle to ${target}`);
  output({ status: "ok", path: destination, bundle_root: target, scripts });
}

main().catch((error) => {
  if (error instanceof UsageError) {
    diagnostic(`persist-skill: ${error.message}`);
    process.exit(2);
  }
  diagnostic(
    `persist-skill: ${error instanceof Error ? error.message : String(error)}`,
  );
  output({ status: "error", reason: "degit_failed" });
  process.exit(1);
});
