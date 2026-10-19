import { attempt, errorMessage } from "../tools/shared/src/attempt.ts";
// Suite-level diagnostic composition; the suite entry remains process-only.
import { cli as cleyeCli } from "cleye";
import { standardCli } from "../tools/shared/src/cli.ts";
import cliPackage from "../tools/agx/package.json" with { type: "json" };
import { mkdir, rename, writeFile, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { DoctorRecord } from "../tools/shared/src/doctor-record.ts";
import { jsonOf } from "../tools/shared/src/zod.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, cliArgv);

async function runDoctor(json: boolean): Promise<number> {
  const targets = ["agx-worker", "ws", "tkt"];
  const results = await Promise.all(
    targets.map(async (target) => {
      const result = await attempt(async () => {
        const child = Bun.spawn([target, "doctor"], {
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          env: { ...process.env, AGX_DOCTOR_QUIET: "1" },
          timeout: 30_000,
        });
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
          child.exited,
        ]);
        return { stdout, stderr, exitCode };
      });
      return result.ok
        ? result.value
        : {
            stdout: "",
            stderr: `${target} doctor: ${errorMessage(result.error)}\n`,
            exitCode: 2,
          };
    }),
  );
  if (!json) for (const result of results) process.stdout.write(result.stdout);
  for (const result of results) process.stderr.write(result.stderr);
  const count = results.reduce(
    (total, result) => total + result.stdout.split("\n").filter(Boolean).length,
    0,
  );
  const decoder = jsonOf(DoctorRecord);
  const records = results.flatMap((result) =>
    result.stdout
      .split("\n")
      .filter(Boolean)
      .map((line) => decoder.safeParse(line)),
  );
  const complete =
    results.every(
      (result) =>
        result.exitCode <= 1 &&
        (result.exitCode === 0 || result.stdout.trim() !== ""),
    ) && records.every((record) => record.success);
  if (!complete)
    process.stderr.write(
      "agx doctor: incomplete doctor output; inspect owner diagnostics\n",
    );
  {
    const findings = results.flatMap((result) =>
      result.stdout.split("\n").filter(Boolean),
    );
    const kinds: Record<string, number> = {};
    for (const line of findings) {
      const record = decoder.safeParse(line);
      const kind = record.success ? record.data.finding : "invalid";
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
    {
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
      await using _cleanup = {
        [Symbol.asyncDispose]: async () => {
          await unlink(temp).catch(() => null);
        },
      };
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
    name: "agx-doctor",
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
