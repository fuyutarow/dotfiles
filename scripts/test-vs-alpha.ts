import { createHash, randomUUID } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { cli } from "cleye";
import { err, ok, type Result } from "neverthrow";
import { jsonOf, z } from "../agents/hooks/zod";

const failureSchema = z.array(
  z.object({ name: z.string(), error: z.string() }),
);
type Failure = z.infer<typeof failureSchema>[number];
const root = resolve(import.meta.dir, "..");
const timeout = 300_000;

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("test:vs-alpha: unknown option '--__proto__'\n");
    process.exit(2);
  }
}

async function run(
  args: string[],
  cwd: string,
  signal: AbortSignal,
): Promise<Result<{ stdout: string; stderr: string; code: number }, string>> {
  const limit = AbortSignal.timeout(timeout);
  const proc = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.any([signal, limit]),
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (limit.aborted) return err(`${args[0]} timed out after ${timeout} ms`);
  if (signal.aborted) return err("interrupted");
  return ok({ stdout, stderr, code });
}

function xmlText(value: string): string {
  return value.replaceAll(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/giu,
    (entity, key: string) => {
      const named: Record<string, string> = {
        amp: "&",
        lt: "<",
        gt: ">",
        quot: '"',
        apos: "'",
      };
      if (key.startsWith("#x"))
        return String.fromCodePoint(Number.parseInt(key.slice(2), 16));
      if (key.startsWith("#"))
        return String.fromCodePoint(Number(key.slice(1)));
      return named[key] ?? entity;
    },
  );
}

export function parseFailures(
  output: string,
  code: number,
): Result<Failure[], string> {
  const tags = output.match(/<[^>]*>/gu) ?? [];
  const suites: string[] = [];
  const failures: Failure[] = [];
  let expected: number | undefined;
  let test: { name: string; file: string; failed: boolean } | undefined;
  for (const tag of tags) {
    const attr = (name: string) => {
      const value = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "u"))?.[1];
      return value === undefined ? undefined : xmlText(value);
    };
    if (tag.startsWith("<testsuites ")) expected = Number(attr("failures"));
    if (tag.startsWith("<testsuite ")) suites.push(attr("name") ?? "");
    if (tag === "</testsuite>") suites.pop();
    const file = attr("file");
    const name = attr("name");
    const isTest = tag.startsWith("<testcase ");
    const isFailure = tag.startsWith("<failure") || tag.startsWith("<error");
    if (
      isTest &&
      (file === undefined || name === undefined || suites.length === 0)
    )
      return err("missing testcase identity");
    if (isTest && file !== undefined && name !== undefined) {
      test = {
        file,
        name: [...suites.slice(1), name].join(" > "),
        failed: false,
      };
    }
    if (isTest && tag.endsWith("/>")) test = undefined;
    if (isFailure && (test === undefined || test.failed))
      return err("unidentified or repeated failure");
    if (isFailure && test !== undefined) {
      test.failed = true;
      failures.push({
        name: `${test.file} > ${test.name}`,
        error:
          (attr("message") ?? "error details unavailable").split("\n")[0] ??
          "error details unavailable",
      });
    }
    if (tag === "</testcase>") test = undefined;
  }
  if (
    expected === undefined ||
    !Number.isInteger(expected) ||
    expected !== failures.length ||
    suites.length > 0 ||
    test !== undefined ||
    (code === 0) !== (failures.length === 0) ||
    !output.includes("</testsuites>")
  )
    return err(`incomplete or inconsistent report (exit ${code})`);
  return ok(failures);
}

async function testTree(
  tree: string,
  path: string,
  signal: AbortSignal,
): Promise<Result<Failure[], string>> {
  const reportDir = await mkdtemp(join(tmpdir(), "test-vs-alpha-report-"));
  return (async () => {
    const report = join(reportDir, "junit.xml");
    const tested = await run(
      [
        process.execPath,
        "test",
        path,
        "--reporter=junit",
        `--reporter-outfile=${report}`,
      ],
      tree,
      signal,
    );
    if (tested.isErr()) return err(tested.error);
    const output = await readFile(report, "utf8").catch(() => "");
    const parsed = parseFailures(output, tested.value.code);
    return parsed.isErr()
      ? err(`${parsed.error}\n${tested.value.stderr.slice(-4000)}`)
      : parsed;
  })().then(
    async (result) => {
      await rm(reportDir, { recursive: true, force: true });
      return result;
    },
    async (error: unknown) => {
      await rm(reportDir, { recursive: true, force: true });
      return err(String(error));
    },
  );
}

async function baselineRun(
  tree: string,
  path: string,
  commit: string,
  name: string,
  signal: AbortSignal,
): Promise<Result<Failure[], string>> {
  const added = await run(
    ["jj", "workspace", "add", "--name", name, "-r", commit, tree],
    root,
    signal,
  );
  if (added.isErr()) return err(added.error);
  if (added.value.code !== 0)
    return err(`cannot create baseline workspace: ${added.value.stderr}`);
  const installed = await run(
    [process.execPath, "install", "--frozen-lockfile"],
    tree,
    signal,
  );
  if (installed.isErr()) return err(installed.error);
  if (installed.value.code !== 0)
    return err(`baseline dependency install failed: ${installed.value.stderr}`);
  return testTree(tree, path, signal);
}

export function compareFailures(baseline: Failure[], current: Failure[]) {
  const known = new Map<string, number>();
  for (const failure of baseline)
    known.set(failure.name, (known.get(failure.name) ?? 0) + 1);
  const seen = new Map<string, number>();
  const added = current.filter((failure) => {
    const ordinal = (seen.get(failure.name) ?? 0) + 1;
    seen.set(failure.name, ordinal);
    return ordinal > (known.get(failure.name) ?? 0);
  });
  return {
    added,
    duplicates: [...known.values(), ...seen.values()].some(
      (count) => count > 1,
    ),
  };
}

async function execute(
  path: string,
  scratch: string,
  name: string,
  signal: AbortSignal,
): Promise<Result<number, string>> {
  const rev = await run(
    [
      "jj",
      "--ignore-working-copy",
      "log",
      "-r",
      "alpha@origin",
      "--no-graph",
      "-T",
      "commit_id",
    ],
    root,
    signal,
  );
  if (rev.isErr()) return err(rev.error);
  const commit = rev.value.stdout.trim();
  if (rev.value.code !== 0 || !/^[0-9a-f]{40,64}$/u.test(commit))
    return err(`cannot resolve alpha@origin: ${rev.value.stderr}`);
  const key = createHash("sha256")
    .update(JSON.stringify(["junit-v1", commit, path]))
    .digest("hex");
  const cacheHome = process.env["XDG_CACHE_HOME"];
  const cache = join(
    cacheHome === undefined || cacheHome === ""
      ? join(homedir(), ".cache")
      : cacheHome,
    "test-vs-alpha",
    `${key}.json`,
  );
  const contents = await readFile(cache, "utf8").then(
    (value) => value,
    () => "",
  );
  const cached = jsonOf(failureSchema).safeParse(contents);
  let baseline: Failure[];
  if (cached.success) baseline = cached.data;
  else {
    const result = await baselineRun(
      join(scratch, "tree"),
      path,
      commit,
      name,
      signal,
    );
    if (result.isErr()) return err(result.error);
    baseline = result.value;
    await mkdir(dirname(cache), { recursive: true });
    const pending = join(dirname(cache), `${key}.${randomUUID()}.tmp`);
    await writeFile(pending, JSON.stringify(baseline));
    await rename(pending, cache);
  }
  const current = await testTree(root, path, signal);
  if (current.isErr()) return err(current.error);
  const { added, duplicates } = compareFailures(baseline, current.value);
  process.stdout.write(
    `baseline: ${baseline.length} failures; workspace: ${current.value.length} failures; new: ${added.length}\n`,
  );
  if (duplicates)
    process.stdout.write(
      "Duplicate failure names: a fixed duplicate and a newly failing identical duplicate can cancel out.\n",
    );
  for (const failure of added)
    process.stdout.write(`${failure.name}\n  ${failure.error}\n`);
  return ok(added.length === 0 ? 0 : 1);
}

async function main(): Promise<Result<number, string>> {
  const parsed = cli({
    name: "test:vs-alpha",
    parameters: ["[path]"],
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    help: {
      description:
        "Compare failures with alpha@origin. Duplicate failure names are counted; a fixed duplicate and a newly failing identical duplicate can cancel out.",
    },
  });
  const paths = [...parsed._, ...parsed._["--"]];
  const arg = paths[0];
  if (
    arg === undefined ||
    parsed._.length > 1 ||
    paths.length !== 1 ||
    isAbsolute(arg)
  )
    return err("usage: test:vs-alpha -- <repository-relative test path>");
  const path = relative(root, resolve(root, arg));
  if (path === "" || path === ".." || path.startsWith("../"))
    return err("test path must be inside the repository");
  const controller = new AbortController();
  const interrupt = () => {
    controller.abort();
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  const scratch = await mkdtemp(join(tmpdir(), "test-vs-alpha-"));
  const name = `test-vs-alpha-${randomUUID()}`;
  const cleanup = async () => {
    const forget = Bun.spawn(["jj", "workspace", "forget", name], {
      cwd: root,
      stdout: "ignore",
      stderr: "ignore",
    });
    await forget.exited;
    await rm(scratch, { recursive: true, force: true });
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", interrupt);
  };
  return execute(path, scratch, name, controller.signal).then(
    async (result) => {
      await cleanup();
      return result;
    },
    async (error: unknown) => {
      await cleanup();
      return err(String(error));
    },
  );
}

if (import.meta.main) {
  await main().then(
    (result) => {
      if (result.isErr()) {
        process.stderr.write(`test:vs-alpha: ${result.error}\n`);
        process.exitCode = 2;
      } else process.exitCode = result.value;
    },
    (error: unknown) => {
      process.stderr.write(`test:vs-alpha: ${String(error)}\n`);
      process.exitCode = 2;
    },
  );
}
