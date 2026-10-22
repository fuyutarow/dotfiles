// Run-workspace lifecycle: add, rm, gc. Facts come from jj, .ws.toml and agx.
// Explicit GC observations publish the owner-written verdict inventory for small-file readers.
// Store locks and foreground waiter markers are transient and removed on completion.
import {
  accessSync,
  constants,
  existsSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import {
  rename,
  writeFile,
  lstat,
  mkdir,
  readdir,
  readlink,
  rm,
  rmdir,
  stat,
} from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { projectSlug } from "../../shared/src/agent-name.ts";
import {
  attempt,
  errorMessage,
  type Attempt,
} from "../../shared/src/attempt.ts";
import { acquire, pidAlive } from "../../shared/src/dir-lock.ts";
import { stateDir } from "./state-dir.ts";
import { validateSlug } from "../../shared/src/slug.ts";
import { fromThrowable, jsonOf, z } from "../../shared/src/zod.ts";
import { jjWorkspace, refLocks } from "./jj-workspace.ts";
import { withWorkspaceLock } from "./lock.ts";
import { runStep, StepFailure } from "./subprocess.ts";
import { enterStep } from "./deadline.ts";

for (const retired of ["AGX_DOCTOR_HOME", "AGX_DOCTOR_WORKSPACE"]) {
  if (process.env[retired] !== undefined) {
    process.stderr.write(
      `agx-ws: ${retired} is retired; unset it and use AGX_REPOS_ROOT instead\n`,
    );
    process.exit(2);
  }
}

const bad = (message: string): Attempt<never> => ({
  ok: false,
  error: message,
});
const good = <T>(value: T): Attempt<T> => ({ ok: true, value });
const msg = (failed: { error: unknown }): string => errorMessage(failed.error);
const gcCollectionReason = (
  reason: string,
  result: Attempt<boolean>,
): string => {
  if (!result.ok) return msg(result);
  return result.value ? `${reason}; immutable commit retained` : reason;
};

export type Repo = {
  backing: string;
  name: string;
  parent: string;
  wsRoot: string;
};
export type Config = { ready: string[]; trunk: string; keep: string[] };

export const CONFIG_FILE = ".ws.toml";
const ConfigSchema = z.strictObject({
  ready: z.array(z.string().min(1)).default([]),
  trunk: z.string().min(1).default("trunk()"),
  keep: z.array(z.string().min(1)).default([]),
});
// Lookup accepts historical names so refresh/rm still work after the creation rule changes.
const LEGACY_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const TERMINAL_STATES = new Set(["ended", "orphaned"]);

export type Ran = { code: number; out: string; err: string };

async function exec(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<Attempt<Ran>> {
  const ran = await runStep(cmd, cwd, { env });
  return ran.ok ? good({ ...ran.value, out: ran.value.out.toString() }) : ran;
}

/** Every jj invocation has a named deadline, including reads after workspace creation. */
async function jjOut(
  args: string[],
  cwd: string,
  readonly: boolean,
): Promise<Attempt<string>> {
  // All forget callers, including adoption and readiness rollback, cross this boundary.
  if (args[0] === "workspace" && args[1] === "forget") {
    const name = args[2];
    if (name === undefined) return bad("workspace forget requires a name");
    const repo = resolveRepo(cwd);
    if (!repo.ok) return repo;
    const root = await jjOut(["workspace", "root", "--name", name], cwd, true);
    if (!root.ok) return root;
    const allowed = await removalGuard(
      repo.value,
      resolve(cwd, root.value.trim()),
    );
    if (!allowed.ok) return allowed;
  }
  const ran = await exec(
    [
      "jj",
      "--no-pager",
      "--color=never",
      ...(readonly ? ["--ignore-working-copy"] : []),
      ...args,
    ],
    cwd,
  );
  if (!ran.ok) return bad(`jj ${args.join(" ")}: ${msg(ran)}`);
  return ran.value.code === 0
    ? good(ran.value.out)
    : bad(
        `jj ${args.join(" ")} failed (exit ${ran.value.code}): ${ran.value.err.trim()}`,
      );
}

/** Let jj diagnose staleness; unrelated status failures must never trigger a repair. */
async function updateStale(dir: string): Promise<Attempt<void>> {
  const status = await jjOut(["status"], dir, false);
  if (status.ok) return good(undefined);
  if (!msg(status).includes("working copy is stale")) return status;
  const updated = await jjOut(["workspace", "update-stale"], dir, false);
  return updated.ok ? good(undefined) : updated;
}

export function resolveRepo(path: string): Attempt<Repo> {
  const found = jjWorkspace(path);
  if (!found.ok) return bad(msg(found));
  const backing = found.value.backingRoot;
  const name = basename(backing);
  const parent = dirname(backing);
  return good({ backing, name, parent, wsRoot: join(parent, `${name}.ws`) });
}

/** All commands prefer the main checkout's working policy, then its parent revision. */
export async function readConfig(repo: Repo): Promise<Attempt<Config>> {
  const file = join(repo.backing, CONFIG_FILE);
  const working = existsSync(file);
  const content = working
    ? await attempt(() => Bun.file(file).text())
    : await jjOut(
        ["file", "show", "-r", "@-", CONFIG_FILE],
        repo.backing,
        true,
      );
  if (!content.ok)
    return working
      ? bad(`${file}: ${msg(content)}`)
      : missingCommittedConfig(repo, content);
  const parsed = await attempt(() => Bun.TOML.parse(content.value));
  if (!parsed.ok) return bad(`${file}: ${msg(parsed)}`);
  const checked = ConfigSchema.safeParse(parsed.value);
  return checked.success
    ? good(checked.data)
    : bad(
        `${file}: ${checked.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
}

async function missingCommittedConfig(
  repo: Repo,
  failure: Attempt<never>,
): Promise<Attempt<Config>> {
  const files = await jjOut(
    ["file", "list", "-r", "@-", CONFIG_FILE],
    repo.backing,
    true,
  );
  if (!files.ok) return files;
  return files.value.trim() === ""
    ? good({ ready: [], trunk: "trunk()", keep: [] })
    : failure;
}

function legacyWorkspaceName(slug: string): Attempt<string> {
  return LEGACY_NAME.test(slug)
    ? good(`ws_${slug}`)
    : bad(`invalid slug '${slug}': use letters, digits, '_' and '-'`);
}

/** Filesystem type of the nearest existing ancestor; preserve named step failures. */
export async function fsType(
  path: string,
  runCommand: typeof exec = exec,
): Promise<Attempt<string>> {
  let probe = path;
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  const forms = [
    ["-f", "-c", "%T", probe], // GNU stat
    ["-f", "%T", probe], // BSD stat
  ];
  const failures: string[] = [];
  for (const args of forms) {
    const ran = await runCommand(["stat", ...args], probe);
    if (ran.ok && ran.value.code === 0) return good(ran.value.out.trim());
    failures.push(
      ran.ok
        ? `stat ${args.join(" ")} failed (exit ${ran.value.code}): ${ran.value.err.trim()}`
        : `stat ${args.join(" ")} failed: ${msg(ran)}`,
    );
  }
  return bad(failures.join("; "));
}

export type Graveyard = { path: string };

/** rip's graveyard, refused when RAM-backed: a buried workspace there vanishes on reboot. */
export async function checkGraveyard(): Promise<Attempt<Graveyard>> {
  const data = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
  const path =
    process.env.RIP_GRAVEYARD ??
    process.env.GRAVEYARD ??
    join(data, "graveyard");
  const type = await fsType(path);
  if (!type.ok) return type;
  if (type.value === "tmpfs" || type.value === "ramfs")
    return bad(
      `graveyard ${path} is on ${type.value} (RAM-backed); set RIP_GRAVEYARD to a disk path`,
    );
  return good({ path });
}

async function bury(
  graveyard: Graveyard,
  dir: string,
  commit: string,
): Promise<Attempt<void>> {
  // The directory still contains its store pointer after forget. Recheck before moving it.
  const repo = resolveRepo(dir);
  if (!repo.ok) return repo;
  const allowed = await removalGuard(repo.value, dir, commit);
  if (!allowed.ok) return allowed;
  if (Bun.which("rip") === null)
    return bad("rip is not on PATH: mise run install:tools");
  const ran = await exec(["rip", dir], dirname(dir), {
    GRAVEYARD: graveyard.path,
    RIP_GRAVEYARD: graveyard.path,
  });
  if (!ran.ok) return bad(`rip ${dir}: ${msg(ran)}`);
  return ran.value.code === 0
    ? good(undefined)
    : bad(`rip ${dir} failed: ${ran.value.err.trim()}`);
}

/** Preconditions common to every verb: checked before any work, each failure names its repair. */
function common(repo: Repo): Attempt<void> {
  if (Bun.which("jj") === null)
    return bad("jj is not on PATH: mise run install:tools");
  const writable = fromThrowable(() => {
    accessSync(repo.parent, constants.W_OK);
  })();
  if (writable.isErr())
    return bad(
      `${repo.parent} is not writable: the store lock and ${repo.name}.ws live there`,
    );
  const locks = refLocks({
    root: repo.backing,
    repo: join(repo.backing, ".jj", "repo"),
    backingRoot: repo.backing,
  });
  if (!locks.ok) return bad(msg(locks));
  return locks.value.length > 0
    ? bad(
        `Git ref locks present (another process may be writing): ${locks.value.join(", ")}; they are never removed here`,
      )
    : good(undefined);
}

async function withLock<T>(
  repo: Repo,
  what: string,
  fn: () => Promise<Attempt<T>>,
  skipBusy?: (reason: string) => Attempt<T>,
): Promise<Attempt<T>> {
  return withWorkspaceLock(
    join(repo.parent, `${repo.name}.ws.lock`),
    what,
    fn,
    skipBusy,
  );
}

async function workspaceNames(repo: Repo): Promise<Attempt<string[]>> {
  const out = await jjOut(
    ["workspace", "list", "-T", 'name ++ "\\n"'],
    repo.backing,
    true,
  );
  return out.ok ? good(out.value.split("\n").filter(Boolean)) : out;
}

/** Commits reachable from `tip` and not from trunk, ignoring empty ones: work that has not landed. */
async function unlandedFrom(
  cwd: string,
  tip: string,
  trunk: string,
  readonly: boolean,
): Promise<Attempt<string[]>> {
  const out = await jjOut(
    [
      "log",
      "--no-graph",
      "-r",
      `(::(${tip}) ~ ::(${trunk})) ~ empty()`,
      "-T",
      'commit_id.short(12) ++ " " ++ description.first_line() ++ "\\n"',
    ],
    cwd,
    readonly,
  );
  return out.ok ? good(out.value.split("\n").filter(Boolean)) : out;
}

/**
 * The unlanded changes of a workspace. In the workspace directory jj snapshots its working copy
 * first, so uncommitted edits count. `endCommits` are run-end commit ids recorded by agx.
 * A revset that cannot be evaluated is an error, never "nothing unlanded".
 */
export async function unlanded(
  repo: Repo,
  cfg: Config,
  dir: string,
  name: string,
  endCommits: string[],
): Promise<Attempt<string[]>> {
  const here = existsSync(dir)
    ? await unlandedFrom(dir, "@", cfg.trunk, false)
    : await unlandedFrom(repo.backing, `${name}@`, cfg.trunk, true);
  if (!here.ok) return bad(`cannot judge ${dir}: ${msg(here)}`);
  const found = [...here.value];
  for (const id of endCommits) {
    const past = await unlandedFrom(repo.backing, id, cfg.trunk, true);
    if (!past.ok)
      return bad(`cannot judge run-end commit ${id} of ${dir}: ${msg(past)}`);
    found.push(...past.value.filter((line) => !found.includes(line)));
  }
  return good(found);
}

/** Linux: pids whose cwd lies inside `dir` (a process may work there with no agx record). */
export function pidsInside(dir: string): number[] {
  if (!existsSync("/proc/self/cwd")) return [];
  const inside = (cwd: string): boolean =>
    cwd === dir || cwd.startsWith(dir + sep);
  return readdirSync("/proc")
    .filter((entry) => /^\d+$/u.test(entry))
    .filter((entry) => {
      const cwd = fromThrowable(() => readlinkSync(`/proc/${entry}/cwd`))();
      return cwd.isOk() && inside(cwd.value);
    })
    .map(Number);
}

function busy(dir: string): string | undefined {
  const pids = pidsInside(dir);
  return pids.length === 0
    ? undefined
    : `processes are working inside ${dir} (pid ${pids.join(", ")})`;
}

async function forgetAndBury(
  repo: Repo,
  graveyard: Graveyard,
  name: string,
  dir: string,
  abandon = false,
): Promise<Attempt<boolean>> {
  const burialTip = await jjOut(
    ["log", "--no-graph", "-r", `${name}@`, "-T", "commit_id"],
    repo.backing,
    true,
  );
  if (!burialTip.ok) return burialTip;
  const tip = abandon
    ? await jjOut(
        [
          "log",
          "--no-graph",
          "-r",
          `${name}@`,
          "-T",
          'commit_id ++ "\\t" ++ immutable',
        ],
        repo.backing,
        true,
      )
    : good("");
  if (!tip.ok) return tip;
  const [tipId, immutableValue] = tip.value.trim().split("\t");
  if (
    abandon &&
    (tipId === undefined ||
      (immutableValue !== "true" && immutableValue !== "false"))
  )
    return bad(`cannot determine whether ${name}@ is immutable`);
  let immutable = immutableValue === "true";
  const forgot = await jjOut(
    ["workspace", "forget", name],
    repo.backing,
    false,
  );
  if (!forgot.ok) return forgot;
  if (abandon && !immutable && tipId !== undefined) {
    const abandoned = await jjOut(["abandon", tipId], repo.backing, false);
    if (!abandoned.ok && !msg(abandoned).includes("immutable"))
      return abandoned;
    immutable = !abandoned.ok;
  }
  const buried = await bury(graveyard, dir, burialTip.value.trim());
  return buried.ok ? good(immutable) : buried;
}

/** Hold land's own lock through removal, closing the gap after classification. */
async function collectWorkspace(
  repo: Repo,
  graveyard: Graveyard,
  ws: Workspace,
  abandon = false,
): Promise<Attempt<boolean>> {
  const state = landState(ws);
  if (state === undefined)
    return forgetAndBury(repo, graveyard, ws.name, ws.dir, abandon);
  const release = await acquire(
    join(state, "land.lock"),
    {
      pid: process.pid,
      host: hostname(),
      what: "agx ws gc land-temp",
      since: Temporal.Now.instant().toString(),
    },
    { waitMs: 0 },
  );
  if (typeof release !== "function")
    return bad("land lock acquired by another process; checkout retained");
  const result = await attempt(() =>
    forgetAndBury(repo, graveyard, ws.name, ws.dir),
  );
  release();
  return result.ok ? result.value : bad(msg(result));
}

export type AddOptions = {
  slug: string;
  rev?: string | undefined;
  repo: string;
  reuse?: boolean | undefined;
  json?: boolean | undefined;
};

/** Runs in the coordinator's environment, before a sandboxed worker receives the path. */
async function readyWorkspace(
  dir: string,
  cfg: Config,
  json: boolean,
): Promise<Attempt<void>> {
  enterStep("workspace readiness");
  const current = await updateStale(dir);
  if (!current.ok) return current;
  const sparse = await jjOut(
    ["sparse", "set", "--clear", "--add", "."],
    dir,
    false,
  );
  if (!sparse.ok) return sparse;
  for (const name of ["mise.toml", ".mise.toml"]) {
    const config = join(dir, name);
    if (!(await Bun.file(config).exists())) continue;
    if (Bun.which("mise") === null)
      return bad("mise is not on PATH: mise run install:tools");
    const trusted = await exec(["mise", "trust", config], dir);
    if (!trusted.ok) return bad(`mise trust ${config}: ${msg(trusted)}`);
    if (trusted.value.code !== 0)
      return {
        ok: false,
        error: new StepFailure(
          `mise trust ${config} failed (exit ${trusted.value.code}): ${trusted.value.err.trim()}`,
          trusted.value.code,
        ),
      };
    process.stderr.write(`ws: ready: trusted ${config}\n`);
  }
  for (const command of cfg.ready) {
    process.stderr.write(`ws: ready: ${command}\n`);
    const ran = await runStep(["sh", "-c", command], dir, {
      output: json ? "json" : "inherit",
    });
    if (!ran.ok) return ran;
    if (ran.value.code !== 0)
      return {
        ok: false,
        error: new StepFailure(
          `readiness command failed (exit ${ran.value.code}): ${command}`,
          ran.value.code,
        ),
      };
  }
  return good(undefined);
}

export async function add(options: AddOptions): Promise<Attempt<string>> {
  enterStep("validate workspace and read configuration");
  const slug = validateSlug(options.slug, "agx ws add");
  if (!slug.ok) return slug;
  const name = `ws_${slug.value}`;
  const repo = resolveRepo(options.repo);
  if (!repo.ok) return repo;
  const cfg = await readConfig(repo.value);
  if (!cfg.ok) return cfg;
  const pre = common(repo.value);
  if (!pre.ok) return pre;
  const graveyard = await checkGraveyard();
  if (!graveyard.ok) return graveyard;
  const dir = join(repo.value.wsRoot, name);
  if (options.rev !== undefined) {
    const rev = await jjOut(
      ["log", "--no-graph", "-r", options.rev, "-T", 'commit_id ++ "\\n"'],
      repo.value.backing,
      true,
    );
    if (!rev.ok) return bad(`--rev ${options.rev}: ${msg(rev)}`);
    if (rev.value.split("\n").filter(Boolean).length !== 1)
      return bad(`--rev ${options.rev} must name exactly one commit`);
  }
  enterStep("acquire workspace store lock");
  const result = await withLock(
    repo.value,
    `agx ws add ${options.slug}`,
    async () => {
      enterStep("check workspace registration");
      const names = await workspaceNames(repo.value);
      if (!names.ok) return names;
      const present = existsSync(dir);
      if (present) {
        if (options.reuse === true && names.value.includes(name))
          return good(dir);
        return bad(`${dir} already exists`);
      }
      if (names.value.includes(name))
        return bad(`jj workspace ${name} is already registered`);
      const source = jjWorkspace(options.repo);
      if (!source.ok) return source;
      enterStep("refresh source workspace");
      for (const root of new Set([source.value.root, repo.value.backing])) {
        const current = await updateStale(root);
        if (!current.ok) return current;
      }
      enterStep("create workspace");
      await mkdir(repo.value.wsRoot, { recursive: true });
      const made = await jjOut(
        [
          "workspace",
          "add",
          "--name",
          name,
          ...(options.rev === undefined ? [] : ["-r", options.rev]),
          dir,
        ],
        repo.value.backing,
        false,
      );
      if (!made.ok) return made;
      const ready = await readyWorkspace(dir, cfg.value, options.json === true);
      if (!ready.ok) {
        enterStep("roll back workspace readiness failure");
        const undone = await forgetAndBury(
          repo.value,
          graveyard.value,
          name,
          dir,
        );
        const failure = `${msg(ready)}; ${
          undone.ok
            ? "the new workspace was removed"
            : `rollback also failed: ${msg(undone)} (remove ${dir} by hand)`
        }`;
        return {
          ok: false,
          error: new StepFailure(
            failure,
            ready.error instanceof StepFailure ? ready.error.code : 1,
          ),
        };
      }
      enterStep("release workspace store lock");
      return good(dir);
    },
  );
  // Verdict inventory belongs to explicit gc, never the latency path of one creation.
  return result;
}

/** Repair only the named workspace: no readiness commands or sparse changes. */
export async function refresh(options: {
  slug: string;
  repo: string;
}): Promise<Attempt<string>> {
  const name = legacyWorkspaceName(options.slug);
  if (!name.ok) return name;
  const repo = resolveRepo(options.repo);
  if (!repo.ok) return repo;
  const pre = common(repo.value);
  if (!pre.ok) return pre;
  const dir = join(repo.value.wsRoot, name.value);
  return withLock(repo.value, `agx ws refresh ${options.slug}`, async () => {
    const owner = jjWorkspace(dir);
    if (!owner.ok) return owner;
    if (
      owner.value.root !== dir ||
      owner.value.backingRoot !== repo.value.backing
    )
      return bad(`${dir} is not a jj workspace of ${repo.value.backing}`);
    const names = await workspaceNames(repo.value);
    if (!names.ok) return names;
    if (!names.value.includes(name.value))
      return bad(`${name.value} is not a registered jj workspace`);
    const current = await updateStale(dir);
    return current.ok ? good(dir) : current;
  });
}

export async function remove(options: {
  slug: string;
  repo: string;
}): Promise<Attempt<string>> {
  const name = legacyWorkspaceName(options.slug);
  if (!name.ok) return name;
  const repo = resolveRepo(options.repo);
  if (!repo.ok) return repo;
  const cfg = await readConfig(repo.value);
  if (!cfg.ok) return cfg;
  const pre = common(repo.value);
  if (!pre.ok) return pre;
  const graveyard = await checkGraveyard();
  if (!graveyard.ok) return graveyard;
  const dir = join(repo.value.wsRoot, name.value);
  if (protectedWorkspace(repo.value, cfg.value, { name: name.value, dir }))
    return bad(`${dir} is kept by .ws.toml`);
  if (!existsSync(dir)) return bad(`${dir} does not exist`);
  const result = await withLock(
    repo.value,
    `agx ws rm ${options.slug}`,
    async () => {
      const names = await workspaceNames(repo.value);
      if (!names.ok) return names;
      if (!names.value.includes(name.value))
        return bad(
          `${name.value} is not a registered jj workspace of ${repo.value.backing}`,
        );
      const occupied = busy(realOr(dir));
      if (occupied !== undefined) return bad(occupied);
      const work = await unlanded(repo.value, cfg.value, dir, name.value, []);
      if (!work.ok) return work;
      if (work.value.length > 0)
        return bad(
          `${dir} has unlanded changes; land or abandon them first:\n${work.value.map((l) => `  ${l}`).join("\n")}`,
        );
      const done = await forgetAndBury(
        repo.value,
        graveyard.value,
        name.value,
        dir,
      );
      return done.ok ? good(dir) : done;
    },
  );
  if (result.ok)
    await gc({ repo: options.repo, dryRun: true, includeUnrecorded: false });
  return result;
}

const RunRecord = z.looseObject({
  id: z.string(),
  state: z.string(),
  started_at: z.string().optional(),
  cwd: z.string().nullable().optional(),
  workspace: z.string().nullable().optional(),
  continues: z.string().nullable().optional(),
  end_commit: z.string().nullable().optional(),
  ended_at: z.string().nullable().optional(),
  outcome: z.string().nullable().optional(),
  judgment: z.looseObject({ decision: z.string() }).nullable().optional(),
});
export type RunRecord = z.output<typeof RunRecord>;

/** Fail closed before effects; content equality and elapsed time are not judgments. */
async function runRemovalReason(
  repo: Repo,
  dir: string,
  records: RunRecord[],
  forgottenCommit?: string,
): Promise<string | undefined> {
  const lineage = lineageOf(records, realOr(dir));
  const live = lineage.find((r) => !TERMINAL_STATES.has(r.state));
  if (live !== undefined)
    return `live or continuing run ${live.id} (${live.state})`;
  // Continuations supersede their parents. Timestamps order unrelated runs, irrespective
  // of the order returned by the inventory. Missing/invalid dates retain all candidates.
  const parents = new Set(lineage.map((r) => r.continues));
  const leaves = lineage.filter((r) => !parents.has(r.id));
  if (lineage.length > 0 && leaves.length === 0)
    return "cyclic run lineage; keep";
  const dates = leaves.map((r) =>
    fromThrowable(
      () => Temporal.Instant.from(r.started_at ?? "").epochMilliseconds,
    )().unwrapOr(Number.NaN),
  );
  const latest = dates.every((date) => Number.isFinite(date))
    ? leaves.filter((_, i) => dates[i] === Math.max(...dates))
    : leaves;
  for (const run of latest) {
    const decision = run.judgment?.decision;
    if (decision === "reject") continue;
    if (decision !== "accept") return `run ${run.id} is unjudged; keep`;
    // Current worker inventories omit end_commit. In that case require the actual
    // workspace commit to be reachable; never substitute content equality for ancestry.
    let tip =
      forgottenCommit === undefined
        ? await jjOut(
            ["log", "--no-graph", "-r", "@", "-T", "commit_id"],
            dir,
            true,
          )
        : good(forgottenCommit);
    if (
      run.end_commit !== undefined &&
      run.end_commit !== null &&
      run.end_commit !== ""
    )
      tip = good(run.end_commit);
    if (!tip.ok)
      return `cannot read accepted run ${run.id} change: ${msg(tip)}`;
    const commit = tip.value.trim();
    if (!/^[0-9a-f]{40,64}$/u.test(commit))
      return `accepted run ${run.id} has an invalid run-end commit; keep`;
    const cfg = await readConfig(repo);
    if (!cfg.ok) return msg(cfg);
    const landed = await jjOut(
      [
        "log",
        "--no-graph",
        "-r",
        `(${commit}) & ::(${cfg.value.trunk})`,
        "-T",
        "commit_id",
      ],
      repo.backing,
      true,
    );
    if (!landed.ok)
      return `cannot establish landing for ${run.id}: ${msg(landed)}`;
    if (landed.value.trim() !== commit)
      return `accepted run ${run.id} is not reachable from ${cfg.value.trunk}; keep`;
  }
  return undefined;
}

async function removalGuard(
  repo: Repo,
  dir: string,
  forgottenCommit?: string,
): Promise<Attempt<void>> {
  const records = await agxRecords(repo.backing);
  if (!records.ok) return records;
  const reason = await runRemovalReason(
    repo,
    dir,
    records.value,
    forgottenCommit,
  );
  return reason === undefined ? good(undefined) : bad(reason);
}

async function agxRecords(cwd: string): Promise<Attempt<RunRecord[]>> {
  if (Bun.which("agx") === null)
    return bad("agx is not on PATH: mise run deps");
  const ran = await exec(["agx", "worker", "ls", "--json"], cwd);
  if (!ran.ok) return bad(`agx worker ls --json: ${msg(ran)}`);
  if (ran.value.code !== 0)
    return bad(
      `agx worker ls --json failed (exit ${ran.value.code}): ${ran.value.err.trim()}`,
    );
  const json = jsonOf(z.array(RunRecord)).safeParse(ran.value.out);
  return json.success
    ? good(json.data)
    : bad(`agx worker ls --json: unexpected output: ${json.error.message}`);
}

const realCache = new Map<string, string>();
function realOr(path: string): string {
  const cached = realCache.get(path);
  if (cached !== undefined) return cached;
  const real = fromThrowable(() => realpathSync(path))();
  const resolved = real.isOk() ? real.value : path;
  realCache.set(path, resolved);
  return resolved;
}

function within(path: string | null | undefined, dir: string): boolean {
  if (path === null || path === undefined || path === "") return false;
  const real = realOr(path);
  return real === dir || real.startsWith(dir + sep);
}

/** Records that touched `dir`, closed over `continues` links in both directions. */
export function lineageOf(records: RunRecord[], dir: string): RunRecord[] {
  const links = new Map<string, string[]>();
  const link = (a: string, b: string): void => {
    links.set(a, [...(links.get(a) ?? []), b]);
  };
  for (const r of records) {
    if (r.continues === null || r.continues === undefined) continue;
    link(r.id, r.continues);
    link(r.continues, r.id);
  }
  const seen = new Set<string>();
  const pending = records
    .filter((r) => within(r.workspace, dir) || within(r.cwd, dir))
    .map((r) => r.id);
  for (const id of pending) {
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...(links.get(id) ?? []));
  }
  return records.filter((r) => seen.has(r.id));
}

export type GcOptions = {
  repo: string;
  dryRun: boolean;
  includeUnrecorded: boolean;
  legacy?: boolean;
  abandoned?: boolean;
};

type Workspace = { name: string; dir: string; change?: string; age?: string };
type Classification = {
  verdict: string;
  change: string;
  age: string;
  reason: string;
  collect: boolean;
};

function landState(ws: Workspace): string | undefined {
  const root = realOr(join(stateDir(), "land"));
  const dir = realOr(ws.dir);
  const state = dirname(dir);
  return basename(dir) === "workspace" && dirname(state) === root
    ? state
    : undefined;
}

async function landBusy(state: string): Promise<boolean> {
  const lock = join(state, "land.lock");
  const present = await attempt(() => stat(lock));
  if (!present.ok) {
    const error = z
      .object({ code: z.literal("ENOENT") })
      .safeParse(present.error);
    return !error.success;
  }
  const owner = await attempt(() => Bun.file(join(lock, "owner.json")).text());
  if (!owner.ok) return true;
  const holder = jsonOf(
    z.object({ pid: z.number().int().positive(), host: z.string() }),
  ).safeParse(owner.value);
  return (
    !holder.success ||
    holder.data.host !== hostname() ||
    pidAlive(holder.data.pid)
  );
}

/** Enumeration and path resolution both come from this repository's jj record. */
async function workspaces(repo: Repo): Promise<Attempt<Workspace[]>> {
  const listed = await jjOut(
    [
      "-R",
      repo.backing,
      "workspace",
      "list",
      "-T",
      'json(name) ++ "\\t" ++ target.change_id().short(12) ++ "\\t" ++ target.committer().timestamp().ago() ++ "\\n"',
    ],
    repo.backing,
    true,
  );
  if (!listed.ok) return listed;
  const found: Workspace[] = [];
  for (const line of listed.value.trim().split("\n").filter(Boolean)) {
    const [encoded, change, age] = line.split("\t");
    const parsed = jsonOf(z.string().min(1)).safeParse(encoded);
    if (!parsed.success)
      return bad("invalid workspace name from jj workspace list");
    const name = parsed.data;
    const root = await jjOut(
      ["-R", repo.backing, "workspace", "root", "--name", name],
      repo.backing,
      true,
    );
    if (!root.ok) return bad(`cannot resolve workspace ${name}: ${msg(root)}`);
    const resolvedRoot = root.value.trim();
    if (resolvedRoot === "")
      return bad(
        `no recorded path for workspace ${name}; refusing incomplete enumeration`,
      );
    const dir = resolve(repo.backing, resolvedRoot);
    if (realOr(dir) !== realOr(repo.backing))
      found.push({ name, dir, change: change ?? "?", age: age ?? "?" });
  }
  return good(found);
}

function keepEntries(repo: Repo, cfg: Config, ws: Workspace): string[] {
  return cfg.keep.filter((entry) => {
    if (entry === ws.name) return true;
    const path = entry.startsWith("~/")
      ? join(homedir(), entry.slice(2))
      : resolve(repo.backing, entry);
    return realOr(path) === realOr(ws.dir);
  });
}

function protectedWorkspace(repo: Repo, cfg: Config, ws: Workspace): boolean {
  return keepEntries(repo, cfg, ws).length > 0;
}

export type AdoptOptions = {
  path?: string | undefined;
  repo?: string | undefined;
  slug?: string | undefined;
  all: boolean;
  dryRun: boolean;
  includeKept: boolean;
  fixNames?: boolean;
};

/** Strip layout markers before normalization; run-id suffixes remain part of the slug. */
function adoptionSlug(repo: Repo, dir: string): string {
  let name = basename(dir).replace(/^ws_/u, "");
  for (const prefix of [
    `${repo.name}-arm-`,
    `${repo.name}-ws-`,
    "dotfiles-arm-",
  ]) {
    if (name.startsWith(prefix)) {
      name = name.slice(prefix.length);
      break;
    }
  }
  return projectSlug(name);
}

/** Re-home the snapshotted change; jj creates all pointers and path registrations. */
async function moveWorkspace(
  repo: Repo,
  ws: Workspace,
  target: string,
  name: string,
  graveyard: Graveyard,
): Promise<Attempt<void>> {
  const permitted = await removalGuard(repo, ws.dir);
  if (!permitted.ok) return permitted;
  const occupied = busy(realOr(ws.dir));
  if (occupied !== undefined) return bad(occupied);
  const change = await jjOut(
    ["log", "--no-graph", "-r", "@", "-T", "change_id"],
    ws.dir,
    false,
  );
  if (!change.ok) return change;
  const before = await jjOut(["diff", "--git"], ws.dir, true);
  if (!before.ok) return before;
  const rootInfo = await attempt(() => lstat(repo.wsRoot));
  if (
    !rootInfo.ok &&
    !z.object({ code: z.literal("ENOENT") }).safeParse(rootInfo.error).success
  )
    return bad(`cannot inspect ${repo.wsRoot}: ${msg(rootInfo)}`);
  const hadRoot = rootInfo.ok;
  await mkdir(repo.wsRoot, { recursive: true });
  // Reserve even empty targets: jj itself accepts an existing empty directory.
  const reserved = await attempt(() => mkdir(target));
  if (!reserved.ok) {
    if (!hadRoot) await rmdir(repo.wsRoot);
    return bad(`${target}: cannot reserve destination: ${msg(reserved)}`);
  }
  const rollback = async (failure: unknown): Promise<Attempt<void>> => {
    const names = await workspaceNames(repo);
    if (!names.ok)
      return bad(`${errorMessage(failure)}; rollback failed: ${msg(names)}`);
    if (names.value.includes(name)) {
      const forgot = await jjOut(
        ["workspace", "forget", name],
        repo.backing,
        false,
      );
      if (!forgot.ok)
        return bad(`${errorMessage(failure)}; rollback failed: ${msg(forgot)}`);
    }
    const allowed = await removalGuard(repo, target);
    if (!allowed.ok)
      return bad(
        `${errorMessage(failure)}; rollback retained workspace: ${msg(allowed)}`,
      );
    const removed = await attempt(async () => {
      await rm(target, { recursive: true, force: true });
      if (!hadRoot) await rmdir(repo.wsRoot);
    });
    return bad(
      `${errorMessage(failure)}; ${removed.ok ? "new workspace removed; old workspace retained" : `rollback failed: ${msg(removed)}`}`,
    );
  };
  const moved = await attempt(async (): Promise<Attempt<void>> => {
    const made = await jjOut(
      ["workspace", "add", "--name", name, "--sparse-patterns", "full", target],
      repo.backing,
      false,
    );
    if (!made.ok) return made;
    const edited = await jjOut(["edit", change.value.trim()], target, false);
    if (!edited.ok) return edited;
    const status = await jjOut(["status"], target, false);
    if (!status.ok) return status;
    const after = await jjOut(
      ["log", "--no-graph", "-r", "@", "-T", "change_id"],
      target,
      true,
    );
    if (!after.ok) return after;
    const diff = await jjOut(["diff", "--git"], target, true);
    if (!diff.ok) return diff;
    if (after.value !== change.value || diff.value !== before.value)
      return bad("change id or diff mismatch");
    const active = busy(realOr(ws.dir));
    if (active !== undefined) return bad(active);
    // Remember precisely the forget operation so a burial failure can restore the old
    // registration without rewinding unrelated operations in this shared store.
    const burialTip = await jjOut(
      ["log", "--no-graph", "-r", `${ws.name}@`, "-T", "commit_id"],
      repo.backing,
      true,
    );
    if (!burialTip.ok) return burialTip;
    const forgot = await jjOut(
      ["workspace", "forget", ws.name],
      repo.backing,
      false,
    );
    if (!forgot.ok) return forgot;
    const operation = await jjOut(
      ["op", "log", "--no-graph", "-n", "1", "-T", "id"],
      repo.backing,
      true,
    );
    const buried = operation.ok
      ? await bury(graveyard, ws.dir, burialTip.value.trim())
      : operation;
    if (buried.ok) return good(undefined);
    const restored = operation.ok
      ? await jjOut(
          ["op", "revert", operation.value.trim()],
          repo.backing,
          true,
        )
      : bad("cannot identify forget operation");
    return bad(
      `${msg(buried)}${restored.ok ? "" : `; old registration recovery failed: ${msg(restored)}`}`,
    );
  });
  const result = moved.ok ? moved.value : bad(msg(moved));
  return result.ok ? result : rollback(result.error);
}

const adoptLine = (dir: string, target: string, verdict: string): string =>
  [dir, target, verdict]
    .map((field) => field.replaceAll("\t", "\\t").replaceAll("\n", "\\n"))
    .join("\t");

/** Compare raw bytes (including binary files) without opening or snapshotting the orphan. */
async function orphanFileDifference(
  repo: Repo,
  dir: string,
  trunk: string,
  path: string,
): Promise<string | undefined> {
  const disk = join(dir, path);
  const info = await attempt(() => lstat(disk));
  if (!info.ok) {
    const missing = z
      .object({ code: z.literal("ENOENT") })
      .safeParse(info.error);
    return missing.success ? `yes: missing ${path}` : `unknown: ${msg(info)}`;
  }
  if (!info.value.isFile() && !info.value.isSymbolicLink())
    return `yes: file type differs at ${path}`;
  const compared = await attempt(async () => {
    const ran = await runStep(
      [
        "jj",
        "--ignore-working-copy",
        "--no-pager",
        "file",
        "show",
        "-r",
        trunk,
        `root-file:${path}`,
      ],
      repo.backing,
    );
    if (!ran.ok) return `unknown: ${msg(ran)}`;
    const { out: expected, err, code } = ran.value;
    if (code !== 0) return `unknown: ${err.trim()}`;
    const actual = info.value.isSymbolicLink()
      ? Buffer.from(await readlink(disk))
      : Buffer.from(await Bun.file(disk).arrayBuffer());
    return actual.equals(Buffer.from(expected))
      ? undefined
      : `yes: bytes differ at ${path}`;
  });
  return compared.ok ? compared.value : `unknown: ${msg(compared)}`;
}

/** File content/path comparison, including extra files; .jj/.git metadata is excluded. */
async function orphanDifference(
  repo: Repo,
  dir: string,
  trunk: string,
): Promise<string> {
  const listed = await jjOut(
    ["file", "list", "-r", trunk, "-T", 'json(path) ++ "\\n"'],
    repo.backing,
    true,
  );
  if (!listed.ok) return `unknown: ${msg(listed)}`;
  const paths: string[] = [];
  for (const line of listed.value.split("\n").filter(Boolean)) {
    const path = jsonOf(z.string()).safeParse(line);
    if (!path.success) return "unknown: invalid trunk file list";
    paths.push(path.data);
    const difference = await orphanFileDifference(repo, dir, trunk, path.data);
    if (difference !== undefined) return difference;
  }
  return orphanExtraFiles(dir, new Set(paths));
}

async function orphanExtraFiles(
  dir: string,
  known: Set<string>,
): Promise<string> {
  const pending = [dir];
  let visited = 0;
  while (pending.length > 0) {
    const path = pending.pop();
    if (path === undefined) break;
    if (++visited > 100_000)
      return "unknown: file inventory exceeds 100000 entries";
    const info = await attempt(() => lstat(path));
    if (!info.ok) return `unknown: ${msg(info)}`;
    if (!info.value.isDirectory() && !known.has(relative(dir, path)))
      return `yes: extra file ${relative(dir, path)}`;
    if (!info.value.isDirectory()) continue;
    const entries = await attempt(() => readdir(path));
    if (!entries.ok) return `unknown: ${msg(entries)}`;
    pending.push(
      ...entries.value
        .filter((name) => name !== ".jj" && name !== ".git")
        .map((name) => join(path, name)),
    );
  }
  return "no (file bytes and paths; excludes .jj/.git metadata)";
}

/** Discover legacy sibling/nested leftovers without following directory symlinks. */
async function orphanLines(
  repo: Repo,
  cfg: Config,
  registered: Workspace[],
): Promise<Attempt<string[]>> {
  const siblings = await attempt(() =>
    readdir(repo.parent, { withFileTypes: true }),
  );
  if (!siblings.ok) return siblings;
  const roots = siblings.value
    .filter(
      (entry) =>
        entry.isDirectory() &&
        (entry.name.startsWith(`${repo.name}-arm-`) ||
          entry.name.startsWith(`${repo.name}-ws-`) ||
          (entry.name.startsWith("dotfiles-arm-") &&
            (() => {
              const owner = jjWorkspace(join(repo.parent, entry.name));
              return owner.ok && owner.value.backingRoot === repo.backing;
            })()) ||
          entry.name === `${repo.name}-ws`),
    )
    .map((entry) => join(repo.parent, entry.name));
  const candidates = roots.filter(
    (path) => basename(path) !== `${repo.name}-ws`,
  );
  for (const root of roots.filter(
    (path) => basename(path) === `${repo.name}-ws`,
  )) {
    const nested = await attempt(() => readdir(root, { withFileTypes: true }));
    if (!nested.ok) return nested;
    candidates.push(
      ...nested.value
        .filter((entry) => entry.isDirectory())
        .map((entry) => join(root, entry.name)),
    );
  }
  const seen = new Set(registered.map((ws) => realOr(ws.dir)));
  const lines: string[] = [];
  for (const dir of candidates) {
    if (seen.has(realOr(dir))) continue;
    const target = join(repo.wsRoot, `ws_${adoptionSlug(repo, dir)}`);
    const difference = await orphanDifference(repo, dir, cfg.trunk);
    lines.push(
      adoptLine(
        dir,
        target,
        `orphan: files differ from ${cfg.trunk}: ${difference}; not registered in jj workspace list; owner decision required; never adopted`,
      ),
    );
  }
  return good(lines);
}

async function adoptRow(
  repo: Repo,
  cfg: Config,
  ws: Workspace,
  options: AdoptOptions,
  reserved: Set<string>,
  targets: Set<string>,
  graveyard?: Graveyard,
): Promise<{ line: string; failed: boolean }> {
  const name = `ws_${options.slug === undefined ? adoptionSlug(repo, ws.dir) : projectSlug(options.slug)}`;
  const target = join(repo.wsRoot, name);
  const kept = keepEntries(repo, cfg, ws);
  const present = await attempt(() => lstat(target));
  const source = jjWorkspace(ws.dir);
  let reason: string | undefined;
  if (realOr(ws.dir) === realOr(target))
    reason = "already at target workspace path";
  else if (!source.ok) reason = msg(source);
  else if (
    source.value.root !== realOr(ws.dir) ||
    source.value.backingRoot !== repo.backing
  )
    reason = "workspace metadata does not match repository registration";
  else if (kept.length > 0 && !options.includeKept)
    reason = `kept by .ws.toml keep: ${kept.map((entry) => JSON.stringify(entry)).join(", ")}; pass --include-kept`;
  else if (present.ok || targets.has(target))
    reason = "target already exists or is reserved";
  else if (
    !z.object({ code: z.literal("ENOENT") }).safeParse(present.error).success
  )
    reason = `cannot inspect target: ${msg(present)}`;
  else if (reserved.has(name))
    reason = `jj workspace ${name} is already registered`;
  else reason = busy(realOr(ws.dir));
  if (reason === undefined) {
    targets.add(target);
    reserved.add(name);
  }
  if (reason === undefined && !options.dryRun && graveyard !== undefined) {
    const moved = await moveWorkspace(repo, ws, target, name, graveyard);
    if (!moved.ok) reason = msg(moved);
  }
  const verdict = options.dryRun ? "would-adopt" : "adopted";
  const update =
    kept.length === 0
      ? ""
      : `; update .ws.toml keep ${kept.map((entry) => JSON.stringify(entry)).join(", ")} to ${JSON.stringify(relative(repo.backing, target))}`;
  return {
    line: adoptLine(
      ws.dir,
      target,
      `${reason === undefined ? verdict : `refused: ${reason}`}${update}`,
    ),
    failed: reason !== undefined,
  };
}

/** Dry runs never lock, snapshot, or write, including when inspecting a real repository. */
export async function adopt(
  options: AdoptOptions,
): Promise<Attempt<{ lines: string[]; failed: string[] }>> {
  const batch = options.all || options.fixNames === true;
  if (options.all && options.fixNames === true)
    return bad("--all cannot be combined with --fix-names");
  if (batch && (options.path !== undefined || options.slug !== undefined))
    return bad("--all/--fix-names cannot be combined with a path or --slug");
  if (batch && options.repo === undefined)
    return bad("--all/--fix-names requires --repo");
  if (!batch && options.path === undefined)
    return bad("provide a workspace path or --all --repo <R>");
  const resolved = resolveRepo(options.repo ?? options.path ?? process.cwd());
  if (!resolved.ok) return resolved;
  const repo = resolved.value;
  const run = async (): Promise<
    Attempt<{ lines: string[]; failed: string[] }>
  > => {
    const cfg = await readConfig(repo);
    if (!cfg.ok) return cfg;
    const listed = await workspaces(repo);
    if (!listed.ok) return listed;
    const selected = listed.value.filter((ws) => {
      if (options.fixNames === true)
        return (
          within(ws.dir, realOr(repo.wsRoot)) &&
          basename(ws.dir).startsWith(`ws_${repo.name}-arm-`)
        );
      if (options.all) return !within(ws.dir, realOr(repo.wsRoot));
      return realOr(ws.dir) === realOr(resolve(options.path ?? ""));
    });
    if (!batch && selected.length !== 1)
      return bad(
        "path must be the root of a registered non-primary workspace of this repository",
      );
    const names = await workspaceNames(repo);
    if (!names.ok) return names;
    const reserved = new Set(names.value);
    const targets = new Set<string>();
    const graveyard = options.dryRun ? undefined : await checkGraveyard();
    if (graveyard !== undefined && !graveyard.ok) return graveyard;
    const rows = [];
    for (const ws of selected)
      rows.push(
        await adoptRow(
          repo,
          cfg.value,
          ws,
          options,
          reserved,
          targets,
          graveyard?.value,
        ),
      );
    const lines = rows.map((row) => row.line);
    const failed = rows
      .filter((row) => row.failed)
      .map((row) => row.line.split("\t")[0] ?? "?");
    const orphans =
      options.dryRun && batch
        ? await orphanLines(repo, cfg.value, listed.value)
        : good([]);
    if (!orphans.ok) return orphans;
    lines.push(...orphans.value);
    return good({ lines, failed });
  };
  if (options.dryRun) return run();
  const pre = common(repo);
  return pre.ok ? withLock(repo, "agx ws adopt", run) : pre;
}

/** Freeze one real trunk commit for the whole repo; root is not a usable integration branch. */
async function trunkCommit(
  repo: Repo,
  cfg: Config,
): Promise<Attempt<string | null>> {
  const out = await jjOut(
    ["log", "--no-graph", "-r", cfg.trunk, "-T", 'commit_id ++ "\\n"'],
    repo.backing,
    true,
  );
  if (!out.ok) return out;
  const ids = out.value.trim().split("\n").filter(Boolean);
  if (ids.length !== 1)
    return bad(`trunk ${cfg.trunk} must resolve to exactly one commit`);
  return good(/^0+$/u.test(ids[0] ?? "") ? null : (ids[0] ?? null));
}

/** Zero-context edits anchored to the same base. Unsupported formats fail closed.
 * New-line offsets are deliberately excluded: unrelated earlier trunk edits shift them.
 */
function patchBlockEdits(block: string): Set<string> | null {
  const edits = new Set<string>();
  const lines = block.split("\n");
  const file = lines[0];
  if (
    file === undefined ||
    lines.some((line) =>
      /^(?:old mode|new mode|new file|deleted file|rename |copy |Binary|GIT binary)/u.test(
        line,
      ),
    )
  )
    return null;
  let key: string | undefined;
  let body: string[] = [];
  const flush = (): void => {
    if (key !== undefined) edits.add(JSON.stringify([file, key, body]));
  };
  for (const line of lines.slice(1)) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@/u.exec(line);
    if (header !== null) {
      flush();
      key = `${header[1]},${header[2] ?? "1"}`;
      body = [];
    } else if (key !== undefined && line !== "") body.push(line);
  }
  flush();
  if (key === undefined) return null;
  return edits;
}

function patchEdits(diff: string): Set<string> | null {
  const blocks = diff
    .split(/^diff --git /mu)
    .filter(Boolean)
    .map((block) => patchBlockEdits(block));
  if (blocks.some((block) => block === null)) return null;
  return new Set(
    blocks.flatMap((block) => (block === null ? [] : Array.from(block))),
  );
}

function patchesByFile(diff: string): Map<string, string> {
  return new Map(
    diff
      .split(/^diff --git /mu)
      .filter(Boolean)
      .map((block) => [block.split("\n", 1)[0]!, `diff --git ${block}`]),
  );
}

type ContentResult = {
  differing: string[];
  total: number;
  consumed: string[];
  integratedAt?: string;
  trunkDifferences?: string[];
};

/** Release notes are evidence: a missing changeset alone never proves that it landed. */
async function consumedChangesets(
  repo: Repo,
  tip: string,
  trunk: string,
  changed: string[],
): Promise<Attempt<string[]>> {
  const consumed: string[] = [];
  for (const path of changed) {
    const tool = /^tools\/([^/]+)\/\.changes\/[^/]+\.md$/u.exec(path)?.[1];
    if (tool === undefined) continue;
    const present = await jjOut(
      ["file", "list", "-r", trunk, `root-file:${path}`],
      repo.backing,
      true,
    );
    if (!present.ok) return present;
    if (present.value.trim() !== "") continue;
    const note = await jjOut(
      ["file", "show", "-r", tip, `root-file:${path}`],
      repo.backing,
      true,
    );
    if (!note.ok) continue; // A deletion made by the workspace is handled by the tree comparison.
    const match =
      /^(?:---\n)?bump: (?:patch|minor|major)\n(?:---\n)?\n?([^\n]+)\n?$/u.exec(
        note.value.replaceAll("\r\n", "\n"),
      );
    if (match?.[1] === undefined) continue;
    const log = await jjOut(
      ["file", "show", "-r", trunk, `root-file:tools/${tool}/CHANGELOG.md`],
      repo.backing,
      true,
    );
    if (log.ok && log.value.split("\n").includes(`- ${match[1].trim()}`))
      consumed.push(path);
  }
  return good(consumed);
}

async function releaseMetadata(
  repo: Repo,
  tip: string,
  trunk: string,
  path: string,
): Promise<boolean> {
  const kind = basename(path);
  const fileset = `root-file:${path}`;
  const before = await jjOut(
    ["file", "show", "-r", tip, fileset],
    repo.backing,
    true,
  );
  const after = await jjOut(
    ["file", "show", "-r", trunk, fileset],
    repo.backing,
    true,
  );
  if (!before.ok || !after.ok) return false;
  if (
    kind === "CHANGELOG.md" &&
    before.value.startsWith("# Changelog\n") &&
    after.value.startsWith("# Changelog\n") &&
    after.value
      .trimEnd()
      .endsWith(before.value.slice("# Changelog\n".length).trim())
  )
    return true;
  if (kind !== "package.json") return false;
  const schema = jsonOf(
    z.looseObject({ version: z.string().regex(/^\d+\.\d+\.\d+$/u) }),
  );
  const a = schema.safeParse(before.value);
  const b = schema.safeParse(after.value);
  if (!a.success || !b.success) return false;
  const { version: av, ...ap } = a.data;
  const { version: bv, ...bp } = b.data;
  const aa = av.split(".").map(Number);
  const bb = bv.split(".").map(Number);
  const next = bb.findIndex((part, index) => part !== aa[index]);
  if (
    next >= 0 &&
    (bb[next] ?? 0) > (aa[next] ?? 0) &&
    JSON.stringify(ap) === JSON.stringify(bp)
  )
    return true;
  return false;
}

/** Compare each path separately: one unsupported binary/addition must not disable text containment. */
async function compareContent(
  repo: Repo,
  tip: string,
  trunk: string,
  base: string,
  changed: string[],
): Promise<Attempt<ContentResult>> {
  const notes = await consumedChangesets(repo, tip, trunk, changed);
  if (!notes.ok) return notes;
  const consumed = notes.value;
  const releasedTools = new Set(consumed.map((path) => path.split("/")[1]));
  const differing: string[] = [];
  if (changed.length === 0) return good({ differing, total: 0, consumed });
  const summary = await jjOut(
    [
      "diff",
      "--from",
      tip,
      "--to",
      trunk,
      "--summary",
      "--",
      ...changed.map((path) => `root-file:${path}`),
    ],
    repo.backing,
    true,
  );
  if (!summary.ok) return summary;
  const entries = summary.value.trimEnd().split("\n").filter(Boolean);
  // Rename displays and unknown formats fall back to the individual tree comparison.
  const delta = entries.every((line) => /^[AMD] /u.test(line))
    ? new Set(entries.map((line) => line.slice(2)))
    : undefined;
  const pending = changed.filter(
    (path) =>
      !consumed.includes(path) && (delta === undefined || delta.has(path)),
  );
  if (pending.length === 0)
    return good({ differing, total: changed.length, consumed });
  const batch = await Promise.all(
    [tip, trunk].map((revision) =>
      jjOut(
        [
          "diff",
          "--from",
          base,
          "--to",
          revision,
          "--git",
          "--context",
          "0",
          "--",
          ...pending.map((path) => `root-file:${path}`),
        ],
        repo.backing,
        true,
      ),
    ),
  );
  const [workBatch, integratedBatch] = batch;
  if (workBatch === undefined || integratedBatch === undefined)
    return bad("missing diff comparison");
  if (!workBatch.ok) return workBatch;
  if (!integratedBatch.ok) return integratedBatch;
  const byRevision = [
    patchesByFile(workBatch.value),
    patchesByFile(integratedBatch.value),
  ];
  for (const path of changed) {
    if (consumed.includes(path)) continue;
    if (delta !== undefined && !delta.has(path)) continue;
    const fileset = `root-file:${path}`;
    // A recognized batch summary already tells us this exact file differs.
    // Only ambiguous rename/unknown displays need another per-file probe.
    const diff =
      delta === undefined
        ? await jjOut(
            ["diff", "--from", tip, "--to", trunk, "--summary", "--", fileset],
            repo.backing,
            true,
          )
        : undefined;
    if (diff?.ok === false) return diff;
    if (diff?.value.trim() === "") continue;
    const releaseFile = /^tools\/([^/]+)\/(package\.json|CHANGELOG\.md)$/u.exec(
      path,
    );
    if (
      releaseFile !== null &&
      releasedTools.has(releaseFile[1]) &&
      (await releaseMetadata(repo, tip, trunk, path))
    )
      continue;
    const patches = await Promise.all(
      [tip, trunk].map((revision, index) =>
        // Plain paths have unquoted git headers. Split the batch by file so an
        // unsupported binary/addition still affects only that file. Unusual
        // path quoting keeps the existing individual-file fallback.
        /^[A-Za-z0-9_./-]+$/u.test(path)
          ? Promise.resolve(
              good(byRevision[index]?.get(`a/${path} b/${path}`) ?? ""),
            )
          : jjOut(
              [
                "diff",
                "--from",
                base,
                "--to",
                revision,
                "--git",
                "--context",
                "0",
                "--",
                fileset,
              ],
              repo.backing,
              true,
            ),
      ),
    );
    const [work, integrated] = patches;
    if (work === undefined || integrated === undefined)
      return bad("missing diff comparison");
    if (!work.ok) return work;
    if (!integrated.ok) return integrated;
    const wanted = patchEdits(work.value);
    const present = patchEdits(integrated.value);
    if (
      wanted === null ||
      present === null ||
      ![...wanted].every((edit) => present.has(edit))
    )
      differing.push(path);
  }
  return good({ differing, total: changed.length, consumed });
}

/** Recognize a release snapshot on trunk even if later trunk edits changed the same paths. */
export async function outstanding(
  repo: Repo,
  tip: string,
  trunk: string,
): Promise<Attempt<ContentResult>> {
  const conflicted = await jjOut(
    ["log", "--no-graph", "-r", tip, "-T", "conflict"],
    repo.backing,
    true,
  );
  if (!conflicted.ok) return conflicted;
  if (conflicted.value.trim() === "true") return bad("workspace has conflicts");
  const pending = await unlandedFrom(repo.backing, tip, trunk, true);
  if (!pending.ok) return pending;
  if (pending.value.length === 0)
    return good({ differing: [], total: 0, consumed: [] });
  const base = `heads(::(${tip}) & ::(${trunk}))`;
  const paths = await jjOut(
    ["diff", "--from", base, "--to", tip, "--name-only"],
    repo.backing,
    true,
  );
  if (!paths.ok) return paths;
  const changed = paths.value.trim().split("\n").filter(Boolean);
  const current = await compareContent(repo, tip, trunk, base, changed);
  if (
    !current.ok ||
    current.value.differing.length === 0 ||
    current.value.consumed.length === 0
  )
    return current;
  // Only release commits carrying this workspace's notes are candidates, never arbitrary history.
  const logs = [
    ...new Set(
      current.value.consumed.map(
        (path) => `tools/${path.split("/")[1]}/CHANGELOG.md`,
      ),
    ),
  ];
  const releases = await jjOut(
    [
      "log",
      "--no-graph",
      "-r",
      `::(${trunk}) & (${logs.map((path) => `files(${JSON.stringify(path)})`).join(" | ")})`,
      "-T",
      'commit_id ++ "\\n"',
    ],
    repo.backing,
    true,
  );
  if (!releases.ok) return releases;
  for (const release of releases.value.trim().split("\n").filter(Boolean)) {
    if (release === trunk) continue;
    const landed = await compareContent(repo, tip, release, base, changed);
    if (!landed.ok) return landed;
    if (landed.value.differing.length === 0)
      return good({
        ...landed.value,
        integratedAt: release,
        trunkDifferences: current.value.differing,
      });
  }
  return current;
}

async function classify(
  repo: Repo,
  cfg: Config,
  ws: Workspace,
  records: RunRecord[],
  trunk: string | null,
  readOnly = false,
  recentRecordedDiagnostic = false,
): Promise<Classification> {
  let change = ws.change ?? "?";
  let age = ws.age ?? "?";
  const verdict = (
    label: string,
    reason: string,
    collect = false,
  ): Classification => ({ verdict: label, change, age, reason, collect });
  if (protectedWorkspace(repo, cfg, ws))
    return verdict("kept", "declared in .ws.toml keep");
  const owner = jjWorkspace(ws.dir);
  if (
    !owner.ok ||
    owner.value.root !== realOr(ws.dir) ||
    owner.value.backingRoot !== repo.backing
  )
    return verdict(
      "keep",
      "missing or foreign workspace; never forget without a verified checkout",
    );
  const occupied = busy(realOr(ws.dir));
  if (occupied !== undefined) return verdict("keep", occupied);
  const lineage = lineageOf(records, realOr(ws.dir));
  const live = lineage.find((r) => !TERMINAL_STATES.has(r.state));
  if (live !== undefined)
    return verdict("keep", `live or continuing run ${live.id} (${live.state})`);
  const blocked = await runRemovalReason(repo, ws.dir, records);
  if (blocked !== undefined) return verdict("keep", blocked);
  const land = landState(ws);
  if (land !== undefined)
    return (await landBusy(land))
      ? verdict("land-temp", "land lock is held or ownership is uncertain")
      : verdict(
          "land-temp",
          "temporary land checkout; no live land lock",
          true,
        );
  const fresh = readOnly
    ? await jjOut(["status"], ws.dir, true)
    : await updateStale(ws.dir);
  if (!fresh.ok)
    return verdict(
      readOnly && msg(fresh).includes("working copy is stale")
        ? "stale"
        : "keep",
      msg(fresh),
    );
  const info = await jjOut(
    [
      "log",
      "--no-graph",
      "-r",
      "@",
      "-T",
      'change_id.short(12) ++ "\\t" ++ committer.timestamp().ago() ++ "\\t" ++ empty',
    ],
    ws.dir,
    true,
  );
  if (!info.ok) return verdict("keep", msg(info));
  const [id, since, empty] = info.value.split("\t");
  change = id ?? "?";
  age = since ?? "?";
  const sparse = await jjOut(["sparse", "list"], ws.dir, true);
  if (!sparse.ok) return verdict("keep", msg(sparse));
  if (sparse.value.trim() !== ".")
    return verdict(
      "keep",
      `sparse patterns are not '.': ${JSON.stringify(sparse.value.trim())}`,
    );
  // Abandonment is based on runs at this workspace path, not a ticket redone elsewhere.
  const local = records.filter(
    (r) =>
      r.workspace !== null &&
      r.workspace !== undefined &&
      realOr(r.workspace) === realOr(ws.dir),
  );
  const cutoff = Temporal.Now.instant().epochMilliseconds - 24 * 60 * 60 * 1000;
  if (
    local.length > 0 &&
    !lineage.some((r) => r.judgment?.decision === "accept") &&
    local.every((r) => {
      const endedAt = r.ended_at;
      if (
        r.state !== "ended" ||
        endedAt === null ||
        endedAt === undefined ||
        r.outcome === null ||
        r.outcome === undefined
      )
        return false;
      const ended = fromThrowable(() => Temporal.Instant.from(endedAt))();
      return ended.isOk() && ended.value.epochMilliseconds < cutoff;
    })
  )
    return verdict(
      "abandoned",
      `all runs ended without acceptance over 24h ago: ${local.map((r) => `${r.id} (${r.outcome})`).join(", ")}`,
      true,
    );
  // Doctor is silent for both landed recorded workspaces (GC owns them) and
  // unlanded recorded workspaces under 72h. Staleness and abandonment above
  // still need attention. GC and full inventories always do the full check.
  if (recentRecordedDiagnostic)
    return verdict(
      "keep",
      "recent recorded workspace: no landing diagnostic due",
    );
  if (trunk === null)
    return verdict(
      "no trunk",
      "trunk resolves to root; no landed/unlanded classification",
    );
  const tip = await jjOut(
    ["log", "--no-graph", "-r", "@", "-T", "commit_id"],
    ws.dir,
    true,
  );
  if (!tip.ok) return verdict("keep", msg(tip));
  const tips = [
    tip.value.trim(),
    ...lineage.flatMap((r) =>
      r.end_commit === undefined || r.end_commit === null || r.end_commit === ""
        ? []
        : [r.end_commit],
    ),
  ];
  const consumed = new Set<string>();
  const releases = new Set<string>();
  for (const candidate of new Set(tips)) {
    const work = await outstanding(repo, candidate, trunk);
    if (!work.ok) return verdict("keep", `cannot judge: ${msg(work)}`);
    if (work.value.differing.length > 0)
      return verdict(
        "unlanded",
        `differs in ${work.value.differing.length} of ${work.value.total} paths: ${work.value.differing.join(", ")}; never removed`,
      );
    for (const path of work.value.consumed) consumed.add(path);
    if (work.value.integratedAt !== undefined)
      releases.add(work.value.integratedAt);
  }
  return verdict(
    empty === "true" ? "empty" : "landed",
    (consumed.size === 0
      ? "nothing unlanded"
      : `nothing unlanded; land-consumed changesets: ${[...consumed].join(", ")}`) +
      (releases.size === 0
        ? ""
        : `; matched release snapshot: ${[...releases].join(", ")}`),
    true,
  );
}

function gcCounts(lines: string[]) {
  const rows = lines
    .map((line) => line.split("\t"))
    .filter((row) => row[2] !== "collected");
  return {
    total: rows.length,
    unlanded: rows.filter((row) => row[2] === "unlanded").length,
    collectable: rows.filter((row) =>
      ["empty", "landed", "abandoned"].includes(row[2] ?? ""),
    ).length,
    legacy: rows.filter((row) => row[1] === "legacy").length,
  };
}
type GcResult = {
  lines: string[];
  failed: string[];
  counts: ReturnType<typeof gcCounts>;
};

/** TSV columns: path, kind, verdict, change id, age, reason. Legacy deletion is opt-in. */
export async function gc(options: GcOptions): Promise<Attempt<GcResult>> {
  const resolved = resolveRepo(options.repo);
  if (!resolved.ok) return resolved;
  const repo = resolved.value;
  const pre = common(repo);
  if (!pre.ok) return pre;
  const graveyard = await checkGraveyard();
  if (!graveyard.ok) return graveyard;
  // Inventory and initial classification are read-only, including in a real collection pass.
  // A dry run never enters withLock (and therefore never creates waiter metadata either).
  const run = async (): Promise<Attempt<GcResult>> => {
    const cfg = await readConfig(repo);
    if (!cfg.ok) return cfg;
    const trunk = await trunkCommit(repo, cfg.value);
    if (!trunk.ok) return trunk;
    const candidates = await workspaces(repo);
    if (!candidates.ok) return candidates;
    const records = await agxRecords(repo.backing);
    if (!records.ok) return records;
    const lines: string[] = [];
    const failed: string[] = [];
    for (const ws of candidates.value) {
      const kind =
        dirname(resolve(ws.dir)) === resolve(repo.wsRoot) &&
        basename(resolve(ws.dir)).startsWith("ws_")
          ? "ws"
          : "legacy";
      let c = await classify(
        repo,
        cfg.value,
        ws,
        records.value,
        trunk.value,
        true,
      );
      let label = c.verdict;
      let reason = c.reason;
      const recorded = lineageOf(records.value, realOr(ws.dir)).length > 0;
      const layoutAllowed =
        kind === "legacy"
          ? options.legacy === true
          : recorded || options.includeUnrecorded;
      const allowed =
        layoutAllowed &&
        (c.verdict !== "abandoned" || options.abandoned === true);
      if (c.collect && !layoutAllowed)
        reason +=
          kind === "legacy"
            ? "; report only; pass --legacy to collect"
            : "; unrecorded; pass --include-unrecorded to collect";
      if (c.verdict === "abandoned" && options.abandoned !== true)
        reason += "; report only; pass --abandoned to collect";
      if (c.collect && allowed && !options.dryRun) {
        const done = await withLock<Classification>(
          repo,
          `agx ws gc ${ws.name}`,
          async () => {
            // Refresh every verdict input after acquiring the lock, including policy and runs.
            const currentConfig = await readConfig(repo);
            if (!currentConfig.ok) return currentConfig;
            const currentTrunk = await trunkCommit(repo, currentConfig.value);
            if (!currentTrunk.ok) return currentTrunk;
            const currentRecords = await agxRecords(repo.backing);
            if (!currentRecords.ok) return currentRecords;
            const root = await jjOut(
              ["workspace", "root", "--name", ws.name],
              repo.backing,
              true,
            );
            if (
              !root.ok ||
              realOr(resolve(repo.backing, root.value.trim())) !==
                realOr(ws.dir)
            )
              return good({
                ...c,
                verdict: "keep",
                collect: false,
                reason: "workspace registration changed before removal",
              });
            const checked = await classify(
              repo,
              currentConfig.value,
              ws,
              currentRecords.value,
              currentTrunk.value,
            );
            const stillRecorded =
              lineageOf(currentRecords.value, realOr(ws.dir)).length > 0;
            const stillAllowed =
              (kind === "legacy"
                ? options.legacy === true
                : stillRecorded || options.includeUnrecorded) &&
              (checked.verdict !== "abandoned" || options.abandoned === true);
            if (!checked.collect) return good(checked);
            if (!stillAllowed)
              return good({
                ...checked,
                collect: false,
                reason: `${checked.reason}; collection no longer permitted by current records/options`,
              });
            const removed = await collectWorkspace(
              repo,
              graveyard.value,
              ws,
              checked.verdict === "abandoned",
            );
            return good({
              ...checked,
              verdict: removed.ok ? "collected" : "FAILED",
              reason: gcCollectionReason(checked.reason, removed),
            });
          },
          (busyReason) =>
            good({
              ...c,
              verdict: "keep",
              collect: false,
              reason: `collection skipped: ${busyReason}`,
            }),
        );
        c = done.ok
          ? done.value
          : { ...c, verdict: "FAILED", reason: msg(done) };
        label = c.verdict;
        reason = c.reason;
        failed.push(...(label === "FAILED" ? [ws.dir] : []));
      }
      // Escape control characters without breaking the column contract.
      lines.push(
        [ws.dir, kind, label, c.change, c.age, reason]
          .map((field) => field.replaceAll("\t", "\\t").replaceAll("\n", "\\n"))
          .join("\t"),
      );
    }
    const result = {
      lines,
      failed,
      counts: gcCounts(lines),
    };
    if (failed.length === 0) await publishVerdicts(repo.backing, result);
    return good(result);
  };
  return run();
}

async function registeredRepoPaths(root: string): Promise<Attempt<string[]>> {
  const read = await attempt(async () =>
    Bun.TOML.parse(await Bun.file(join(root, "presets/consumers.toml")).text()),
  );
  if (!read.ok) return read;
  const row = z.looseObject({ root: z.string() });
  const registry = z
    .looseObject({
      consumers: z.array(row).default([]),
      pending: z.array(row).default([]),
    })
    .safeParse(read.value);
  if (!registry.success)
    return bad(`consumer registry: ${registry.error.message}`);
  return good([
    ...new Set([
      root,
      ...registry.data.consumers.map((entry) => entry.root),
      ...registry.data.pending.map((entry) => entry.root),
    ]),
  ]);
}

async function doctorRepoPaths(root: string): Promise<Attempt<string[]>> {
  const workspaceHome = process.env.AGX_REPOS_ROOT;
  if (workspaceHome === undefined) return registeredRepoPaths(root);
  const entries = await readdir(workspaceHome, { withFileTypes: true }).catch(
    () => [],
  );
  return good(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(workspaceHome, entry.name)),
  );
}

export type DoctorWorkspaceRow = {
  repo: string;
  dir: string;
  name: string;
  kind: "ws" | "legacy";
  recorded: boolean;
  classification: Classification;
  ageMs: number | undefined;
};

/** Read-only inventory built from the same workspaces and classifier as `agx ws gc --dry-run`. */
export async function doctorInventory(
  root = resolve(import.meta.dir, "../../.."),
  findingsOnly = false,
): Promise<Attempt<DoctorWorkspaceRow[]>> {
  const paths = await doctorRepoPaths(root);
  if (!paths.ok) return paths;
  const seen = new Set<string>();
  const rows: DoctorWorkspaceRow[] = [];
  let records: Attempt<RunRecord[]> | undefined;
  for (const path of paths.value) {
    const expanded = path.startsWith("~/")
      ? join(homedir(), path.slice(2))
      : path;
    if (!(await Bun.file(join(expanded, ".git")).exists())) continue;
    const resolved = resolveRepo(expanded);
    if (!resolved.ok) return bad(`${path}: ${msg(resolved)}`);
    const repo = resolved.value;
    if (seen.has(repo.backing)) continue;
    seen.add(repo.backing);
    const cfg = await readConfig(repo);
    if (!cfg.ok) return cfg;
    const trunk = await trunkCommit(repo, cfg.value);
    if (!trunk.ok) return trunk;
    const candidates = await workspaces(repo);
    if (!candidates.ok) return candidates;
    // agx worker ls is a global run inventory, independent of repository cwd.
    records ??= await agxRecords(repo.backing);
    if (!records.ok) return records;
    for (const ws of candidates.value) {
      const kind =
        dirname(resolve(ws.dir)) === resolve(repo.wsRoot) &&
        basename(resolve(ws.dir)).startsWith("ws_")
          ? "ws"
          : "legacy";
      const info = await attempt(() => stat(ws.dir));
      const ageMs = info.ok
        ? Temporal.Now.instant().epochMilliseconds - info.value.mtimeMs
        : undefined;
      const recorded = lineageOf(records.value, realOr(ws.dir)).length > 0;
      const classification = await classify(
        repo,
        cfg.value,
        ws,
        records.value,
        trunk.value,
        true,
        findingsOnly &&
          kind === "ws" &&
          recorded &&
          ageMs !== undefined &&
          ageMs <= 72 * 60 * 60 * 1000,
      );
      rows.push({
        repo: repo.backing,
        dir: ws.dir,
        name: ws.name,
        kind,
        recorded,
        classification,
        ageMs,
      });
    }
  }
  return good(rows);
}

const doctorClean = (value: string) => value.replaceAll(/[\t\r\n]/gu, " ");

/** Map gc classifier outcomes to doctor findings; kept rows remain deliberately silent. */
export async function doctor(): Promise<Attempt<string[]>> {
  const inventory = await doctorInventory(undefined, true);
  if (!inventory.ok) return inventory;
  return good(doctorFindings(inventory.value));
}

/** Findings count workspaces that the unattended `agx ws gc --all --legacy` cannot collect. */
export function doctorFindings(rows: DoctorWorkspaceRow[]): string[] {
  const findings: string[] = [];
  for (const row of rows) {
    const c = row.classification;
    if (
      c.verdict === "kept" ||
      c.verdict === "keep" ||
      c.verdict === "land-temp"
    )
      continue;
    if (
      c.collect &&
      c.verdict !== "abandoned" &&
      (row.kind === "legacy" || row.recorded)
    )
      continue;
    const emit = (finding: string, fix: string) => {
      findings.push(
        ["agx-ws", row.repo, row.name, finding, fix]
          .map((value) => doctorClean(value))
          .join("\t"),
      );
    };
    if (c.verdict === "stale") {
      const slug = row.name.startsWith("ws_") ? row.name.slice(3) : row.name;
      emit("stale", `agx ws refresh ${slug} --repo ${row.repo}`);
      continue;
    }
    if (c.verdict === "abandoned") {
      emit(
        "abandoned",
        `agx ws gc --abandoned${row.kind === "legacy" ? " --legacy" : ""} --repo ${row.repo}`,
      );
    } else if (row.kind === "legacy") {
      emit(
        c.verdict === "empty" ? "legacy-empty" : "legacy-layout",
        `agx ws gc --legacy --repo ${row.repo}`,
      );
    } else if (c.verdict === "empty") {
      emit("empty", `agx ws gc --include-unrecorded --repo ${row.repo}`);
    } else if (c.verdict === "landed") {
      emit("collectable", `agx ws gc --include-unrecorded --repo ${row.repo}`);
    }
    if (
      c.verdict === "unlanded" &&
      row.ageMs !== undefined &&
      row.ageMs > 72 * 60 * 60 * 1000
    )
      emit("unlanded-72h", `cd ${row.dir} && mise run land`);
  }
  return findings;
}

/** Fleet-wide gc; the consumer registry is data, never executable configuration. */
export async function gcAll(
  options: Omit<GcOptions, "repo">,
  root = resolve(import.meta.dir, "../../.."),
): Promise<Attempt<GcResult>> {
  const roots = await registeredRepoPaths(root);
  if (!roots.ok) return roots;
  const lines: string[] = [];
  const failed: string[] = [];
  const seen = new Set<string>();
  for (const path of roots.value) {
    const expanded = path.startsWith("~/")
      ? join(homedir(), path.slice(2))
      : path;
    const repo = resolveRepo(expanded);
    if (!repo.ok) {
      failed.push(path);
      lines.push(`${path}\trepo\tFAILED\t?\t?\t${msg(repo)}`);
      continue;
    }
    if (seen.has(repo.value.backing)) continue;
    seen.add(repo.value.backing);
    const done = await gc({ ...options, repo: repo.value.backing });
    if (!done.ok) {
      failed.push(path);
      lines.push(`${path}\trepo\tFAILED\t?\t?\t${msg(done)}`);
      continue;
    }
    lines.push(...done.value.lines);
    failed.push(...done.value.failed);
  }
  const result = { lines, failed, counts: gcCounts(lines) };
  if (failed.length === 0) await publishVerdicts(undefined, result, seen);
  return good(result);
}

const Counts = z.object({
  total: z.number(),
  unlanded: z.number(),
  collectable: z.number(),
  legacy: z.number(),
});
const VerdictCache = z.object({
  fleetComplete: z.boolean().optional(),
  repos: z.record(
    z.string(),
    z.object({
      lines: z.array(z.string()),
      counts: Counts,
      capturedAt: z.number(),
    }),
  ),
});
/** One fixed, atomic owner output. Per-repo observations retain their own age. */
async function publishVerdicts(
  repo: string | undefined,
  result: GcResult,
  retained?: Set<string>,
): Promise<void> {
  const root = stateDir();
  const path = join(root, "workspace-verdicts.json");
  await mkdir(root, { recursive: true });
  const release = await acquire(
    path + ".lock",
    {
      pid: process.pid,
      host: hostname(),
      what: "publish workspace verdicts",
      since: Temporal.Now.instant().toString(),
    },
    { pollMs: 5, waitMs: 10_000 },
  );
  if (typeof release !== "function") return;
  const done = await attempt(async () => {
    const text = await Bun.file(path)
      .text()
      .catch(() => "");
    const parsed = jsonOf(VerdictCache).safeParse(text);
    const repos = parsed.success ? parsed.data.repos : {};
    for (const key of Object.keys(repos).filter(
      (candidate) => retained !== undefined && !retained.has(candidate),
    ))
      delete repos[key];
    if (repo !== undefined)
      repos[repo] = {
        lines: result.lines.filter(
          (line) => line.split("\t")[2] !== "collected",
        ),
        counts: result.counts,
        capturedAt: Temporal.Now.instant().epochMilliseconds,
      };
    const entries = Object.values(repos);
    const lines = entries.flatMap((entry) => entry.lines);
    const temp = path + "." + crypto.randomUUID() + ".tmp";
    await writeFile(
      temp,
      JSON.stringify({
        repos,
        fleetComplete:
          retained !== undefined ||
          (parsed.success && parsed.data.fleetComplete === true),
        rows: lines.map((line) => line.split("\t")),
        tsv: lines.join("\n"),
        counts: gcCounts(lines),
        capturedAt: Math.min(...entries.map((entry) => entry.capturedAt)),
        complete: true,
      }),
      { mode: 0o600 },
    );
    await rename(temp, path);
  });
  release();
  if (!done.ok)
    process.stderr.write("ws: cannot publish verdicts: " + msg(done) + "\n");
}
