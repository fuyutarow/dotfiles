// Consumer: human/agent. Stage verdicts; stop on the first failure. Test seams are executable
// paths LAND_MISE and LAND_SSH (argv is never interpreted by a local shell).
import {
  appendFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { cli } from "cleye";
import {
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
import {
  enqueue,
  landLock,
  landStateDir,
  queueStatus,
  runQueue,
} from "./land-queue.ts";
import { applyToolChangesets } from "./land-changesets.ts";
import {
  landExit,
  landLiveness,
  landSummary,
  ledgerAcceptances,
  lifecycleJudgments,
  type LandReport,
} from "./land-verdict.ts";

type WorkspaceRun = {
  run_id: string;
  ticket: string;
  workspace?: string;
  judgment?: { decision: "accept" | "reject" } | null;
};

function nextAgxRuns(): ResultAsync<WorkspaceRun[], Error> {
  const command = Bun.spawnSync(
    [
      process.execPath,
      join(import.meta.dir, "../tools/agx/src/next/cli.ts"),
      "ls",
      "--json",
    ],
    { cwd: process.cwd(), env: process.env, timeout: 5_000 },
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

function workspaceRuns(workspace: string): ResultAsync<WorkspaceRun[], Error> {
  const lines = workspaceLedgerLines();
  const target = realpathSync(workspace);
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
    const matchesWorkspace = (path: string | undefined): boolean =>
      path !== undefined && existsSync(path) && realpathSync(path) === target;
    if (
      parsed.success &&
      (matchesWorkspace(parsed.data.cwd) ||
        matchesWorkspace(parsed.data.workspace))
    )
      runs.set(parsed.data.run_id, {
        run_id: parsed.data.run_id,
        ticket: parsed.data.ticket?.name ?? parsed.data.run_id,
      });
  }
  return nextAgxRuns().map((nextRuns) => {
    const matchingNextRuns = nextRuns.filter((entry) => {
      const path = entry.workspace;
      return (
        path !== undefined && existsSync(path) && realpathSync(path) === target
      );
    });
    return Array.from(runs.values()).concat(matchingNextRuns);
  });
}

function workspaceLedgerLines(): string[] {
  const state = dispatchStateDir();
  if (!existsSync(state)) return [];
  const archives = readdirSync(state)
    .filter((name) => /^runs-\d{4}-\d{2}-\d{2}\.jsonl$/u.test(name))
    .toSorted()
    .map((name) => join(state, name));
  const live = join(state, "runs.jsonl");
  const ledgerPaths = existsSync(live) ? [...archives, live] : archives;
  return ledgerPaths.flatMap((path) => readFileSync(path, "utf8").split("\n"));
}

function lifecycleLines(): string[] {
  const path = join(dispatchStateDir(), "lifecycle.jsonl");
  return existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
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
    const runs = yield* workspaceRuns(workspace);
    const ticketByRun = new Map(
      runs.map((workspaceRun) => [workspaceRun.run_id, workspaceRun.ticket]),
    );
    const judgments: WorkspaceJudgment[] = [
      ...ledgerAcceptances(workspaceLedgerLines()),
      ...lifecycleJudgments(lifecycleLines()),
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
): ResultAsync<number, Error> {
  return safeTry(async function* () {
    const ids = yield* workspaceRuns(workspace);
    const log = join(dispatchStateDir(), "runs.jsonl");
    for (const { run_id } of ids)
      appendFileSync(
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
    const source = fromThrowable(
      () => readFileSync(join(root, manifest), "utf8"),
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
      problems.push(...packageBinTargetProblems(root, manifest, target));
  }
  return problems;
}

function packageBinTargetProblems(
  root: string,
  manifest: string,
  target: string,
): string[] {
  const path = resolve(dirname(join(root, manifest)), target);
  const relative = `${manifest.slice(0, -"package.json".length)}${target}`;
  const info = fromThrowable(() => statSync(path), errorMessage)();
  if (info.isErr()) return [`${relative}: target does not exist`];
  const source = fromThrowable(
    () => readFileSync(path, "utf8"),
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

function unresolvedConflictPaths(root: string, pathList: string[]): string[] {
  const conflicts: string[] = [];
  for (const path of pathList) {
    const file = join(root, path);
    if (!existsSync(file)) continue;
    const source = fromThrowable(
      () => readFileSync(file, "utf8"),
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
      writeSync(2, `${stdout}${stderr}`);
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
  if (!existsSync(candidatePath)) return { knownNames: names };
  const candidateRoot = await read(candidatePath, ["workspace", "root"]);
  if (candidateRoot.isErr()) return { knownNames: names };
  const candidate = realpathSync(candidateRoot.value.trim());
  const match = entries.find(({ path }) => realpathSync(path) === candidate);
  if (match !== undefined)
    return { name: match.name, path: match.path, knownNames: names };
  return { knownNames: names };
}

function packageBinMap(text: string): unknown {
  const parsed = jsonOf(z.record(z.string(), z.unknown())).safeParse(text);
  return parsed.success ? parsed.data.bin : Symbol.for("invalid-package-json");
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

function previewCopies(
  primary: string,
  worker: string,
  lander: string,
  tmp: string,
): { main: string; worker: string; lander: string } {
  const copyMain = join(tmp, "main");
  const copyWorker = join(tmp, "worker");
  const copyLander = join(tmp, "lander");
  // Copy repository metadata, never another session's main working tree.
  mkdirSync(copyMain);
  for (const entry of [".jj", ".git"])
    cpSync(join(primary, entry), join(copyMain, entry), { recursive: true });
  cpSync(worker, copyWorker, {
    recursive: true,
    filter: previewFilter,
    verbatimSymlinks: true,
  });
  // Colocated stores may use an absolute Git target. Keep every preview write in the copy.
  writeFileSync(
    join(copyMain, ".jj", "repo", "store", "git_target"),
    join(copyMain, ".git"),
  );
  writeFileSync(join(copyWorker, ".jj", "repo"), join(copyMain, ".jj", "repo"));
  if (existsSync(lander)) {
    cpSync(lander, copyLander, {
      recursive: true,
      filter: previewFilter,
      verbatimSymlinks: true,
    });
    writeFileSync(
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
    if (!existsSync(root)) {
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
      lstatSync(join(root, "node_modules"), {
        throwIfNoEntry: false,
      })?.isSymbolicLink() === true;
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
      existsSync(join(root, "package.json")) &&
      existsSync(modules) &&
      !existsSync(join(root, "node_modules"))
    )
      symlinkSync(modules, join(root, "node_modules"), "dir");
    return ok(alpha);
  });
}

function format(root: string, changed: string[]): ResultAsync<void, Error> {
  return safeTry(async function* () {
    // Skip deletions, directories and symlinks: formatting a symlink could write outside the set.
    const existing = changed.filter(
      (path) =>
        existsSync(join(root, path)) && lstatSync(join(root, path)).isFile(),
    );
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

function mainCheckout(root: string): string {
  const repoEntry = join(root, ".jj", "repo");
  const repo = lstatSync(repoEntry).isFile()
    ? realpathSync(
        resolve(dirname(repoEntry), readFileSync(repoEntry, "utf8").trim()),
      )
    : realpathSync(repoEntry);
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
    const mainRoot = mainCheckout(root.value.trim());
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
  let releaseLand: (() => void) | undefined;
  using _landLock = {
    [Symbol.dispose]: () => {
      releaseLand?.();
    },
  };
  const captured = await attempt(() =>
    safeTry(async function* () {
      if (parsed._.length !== 1 || (parsed.flags.message?.trim() ?? "") === "")
        return reject("one workspace and -m <message> are required");
      if (parsed.flags.review?.trim() === "")
        return reject("--review requires a non-empty agx run ID");
      const root = (yield* read(process.cwd(), ["workspace", "root"])).trim();
      const mainRoot = mainCheckout(root);
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
        !existsSync(workerRoot)
      )
        return reject(
          "worker workspace must exist and differ from the main checkout",
        );
      const binProblems = await packageBinProblems(workerRoot);
      if (binProblems.length > 0)
        return reject(`package bin check failed: ${binProblems.join("; ")}`);
      tmp = parsed.flags.dryRun
        ? mkdtempSync(join(tmpdir(), "land-preview-"))
        : undefined;
      if (tmp !== undefined) {
        const copies = previewCopies(mainRoot, workerRoot, landerRoot, tmp);
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
        const conflictPaths = unresolvedConflictPaths(workerRoot, initial);
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
        const appliedChangesets = applyToolChangesets(landerRoot);
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
        const liveness = landLiveness(
          changed,
          deployChanges.changedBinMaps,
          deployChanges.changedEnvironmentDropins,
        );
        report.live = liveness.live;
        if (!liveness.live)
          emit(
            `[land] NOT LIVE until: mise run deploy (changed: ${liveness.deployPaths.join(", ")})`,
          );
        stage = "landed";
        const recorded = yield* recordWorkspaceLanding(
          workerRoot,
          commit ?? "alpha",
        );
        emit(`[land] landed: recorded ${recorded} run(s)`);
        stage = "workspace";
        yield* jj(landerRoot, ["workspace", "forget", workspaceName]);
        rmSync(workerRoot, { recursive: true, force: true });
        emit(`[land] workspace: removed ${workspaceName}`);
      }
      return ok(undefined);
    }),
  ).finally(() => {
    if (tmp !== undefined) rmSync(tmp, { recursive: true, force: true });
  });
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
  if (result.isErr() && landedRoot !== undefined && restoredPaths.length > 0) {
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
