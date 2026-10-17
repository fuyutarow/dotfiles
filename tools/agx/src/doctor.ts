// Suite-level diagnostic composition; the suite entry remains process-only.
import { cli as cleyeCli } from "cleye";
import { standardCli } from "../../shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import { mkdir, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, cliArgv);

async function runDoctor(json: boolean): Promise<number> {
  const targets = [
    fileURLToPath(new URL("../../agx-run/src/next/cli.ts", import.meta.url)),
    fileURLToPath(new URL("../../agx-ws/src/ws.ts", import.meta.url)),
    fileURLToPath(new URL("../../agx-ticket/src/tkt.ts", import.meta.url)),
  ];
  const results = await Promise.all(
    targets.map(async (target) => {
      const child = Bun.spawn([process.execPath, target, "doctor"], {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, AGX_DOCTOR_QUIET: "1" },
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { stdout, stderr, exitCode };
    }),
  );
  if (!json) for (const result of results) process.stdout.write(result.stdout);
  for (const result of results) process.stderr.write(result.stderr);
  const count = results.reduce(
    (total, result) => total + result.stdout.split("\n").filter(Boolean).length,
    0,
  );
  const complete = results.every(
    (result) => result.exitCode <= 1 && result.stderr === "",
  );
  {
    const findings = results.flatMap((result) =>
      result.stdout.split("\n").filter(Boolean),
    );
    const kinds: Record<string, number> = {};
    for (const line of findings) {
      const kind = line.split("\t")[3];
      kinds[kind ?? "unknown"] = (kinds[kind ?? "unknown"] ?? 0) + 1;
    }
    const snapshot = {
      findings,
      kinds,
      total: count,
      lost: kinds.orphaned ?? 0,
      complete,
      capturedAt: Temporal.Now.instant().epochMilliseconds,
    };
    if (snapshot.complete) {
      const root =
        [process.env.AGX_NEXT_STATE_DIR, process.env.AGX_STATE_DIR].find(
          (value) => value !== undefined && value !== "",
        ) ??
        join(
          (process.env.XDG_STATE_HOME === ""
            ? undefined
            : process.env.XDG_STATE_HOME) ??
            join(process.env.HOME ?? homedir(), ".local/state"),
          "agx-next",
        );
      await mkdir(root, { recursive: true });
      const path = join(root, "doctor.json");
      const temp = path + "." + crypto.randomUUID() + ".tmp";
      await writeFile(temp, JSON.stringify(snapshot), { mode: 0o600 });
      await rename(temp, path);
    }
    if (json) process.stdout.write(JSON.stringify(snapshot) + "\n");
  }
  process.stderr.write(`agx doctor: ${count} finding(s)\n`);
  return complete ? Math.max(...results.map((result) => result.exitCode)) : 2;
}
function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("agx doctor: unknown option --__proto__\n");
    process.exit(2);
  }
}
async function main(): Promise<void> {
  const parsed = cli({
    name: "agx doctor",
    parameters: [],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    flags: {
      json: {
        type: Boolean,
        description: "emit authoritative diagnostic findings",
      },
    },
  });
  if (parsed._.length > 0) {
    process.stderr.write("agx doctor: unexpected argument\n");
    process.exitCode = 2;
    return;
  }
  process.exitCode = await runDoctor(parsed.flags.json === true);
}
if (import.meta.main)
  await main().catch((error: unknown) => {
    process.stderr.write("FATAL: " + String(error) + "\n");
    process.exitCode = 2;
  });
