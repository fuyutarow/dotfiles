#!/usr/bin/env bun
import { cli as cleyeCli } from "cleye";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import { attempt } from "@dotfiles/shared/src/attempt.ts";
import { headroom } from "./headroom.ts";
import type { StorageMeasurement } from "@dotfiles/shared/src/storage-headroom.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, cliArgv);

const usageExit = (code: number) => {
  if (code === 1) process.exitCode = 2;
};

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`Error: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

export async function main(
  argv = cliArgv(),
  measure?: (path: string) => StorageMeasurement | null,
): Promise<number> {
  process.on("exit", usageExit);
  const parsed = cli(
    {
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      name: "storage-headroom",
      parameters: [],
      flags: {
        json: { type: Boolean, default: false, description: "Write JSON" },
        path: { type: String, description: "Filesystem path to measure" },
      },
      help: {
        description: "Report shared storage thresholds and measured headroom",
      },
    },
    undefined,
    argv,
  );
  process.removeListener("exit", usageExit);
  if (parsed._.length > 0) {
    process.stderr.write("storage-headroom: unexpected positional arguments\n");
    return 2;
  }
  const result = await headroom({
    ...(parsed.flags.path === undefined ? {} : { path: parsed.flags.path }),
    ...(measure === undefined ? {} : { measure }),
  });
  if (result.errors.length > 0) {
    process.stderr.write(`storage-headroom: ${result.errors.join("; ")}\n`);
    return 2;
  }
  const human = [
    "DRIVE\tPATH\tSTATE\tFREE\tDENY\tWARN",
    ...result.headroom.drives.map(
      (d) =>
        `${d.label}\t${d.path}\t${d.state}\t${d.free}\t${d.deny_line}\t${d.warn_line ?? "-"}`,
    ),
  ].join("\n");
  process.stdout.write(
    `${parsed.flags.json ? JSON.stringify(result.headroom) : human}\n`,
  );
  return result.exit;
}

if (import.meta.main) {
  const result = await attempt(() => main());
  if (!result.ok) {
    process.stderr.write(
      `storage-headroom: ${result.error instanceof Error ? result.error.message : String(result.error)}\n`,
    );
    process.exit(2);
  }
  process.exit(result.value);
}
