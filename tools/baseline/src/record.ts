import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { err, ok, type Result } from "neverthrow";
import { createConsola } from "consola";
import { attempt, errorMessage } from "@dotfiles/shared/src/attempt.ts";
import { parseFailures } from "./data.ts";

const JJ_TIMEOUT = 60_000;
const TEST_TIMEOUT = 30 * 60_000;
const logger = createConsola({ stdout: process.stderr });

async function run(
  cmd: string[],
  cwd: string,
  signal?: AbortSignal,
  env = process.env,
  timeout = TEST_TIMEOUT,
) {
  const child = Bun.spawn(cmd, {
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    timeout,
    ...(signal === undefined ? {} : { signal }),
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exit, signal: child.signalCode };
}

function jj(args: string[], cwd: string, snapshot = false) {
  return run(
    [
      "jj",
      ...(snapshot ? [] : ["--ignore-working-copy"]),
      "--no-pager",
      "--color=never",
      ...args,
    ],
    cwd,
    undefined,
    process.env,
    JJ_TIMEOUT,
  );
}

/** Only owned scratch bytes are deleted; forgetting a workspace does not delete its files. */
async function cleanup(
  repo: string,
  name: string,
  root: string,
): Promise<Result<void, string>> {
  const forgotten = await attempt(() =>
    jj(["workspace", "forget", name], repo),
  );
  const removed = await attempt(() => rmOwned(root));
  if (!removed.ok) return err(errorMessage(removed.error));
  if (!forgotten.ok) return err(errorMessage(forgotten.error));
  if (forgotten.value.exit !== 0)
    return err(`could not forget ${name}: ${forgotten.value.stderr.trim()}`);
  return removed.value;
}

async function rmOwned(root: string): Promise<Result<void, string>> {
  // The caller wraps filesystem exceptions with attempt; no deletion outside this mkdtemp tree.
  await rm(root, { recursive: true, force: true });
  return ok(undefined);
}

export async function record(
  rev: string,
  cmd: string[],
  repo = process.cwd(),
): Promise<Result<string[], string>> {
  if (Bun.which("jj") === null) return err("jj is required on PATH");
  const executable = cmd[0];
  if (executable === undefined) return err("record requires -- <test command>");
  if (!executable.includes("/") && Bun.which(executable) === null)
    return err(`test command not found: ${executable}`);
  const made = await attempt(() => mkdtemp(join(tmpdir(), "baseline-record-")));
  if (!made.ok) return err(errorMessage(made.error));
  const root = made.value;
  const workspace = join(root, "checkout");
  const temp = join(root, "tmp");
  const name = `baseline-${crypto.randomUUID()}`;
  let registered = false;
  const controller = new AbortController();
  const interrupt = () => {
    controller.abort();
  };
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    process.on(signal, interrupt);
  const result = await attempt(async (): Promise<Result<string[], string>> => {
    logger.info(`baseline: checking out ${rev}`);
    // --ignore-working-copy also suppresses materializing the NEW checkout in jj.
    const added = await jj(
      [
        "workspace",
        "add",
        "--no-colocate",
        "--sparse-patterns=full",
        "--name",
        name,
        "--revision",
        rev,
        workspace,
      ],
      repo,
      true,
    );
    if (added.exit !== 0) return err(added.stderr.trim());
    registered = true;
    if (controller.signal.aborted) return err("record interrupted");
    await mkdir(temp);
    logger.info(`baseline: running ${cmd.join(" ")}`);
    const child = await run(cmd, workspace, controller.signal, {
      ...process.env,
      TMPDIR: temp,
      TMP: temp,
      TEMP: temp,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      // A nested test preload must own its scratch under this run, not an inherited test parent.
      DOTFILES_TEST_RUN_DIR: undefined,
    });
    if (controller.signal.aborted || child.signal !== null)
      return err("test command was interrupted or exceeded 30 minutes");
    const parsed = parseFailures(`${child.stdout}\n${child.stderr}`, workspace);
    if (parsed.isErr())
      return err(`${parsed.error}\n${child.stderr.slice(-4000)}`);
    if (
      (child.exit !== 0 && child.exit !== 1) ||
      (child.exit === 1 && parsed.value.length === 0)
    )
      return err(
        `test command exited ${child.exit} without a usable failure set`,
      );
    return parsed;
  });
  const workspaceExists =
    registered || (await attempt(() => stat(join(workspace, ".jj")))).ok;
  const cleaned = await attempt(() =>
    workspaceExists ? cleanup(repo, name, root) : rmOwned(root),
  );
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
    process.off(signal, interrupt);
  if (!cleaned.ok) return err(`cleanup failed: ${errorMessage(cleaned.error)}`);
  if (cleaned.value.isErr())
    return err(`cleanup failed: ${cleaned.value.error}`);
  return result.ok ? result.value : err(errorMessage(result.error));
}
