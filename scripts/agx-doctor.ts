// Compatibility caller; released agx owns aggregation and state publication.
import { cli as cleyeCli } from "cleye";
import { join } from "node:path";
import { standardCli } from "../tools/shared/src/cli.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, { version: "1.0.0" }, cliArgv);
function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("agx-doctor: unknown option --__proto__\n");
    process.exit(2);
  }
}
async function main(): Promise<number> {
  const parsed = cli({
    name: "agx-doctor",
    parameters: [],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    flags: {
      json: { type: Boolean, description: "emit released agx doctor JSON" },
    },
  });
  if (parsed._.length > 0) {
    process.stderr.write("agx-doctor: unexpected argument\n");
    return 2;
  }
  // Transitional until agx-doctor-deadline-1024 raises the per-member default; remove --timeout-ms when dotfiles pins that release.
  const child = Bun.spawn(
    [
      "mise",
      "-C",
      join(import.meta.dir, ".."),
      "exec",
      "--",
      "agx",
      "doctor",
      "--json",
      "--timeout-ms",
      "60000",
    ],
    { stdin: "ignore", stdout: "inherit", stderr: "inherit", timeout: 90_000 },
  );
  return child.exited;
}
if (import.meta.main) {
  process.exitCode = await main().catch((error: unknown) => {
    process.stderr.write(`FATAL: ${String(error)}\n`);
    return 2;
  });
}
