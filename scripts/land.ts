// Consumer: human/agent. Stage verdicts; stop on the first failure. Test seams are executable
// paths LAND_MISE and LAND_SSH (argv is never interpreted by a local shell).
import {
  cpSync,
  appendFileSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { cli } from "cleye";
import { err, fromThrowable, ok, ResultAsync, safeTry } from "neverthrow";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { jsonOf, z } from "../agents/hooks/zod.ts";
import {
  filesets,
  validPath,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";
import { LAND_HOSTS } from "./config-registry.ts";
import { dispatchStateDir } from "../tools/shared/src/dispatch-state.ts";
import { enqueue, landLock, queueStatus, runQueue } from "./land-queue.ts";
import { renderRefusal } from "./render-source.ts";
import { doctorReport, doctorStep } from "./land-doctor.ts";

function recordWorkspaceAcceptance(workspace: string): number {
  const state = dispatchStateDir();
  const log = join(state, "runs.jsonl");
  if (!existsSync(log)) return 0;
  const target = realpathSync(workspace);
  const lines = readFileSync(log, "utf8").split("\n").filter(Boolean);
  const ids = new Set<string>();
  for (const line of lines) {
    const parsed = jsonOf(
      z.looseObject({
        kind: z.literal("run"),
        run_id: z.string(),
        cwd: z.string(),
      }),
    ).safeParse(line);
    if (!parsed.success || !existsSync(parsed.data.cwd)) continue;
    if (realpathSync(parsed.data.cwd) !== target) continue;
    ids.add(parsed.data.run_id);
  }
  for (const run_id of ids)
    appendFileSync(
      log,
      `${JSON.stringify({ kind: "acceptance", run_id, accept: true, at: Temporal.Now.instant().toString(), workspace: target })}\n`,
    );
  return ids.size;
}

const emit = (text: string): void => {
  process.stdout.write(`${text}\n`);
};
const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

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

type Version = { major: number; minor: number; patch: number };
const parseVersion = (value: string): Version | undefined => {
  const match = /^(\d+)\.(\d+)\.(\d+)$/u.exec(value);
  if (match === null) return undefined;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
};
const versionText = ({ major, minor, patch }: Version): string =>
  `${major}.${minor}.${patch}`;
function nextVersion(
  alpha: string,
  base: string,
  workspace: string,
): string | undefined {
  const a = parseVersion(alpha);
  const b = parseVersion(base);
  const w = parseVersion(workspace);
  if (a === undefined || b === undefined || w === undefined) return undefined;
  let bump: "major" | "minor" | "patch" | undefined;
  if (w.major > b.major) bump = "major";
  else if (w.minor > b.minor) bump = "minor";
  else if (w.patch > b.patch) bump = "patch";
  if (bump === undefined) return undefined;
  if (bump === "major")
    return versionText({ major: a.major + 1, minor: 0, patch: 0 });
  if (bump === "minor")
    return versionText({ major: a.major, minor: a.minor + 1, patch: 0 });
  return versionText({ major: a.major, minor: a.minor, patch: a.patch + 1 });
}

function changelogParts(
  text: string,
): { preamble: string; top: string; rest: string } | undefined {
  const start = text.indexOf("## ");
  if (start < 0) return undefined;
  const next = text.indexOf("\n## ", start + 3);
  return {
    preamble: text.slice(0, start).trimEnd(),
    top: text.slice(start, next < 0 ? text.length : next).trimEnd(),
    rest: next < 0 ? "" : text.slice(next + 1).trim(),
  };
}

function samePackageExceptVersion(left: string, right: string): boolean {
  const packageRecord = z.record(z.string(), z.unknown());
  const a = jsonOf(packageRecord).safeParse(left);
  const b = jsonOf(packageRecord).safeParse(right);
  if (!a.success || !b.success) return false;
  delete a.data.version;
  delete b.data.version;
  return JSON.stringify(a.data) === JSON.stringify(b.data);
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

function resolveVersionOnlyConflict(
  workerRoot: string,
  mainRoot: string,
  alpha: string,
  workspaceChange: string,
  workspaceBase: string,
  conflictPaths: string[],
): ResultAsync<{ packagePath: string; version: string }, Error> {
  return safeTry(async function* () {
    const packagePath = conflictPaths.find((path) =>
      /^tools\/[^/]+\/package\.json$/u.test(path),
    );
    if (packagePath === undefined)
      return reject(
        `rebase introduced conflicts: ${JSON.stringify(conflictPaths)}`,
      );
    const changelogPath = packagePath.replace(
      /package\.json$/u,
      "CHANGELOG.md",
    );
    if (conflictPaths.length !== 2 || !conflictPaths.includes(changelogPath))
      return reject(
        `rebase introduced conflicts: ${JSON.stringify(conflictPaths)}`,
      );
    const basePackageText = yield* jj(workerRoot, [
      "file",
      "show",
      "-r",
      workspaceBase,
      packagePath,
    ]);
    const workspacePackageText = yield* jj(workerRoot, [
      "file",
      "show",
      "-r",
      workspaceChange,
      packagePath,
    ]);
    const alphaPackageText = yield* jj(mainRoot, [
      "file",
      "show",
      "-r",
      alpha,
      packagePath,
    ]);
    const packageVersion = z.looseObject({ version: z.string() });
    const basePackage = jsonOf(packageVersion).safeParse(basePackageText);
    const workspacePackage =
      jsonOf(packageVersion).safeParse(workspacePackageText);
    const alphaPackage = jsonOf(packageVersion).safeParse(alphaPackageText);
    if (
      !basePackage.success ||
      !workspacePackage.success ||
      !alphaPackage.success
    )
      return reject(`cannot parse package versions: ${packagePath}`);
    if (!samePackageExceptVersion(basePackageText, workspacePackageText))
      return reject(
        `version conflict also changes package fields: ${packagePath}`,
      );
    const version = nextVersion(
      alphaPackage.data.version,
      basePackage.data.version,
      workspacePackage.data.version,
    );
    if (version === undefined)
      return reject(
        `cannot infer the workspace version bump level: ${packagePath}`,
      );
    const baseChangelog = yield* jj(workerRoot, [
      "file",
      "show",
      "-r",
      workspaceBase,
      changelogPath,
    ]);
    const workspaceChangelog = yield* jj(workerRoot, [
      "file",
      "show",
      "-r",
      workspaceChange,
      changelogPath,
    ]);
    const alphaChangelog = yield* jj(mainRoot, [
      "file",
      "show",
      "-r",
      alpha,
      changelogPath,
    ]);
    const workspaceParts = changelogParts(workspaceChangelog);
    const alphaParts = changelogParts(alphaChangelog);
    const baseParts = changelogParts(baseChangelog);
    if (
      workspaceParts === undefined ||
      alphaParts === undefined ||
      baseParts === undefined
    )
      return reject(`cannot parse top CHANGELOG sections: ${changelogPath}`);
    const baseSections =
      `${baseParts.top}${baseParts.rest === "" ? "" : `\n\n${baseParts.rest}`}`.trim();
    if (
      workspaceParts.preamble !== alphaParts.preamble ||
      workspaceParts.rest.trim() !== baseSections
    )
      return reject(
        `CHANGELOG conflict is not a single additive top entry: ${changelogPath}`,
      );
    if (!/^## \d+\.\d+\.\d+/u.test(workspaceParts.top))
      return reject(
        `workspace CHANGELOG entry has no semantic version: ${changelogPath}`,
      );
    const workspaceTop = workspaceParts.top.replace(
      /^## \d+\.\d+\.\d+/u,
      `## ${version}`,
    );
    alphaPackage.data.version = version;
    writeFileSync(
      join(workerRoot, packagePath),
      `${JSON.stringify(alphaPackage.data, null, 2)}\n`,
    );
    const mergedChangelog = `${alphaParts.preamble}\n\n${workspaceTop}\n\n${alphaParts.top}${alphaParts.rest === "" ? "" : `\n\n${alphaParts.rest}`}\n`;
    writeFileSync(join(workerRoot, changelogPath), mergedChangelog);
    return ok({ packagePath, version });
  });
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

type HostExecution = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

type HostExecutionResult =
  | { ok: true; value: HostExecution }
  | { ok: false; reason: string };

async function runHost(
  cwd: string,
  argv: string[],
  timeoutMs = 600_000,
  env: NodeJS.ProcessEnv = process.env,
): Promise<HostExecutionResult> {
  const result = await attempt(async () => {
    const signal = AbortSignal.timeout(timeoutMs);
    const child = Bun.spawn(argv, {
      cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
      env,
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { code, stdout, stderr, timedOut: signal.aborted };
  });
  return result.ok ? result : { ok: false, reason: errorMessage(result.error) };
}

function extractSmoke(
  stdout: string,
  begin: string,
  end: string,
): { output: string; smoke: string | undefined } {
  const beginToken = `\n${begin}\n`;
  const endToken = `\n${end}\n`;
  const start = stdout.lastIndexOf(beginToken);
  if (start < 0) return { output: stdout, smoke: undefined };
  const finish = stdout.indexOf(endToken, start + beginToken.length);
  if (finish < 0) return { output: stdout, smoke: undefined };
  return {
    output: stdout.slice(0, start) + stdout.slice(finish + endToken.length),
    smoke: stdout.slice(start + beginToken.length, finish).trim(),
  };
}

function printSmoke(host: string, smoke: string | undefined): void {
  if (smoke === undefined) return;
  emit(`[land] smoke: ${host}${smoke === "" ? " (empty)" : ""}`);
  if (smoke !== "") emit(smoke);
}

function hostDiagnostic(stderr: string): string {
  return stderr.trim().replaceAll(/\s+/gu, " ").slice(-1000);
}

const jj = (cwd: string, argv: string[]) =>
  run(cwd, ["jj", "--no-pager", "--color", "never", ...argv]);
const read = (cwd: string, argv: string[]) =>
  jj(cwd, ["--ignore-working-copy", "--at-operation=@", ...argv]);
const at = (cwd: string, rev: string, template = "commit_id") =>
  read(cwd, ["log", "--no-graph", "-r", rev, "-T", template]).map((text) =>
    text.trim(),
  );

function findWorkspaceListMatch(
  output: string,
  requestedPath: string,
  requestedBasename: string,
): { name: string; path: string } | undefined {
  for (const line of output.split("\n")) {
    const [name, path] = line.split("\t");
    if (name === undefined || path === undefined) continue;
    if (
      resolve(path) === resolve(requestedPath) ||
      basename(path) === requestedBasename
    )
      return { name, path };
  }
  return undefined;
}

async function listWorkspaceMatch(
  root: string,
  requestedPath: string,
  requestedBasename: string,
): Promise<{ name: string; path: string } | undefined> {
  const listed = await read(root, [
    "workspace",
    "list",
    "--template",
    'name ++ "\\t" ++ workspace_root ++ "\\n"',
  ]);
  if (listed.isErr()) return undefined;
  return findWorkspaceListMatch(listed.value, requestedPath, requestedBasename);
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

function overlap(left: string[], right: string[]): string[] {
  return left.filter((a) =>
    right.some(
      (b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`),
    ),
  );
}

const previewFilter = (src: string) => basename(src) !== "node_modules";

function previewCopies(
  primary: string,
  worker: string,
  tmp: string,
): { main: string; worker: string } {
  const copyMain = join(tmp, "main");
  const copyWorker = join(tmp, "worker");
  cpSync(primary, copyMain, {
    recursive: true,
    filter: previewFilter,
    verbatimSymlinks: true,
  });
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
  return { main: copyMain, worker: copyWorker };
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
        yield* run(root, [
          ...group.command,
          ...selected.map((path) => `./${path}`),
        ]);
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
          description:
            "Drain queued work, waiting for the land lock and a clean main checkout.",
        },
        queueStatus: {
          type: Boolean,
          default: false,
          description: "Print the queue journal and lock owners as JSON.",
        },
        message: {
          type: String,
          alias: "m",
          description: "Commit message for the landed workspace.",
        },
        smoke: {
          type: String,
          description:
            "Run this command on each deployed host after pull and deps, and print its output.",
        },
        dryRun: {
          type: Boolean,
          default: false,
          description:
            "Preview the landing and host results without committing or deploying.",
        },
        keepWorkspace: {
          type: Boolean,
          default: false,
          description:
            "Keep the accepted workspace for post-deployment verification or a long host migration.",
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
          parsed.flags.smoke !== undefined ||
          parsed.flags.keepWorkspace));
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
          ...(parsed.flags.smoke === undefined
            ? {}
            : { smoke: parsed.flags.smoke }),
          keep_workspace: parsed.flags.keepWorkspace,
        });
        return result instanceof Error ? result : 0;
      }
      return runQueue(mainRoot, (item) =>
        main(
          [
            item.ws,
            "-m",
            item.msg,
            ...(item.smoke === undefined ? [] : ["--smoke", item.smoke]),
            ...(item.keep_workspace ? ["--keep-workspace"] : []),
          ],
          true,
        ),
      );
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
  const hostResults = new Map<string, string>();
  const captured = await attempt(() =>
    safeTry(async function* () {
      const binProblems = await packageBinProblems(process.cwd());
      if (binProblems.length > 0)
        return reject(`package bin check failed: ${binProblems.join("; ")}`);
      if (parsed._.length !== 1 || (parsed.flags.message?.trim() ?? "") === "")
        return reject("one workspace and -m <message> are required");
      for (const host of LAND_HOSTS)
        hostResults.set(
          host.alias,
          host.deploy ? "pending" : `skipped (${host.reason ?? "disabled"})`,
        );
      const root = (yield* read(process.cwd(), ["workspace", "root"])).trim();
      let mainRoot = mainCheckout(root);
      const release = queueLockHeld ? () => {} : await landLock(mainRoot);
      if (release instanceof Error) return reject(release.message);
      using _landLock = { [Symbol.dispose]: release };
      landedRoot = mainRoot;
      const requestedWorkspace = parsed._[0] ?? "";
      const workspaceBasename = basename(requestedWorkspace);
      const directWorkspace = await read(root, [
        "workspace",
        "root",
        "--name",
        workspaceBasename,
      ]);
      let workspaceName = workspaceBasename;
      let workspacePath = directWorkspace.isOk()
        ? directWorkspace.value.trim()
        : undefined;
      if (workspacePath === undefined) {
        const listedMatch = await listWorkspaceMatch(
          root,
          requestedWorkspace,
          workspaceBasename,
        );
        if (listedMatch !== undefined) {
          workspaceName = listedMatch.name;
          workspacePath = listedMatch.path;
        }
      }
      if (workspacePath === undefined) {
        workspaceName = workspaceBasename.startsWith("dotfiles-arm-")
          ? workspaceBasename.slice("dotfiles-arm-".length)
          : workspaceBasename;
        workspacePath = (yield* read(root, [
          "workspace",
          "root",
          "--name",
          workspaceName,
        ])).trim();
      }
      let workerRoot = workspacePath;
      if (workerRoot === mainRoot || !existsSync(workerRoot))
        return reject(
          "worker workspace must exist and differ from the main checkout",
        );
      tmp = parsed.flags.dryRun
        ? mkdtempSync(join(tmpdir(), "land-preview-"))
        : undefined;
      if (tmp !== undefined) {
        const copies = previewCopies(mainRoot, workerRoot, tmp);
        mainRoot = copies.main;
        workerRoot = copies.worker;
      }
      yield* jj(workerRoot, ["status"]);
      yield* jj(mainRoot, ["status"]);
      const alpha = yield* at(mainRoot, "alpha");
      const workspaceChange = yield* at(workerRoot, "@");
      const workspaceBase = yield* at(workerRoot, "@-");
      if ((yield* at(workerRoot, "@", "conflict")) !== "false")
        return reject("workspace change has conflicts");
      const initial = yield* paths(workerRoot, "@-", "@");
      if (initial.length === 0) return reject("workspace change is empty");
      const dirty = yield* paths(mainRoot, "@-", "@");
      const renderDirty = await renderRefusal(mainRoot);
      if (renderDirty !== undefined) return reject(renderDirty.message);
      const refused = overlap(initial, dirty);
      if (refused.length > 0)
        return reject(
          `dirty main checkout overlaps: ${JSON.stringify(refused)}`,
        );
      if ((yield* at(mainRoot, "@-", "commit_id")) !== alpha)
        return reject(
          "main checkout parent must be alpha; run mise run pull first",
        );
      emit(
        "[land] preflight: ok workspace is non-empty, conflict-free and disjoint",
      );
      stage = "rebase";
      yield* jj(workerRoot, ["rebase", "-r", "@", "-o", alpha]);
      if ((yield* at(workerRoot, "@", "conflict")) !== "false") {
        const conflictPaths = unresolvedConflictPaths(workerRoot, initial);
        const repaired = yield* resolveVersionOnlyConflict(
          workerRoot,
          mainRoot,
          alpha,
          workspaceChange,
          workspaceBase,
          conflictPaths,
        );
        yield* jj(workerRoot, ["status"]);
        if ((yield* at(workerRoot, "@", "conflict")) !== "false")
          return reject(
            "version-only conflict repair left unresolved conflicts",
          );
        emit(
          `[land] rebase: resolved version-only conflict ${repaired.packagePath} -> ${repaired.version}`,
        );
      }
      emit(
        `[land] rebase: ok ${parsed.flags.dryRun ? "preview " : ""}onto alpha`,
      );
      stage = "paths";
      const changed = yield* paths(workerRoot, alpha, "@");
      if (changed.length === 0)
        return reject("workspace change is empty after rebase");
      const collisions = overlap(changed, dirty);
      if (collisions.length > 0)
        return reject(
          `dirty main checkout overlaps: ${JSON.stringify(collisions)}`,
        );
      emit(`[land] paths: ok ${JSON.stringify(changed)}`);
      stage = "restore";
      const rev = yield* at(workerRoot, "@");
      if (!parsed.flags.dryRun) restoredPaths = changed;
      if (!parsed.flags.dryRun)
        yield* jj(mainRoot, [
          "restore",
          "--from",
          rev,
          "--",
          ...filesets(changed),
        ]);
      emit(
        `[land] restore: ok ${parsed.flags.dryRun ? "would restore" : "restored"} ${changed.length} paths`,
      );
      stage = "format";
      if (!parsed.flags.dryRun) yield* format(mainRoot, changed);
      emit(
        `[land] format: ok ${parsed.flags.dryRun ? "would format existing paths" : "formatted existing paths"}`,
      );
      stage = "commit";
      if (!parsed.flags.dryRun) {
        const before = yield* at(mainRoot, "@-");
        const committed = await run(mainRoot, [
          process.env.LAND_MISE ?? "mise",
          "run",
          "commit",
          "--",
          "-m",
          parsed.flags.message ?? "",
          "--push",
          "--",
          ...changed,
        ]);
        const after = await at(mainRoot, "@-");
        if (after.isOk() && after.value !== before) commit = after.value;
        const failedCommitUnchanged =
          committed.isErr() && after.isOk() && after.value === before;
        if (failedCommitUnchanged)
          yield* jj(mainRoot, [
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
      emit(`[land] commit: ok ${commit ?? "would gated commit --push"}`);
      if (!parsed.flags.dryRun) {
        stage = "deps";
        yield* run(mainRoot, [process.env.LAND_MISE ?? "mise", "run", "deps"]);
        emit("[land] deps: ok local main checkout");
        const deployEnv = {
          ...process.env,
          DOTFILES_RENDER_REV: commit,
          DOTFILES_RENDER_FROM_WORKING_COPY: "0",
          DOCTOR_ONLY: "",
        };
        yield* run(
          mainRoot,
          [process.env.LAND_MISE ?? "mise", "run", "hook:post-merge"],
          deployEnv,
        );
        const proof = await runHost(
          mainRoot,
          [process.env.LAND_MISE ?? "mise", "run", "doctor"],
          90_000,
          deployEnv,
        );
        const proofExit = proof.ok ? proof.value.code : 2;
        const doctorExit = proof.ok && proof.value.timedOut ? 124 : proofExit;
        const localDoctor = doctorReport(
          proof.ok
            ? `${proof.value.stdout}\n__LAND_DOCTOR_EXIT_${doctorExit}__`
            : undefined,
        );
        for (const line of localDoctor.lines)
          emit(`[land] doctor: local ${line}`);
        hostResults.set(
          "local",
          `${localDoctor.status}; doctor PASS ${localDoctor.pass} / FAIL ${localDoctor.fail}`,
        );
        emit(
          `[land] deploy: ${localDoctor.status} local; doctor PASS ${localDoctor.pass} / FAIL ${localDoctor.fail}`,
        );
        const accepted = recordWorkspaceAcceptance(workerRoot);
        emit(
          `[land] acceptance: recorded ${accepted} run(s) from this workspace`,
        );
      }
      stage = "deploy";
      const smokeBegin = `__LAND_SMOKE_BEGIN_${process.pid}__`;
      const smokeEnd = `__LAND_SMOKE_END_${process.pid}__`;
      for (const host of LAND_HOSTS) {
        if (!host.deploy) {
          const reason = host.reason ?? "disabled";
          hostResults.set(host.alias, `skipped (${reason})`);
          emit(`[land] deploy: skipped ${host.alias} (${reason})`);
          continue;
        }
        if (parsed.flags.dryRun) {
          hostResults.set(host.alias, "would pull, deps and smoke");
          emit(`[land] deploy: ok ${host.alias} preview`);
          continue;
        }
        const smokeStep =
          parsed.flags.smoke === undefined
            ? ""
            : ` && { printf '\\n${smokeBegin}\\n'; ( ${parsed.flags.smoke}\n ) 2>&1; _land_smoke_status=$?; printf '\\n${smokeEnd}\\n'; exit "$_land_smoke_status"; }`;
        const remoteWork = `cd ~/dotfiles && export DOTFILES_RENDER_REV=${shellQuote(commit ?? "alpha")} && mise run pull && mise run deps${doctorStep(smokeBegin, smokeEnd)}${smokeStep}`;
        const locked = `flock -w 600 ~/.cache/dotfiles-land.lock sh -c ${shellQuote(remoteWork)}`;
        const command = `mkdir -p ~/.cache; setsid sh -c ${shellQuote(locked)} & _land_pid=$!; trap 'kill -TERM -$_land_pid 2>/dev/null || true; wait $_land_pid 2>/dev/null || true' HUP TERM INT; wait $_land_pid; _land_status=$?; trap - HUP TERM INT; exit $_land_status`;
        emit(`[land] deploy: waiting for host lock ${host.alias}`);
        const deployed = await runHost(mainRoot, [
          process.env.LAND_SSH ?? "ssh",
          "-o",
          "BatchMode=yes",
          host.alias,
          command,
        ]);
        if (!deployed.ok) {
          const state = `FAIL ${deployed.reason}`;
          hostResults.set(host.alias, state);
          emit(`[land] deploy: FAIL ${host.alias}: ${deployed.reason}`);
          continue;
        }
        const capturedDoctor = extractSmoke(
          deployed.value.stdout,
          `${smokeBegin}_DOCTOR`,
          `${smokeEnd}_DOCTOR`,
        );
        const doctor = doctorReport(capturedDoctor.smoke);
        for (const line of doctor.lines)
          emit(`[land] doctor: ${host.alias} ${line}`);
        const capturedSmoke = extractSmoke(
          capturedDoctor.output,
          smokeBegin,
          smokeEnd,
        );
        printSmoke(host.alias, capturedSmoke.smoke);
        const diagnostic = hostDiagnostic(deployed.value.stderr);
        if (deployed.value.timedOut) {
          const reason = `SSH command timed out${diagnostic === "" ? "" : `: ${diagnostic}`}`;
          hostResults.set(host.alias, `FAIL ${reason}`);
          emit(`[land] deploy: FAIL ${host.alias}: ${reason}`);
          continue;
        }
        if (deployed.value.code === 255) {
          const reason = diagnostic.length > 0 ? diagnostic : "ssh exited 255";
          hostResults.set(host.alias, `unreachable ${reason}`);
          emit(`[land] deploy: unreachable ${host.alias}: ${reason}`);
          continue;
        }
        if (deployed.value.code !== 0) {
          const reason = `remote command exited ${deployed.value.code}${diagnostic === "" ? "" : `: ${diagnostic}`}`;
          hostResults.set(host.alias, `FAIL ${reason}`);
          emit(`[land] deploy: FAIL ${host.alias}: ${reason}`);
          continue;
        }
        hostResults.set(
          host.alias,
          `${doctor.status}; doctor PASS ${doctor.pass} / FAIL ${doctor.fail}`,
        );
        emit(
          `[land] deploy: ${doctor.status} ${host.alias}; doctor PASS ${doctor.pass} / FAIL ${doctor.fail}`,
        );
      }
      const failedHosts = [...hostResults.values()].some(
        (status) =>
          status.startsWith("FAIL ") || status.startsWith("unreachable "),
      );
      if (failedHosts) return reject("one or more host deployments failed");
      if (!parsed.flags.dryRun && !parsed.flags.keepWorkspace) {
        yield* jj(root, ["workspace", "forget", workspaceName]);
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
  if (
    result.isErr() &&
    queueLockHeld &&
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
        ? `[land] queue: restored ${restoredPaths.length} residue path(s)`
        : `[land] queue: residue restore FAIL ${errorMessage(cleaned.error)}`,
    );
  }
  emit(
    `[land] summary: ${result.isOk() ? "ok" : "FAIL"} commit=${commit ?? "none"} hosts=${JSON.stringify(Object.fromEntries(hostResults))}`,
  );
  return result.isOk() ? 0 : 1;
}

if (import.meta.main)
  process.exitCode = await main().catch((error: unknown) => {
    process.stderr.write(`FATAL: ${errorMessage(error)}\n`);
    return 2;
  });
