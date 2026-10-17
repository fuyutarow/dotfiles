/// <reference types="bun" />
// Selected lint files can sit outside a consumer's include globs. Load this runner's
// runtime types explicitly so type-aware lint also works for that standalone file.
// Consumer lint entrypoint: run the pinned local oxlint with Bun, never its Node shebang.
// Human/agent consumer: JSON diagnostics and a checked file count. Exit 0 clean / 1 findings /
// 2 fatal (including empty, malformed or zero-file reports). No network installation fallback.
import { cli } from "cleye";
import { jsonOf, z } from "./zod.ts";

const Report = z.looseObject({
  diagnostics: z.array(z.unknown()),
  number_of_files: z.number().int().positive(),
});

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("lint-oxlint: unknown option --__proto__\n");
    process.exit(2);
  }
}

async function main(): Promise<number> {
  const argv = cli({
    name: "lint-oxlint",
    parameters: ["[files...]"],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    flags: { typeAware: { type: Boolean, default: false } },
  });
  const child = Bun.spawn(
    [
      process.execPath,
      "x",
      "--bun",
      "--no-install",
      "oxlint",
      "--format=json",
      ...(argv.flags.typeAware ? ["--type-aware"] : []),
      ...argv._,
    ],
    { stdout: "pipe", stderr: "pipe", timeout: 120_000 },
  );
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (stderr.length > 0) process.stderr.write(stderr);
  const report = jsonOf(Report).safeParse(stdout);
  if (!report.success) {
    if (stdout.length > 0) process.stdout.write(stdout);
    process.stderr.write(
      `lint-oxlint: FATAL: oxlint exited ${exit} without a valid nonempty JSON report with files checked; check the local oxlint installation and runtime\n`,
    );
    return 2;
  }
  process.stdout.write(`${stdout.trim()}\n`);
  process.stdout.write(
    `lint-oxlint: checked ${report.data.number_of_files} file(s)\n`,
  );
  return exit === 0 && report.data.diagnostics.length > 0 ? 1 : exit;
}

if (import.meta.main)
  process.exitCode = await main().catch((error: unknown) => {
    process.stderr.write(`lint-oxlint: FATAL: ${String(error)}\n`);
    return 2;
  });
