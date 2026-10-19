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

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, cliArgv);

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("agx dispatch: unknown option '--__proto__'\n");
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

async function invoke(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; out: string; err: string }> {
  const child = Bun.spawn(args, {
    cwd,
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out, err };
}

async function invokeReadonly(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<{ code: number; out: string; err: string }> {
  const command = readonlyCommand(args, cwd, env);
  const child = Bun.spawn(command.cmd, {
    cwd,
    env: command.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 5000,
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out, err };
}

async function repositoryRootFromCommand(
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  fallback: string,
): Promise<{ root?: string; error?: string }> {
  const found = await invokeReadonly(args, cwd, env);
  const root = found.out.trim();
  if (found.code === 0 && root !== "") return { root: resolve(root) };
  const reason = found.err.trim();
  return { error: reason !== "" ? reason : fallback };
}

async function defaultRepositoryRoot(
  path: string,
  env: NodeJS.ProcessEnv,
): Promise<{ root?: string; error?: string }> {
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
): Promise<{ rows?: RunRow[]; error?: string }> {
  const result = await invoke(
    ["agx-worker", "ls", "--json", "--all"],
    cwd,
    env,
  );
  if (result.code !== 0)
    return {
      error:
        result.err.trim() !== ""
          ? result.err.trim()
          : `agx ls exited ${result.code}`,
    };
  const parsed = Rows.safeParse(result.out);
  return parsed.success
    ? { rows: parsed.data }
    : { error: "agx ls returned an invalid run list" };
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
  return validateSlug(name, "tkt new");
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
  const env = options.env ?? process.env;
  const ticketPath = resolve(cwd, options.ticketPath);
  const ticket = await ticketSlug(ticketPath);
  if (!ticket.ok) {
    process.stderr.write(`agx dispatch: ${errorMessage(ticket.error)}\n`);
    return 1;
  }
  const slug = ticket.value;
  const wsSlug = options.ws ?? slug;
  const ticketRepo = await defaultRepositoryRoot(dirname(ticketPath), env);
  if (ticketRepo.root === undefined) {
    process.stderr.write(
      `agx dispatch: cannot resolve ticket repository: ${ticketRepo.error}\n`,
    );
    return 1;
  }

  const unitInput = options.unit ?? `agt_${slug}`;
  const unit = unitInput.endsWith(".service")
    ? unitInput.slice(0, -".service".length)
    : unitInput;
  if (!/^[A-Za-z0-9][A-Za-z0-9:_.@-]*$/u.test(unit)) {
    process.stderr.write(
      `agx dispatch: invalid systemd unit name '${unitInput}'\n`,
    );
    return 2;
  }
  if (
    options.sandbox !== undefined &&
    !["none", "read-only", "workspace-write"].includes(options.sandbox)
  ) {
    process.stderr.write(
      "agx dispatch: --sandbox must be none, read-only, or workspace-write\n",
    );
    return 2;
  }
  const whichOptions = env.PATH === undefined ? {} : { PATH: env.PATH };
  if (
    Bun.which("systemctl", whichOptions) === null ||
    Bun.which("systemd-run", whichOptions) === null
  ) {
    process.stderr.write(
      "agx dispatch: systemctl and systemd-run are required\n",
    );
    return 1;
  }
  const active = await invoke(
    ["systemctl", "--user", "is-active", "--quiet", `${unit}.service`],
    cwd,
    env,
  );
  if (active.code === 0) {
    process.stderr.write(
      `agx dispatch: unit ${unit}.service is already running\n`,
    );
    return 1;
  }
  const ws = await invoke(
    ["ws", "add", wsSlug, "--repo", ticketRepo.root, "--reuse", "--json"],
    cwd,
    env,
  );
  if (ws.code !== 0) {
    const reason = ws.err.trim();
    process.stderr.write(
      `agx dispatch: ws add failed: ${reason !== "" ? reason : `exit ${ws.code}`}\n`,
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
      "agx dispatch: ws add returned an invalid workspace path\n",
    );
    return 1;
  }
  const workspace = resolve(parsedWorkspace.data.workspace);

  const workspaceRepo = await defaultRepositoryRoot(workspace, env);
  if (workspaceRepo.root === undefined) {
    process.stderr.write(
      `agx dispatch: cannot verify ticket/workspace repositories: ${workspaceRepo.error}\n`,
    );
    return 1;
  }
  if (ticketRepo.root !== workspaceRepo.root) {
    process.stderr.write(
      `agx dispatch: ticket repository ${ticketRepo.root} differs from workspace repository ${workspaceRepo.root}\n`,
    );
    return 1;
  }

  const parsedBinding = DispatchBindingSchema.safeParse({
    id: randomUUID(),
    ticket: slug,
    workspace,
    unit,
  });
  if (!parsedBinding.success) {
    process.stderr.write("agx dispatch: cannot create run binding\n");
    return 1;
  }
  const binding: DispatchBinding = parsedBinding.data;

  const before = await listedRuns(cwd, env);
  if (before.rows === undefined) {
    process.stderr.write(
      `agx dispatch: cannot read run records: ${before.error}\n`,
    );
    return 1;
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
      `agx dispatch: ${unit}.service did not start: ${reason !== "" ? reason : `systemd-run exited ${started.code}`}\n`,
    );
    return started.code === 0 ? 1 : started.code;
  }

  const waitMs = Number(env.AGX_DISPATCH_WAIT_MS ?? 20_000);
  const deadline =
    Temporal.Now.instant().epochMilliseconds +
    (Number.isFinite(waitMs) ? waitMs : 20_000);
  let listError: string | undefined;
  while (Temporal.Now.instant().epochMilliseconds <= deadline) {
    const current = await listedRuns(cwd, env);
    listError = current.error;
    const run = current.rows?.find((row) => matches(row, binding));
    if (run !== undefined) {
      process.stdout.write(`${run.id}\n`);
      return 0;
    }
    await Bun.sleep(100);
  }
  process.stderr.write(
    `agx dispatch: ${unit}.service started but no matching run record appeared${listError === undefined ? "" : `: ${listError}`}\n`,
  );
  return 1;
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
          description: "previous agx run id to continue",
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
    process.stderr.write(`agx dispatch: ${errorMessage(result.error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.main) await dispatchMain(cliArgv());
