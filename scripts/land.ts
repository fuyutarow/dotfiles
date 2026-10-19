import { ResultAsync as AsyncResult } from "neverthrow";
import { access as accessPath } from "node:fs/promises";

// Consumer: human/agent. Stage verdicts; stop on the first failure. Test seams are executable
// paths LAND_MISE and LAND_SSH (argv is never interpreted by a local shell).
import {
  appendFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { cli } from "cleye";
import {
  type Result,
  errAsync,
  err,
  fromThrowable,
  ok,
  okAsync,
  ResultAsync,
  safeTry,
} from "neverthrow";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import {
  filesets,
  validPath,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";
import { dispatchStateDir } from "../tools/shared/src/dispatch-state.ts";
import { registeredRepos } from "./workspace-repos.ts";
import {
  enqueue,
  landLock,
  landStateDir,
  queueStatus,
  runQueue,
} from "./land-queue.ts";
import { applyToolChangesets } from "./land-changesets.ts";
import type { ConsumerGateReport } from "./consumer-gate.ts";
import {
  landExit,
  landLiveness,
  landSummary,
  ledgerAcceptances,
  lifecycleJudgments,
  type LandReport,
} from "./land-verdict.ts";

const pathExists = (path: Parameters<typeof accessPath>[0]) =>
  accessPath(path).then(
    () => true,
    () => false,
  );

type WorkspaceRun = {
  run_id: string;
  ticket: string;
  workspace?: string;
  judgment?: { decision: "accept" | "reject" } | null;
};

const ConsumerGateReportSchema = jsonOf(
  z.looseObject({
    ok: z.boolean(),
    checked: z.number(),
    lines: z.array(z.string()),
  }),
);

export async function runLandConsumerGates(
  root: string,
  changed: readonly string[],
): Promise<Result<ConsumerGateReport, Error>> {
  const gatePath = join(root, "scripts/consumer-gate.ts");
  let gateUrl = pathToFileURL(join(import.meta.dir, "consumer-gate.ts"));
  if (await pathExists(gatePath)) {
    gateUrl = pathToFileURL(gatePath);
  } else if (changed.includes("scripts/consumer-gate.ts")) {
    return err(new Error("candidate consumer gate is missing after restore"));
  }
  // A fresh process reloads the entire candidate graph after restore. Bun caches
  // file modules even with a changed URL query, including an inline registry schema.
  const source = `const gate = await import(${JSON.stringify(gateUrl.href)});
if (typeof gate.runConsumerGates !== 'function') throw new Error('invalid candidate consumer gate');
process.stdout.write(JSON.stringify(await gate.runConsumerGates(${JSON.stringify(root)}, ${JSON.stringify(changed)})));`;
  const executed = await attempt(() =>
    runProcess([process.execPath, "--eval", source], {
      cwd: root,
      // Each consumer step has its own declared timeout; allow the whole registry
      // to run serially without imposing the ordinary command's two-minute limit.
      timeout: 3_600_000,
    }),
  );
  if (!executed.ok) return err(new Error(errorMessage(executed.error)));
  if (executed.value.exitCode !== 0)
    return err(
      new Error(
        `candidate consumer gate exit ${executed.value.exitCode}: ${executed.value.stderr.toString().trim()}`,
      ),
    );
  const report = ConsumerGateReportSchema.safeParse(
    executed.value.stdout.toString(),
  );
  return report.success
    ? ok(report.data)
    : err(
        new Error(
          `invalid candidate consumer gate report: ${report.error.message}`,
        ),
      );
}

async function nextAgxRuns(
  root: string,
): Promise<Result<WorkspaceRun[], Error>> {
  // Resolve the declaration in the selected tree, never an installed bin that may
  // still point at an entry removed by this landing.
  const packageRoot = join(root, "tools/agx-worker");
  const manifest = jsonOf(
    z.looseObject({ bin: z.looseObject({ "agx-worker": z.string() }) }),
  ).safeParse(await readFile(join(packageRoot, "package.json"), "utf8"));
  if (!manifest.success)
    return err(
      new Error(
        `invalid agx-worker bin declaration: ${manifest.error.message}`,
      ),
    );
  const command = await runProcess(
    [
      process.execPath,
      resolve(packageRoot, manifest.data.bin["agx-worker"]),
      "ls",
      "--json",
    ],
    { cwd: root, env: process.env, timeout: 5_000 },
  );
  if (command.exitCode !== 0)
    return errAsync(
      new Error(`agx ls --json failed: ${command.stderr.toString().trim()}`),
    );
  const parsed = jsonOf(
    z.array(
      z.looseObject({
        id: z.string(),
        ticket: z.string(),
        workspace: z.string(),
        judgment: z
          .looseObject({ decision: z.enum(["accept", "reject"]) })
          .nullable(),
      }),
    ),
  ).safeParse(command.stdout.toString());
  if (!parsed.success)
    return errAsync(
      new Error(
        `agx ls --json returned invalid output: ${parsed.error.message}`,
      ),
    );
  return okAsync(
    parsed.data.map((entry) => ({
      run_id: entry.id,
      ticket: entry.ticket,
      workspace: entry.workspace,
      judgment: entry.judgment,
    })),
  );
}

async function workspaceRuns(
  workspace: string,
  sourceRoot = resolve(import.meta.dir, ".."),
): Promise<Result<WorkspaceRun[], Error>> {
  const lines = await workspaceLedgerLines();
  const target = await realpath(workspace);
  const runs = new Map<string, WorkspaceRun>();
  for (const line of lines) {
    const parsed = jsonOf(
      z.looseObject({
        kind: z.literal("run"),
        run_id: z.string(),
        cwd: z.string().optional(),
        workspace: z.string().optional(),
        ticket: z.looseObject({ name: z.string() }).optional(),
      }),
    ).safeParse(line);
    const matchesWorkspace = async (
      path: string | undefined,
    ): Promise<boolean> =>
      path !== undefined &&
      (await pathExists(path)) &&
      (await realpath(path)) === target;
    if (
      parsed.success &&
      ((await matchesWorkspace(parsed.data.cwd)) ||
        (await matchesWorkspace(parsed.data.workspace)))
    )
      runs.set(parsed.data.run_id, {
        run_id: parsed.data.run_id,
        ticket: parsed.data.ticket?.name ?? parsed.data.run_id,
      });
  }
  const next = await nextAgxRuns(sourceRoot);
  if (next.isErr()) return next;
  const matchingNextRuns: WorkspaceRun[] = [];
  for (const entry of next.value) {
    const path = entry.workspace;
    if (
      path !== undefined &&
      (await pathExists(path)) &&
      (await realpath(path)) === target
    )
      matchingNextRuns.push(entry);
  }
  return ok(Array.from(runs.values()).concat(matchingNextRuns));
}

async function workspaceLedgerLines(): Promise<string[]> {
  const state = dispatchStateDir();
  if (!(await pathExists(state))) return [];
  const archives = (await readdir(state))
    .filter((name) => /^runs-\d{4}-\d{2}-\d{2}\.jsonl$/u.test(name))
    .toSorted()
    .map((name) => join(state, name));
  const live = join(state, "runs.jsonl");
  const ledgerPaths = (await pathExists(live)) ? [...archives, live] : archives;
  return (
    await Promise.all(ledgerPaths.map((path) => readFile(path, "utf8")))
  ).flatMap((text) => text.split("\n"));
}

async function lifecycleLines(): Promise<string[]> {
  const path = join(dispatchStateDir(), "lifecycle.jsonl");
  return (await pathExists(path))
    ? (await readFile(path, "utf8")).split("\n")
    : [];
}

type WorkspaceJudgment = {
  run_id: string;
  ticket: string;
  kind: string;
  accept?: boolean;
  at?: string;
  order: number;
};

function latestJudgment(
  judgments: WorkspaceJudgment[],
  ticket: string,
): WorkspaceJudgment | undefined {
  return judgments
    .filter((judgment) => judgment.ticket === ticket)
    .toSorted((left, right) => {
      const leftAt = timestampMilliseconds(left.at);
      const rightAt = timestampMilliseconds(right.at);
      if (leftAt !== undefined && rightAt !== undefined && leftAt !== rightAt)
        return leftAt - rightAt;
      return left.order - right.order;
    })
    .at(-1);
}

function timestampMilliseconds(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = fromThrowable(
    () => Temporal.Instant.from(value).epochMilliseconds,
    errorMessage,
  )();
  return parsed.isOk() ? parsed.value : undefined;
}

export type WorkspacePreflightVerdict = {
  ticket: string;
  run_id: string;
  accept: boolean;
};

export function workspacePreflightVerdicts(
  workspace: string,
): ResultAsync<WorkspacePreflightVerdict[], Error> {
  return safeTry(async function* () {
    const runs = yield* await workspaceRuns(workspace);
    const ticketByRun = new Map(
      runs.map((workspaceRun) => [workspaceRun.run_id, workspaceRun.ticket]),
    );
    const judgments: WorkspaceJudgment[] = [
      ...ledgerAcceptances(await workspaceLedgerLines()),
      ...lifecycleJudgments(await lifecycleLines()),
      ...runs.flatMap((entry, order) =>
        entry.judgment === undefined || entry.judgment === null
          ? []
          : [
              {
                run_id: entry.run_id,
                ticket: entry.ticket,
                kind: "judged",
                accept: entry.judgment.decision === "accept",
                order: Number.MAX_SAFE_INTEGER + order,
              },
            ],
      ),
    ].flatMap((judgment, order) => {
      const ticket = ticketByRun.get(judgment.run_id);
      return ticket === undefined
        ? []
        : [{ ...judgment, ticket, kind: "acceptance", order }];
    });
    const tickets = [
      ...new Set(runs.map((workspaceRun) => workspaceRun.ticket)),
    ];
    return ok(
      tickets.flatMap((ticket) => {
        const latestRun = runs.findLast((entry) => entry.ticket === ticket);
        return latestRun === undefined
          ? []
          : [
              {
                ticket,
                run_id: latestRun.run_id,
                accept: latestJudgment(judgments, ticket)?.accept === true,
              },
            ];
      }),
    );
  });
}

function recordWorkspaceLanding(
  workspace: string,
  commit: string,
  sourceRoot: string,
): ResultAsync<number, Error> {
  return safeTry(async function* () {
    const ids = yield* await workspaceRuns(workspace, sourceRoot);
    const log = join(dispatchStateDir(), "runs.jsonl");
    for (const { run_id } of ids)
      await appendFile(
        log,
        `${JSON.stringify({ kind: "landed", run_id, commit, at: Temporal.Now.instant().toString() })}\n`,
        { mode: 0o600 },
      );
    return ok(ids.length);
  });
}

const emit = (text: string): void => {
  process.stdout.write(`${text}\n`);
};
export async function packageBinProblems(root: string): Promise<string[]> {
  const problems: string[] = [];
  for await (const manifest of new Bun.Glob("**/package.json").scan({
    cwd: root,
    onlyFiles: true,
  })) {
    if (
      ["node_modules/", ".jj/", ".git/", "archives/"].some((prefix) =>
        manifest.startsWith(prefix),
      )
    )
      continue;
    const source = await fromAsyncThrowable(
      async () => readFile(join(root, manifest), "utf8"),
      errorMessage,
    )();
    if (source.isErr()) continue;
    const parsed = jsonOf(
      z.looseObject({
        bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
      }),
    ).safeParse(source.value);
    if (!parsed.success || parsed.data.bin === undefined) continue;
    const targets =
      typeof parsed.data.bin === "string"
        ? [parsed.data.bin]
        : Object.values(parsed.data.bin);
    for (const target of targets)
      problems.push(
        ...(await packageBinTargetProblems(root, manifest, target)),
      );
  }
  return problems;
}

async function packageBinTargetProblems(
  root: string,
  manifest: string,
  target: string,
): Promise<string[]> {
  const path = resolve(dirname(join(root, manifest)), target);
  const relative = `${manifest.slice(0, -"package.json".length)}${target}`;
  const info = await fromAsyncThrowable(async () => stat(path), errorMessage)();
  if (info.isErr()) return [`${relative}: target does not exist`];
  const source = await fromAsyncThrowable(
    async () => readFile(path, "utf8"),
    errorMessage,
  )();
  if (source.isErr()) return [`${relative}: target cannot be read`];
  const problems: string[] = [];
  if ((info.value.mode & 0o111) === 0)
    problems.push(`${relative}: target is not executable`);
  if (!source.value.startsWith("#!"))
    problems.push(`${relative}: target has no shebang`);
  return problems;
}

async function unresolvedConflictPaths(
  root: string,
  pathList: string[],
): Promise<string[]> {
  const conflicts: string[] = [];
  for (const path of pathList) {
    const file = join(root, path);
    if (!(await pathExists(file))) continue;
    const source = await fromAsyncThrowable(
      async () => readFile(file, "utf8"),
      errorMessage,
    )();
    if (source.isErr()) continue;
    if (/^(?:<<<<<<<|%%%%%%%)/mu.test(source.value)) conflicts.push(path);
  }
  return conflicts;
}

const reject = (reason: string) => err(new Error(reason));
const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("FATAL: unknown option --__proto__\n");
    process.exit(2);
  }
};

function run(
  cwd: string,
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): ResultAsync<string, Error> {
  return safeTry(async function* () {
    const signal = AbortSignal.timeout(600_000);
    const child = Bun.spawn(argv, {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
      env,
    });
    const [stdout, stderr, code] = yield* ResultAsync.fromPromise(
      Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]),
      (error: unknown) => new Error(errorMessage(error)),
    );
    if (signal.aborted || code !== 0) {
      // Preserve hook refusal lines and the real process exit status, without a shell pipe.
      process.stderr.write(`${stdout}${stderr}`);
      return reject(
        `${argv[0]} exited ${code}${signal.aborted ? " (timeout)" : ""}`,
      );
    }
    if (stderr.includes("Refused to snapshot")) return reject(stderr.trim());
    return ok(stdout);
  });
}

const jj = (cwd: string, argv: string[]) =>
  run(cwd, ["jj", "--no-pager", "--color", "never", ...argv]);
const read = (cwd: string, argv: string[]) =>
  jj(cwd, ["--ignore-working-copy", "--at-operation=@", ...argv]);
// Land already executes the accepted candidate's tasks. Scope mise trust to that owned
// workspace for these subprocesses; a fresh state-directory path has no persisted trust.
const landEnvironment = (root: string): NodeJS.ProcessEnv => ({
  ...process.env,
  MISE_TRUSTED_CONFIG_PATHS: root,
});
function usehooksConsumerGate(
  root: string,
  changed: string[],
  alpha: string,
): ResultAsync<string, Error> {
  return safeTry(async function* () {
    if (!changed.some((path) => path.startsWith("tools/agx-usehooks/")))
      return ok("");
    const consumers = await run(
      root,
      [process.env.LAND_MISE ?? "mise", "run", "usehooks:consumers"],
      landEnvironment(root),
    );
    if (consumers.isErr()) {
      yield* jj(root, ["restore", "--from", alpha, "--", ...filesets(changed)]);
      return consumers;
    }
    return consumers;
  });
}
const at = (cwd: string, rev: string, template = "commit_id") =>
  read(cwd, ["log", "--no-graph", "-r", rev, "-T", template]).map((text) =>
    text.trim(),
  );

function pushLandCommit(
  root: string,
  commit: string,
): ResultAsync<void, Error> {
  return safeTry(async function* () {
    yield* jj(root, ["git", "fetch", "--remote", "origin"]);
    yield* jj(root, [
      "bookmark",
      "set",
      "alpha",
      "-r",
      commit,
      "--allow-backwards",
    ]);
    const beforeRebase = yield* jj(root, [
      "op",
      "log",
      "--no-graph",
      "-n",
      "1",
      "-T",
      "id",
    ]);
    yield* jj(root, ["rebase", "-b", "alpha", "-d", "alpha@origin"]);
    if ((yield* at(root, "alpha", "conflict")) !== "false") {
      const conflicts = yield* jj(root, ["resolve", "--list", "-r", "alpha"]);
      const conflictPaths = conflicts
        .split("\n")
        .map((line) => line.replace(/\s+\d+-sided conflict$/u, "").trim())
        .filter((line) => line !== "");
      const restored = await jj(root, [
        "op",
        "restore",
        beforeRebase.trim(),
        "--what",
        "repo",
      ]);
      if (restored.isErr())
        return reject(
          `push rebase conflicted on ${JSON.stringify(conflictPaths)}; restoring the workspace also failed: ${errorMessage(restored.error)}`,
        );
      return reject(
        `push rebase conflicted on ${JSON.stringify(conflictPaths)}; workspace restored to its pre-rebase state`,
      );
    }
    yield* jj(root, [
      "git",
      "push",
      "--bookmark",
      "alpha",
      "--remote",
      "origin",
    ]);
    return ok(undefined);
  });
}

function followMainCheckout(
  root: string,
): ResultAsync<{ conflictPaths: string[]; live: boolean }, Error> {
  return safeTry(async function* () {
    // Other workspaces share the jj store and may have advanced its operation while
    // land was committing or pushing. Refresh this workspace before rebasing it.
    yield* jj(root, ["workspace", "update-stale"]);
    yield* jj(root, ["rebase", "-r", "@", "-o", "alpha"]);
    if ((yield* at(root, "@", "conflict")) !== "false") {
      const conflicts = yield* jj(root, ["resolve", "--list", "-r", "@"]);
      const conflictPaths = conflicts
        .split("\n")
        .map((line) => line.replace(/\s+\d+-sided conflict$/u, "").trim())
        .filter((line) => line !== "");
      return ok({ conflictPaths, live: false });
    }
    const [parent, alpha] = yield* ResultAsync.combine([
      at(root, "@-"),
      at(root, "alpha"),
    ]);
    if (parent !== alpha)
      return reject(
        `main checkout parent ${parent} does not follow alpha ${alpha}`,
      );
    yield* run(
      root,
      [process.env.LAND_MISE ?? "mise", "run", "hook:post-merge"],
      landEnvironment(root),
    );
    return ok({ conflictPaths: [], live: true });
  });
}

function parseWorkspaceList(
  output: string,
  root: string,
): { name: string; path: string }[] {
  return output
    .split("\n")
    .flatMap((line) => {
      const match = /^([^:]+): (.+?) [a-z0-9]{8,} [0-9a-f]{8,} /u.exec(line);
      if (match?.[1] === undefined || match[2] === undefined) return [];
      return [{ name: match[1].trim(), path: resolve(root, match[2]) }];
    })
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

async function resolveWorkspace(
  root: string,
  requested: string,
): Promise<{ name?: string; path?: string; knownNames: string[] }> {
  const listed = await read(root, ["workspace", "list"]);
  if (listed.isErr()) return { knownNames: [] };
  const entries = parseWorkspaceList(listed.value, root);
  const names = entries.map(({ name }) => name);
  const roots = new Map(entries.map(({ name, path }) => [name, path]));
  const aliasedName = requested.startsWith("dotfiles-arm-")
    ? requested.slice("dotfiles-arm-".length)
    : requested;
  const requestedName = roots.has(requested) ? requested : aliasedName;
  const namedRoot = roots.get(requestedName);
  if (namedRoot !== undefined)
    return { name: requestedName, path: namedRoot, knownNames: names };

  const candidatePath = resolve(requested);
  if (!(await pathExists(candidatePath))) return { knownNames: names };
  const candidateRoot = await read(candidatePath, ["workspace", "root"]);
  if (candidateRoot.isErr()) return { knownNames: names };
  const candidate = await realpath(candidateRoot.value.trim());
  for (const entry of entries) {
    if ((await realpath(entry.path)) === candidate)
      return { name: entry.name, path: entry.path, knownNames: names };
  }
  return { knownNames: names };
}

function packageBinMap(text: string): unknown {
  const parsed = jsonOf(z.record(z.string(), z.unknown())).safeParse(text);
  return parsed.success ? parsed.data.bin : Symbol.for("invalid-package-json");
}

function packageBinNames(text: string | undefined): string[] {
  if (text === undefined) return [];
  const parsed = jsonOf(
    z.looseObject({
      name: z.string().optional(),
      bin: z.union([z.string(), z.record(z.string(), z.string())]).optional(),
    }),
  ).safeParse(text);
  if (!parsed.success || parsed.data.bin === undefined) return [];
  if (typeof parsed.data.bin !== "string") return Object.keys(parsed.data.bin);
  const name = parsed.data.name?.split("/").at(-1);
  return name === undefined ? [] : [name];
}

function agxRouterVerbs(text: string | undefined): string[] {
  if (text === undefined) return [];
  const tools = text.match(/\bconst\s+tools\s*=\s*\[([^\]]*)\]/u)?.[1];
  return tools === undefined
    ? []
    : Array.from(
        tools.matchAll(/["']([a-z][a-z0-9-]*)["']/gu),
        (match) => match[1] ?? "",
      );
}

function removalSearchPattern(name: string): string {
  const escaped = name.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  if (name === "jev")
    return `(^|[^[:alnum:]_])agx[[:space:]]+${escaped}([^[:alnum:]_-]|$)|["']agx["'][[:space:]]*,[[:space:]]*["']${escaped}["']`;
  return `(^|[[:space:]"'\u0060])${escaped}($|[[:space:]"'\u0060])`;
}

async function searchRemovalCallers(
  search: string,
  repo: string,
  name: string,
): Promise<Result<string[], Error>> {
  const result = await runProcess(
    [search, "regex", "--project", repo, "--query", removalSearchPattern(name)],
    { cwd: repo, timeout: 30_000 },
  );
  if (result.exitCode === 1) return ok([]);
  if (result.exitCode !== 0)
    return err(
      new Error(
        `repo-retrieve caller search failed for ${name} in ${repo} (exit ${result.exitCode}): ${result.stderr.toString().trim()}`,
      ),
    );
  return ok(
    result.stdout
      .toString()
      .split("\n")
      .flatMap((line) => {
        const match = line.match(/^(.+):(\d+):/u);
        return match?.[1] === undefined || match[2] === undefined
          ? []
          : [`${repo}/${match[1].replace(/^\.\//u, "")}:${match[2]} (${name})`];
      }),
  );
}

export async function removedCommandCallers(
  names: readonly string[],
  commitMessage: string,
  home = process.env.HOME ?? "",
  workspace = join(home, "Workspace"),
): Promise<Result<string[], Error>> {
  const pending = names.filter(
    (name) => !commitMessage.includes(`callers-cleared: ${name}`),
  );
  if (pending.length === 0) return ok([]);
  const search = Bun.which("repo-retrieve");
  if (search === null)
    return err(
      new Error("repo-retrieve is required for removal caller checks"),
    );
  const callers = new Set<string>();
  const searches = registeredRepos(home, workspace).flatMap((repo) =>
    pending.map((name) => ({ repo, name })),
  );
  for (const { repo, name } of searches) {
    const result = await searchRemovalCallers(search, repo, name);
    if (result.isErr()) return err(result.error);
    for (const caller of result.value) callers.add(caller);
  }
  return ok([...callers].toSorted());
}

function removedNames<T>(before: readonly T[], after: readonly T[]): T[] {
  const retained = new Set(after);
  return before.filter((name) => !retained.has(name));
}

function landRemovedCommands(
  root: string,
  changedPaths: readonly string[],
  before: string,
  after: string,
): ResultAsync<string[], Error> {
  return safeTry(async function* () {
    const beforePaths = new Set(
      (yield* jj(root, ["file", "list", "-r", before])).split("\n"),
    );
    const afterPaths = new Set(
      (yield* jj(root, ["file", "list", "-r", after])).split("\n"),
    );
    const removals = new Set<string>();
    for (const path of changedPaths) {
      const isRouter = path === "tools/agx/src/agx.ts";
      if (!isRouter && !path.endsWith("package.json")) continue;
      const oldFile = beforePaths.has(path)
        ? yield* jj(root, ["file", "show", "-r", before, path])
        : undefined;
      const newFile = afterPaths.has(path)
        ? yield* jj(root, ["file", "show", "-r", after, path])
        : undefined;
      const removed = isRouter
        ? removedNames(agxRouterVerbs(oldFile), agxRouterVerbs(newFile))
        : removedNames(packageBinNames(oldFile), packageBinNames(newFile));
      for (const name of removed) removals.add(name);
    }
    return ok([...removals].toSorted());
  });
}

function packageBinMapDiffers(
  oldFile: string | undefined,
  newFile: string | undefined,
): boolean {
  const oldBin = oldFile === undefined ? undefined : packageBinMap(oldFile);
  const newBin = newFile === undefined ? undefined : packageBinMap(newFile);
  return !Bun.deepEquals(oldBin, newBin);
}

function landDeployChanges(
  root: string,
  changedPaths: readonly string[],
  before: string,
  after: string,
): ResultAsync<
  { changedBinMaps: string[]; changedEnvironmentDropins: string[] },
  Error
> {
  return safeTry(async function* () {
    const beforePaths = new Set(
      (yield* jj(root, ["file", "list", "-r", before])).split("\n"),
    );
    const afterPaths = new Set(
      (yield* jj(root, ["file", "list", "-r", after])).split("\n"),
    );
    const changedBinMaps: string[] = [];
    const changedEnvironmentDropins: string[] = [];
    for (const path of changedPaths) {
      const packageManifest = path.endsWith("package.json");
      const environmentDropin = path.startsWith("zsh/environment.d/");
      if (!packageManifest && !environmentDropin) continue;
      const existedBefore = beforePaths.has(path);
      const existsAfter = afterPaths.has(path);
      if (environmentDropin && existedBefore !== existsAfter) {
        changedEnvironmentDropins.push(path);
        continue;
      }
      if (!packageManifest) continue;
      const oldFile = existedBefore
        ? yield* jj(root, ["file", "show", "-r", before, path])
        : undefined;
      const newFile = existsAfter
        ? yield* jj(root, ["file", "show", "-r", after, path])
        : undefined;
      if (packageManifest && packageBinMapDiffers(oldFile, newFile))
        changedBinMaps.push(path);
    }
    return ok({ changedBinMaps, changedEnvironmentDropins });
  });
}

function paths(
  cwd: string,
  from: string,
  to: string,
): ResultAsync<string[], Error> {
  return safeTry(async function* () {
    // TreeDiffEntry.source/target retain BOTH sides of renames, including embedded newlines.
    const raw = yield* read(cwd, [
      "diff",
      "--from",
      from,
      "--to",
      to,
      "-T",
      'source.path() ++ "\\0" ++ target.path() ++ "\\0"',
    ]);
    const result = [
      ...new Set(raw.split("\0").filter((path) => path !== "")),
    ].toSorted();
    if (!result.every((path) => validPath(path)))
      return reject("diff contains invalid repository paths");
    return ok(result);
  });
}

const previewFilter = (src: string) => basename(src) !== "node_modules";

async function previewCopies(
  primary: string,
  worker: string,
  lander: string,
  tmp: string,
): Promise<{ main: string; worker: string; lander: string }> {
  const copyMain = join(tmp, "main");
  const copyWorker = join(tmp, "worker");
  const copyLander = join(tmp, "lander");
  // Copy repository metadata, never another session's main working tree.
  await mkdir(copyMain);
  for (const entry of [".jj", ".git"])
    await cp(join(primary, entry), join(copyMain, entry), { recursive: true });
  await cp(worker, copyWorker, {
    recursive: true,
    filter: previewFilter,
    verbatimSymlinks: true,
  });
  // Colocated stores may use an absolute Git target. Keep every preview write in the copy.
  await writeFile(
    join(copyMain, ".jj", "repo", "store", "git_target"),
    join(copyMain, ".git"),
  );
  await writeFile(
    join(copyWorker, ".jj", "repo"),
    join(copyMain, ".jj", "repo"),
  );
  if (await pathExists(lander)) {
    await cp(lander, copyLander, {
      recursive: true,
      filter: previewFilter,
      verbatimSymlinks: true,
    });
    await writeFile(
      join(copyLander, ".jj", "repo"),
      join(copyMain, ".jj", "repo"),
    );
  }
  return { main: copyMain, worker: copyWorker, lander: copyLander };
}

// A stable workspace under the same per-repository lock/state namespace. Only land writes it.
// Refuse foreign edits BEFORE resetting to alpha, rebasing, formatting or committing anything.
function prepareLander(
  source: string,
  root: string,
  name: string,
): ResultAsync<string, Error> {
  return safeTry(async function* () {
    if (!(await pathExists(root))) {
      yield* jj(source, [
        "workspace",
        "add",
        "--name",
        name,
        "-r",
        "alpha",
        root,
      ]);
    }
    yield* jj(root, ["status"]);
    // The ignore rule `**/node_modules/` matches directories only, so the dependency symlink
    // this function installs below is the one path jj snapshots despite being ignored output.
    const installed =
      (
        await lstat(join(root, "node_modules")).catch(() => null)
      )?.isSymbolicLink() === true;
    const dirty = (yield* paths(root, "@-", "@")).filter(
      (path) => !(installed && path === "node_modules"),
    );
    if (dirty.length > 0)
      return reject(`dirty land tree: ${JSON.stringify(dirty)}`);
    if ((yield* at(root, "@", "conflict")) !== "false")
      return reject("land tree has conflicts");
    const alpha = yield* at(root, "alpha");
    yield* jj(root, ["new", alpha]);
    // Dependencies are installation state, not candidate source. Reuse the running tool's
    // installed packages without running deps (which also changes global command links).
    const modules = resolve(import.meta.dir, "../node_modules");
    if (
      (await pathExists(join(root, "package.json"))) &&
      (await pathExists(modules)) &&
      !(await pathExists(join(root, "node_modules")))
    )
      await symlink(modules, join(root, "node_modules"), "dir");
    return ok(alpha);
  });
}

function format(root: string, changed: string[]): ResultAsync<void, Error> {
  return safeTry(async function* () {
    // Skip deletions, directories and symlinks: formatting a symlink could write outside the set.
    const existing: string[] = [];
    for (const path of changed) {
      if (
        (await pathExists(join(root, path))) &&
        (await lstat(join(root, path))).isFile()
      )
        existing.push(path);
    }
    const groups = [
      { extensions: [".ts"], command: ["bunx", "--bun", "oxfmt"] },
      { extensions: [".md"], command: ["rumdl", "fmt"] },
      {
        // shfmt's Bash parser cannot parse zsh parameter expansions; lint:sh uses zsh -n there.
        extensions: [".sh", ".bash"],
        command: [
          "shfmt",
          "-w",
          "-ln",
          "bash",
          "-i",
          "2",
          "-ci",
          "-sr",
          "-bn",
          "-s",
        ],
      },
    ];
    for (const group of groups) {
      const selected = existing.filter((path) =>
        group.extensions.includes(extname(path)),
      );
      // ./ forces a leading dash filename to be a path for every formatter.
      if (selected.length > 0)
        yield* run(
          root,
          [...group.command, ...selected.map((path) => `./${path}`)],
          landEnvironment(root),
        );
    }
    return ok(undefined);
  });
}

async function mainCheckout(root: string): Promise<string> {
  const repoEntry = join(root, ".jj", "repo");
  const repo = (await lstat(repoEntry)).isFile()
    ? await realpath(
        resolve(dirname(repoEntry), (await readFile(repoEntry, "utf8")).trim()),
      )
    : await realpath(repoEntry);
  return dirname(dirname(repo));
}

async function main(
  argv = Bun.argv.slice(2),
  queueLockHeld = false,
  onReport?: (report: LandReport) => void,
): Promise<number> {
  const parsed = cli(
    {
      name: "land",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["[workspace-name]"],
      flags: {
        enqueue: {
          type: String,
          description:
            "Append a workspace to the serial land queue; requires -m.",
        },
        runQueue: {
          type: Boolean,
          default: false,
          description: "Drain queued work, waiting for the land lock.",
        },
        queueStatus: {
          type: Boolean,
          default: false,
          description: "Print the queue journal and lock owners as JSON.",
        },
        review: {
          type: String,
          description: "Independent agx run ID reviewing this acceptance.",
        },
        message: {
          type: String,
          alias: "m",
          description: "Commit message for the landed workspace.",
        },
        dryRun: {
          type: Boolean,
          default: false,
          description:
            "Preview the landing and host results without committing or deploying.",
        },
      },
    },
    undefined,
    argv,
  );
  const queueModes = [
    parsed.flags.enqueue !== undefined,
    parsed.flags.runQueue,
    parsed.flags.queueStatus,
  ].filter(Boolean).length;
  if (queueModes > 0) {
    const invalid =
      queueModes !== 1 ||
      parsed._.length > 0 ||
      parsed.flags.dryRun ||
      (parsed.flags.enqueue === undefined &&
        (parsed.flags.message !== undefined ||
          parsed.flags.review !== undefined));
    if (invalid) {
      emit(
        "[land] queue: FAIL select exactly one queue mode; positional workspace and --dry-run are not allowed",
      );
      return 2;
    }
    const root = await read(process.cwd(), ["workspace", "root"]);
    if (root.isErr()) {
      emit(`[land] queue: FAIL ${errorMessage(root.error)}`);
      return 2;
    }
    const mainRoot = await mainCheckout(root.value.trim());
    const queued = await attempt(async () => {
      if (parsed.flags.queueStatus) return (await queueStatus(mainRoot)) ?? 0;
      if (parsed.flags.enqueue !== undefined) {
        if ((parsed.flags.message?.trim() ?? "") === "")
          return new Error("--enqueue requires -m <message>");
        const result = await enqueue(mainRoot, {
          ws: parsed.flags.enqueue,
          msg: parsed.flags.message ?? "",
          ...(parsed.flags.review === undefined
            ? {}
            : { review: parsed.flags.review }),
        });
        return result instanceof Error ? result : 0;
      }
      return runQueue(mainRoot, async (item) => {
        let report: LandReport | undefined;
        const exit = await main(
          [
            item.ws,
            "-m",
            item.msg,
            ...(item.review === undefined ? [] : ["--review", item.review]),
          ],
          true,
          (value) => {
            report = value;
          },
        );
        return { exit, ...(report === undefined ? {} : { report }) };
      });
    });
    const result = queued.ok
      ? queued.value
      : new Error(errorMessage(queued.error));
    if (result instanceof Error) {
      emit(`[land] queue: FAIL ${result.message}`);
      return 2;
    }
    return result;
  }
  let stage = "preflight";
  let commit: string | undefined;
  let tmp: string | undefined;
  let landedRoot: string | undefined;
  let restoredPaths: string[] = [];
  const report: LandReport = { commit: "pending", push: "pending" };
  let releaseLand: (() => void | Promise<void>) | undefined;
  await using _landLock = {
    [Symbol.asyncDispose]: async () => {
      if (releaseLand !== undefined) await Promise.try(releaseLand);
    },
  };
  const captured = await attempt(() =>
    safeTry(async function* () {
      await using _tmp = {
        [Symbol.asyncDispose]: async () => {
          if (tmp !== undefined)
            await rm(tmp, { recursive: true, force: true });
        },
      };
      if (parsed._.length !== 1 || (parsed.flags.message?.trim() ?? "") === "")
        return reject("one workspace and -m <message> are required");
      if (parsed.flags.review?.trim() === "")
        return reject("--review requires a non-empty agx run ID");
      const root = (yield* read(process.cwd(), ["workspace", "root"])).trim();
      const mainRoot = await mainCheckout(root);
      const release = queueLockHeld ? () => {} : await landLock(mainRoot);
      if (release instanceof Error) return reject(release.message);
      releaseLand = release;
      const state = landStateDir(mainRoot);
      let landerRoot = join(state, "workspace");
      const landerName = `land-owned-${basename(state)}`;
      const requestedWorkspace = parsed._[0] ?? "";
      const workspace = await resolveWorkspace(root, requestedWorkspace);
      if (workspace.path === undefined || workspace.name === undefined) {
        const knownNames = workspace.knownNames;
        const namesMessage =
          knownNames.length === 0 ? "(none)" : knownNames.join(", ");
        return reject(
          `unknown workspace ${JSON.stringify(requestedWorkspace)}; known workspaces: ${namesMessage}`,
        );
      }
      const workspaceName = workspace.name;
      let workerRoot = workspace.path;
      emit(`[land] workspace: ok ${workspaceName}`);
      if (
        workerRoot === mainRoot ||
        workerRoot === landerRoot ||
        !(await pathExists(workerRoot))
      )
        return reject(
          "worker workspace must exist and differ from the main checkout",
        );
      const binProblems = await packageBinProblems(workerRoot);
      if (binProblems.length > 0)
        return reject(`package bin check failed: ${binProblems.join("; ")}`);
      tmp = parsed.flags.dryRun
        ? await mkdtemp(join(tmpdir(), "land-preview-"))
        : undefined;
      if (tmp !== undefined) {
        const copies = await previewCopies(
          mainRoot,
          workerRoot,
          landerRoot,
          tmp,
        );
        workerRoot = copies.worker;
        landerRoot = copies.lander;
      }
      const alpha = yield* prepareLander(workerRoot, landerRoot, landerName);
      landedRoot = parsed.flags.dryRun ? undefined : landerRoot;
      const verdicts = parsed.flags.dryRun
        ? []
        : yield* workspacePreflightVerdicts(workerRoot);
      for (const { ticket, run_id, accept } of verdicts) {
        if (!accept) {
          return reject(
            `ticket ${ticket} has no current accept judgment; import legacy runs if needed with ` +
              `\`agx stats --import-legacy\`, inspect \`agx ls --json\`, then judge run \`${run_id}\` ` +
              (parsed.flags.review === undefined
                ? `with \`agx judge ${run_id} accept --note "<reason>"\``
                : `with \`agx judge ${run_id} accept --note "independent review ${parsed.flags.review}"\``),
          );
        }
      }
      if (!parsed.flags.dryRun)
        emit(
          `[land] judgment: ok ${verdicts.length} accepted ticket lineage(s)`,
        );
      yield* jj(workerRoot, ["status"]);
      if ((yield* at(workerRoot, "@", "conflict")) !== "false")
        return reject("workspace change has conflicts");
      const initial = yield* paths(workerRoot, "@-", "@");
      if (initial.length === 0) return reject("workspace change is empty");
      emit(
        "[land] preflight: ok land tree is clean; workspace is non-empty and conflict-free",
      );
      stage = "rebase";
      yield* jj(workerRoot, ["rebase", "-r", "@", "-o", alpha]);
      if ((yield* at(workerRoot, "@", "conflict")) !== "false") {
        const conflictPaths = await unresolvedConflictPaths(
          workerRoot,
          initial,
        );
        return reject(
          `rebase introduced conflicts: ${JSON.stringify(conflictPaths)}`,
        );
      }
      emit(
        `[land] rebase: ok ${parsed.flags.dryRun ? "preview " : ""}onto alpha`,
      );
      stage = "paths";
      let changed = yield* paths(workerRoot, alpha, "@");
      if (changed.length === 0)
        return reject("workspace change is empty after rebase");
      const removedCommands = yield* landRemovedCommands(
        landerRoot,
        changed,
        alpha,
        "@",
      );
      if (removedCommands.length > 0) {
        const callers = await removedCommandCallers(
          removedCommands,
          parsed.flags.message ?? "",
        );
        if (callers.isErr()) return reject(errorMessage(callers.error));
        if (callers.value.length > 0)
          return reject(
            `removed command callers remain; clear them or add ${removedCommands.map((name) => `\`callers-cleared: ${name}\``).join(", ")}: ${callers.value.join(", ")}`,
          );
      }
      const basePaths = new Set(
        (yield* jj(landerRoot, [
          "file",
          "list",
          "-r",
          alpha,
          "-T",
          'path ++ "\\0"',
        ]))
          .split("\0")
          .filter((path) => path !== ""),
      );
      emit(`[land] paths: ok ${JSON.stringify(changed)}`);
      stage = "restore";
      const rev = yield* at(workerRoot, "@");
      if (!parsed.flags.dryRun) restoredPaths = changed;
      if (!parsed.flags.dryRun)
        yield* jj(landerRoot, [
          "restore",
          "--from",
          rev,
          "--",
          ...filesets(changed),
        ]);
      emit(
        `[land] restore: ok ${parsed.flags.dryRun ? "would restore" : "restored"} ${changed.length} paths`,
      );
      if (!parsed.flags.dryRun) {
        stage = "changesets";
        const appliedChangesets = await applyToolChangesets(landerRoot);
        if (appliedChangesets.isErr())
          return reject(errorMessage(appliedChangesets.error));
        const landedChangesets = appliedChangesets.value;
        changed = [
          ...new Set([
            ...changed.filter(
              (path) =>
                !landedChangesets.consumedChangesets.includes(path) ||
                basePaths.has(path),
            ),
            ...landedChangesets.releaseFiles,
            ...landedChangesets.consumedChangesets.filter((path) =>
              basePaths.has(path),
            ),
          ]),
        ].toSorted();
        restoredPaths = changed;
        for (const toolRelease of landedChangesets.releases)
          emit(
            `[land] release: ${toolRelease.tool} ${toolRelease.version} (${toolRelease.entries} changeset entries)`,
          );
      }
      stage = "format";
      if (!parsed.flags.dryRun) yield* format(landerRoot, changed);
      emit(
        `[land] format: ok ${parsed.flags.dryRun ? "would format existing paths" : "formatted existing paths"}`,
      );
      stage = "commit";
      if (!parsed.flags.dryRun) {
        const sharedConsumersResult = await runLandConsumerGates(
          landerRoot,
          changed,
        );
        if (sharedConsumersResult.isErr())
          return reject(errorMessage(sharedConsumersResult.error));
        const sharedConsumers = sharedConsumersResult.value;
        for (const line of sharedConsumers.lines)
          emit(`[land] consumers: ${line}`);
        if (!sharedConsumers.ok)
          return reject("consumer commit gate refused landing");
        const consumers = yield* usehooksConsumerGate(
          landerRoot,
          changed,
          alpha,
        );
        if (consumers !== "") emit(consumers.trimEnd());
        const before = yield* at(landerRoot, "@-");
        const committed = await run(
          landerRoot,
          [
            process.env.LAND_MISE ?? "mise",
            "run",
            "commit",
            "--",
            "-m",
            parsed.flags.message ?? "",
            "--",
            ...changed,
          ],
          landEnvironment(landerRoot),
        );
        const after = await at(landerRoot, "@-");
        if (after.isOk() && after.value !== before) commit = after.value;
        if (commit !== undefined) {
          report.commit = "ok";
          emit(`[land] commit: ok ${commit}`);
          stage = "push";
        }
        const failedCommitUnchanged =
          committed.isErr() && after.isOk() && after.value === before;
        if (failedCommitUnchanged)
          yield* jj(landerRoot, [
            "restore",
            "--from",
            alpha,
            "--",
            ...filesets(changed),
          ]);
        if (committed.isErr()) return committed;
        if (after.isErr()) return after;
        commit = after.value;
      }
      report.commit = "ok";
      if (parsed.flags.dryRun) emit("[land] commit: ok preview gated commit");
      if (!parsed.flags.dryRun) {
        stage = "push";
        yield* pushLandCommit(landerRoot, commit ?? "@-");
      }
      report.push = "ok";
      emit(`[land] push: ok ${parsed.flags.dryRun ? "preview" : commit}`);
      if (!parsed.flags.dryRun) {
        const deployChanges = yield* landDeployChanges(
          landerRoot,
          changed,
          alpha,
          commit ?? "alpha",
        );
        stage = "main checkout";
        const mainFollow = yield* followMainCheckout(mainRoot);
        if (mainFollow.live) {
          emit("[land] main checkout: ok follows alpha");
        } else {
          emit(
            `[land] main checkout: NOT LIVE rebase conflicted on ${JSON.stringify(mainFollow.conflictPaths)}`,
          );
        }
        const liveness = landLiveness(
          changed,
          deployChanges.changedBinMaps,
          deployChanges.changedEnvironmentDropins,
        );
        report.live = mainFollow.live && liveness.live;
        if (!liveness.live)
          emit(
            `[land] NOT LIVE until: mise run deploy (changed: ${liveness.deployPaths.join(", ")})`,
          );
        stage = "landed";
        const recorded = yield* recordWorkspaceLanding(
          workerRoot,
          commit ?? "alpha",
          landerRoot,
        );
        emit(`[land] landed: recorded ${recorded} run(s)`);
        stage = "workspace";
        yield* jj(landerRoot, ["workspace", "forget", workspaceName]);
        await rm(workerRoot, { recursive: true, force: true });
        emit(`[land] workspace: removed ${workspaceName}`);
      }
      return ok(undefined);
    }),
  );
  const result = captured.ok
    ? captured.value
    : reject(errorMessage(captured.error));
  if (result.isErr())
    emit(`[land] ${stage}: FAIL ${errorMessage(result.error)}`);
  if (result.isErr()) {
    report.failure = errorMessage(result.error);
    if (stage === "commit") report.commit = "failed";
    if (stage === "push") report.push = "failed";
  }
  // Push is the irreversible boundary: post-push bookkeeping cannot roll back a
  // commit already published to origin.
  if (
    result.isErr() &&
    report.push !== "ok" &&
    landedRoot !== undefined &&
    restoredPaths.length > 0
  ) {
    const cleaned = await jj(landedRoot, [
      "restore",
      "--from",
      "@-",
      "--",
      ...filesets(restoredPaths),
    ]);
    emit(
      cleaned.isOk()
        ? `[land] rollback: restored ${restoredPaths.length} path(s) to the pre-land checkout`
        : `[land] rollback: FAIL ${errorMessage(cleaned.error)}`,
    );
  }
  onReport?.(report);
  emit(`[land] ${landSummary(report, commit)}`);
  return landExit(report);
}

if (import.meta.main)
  process.exitCode = await main().catch((error: unknown) => {
    process.stderr.write(`FATAL: ${errorMessage(error)}\n`);
    return 2;
  });

// Drain both pipes while waiting for the bounded subprocess.
async function runProcess(
  argv: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    stdin?: "ignore";
    stdout?: "pipe";
    stderr?: "pipe";
  } = {},
) {
  const child = Bun.spawn(argv, {
    ...options,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: options.timeout ?? 120_000,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).arrayBuffer(),
    child.exited,
  ]);
  return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode };
}

function fromAsyncThrowable<A extends unknown[], T, E = unknown>(
  fn: (...args: A) => Promise<T>,
  mapError: (error: unknown) => E,
) {
  return (...args: A) =>
    AsyncResult.fromPromise(
      Promise.resolve().then(() => fn(...args)),
      (error: unknown) => mapError(error),
    );
}
