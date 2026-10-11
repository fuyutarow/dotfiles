// Consumer: land/coordinator. Read-only checks; verdict lines distinguish SKIP from PASS.
import { stat, mkdtemp, rm } from "node:fs/promises";
import { stripVTControlCharacters } from "node:util";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { attempt, errorMessage } from "../../shared/src/attempt.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const RegistrySchema = z.object({
  consumers: z.array(
    z.object({
      name: z.string().min(1),
      root: z.string().min(1),
      hooks: z.string().min(1),
      link_task: z.string().min(1),
      link_path: z.string().min(1),
      command: z.array(z.string()).min(1),
    }),
  ),
});
export type Consumer = z.output<typeof RegistrySchema>["consumers"][number];

async function typecheck(argv: string[], root: string) {
  const signal = AbortSignal.timeout(120_000);
  const child = Bun.spawn(argv, {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    signal,
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  const [out, err, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout: out, output: out + err, exit, timedOut: signal.aborted };
}

const CompilerConfig = z.looseObject({
  compilerOptions: z
    .looseObject({
      baseUrl: z.string().optional(),
      paths: z.record(z.string(), z.array(z.string())).optional(),
      typeRoots: z.array(z.string()).optional(),
      incremental: z.boolean().optional(),
      composite: z.boolean().optional(),
    })
    .optional(),
});

function defaultTypeRoots(root: string): string[] {
  const roots: string[] = [];
  for (let directory = root; ; directory = dirname(directory)) {
    roots.push(join(directory, "node_modules/@types"));
    if (dirname(directory) === directory) return roots;
  }
}

/** tsc non-pretty diagnostics include file(line,column): error TSnnnn. */
export function consumerVerdict(
  output: string,
  exit: number,
  hooks: string,
): "pass" | "fail" | "reported" {
  const diagnostics = stripVTControlCharacters(output);
  const normalized = hooks.replaceAll("\\", "/").replace(/\/$/u, "");
  const errors = diagnostics
    .split("\n")
    .filter((line) => /error TS\d+/u.test(line));
  if (
    errors.some((line) => {
      const file =
        line.split(/\(\d+,\d+\): error TS/u)[0]?.replaceAll("\\", "/") ?? "";
      return (
        file.startsWith(`${normalized}/`) || file.includes(`/${normalized}/`)
      );
    })
  )
    return "fail";
  if (exit === 0 && errors.length === 0) return "pass";
  // Project-wide diagnostics with no location (bad config/missing compiler) cannot be waived.
  return errors.length > 0 &&
    errors.every((line) => /\(\d+,\d+\): error TS\d+/u.test(line))
    ? "reported"
    : "fail";
}

export async function checkConsumer(
  consumer: Consumer,
  workspace: string,
): Promise<number> {
  const root = resolve(
    consumer.root.startsWith("~/")
      ? join(homedir(), consumer.root.slice(2))
      : consumer.root,
  );
  if (
    !(await stat(root)
      .then(() => true)
      .catch(() => false))
  ) {
    process.stdout.write(
      `SKIP ${consumer.name}: consumer not present on this host (${root}); run on r99-u26\n`,
    );
    return 0;
  }
  if (
    !(await stat(join(root, consumer.hooks))
      .then(() => true)
      .catch(() => false))
  ) {
    process.stderr.write(
      `FAIL ${consumer.name}: declared hooks missing: ${consumer.hooks}\n`,
    );
    return 1;
  }
  const argv = consumer.command.map((part) => part.replaceAll("{root}", root));
  const checked = await attempt(async () => {
    // Run the owner's exact project command first. The second check changes only the
    // package resolution in a throwaway config; it works with native and JS compilers.
    const shown = await typecheck(
      argv.map((arg) => (arg === "--noEmit" ? "--showConfig" : arg)),
      root,
    );
    const parsedConfig = jsonOf(CompilerConfig).safeParse(shown.stdout);
    if (shown.exit !== 0 || shown.timedOut || !parsedConfig.success)
      return {
        output: shown.output,
        exit: 1,
        timedOut: shown.timedOut,
        projectFailed: true,
        projectReported: false,
      };
    const options = parsedConfig.data.compilerOptions;
    if (options?.incremental === true || options?.composite === true)
      return {
        output:
          "FAIL exact consumer command would write incremental build state; read-only check refused\n",
        exit: 1,
        timedOut: false,
        projectFailed: true,
        projectReported: false,
      };
    const project = await typecheck(argv, root);
    process.stdout.write(project.output);
    const base = resolve(root, options?.baseUrl ?? ".");
    const aliases = Object.fromEntries(
      Object.entries(options?.paths ?? {}).map(([key, values]) => [
        key,
        values.map((value) => resolve(base, value)),
      ]),
    );
    const temporary = await mkdtemp(join(tmpdir(), "agx-usehooks-typecheck-"));
    await using _temporary = {
      [Symbol.asyncDispose]: async () => {
        await rm(temporary, { recursive: true, force: true });
      },
    };
    const files: string[] = [];
    for await (const file of new Bun.Glob("**/*.{ts,tsx,mts,cts}").scan({
      cwd: join(root, consumer.hooks),
      absolute: true,
    }))
      files.push(file);
    if (files.length === 0)
      return {
        output: "No hook TypeScript files found",
        exit: 1,
        timedOut: false,
        projectFailed: true,
        projectReported: false,
      };
    const config = join(temporary, "tsconfig.json");
    await Bun.write(
      config,
      JSON.stringify({
        extends: join(root, "tsconfig.json"),
        files,
        include: [],
        compilerOptions: {
          noEmit: true,
          incremental: false,
          composite: false,
          paths: {
            ...aliases,
            "agx-usehooks": [join(resolve(workspace), "src/index.ts")],
          },
          typeRoots:
            options?.typeRoots?.map((path) => resolve(root, path)) ??
            defaultTypeRoots(root),
        },
      }),
    );
    const projected = await typecheck(
      argv.map((arg) => (arg === root ? config : arg)),
      root,
    );
    const projectVerdict = project.timedOut
      ? "fail"
      : consumerVerdict(project.output, project.exit, consumer.hooks);
    return {
      output: projected.output,
      exit: projected.exit,
      timedOut: projected.timedOut,
      projectFailed: projectVerdict === "fail",
      projectReported: projectVerdict === "reported",
    };
  });
  if (!checked.ok) {
    process.stderr.write(
      `FAIL ${consumer.name}: ${errorMessage(checked.error)}\n`,
    );
    return 1;
  }
  process.stdout.write(checked.value.output);
  const verdict =
    checked.value.timedOut || checked.value.projectFailed
      ? "fail"
      : consumerVerdict(
          checked.value.output,
          checked.value.exit,
          consumer.hooks,
        );
  const label =
    verdict === "pass" && checked.value.projectReported
      ? "REPORTED"
      : { pass: "PASS", fail: "FAIL", reported: "REPORTED" }[verdict];
  process.stdout.write(
    `${label} ${consumer.name}: workspace ${workspace}; tsc exit ${checked.value.exit}${checked.value.timedOut ? " (timeout)" : ""}\n`,
  );
  return verdict === "fail" ? 1 : 0;
}

export async function main(): Promise<number> {
  const text = await Bun.file(
    join(import.meta.dir, "..", "consumers.toml"),
  ).text();
  const parsed = RegistrySchema.safeParse(Bun.TOML.parse(text));
  if (!parsed.success) {
    process.stderr.write(`FAIL consumer registry: ${parsed.error.message}\n`);
    return 1;
  }
  let exit = 0;
  for (const consumer of parsed.data.consumers)
    exit = Math.max(
      exit,
      await checkConsumer(consumer, resolve(import.meta.dir, "..")),
    );
  return exit;
}

if (import.meta.main)
  process.exitCode = await main().catch((error: unknown) => {
    process.stderr.write(`FATAL: ${errorMessage(error)}\n`);
    return 2;
  });
