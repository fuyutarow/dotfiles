import { randomUUID } from "node:crypto";
import { lstat, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { cli as cleyeCli } from "cleye";
import { standardCli } from "../../shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import {
  attempt,
  errorMessage,
  type Attempt,
} from "../../shared/src/attempt.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { validateSlug } from "../../shared/src/slug.ts";
import {
  DispatchBindingSchema,
  type DispatchBinding,
} from "../../shared/src/agx-dispatch-binding.ts";
import { JJ_READ_ARGS } from "../../shared/src/jj-read.ts";
import { readonlyCommand } from "../../shared/src/readonly-command.ts";
import { InspectionTimeout } from "../../shared/src/agx-config.ts";

export const DISPATCH_CHECK_TIMEOUT_MS = 60_000;
export const DISPATCH_LIST_TIMEOUT_MS = 60_000;
export const DISPATCH_COMMAND_TIMEOUT_MS = 60_000;
export const DISPATCH_TREE_READ_TIMEOUT_MS = 60_000;

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, cliArgv);

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("agx worker dispatch: unknown option '--__proto__'\n");
    process.exit(2);
  }
};

const RunRow = z.looseObject({
  id: z.string().min(1),
  ticket: z.string(),
  state: z.enum(["running", "ended"]),
  cwd: z.string(),
  workspace: z.string(),
  unit: z.string().optional(),
});
const Rows = jsonOf(z.array(RunRow));
const WorkspaceResult = jsonOf(z.object({ workspace: z.string().min(1) }));
type RunRow = z.output<typeof RunRow>;

export async function invoke(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs = DISPATCH_COMMAND_TIMEOUT_MS,
  bound = "DISPATCH_COMMAND_TIMEOUT_MS",
): Promise<{ code: number; out: string; err: string }> {
  const started = performance.now();
  const child = Bun.spawn(args, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (
    child.signalCode === "SIGKILL" &&
    performance.now() - started >= timeoutMs
  )
    return {
      code: 75,
      out: "",
      err: new InspectionTimeout(bound, timeoutMs, args, cwd).message,
    };
  if (code === 75)
    return {
      code,
      out,
      err:
        err.trim() === ""
          ? `inspection unavailable; command=${JSON.stringify(args)}; cwd=${cwd}; exit=75; no stderr`
          : err.trim().replaceAll(/[\r\n]+/gu, "; "),
    };
  return { code, out, err };
}

export async function invokeReadonly(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs = DISPATCH_TREE_READ_TIMEOUT_MS,
): Promise<{ code: number; out: string; err: string }> {
  const command = readonlyCommand(args, cwd, env);
  const started = performance.now();
  const child = Bun.spawn(command.cmd, {
    cwd,
    env: command.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: timeoutMs,
    killSignal: "SIGKILL",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (
    child.signalCode === "SIGKILL" &&
    performance.now() - started >= timeoutMs
  )
    return {
      code: 75,
      out: "",
      err: new InspectionTimeout(
        "DISPATCH_TREE_READ_TIMEOUT_MS",
        timeoutMs,
        args,
        cwd,
      ).message,
    };
  if (code === 75)
    return {
      code,
      out,
      err:
        err.trim() === ""
          ? `inspection unavailable; command=${JSON.stringify(args)}; cwd=${cwd}; exit=75; no stderr`
          : err.trim().replaceAll(/[\r\n]+/gu, "; "),
    };
  return { code, out, err };
}

async function repositoryRootFromCommand(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  fallback: string,
): Promise<{ root?: string; error?: string; code?: number }> {
  const found = await invokeReadonly(args, cwd, env);
  const root = found.out.trim();
  if (found.code === 0 && root !== "") return { root: resolve(root) };
  const reason = found.err.trim();
  return {
    error: reason !== "" ? reason : fallback,
    code: found.code === 75 ? 75 : 1,
  };
}

async function defaultRepositoryRoot(
  path: string,
  env: NodeJS.ProcessEnv,
): Promise<{ root?: string; error?: string; code?: number }> {
  const resolvedPath = await attempt(() => realpath(path));
  if (!resolvedPath.ok) return { error: errorMessage(resolvedPath.error) };
  const physical = resolvedPath.value;
  const info = await lstat(physical).catch(() => null);
  let probe = info?.isDirectory() === true ? physical : dirname(physical);
  while (true) {
    const jj = await lstat(join(probe, ".jj")).catch(() => null);
    if (jj !== null)
      return repositoryRootFromCommand(
        ["jj", ...JJ_READ_ARGS, "workspace", "root", "--name", "default"],
        probe,
        env,
        `cannot resolve jj default workspace from ${path}`,
      );
    const git = await lstat(join(probe, ".git")).catch(() => null);
    if (git !== null)
      return repositoryRootFromCommand(
        ["git", "--no-optional-locks", "rev-parse", "--show-toplevel"],
        probe,
        env,
        `cannot resolve Git root from ${path}`,
      );
    const parent = dirname(probe);
    if (parent === probe)
      return {
        error: `cannot resolve repository default workspace from ${path}`,
      };
    probe = parent;
  }
}

async function listedRuns(
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ rows?: RunRow[]; error?: string; code?: number }> {
  const result = await invoke(
    ["agx-worker", "ls", "--json", "--all"],
    cwd,
    env,
    DISPATCH_LIST_TIMEOUT_MS,
    "DISPATCH_LIST_TIMEOUT_MS",
  );
  if (result.code !== 0)
    return {
      code: result.code === 75 ? 75 : 1,
      error:
        result.err.trim() !== ""
          ? result.err.trim()
          : `agx worker ls exited ${result.code}`,
    };
  const parsed = Rows.safeParse(result.out);
  return parsed.success
    ? { rows: parsed.data }
    : { error: "agx worker ls returned an invalid run list" };
}

function matches(row: RunRow, binding: DispatchBinding): boolean {
  return (
    row.id === binding.id &&
    row.ticket === binding.ticket &&
    resolve(row.cwd) === binding.workspace &&
    resolve(row.workspace) === binding.workspace &&
    row.unit === binding.unit
  );
}

async function ticketSlug(path: string): Promise<Attempt<string>> {
  const source = await attempt(() => readFile(path, "utf8"));
  if (!source.ok) return source;
  const front = /^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+/u.exec(source.value);
  if (front === null)
    return { ok: false, error: "ticket starts with +++ front matter" };
  const parsedToml = await attempt(() => Bun.TOML.parse(front[1]!));
  if (!parsedToml.ok) return { ok: false, error: parsedToml.error };
  const metadata: unknown = parsedToml.value;
  const parsed = z
    .object({ name: z.string().min(1).optional() })
    .safeParse(metadata);
  const name = parsed.success
    ? (parsed.data.name ?? basename(path, ".md"))
    : basename(path, ".md");
  return validateSlug(name, "agx ticket new");
}

export async function dispatch(options: {
  ticketPath: string;
  ws?: string;
  unit?: string;
  sandbox?: string;
  continuation?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}): Promise<number> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const callerEnv = options.env ?? process.env;
  // systemd does not inherit the caller's cwd; resolve the override once so
  // preflight and the child load the same file. Keep empty input invalid.
  const rosterPath = callerEnv.DISPATCH_ROSTER_PATH;
  const env: NodeJS.ProcessEnv = {
    ...callerEnv,
    ...(rosterPath === undefined || rosterPath === ""
      ? {}
      : { DISPATCH_ROSTER_PATH: resolve(cwd, rosterPath) }),
  };
  const ticketPath = resolve(cwd, options.ticketPath);
  const ticket = await ticketSlug(ticketPath);
  if (!ticket.ok) {
    process.stderr.write(
      `agx worker dispatch: ${errorMessage(ticket.error)}\n`,
    );
    return 1;
  }
  const slug = ticket.value;
  const wsSlug = options.ws ?? slug;
  const ticketRepo = await defaultRepositoryRoot(dirname(ticketPath), env);
  if (ticketRepo.root === undefined) {
    process.stderr.write(
      `agx worker dispatch: cannot resolve ticket repository: ${ticketRepo.error}\n`,
    );
    return ticketRepo.code ?? 1;
  }

  const unitInput = options.unit ?? `agt_${slug}`;
  const unit = unitInput.endsWith(".service")
    ? unitInput.slice(0, -".service".length)
    : unitInput;
  if (!/^[A-Za-z0-9][A-Za-z0-9:_.@-]*$/u.test(unit)) {
    process.stderr.write(
      `agx worker dispatch: invalid systemd unit name '${unitInput}'\n`,
    );
    return 2;
  }
  if (
    options.sandbox !== undefined &&
    !["none", "read-only", "workspace-write"].includes(options.sandbox)
  ) {
    process.stderr.write(
      "agx worker dispatch: --sandbox must be none, read-only, or workspace-write\n",
    );
    return 2;
  }
  const whichOptions = env.PATH === undefined ? {} : { PATH: env.PATH };
  if (
    Bun.which("systemctl", whichOptions) === null ||
    Bun.which("systemd-run", whichOptions) === null
  ) {
    process.stderr.write(
      "agx worker dispatch: systemctl and systemd-run are required\n",
    );
    return 1;
  }
  const active = await invoke(
    ["systemctl", "--user", "is-active", "--quiet", `${unit}.service`],
    cwd,
    env,
  );
  const failures: string[] = [];
  if (active.code === 75) {
    process.stderr.write(`${active.err}\n`);
    return 75;
  }
  if (active.code === 0)
    failures.push(
      `agx worker dispatch: unit ${unit}.service is already running; repair: wait for it to end or choose --unit`,
    );
  const ws = await invoke(
    ["agx-ws", "add", wsSlug, "--repo", ticketRepo.root, "--reuse", "--json"],
    cwd,
    env,
  );
  if (ws.code !== 0) {
    const reason = ws.err.trim();
    process.stderr.write(
      `agx worker dispatch: agx ws add failed: ${reason !== "" ? reason : `exit ${ws.code}`}\n`,
    );
    return ws.code === 0 ? 1 : ws.code;
  }
  const parsedWorkspace = WorkspaceResult.safeParse(ws.out);
  if (
    !parsedWorkspace.success ||
    !isAbsolute(parsedWorkspace.data.workspace) ||
    basename(parsedWorkspace.data.workspace) !== `ws_${wsSlug}`
  ) {
    process.stderr.write(
      "agx worker dispatch: agx ws add returned an invalid workspace path\n",
    );
    return 1;
  }
  const workspace = resolve(parsedWorkspace.data.workspace);

  const jjWorkspace = await lstat(join(workspace, ".jj")).catch(() => null);
  const revision = await invokeReadonly(
    jjWorkspace === null
      ? ["git", "--no-optional-locks", "rev-parse", "--verify", "HEAD^{commit}"]
      : [
          "jj",
          ...JJ_READ_ARGS,
          "log",
          "-r",
          "@",
          "--no-graph",
          "-T",
          "commit_id",
        ],
    workspace,
    env,
  );
  const revisionId = revision.out.trim();
  if (revision.code === 75) {
    process.stderr.write(`${revision.err}\n`);
    return 75;
  }
  let revisionDescription = revisionId;
  if (
    revision.code !== 0 ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(revisionId)
  ) {
    const reason =
      revision.err.trim() === "" ? "no revision output" : revision.err.trim();
    revisionDescription = `unavailable (revision exit=${revision.code}: ${reason.replaceAll(/[\r\n]+/gu, "; ")})`;
  }
  const tree = `--cd ${workspace} @/base_rev=${revisionDescription}`;

  const workspaceRepo = await defaultRepositoryRoot(workspace, env);
  if (workspaceRepo.root === undefined) {
    process.stderr.write(
      `agx worker dispatch: cannot verify ticket/workspace repositories: ${workspaceRepo.error}\n`,
    );
    return workspaceRepo.code ?? 1;
  }
  if (ticketRepo.root !== workspaceRepo.root) {
    failures.push(
      `agx worker dispatch: ticket repository ${ticketRepo.root} differs from workspace repository ${workspaceRepo.root}; repair: select a workspace in the ticket repository`,
    );
  }

  const checked = await invoke(
    [
      "agx-worker",
      "check",
      ticketPath,
      "--cd",
      workspace,
      ...(options.sandbox === undefined ? [] : ["--sandbox", options.sandbox]),
      ...(options.continuation === undefined
        ? []
        : ["--continue", options.continuation]),
    ],
    cwd,
    env,
    DISPATCH_CHECK_TIMEOUT_MS,
    "DISPATCH_CHECK_TIMEOUT_MS",
  );
  if (checked.code === 75) {
    process.stderr.write(`${checked.err}\n`);
    return 75;
  }
  if (checked.code !== 0)
    failures.push(
      checked.err.trim() === ""
        ? "no stderr"
        : checked.err.trim().replaceAll(/[\r\n]+/gu, "; "),
    );
  if (failures.length > 0) {
    process.stderr.write(
      `agx worker dispatch: preflight failed ${tree}; check exit=${checked.code}: ${failures.join("; ")}\n`,
    );
    return 2;
  }

  const parsedBinding = DispatchBindingSchema.safeParse({
    id: randomUUID(),
    ticket: slug,
    workspace,
    unit,
  });
  if (!parsedBinding.success) {
    process.stderr.write("agx worker dispatch: cannot create run binding\n");
    return 1;
  }
  const binding: DispatchBinding = parsedBinding.data;

  const before = await listedRuns(cwd, env);
  if (before.rows === undefined) {
    process.stderr.write(
      `agx worker dispatch: cannot read run records: ${before.error}\n`,
    );
    return before.code ?? 1;
  }
  const args = [
    "systemd-run",
    "--user",
    `--unit=${unit}`,
    "--collect",
    "-p",
    "KillMode=mixed",
    "-p",
    "TimeoutStopSec=60",
    "-E",
    "CLAUDE_CODE_SESSION_ID",
    "-E",
    "CODEX_SESSION_ID",
    ...(rosterPath === undefined ? [] : ["-E", "DISPATCH_ROSTER_PATH"]),
    "--",
    "agx-worker",
    "run",
    ticketPath,
    "--cd",
    workspace,
    "--dispatch-binding",
    JSON.stringify(binding),
    ...(options.sandbox === undefined ? [] : ["--sandbox", options.sandbox]),
    ...(options.continuation === undefined
      ? []
      : ["--continue", options.continuation]),
  ];
  const started = await invoke(args, cwd, env);
  if (started.code !== 0) {
    const reason = started.err.trim();
    process.stderr.write(
      `agx worker dispatch: ${unit}.service did not start: ${reason !== "" ? reason : `systemd-run exited ${started.code}`}\n`,
    );
    return started.code === 0 ? 1 : started.code;
  }

  const configuredWaitMs = Number(env.AGX_DISPATCH_WAIT_MS ?? 60_000);
  const waitMs = Number.isFinite(configuredWaitMs) ? configuredWaitMs : 60_000;
  const deadline = Temporal.Now.instant().epochMilliseconds + waitMs;
  let listError: string | undefined;
  while (Temporal.Now.instant().epochMilliseconds <= deadline) {
    const current = await listedRuns(cwd, env);
    if (current.code === 75) {
      process.stderr.write(`${current.error}\n`);
      return 75;
    }
    listError = current.error;
    const run = current.rows?.find((row) => matches(row, binding));
    if (run !== undefined) {
      process.stdout.write(`${run.id}\n`);
      return 0;
    }
    await Bun.sleep(100);
  }
  process.stderr.write(
    `agx worker dispatch: ${unit}.service started but no matching run record appeared within ${waitMs}ms (AGX_DISPATCH_WAIT_MS=${waitMs}ms); command=["agx-worker","ls","--json","--all"]; cwd=${cwd}${listError === undefined ? "" : `: ${listError}`}\n`,
  );
  return 75;
}

export async function dispatchMain(commandArgs: string[]): Promise<void> {
  const parsed = cli(
    {
      name: "agx-worker dispatch",
      parameters: ["<ticket>"],
      flags: {
        ws: {
          type: String,
          description: "workspace slug (created as ws_<slug>)",
        },
        unit: { type: String, description: "systemd service unit name" },
        sandbox: {
          type: String,
          description: "none | read-only | workspace-write",
        },
        continue: {
          type: String,
          description: "previous agx worker run id to continue",
        },
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    commandArgs,
  );
  if (parsed._.length > 1) {
    process.stderr.write("agx-worker dispatch: unexpected argument\n");
    process.exitCode = 2;
    return;
  }
  const result = await attempt(() =>
    dispatch({
      ticketPath: parsed._.ticket,
      ...(parsed.flags.ws === undefined ? {} : { ws: parsed.flags.ws }),
      ...(parsed.flags.unit === undefined ? {} : { unit: parsed.flags.unit }),
      ...(parsed.flags.sandbox === undefined
        ? {}
        : { sandbox: parsed.flags.sandbox }),
      ...(parsed.flags["continue"] === undefined
        ? {}
        : { continuation: parsed.flags["continue"] }),
    }),
  );
  if (result.ok) process.exitCode = result.value;
  else {
    process.stderr.write(
      `agx worker dispatch: ${errorMessage(result.error)}\n`,
    );
    process.exitCode = 1;
  }
}

if (import.meta.main) await dispatchMain(cliArgv());
