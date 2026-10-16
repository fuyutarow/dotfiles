// Run-workspace lifecycle: add, rm, gc. The tool keeps no state of its own. The workspace
// directory is the only artifact; what it must know it reads from the jj store (`jj workspace
// list`, revsets), from the repo's `.ws.toml`, and from `agx ls --json`. The one transient file
// is the per-store lock directory, removed on release.
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  realpathSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { stat } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import {
  attempt,
  errorMessage,
  type Attempt,
} from "../../shared/src/attempt.ts";
import { acquire, pidAlive } from "../../shared/src/dir-lock.ts";
import { dispatchStateDir } from "../../shared/src/dispatch-state.ts";
import { fromThrowable, jsonOf, z } from "../../shared/src/zod.ts";
import { jjWorkspace, refLocks } from "./jj-workspace.ts";

const bad = (message: string): Attempt<never> => ({
  ok: false,
  error: message,
});
const good = <T>(value: T): Attempt<T> => ({ ok: true, value });
const msg = (failed: { error: unknown }): string => errorMessage(failed.error);

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
const SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;
const TERMINAL_STATES = new Set(["ended", "orphaned"]);

type Ran = { code: number; out: string; err: string };

async function exec(
  cmd: string[],
  cwd: string,
  env?: Record<string, string>,
): Promise<Attempt<Ran>> {
  return attempt(async () => {
    const child = Bun.spawn(cmd, {
      cwd,
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { out, err, code };
  });
}

/** jj never gets a timeout: killing it mid-write is the failure this tool exists to avoid. */
async function jjOut(
  args: string[],
  cwd: string,
  readonly: boolean,
): Promise<Attempt<string>> {
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

export async function readConfig(
  repo: Repo,
  committed = false,
): Promise<Attempt<Config>> {
  const file = join(repo.backing, CONFIG_FILE);
  let text: string;
  if (committed) {
    const files = await jjOut(
      ["file", "list", "-r", "@-", CONFIG_FILE],
      repo.backing,
      true,
    );
    if (!files.ok) return files;
    if (files.value.trim() === "")
      return good({ ready: [], trunk: "trunk()", keep: [] });
    const content = await jjOut(
      ["file", "show", "-r", "@-", CONFIG_FILE],
      repo.backing,
      true,
    );
    if (!content.ok) return content;
    text = content.value;
  } else {
    if (!existsSync(file))
      return good({ ready: [], trunk: "trunk()", keep: [] });
    text = await Bun.file(file).text();
  }
  const parsed = await attempt(() => Bun.TOML.parse(text));
  if (!parsed.ok) return bad(`${file}: ${msg(parsed)}`);
  const checked = ConfigSchema.safeParse(parsed.value);
  return checked.success
    ? good(checked.data)
    : bad(
        `${file}: ${checked.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
      );
}

export function checkSlug(slug: string): Attempt<string> {
  return SLUG.test(slug)
    ? good(`ws_${slug}`)
    : bad(`invalid slug '${slug}': use letters, digits, '_' and '-'`);
}

/** Filesystem type of the nearest existing ancestor of `path`; undefined when it cannot be read. */
async function fsType(path: string): Promise<string | undefined> {
  let probe = path;
  while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe);
  const args =
    process.platform === "darwin"
      ? ["-f", "%T", probe]
      : ["-f", "-c", "%T", probe];
  const ran = await exec(["stat", ...args], probe);
  return ran.ok && ran.value.code === 0 ? ran.value.out.trim() : undefined;
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
  if (type === undefined)
    return bad(
      `cannot verify the filesystem of the graveyard ${path}; refusing`,
    );
  if (type === "tmpfs" || type === "ramfs")
    return bad(
      `graveyard ${path} is on ${type} (RAM-backed); set RIP_GRAVEYARD to a disk path`,
    );
  return good({ path });
}

async function bury(graveyard: Graveyard, dir: string): Promise<Attempt<void>> {
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
): Promise<Attempt<T>> {
  const lock = join(repo.parent, `${repo.name}.ws.lock`);
  const got = await acquire(
    lock,
    {
      pid: process.pid,
      host: hostname(),
      what,
      since: Temporal.Now.instant().toString(),
    },
    {
      onWait: (holder) => {
        process.stderr.write(
          `ws: waiting for ${holder?.what ?? "another ws"} (pid ${holder?.pid ?? "?"}) on ${repo.name}\n`,
        );
      },
    },
  );
  if (typeof got !== "function")
    return bad(
      `lock ${lock} is held by ${got?.what ?? "unknown"} (pid ${got?.pid ?? "?"}); not waiting longer`,
    );
  const result = await attempt(fn);
  got();
  return result.ok ? result.value : bad(msg(result));
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
): Promise<Attempt<void>> {
  const forgot = await jjOut(
    ["workspace", "forget", name],
    repo.backing,
    false,
  );
  return forgot.ok ? bury(graveyard, dir) : forgot;
}

/** Hold land's own lock through removal, closing the gap after classification. */
async function collectWorkspace(
  repo: Repo,
  graveyard: Graveyard,
  ws: Workspace,
): Promise<Attempt<void>> {
  const state = landState(ws);
  if (state === undefined)
    return forgetAndBury(repo, graveyard, ws.name, ws.dir);
  const release = await acquire(
    join(state, "land.lock"),
    {
      pid: process.pid,
      host: hostname(),
      what: "ws gc land-temp",
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
};

/** Runs in the coordinator's environment, before a sandboxed worker receives the path. */
async function readyWorkspace(
  dir: string,
  cfg: Config,
): Promise<Attempt<void>> {
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
      return bad(
        `mise trust ${config} failed (exit ${trusted.value.code}): ${trusted.value.err.trim()}`,
      );
    process.stderr.write(`ws: ready: trusted ${config}\n`);
  }
  for (const command of cfg.ready) {
    process.stderr.write(`ws: ready: ${command}\n`);
    const ran = await attempt(
      () =>
        Bun.spawn(["sh", "-c", command], {
          cwd: dir,
          stdin: "ignore",
          stdout: "inherit",
          stderr: "inherit",
        }).exited,
    );
    if (!ran.ok)
      return bad(`readiness command failed: ${command}: ${msg(ran)}`);
    if (ran.value !== 0)
      return bad(`readiness command failed (exit ${ran.value}): ${command}`);
  }
  return good(undefined);
}

export async function add(options: AddOptions): Promise<Attempt<string>> {
  const name = checkSlug(options.slug);
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
  if (existsSync(dir)) return bad(`${dir} already exists`);
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
  return withLock(repo.value, `ws add ${options.slug}`, async () => {
    const names = await workspaceNames(repo.value);
    if (!names.ok) return names;
    if (names.value.includes(name.value))
      return bad(`jj workspace ${name.value} is already registered`);
    const source = jjWorkspace(options.repo);
    if (!source.ok) return source;
    for (const root of new Set([source.value.root, repo.value.backing])) {
      const current = await updateStale(root);
      if (!current.ok) return current;
    }
    mkdirSync(repo.value.wsRoot, { recursive: true });
    const made = await jjOut(
      [
        "workspace",
        "add",
        "--name",
        name.value,
        ...(options.rev === undefined ? [] : ["-r", options.rev]),
        dir,
      ],
      repo.value.backing,
      false,
    );
    if (!made.ok) return made;
    const ready = await readyWorkspace(dir, cfg.value);
    if (!ready.ok) {
      const undone = await forgetAndBury(
        repo.value,
        graveyard.value,
        name.value,
        dir,
      );
      return bad(
        `${msg(ready)}; ${
          undone.ok
            ? "the new workspace was removed"
            : `rollback also failed: ${msg(undone)} (remove ${dir} by hand)`
        }`,
      );
    }
    return good(dir);
  });
}

/** Repair only the named workspace: no readiness commands or sparse changes. */
export async function refresh(options: {
  slug: string;
  repo: string;
}): Promise<Attempt<string>> {
  const name = checkSlug(options.slug);
  if (!name.ok) return name;
  const repo = resolveRepo(options.repo);
  if (!repo.ok) return repo;
  const pre = common(repo.value);
  if (!pre.ok) return pre;
  const dir = join(repo.value.wsRoot, name.value);
  return withLock(repo.value, `ws refresh ${options.slug}`, async () => {
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
  const name = checkSlug(options.slug);
  if (!name.ok) return name;
  const repo = resolveRepo(options.repo);
  if (!repo.ok) return repo;
  const cfg = await readConfig(repo.value, true);
  if (!cfg.ok) return cfg;
  const pre = common(repo.value);
  if (!pre.ok) return pre;
  const graveyard = await checkGraveyard();
  if (!graveyard.ok) return graveyard;
  const dir = join(repo.value.wsRoot, name.value);
  if (protectedWorkspace(repo.value, cfg.value, { name: name.value, dir }))
    return bad(`${dir} is kept by .ws.toml`);
  if (!existsSync(dir)) return bad(`${dir} does not exist`);
  return withLock(repo.value, `ws rm ${options.slug}`, async () => {
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
  });
}

const RunRecord = z.looseObject({
  id: z.string(),
  state: z.string(),
  cwd: z.string().nullable().optional(),
  workspace: z.string().nullable().optional(),
  continues: z.string().nullable().optional(),
  end_commit: z.string().nullable().optional(),
});
export type RunRecord = z.output<typeof RunRecord>;

async function agxRecords(cwd: string): Promise<Attempt<RunRecord[]>> {
  if (Bun.which("agx") === null)
    return bad("agx is not on PATH: mise run deps");
  const ran = await exec(["agx", "ls", "--json"], cwd);
  if (!ran.ok) return bad(`agx ls --json: ${msg(ran)}`);
  if (ran.value.code !== 0)
    return bad(
      `agx ls --json failed (exit ${ran.value.code}): ${ran.value.err.trim()}`,
    );
  const json = jsonOf(z.array(RunRecord)).safeParse(ran.value.out);
  return json.success
    ? good(json.data)
    : bad(`agx ls --json: unexpected output: ${json.error.message}`);
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
  const root = realOr(join(dispatchStateDir(), "land"));
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
    const dir = root.value.trim();
    if (dir === "")
      return bad(
        `no recorded path for workspace ${name}; refusing incomplete enumeration`,
      );
    if (realOr(dir) !== realOr(repo.backing))
      found.push({ name, dir, change: change ?? "?", age: age ?? "?" });
  }
  return good(found);
}

function protectedWorkspace(repo: Repo, cfg: Config, ws: Workspace): boolean {
  return cfg.keep.some((entry) => {
    if (entry === ws.name) return true;
    const path = entry.startsWith("~/")
      ? join(homedir(), entry.slice(2))
      : resolve(repo.backing, entry);
    return realOr(path) === realOr(ws.dir);
  });
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
  for (const path of changed) {
    if (consumed.includes(path)) continue;
    if (delta !== undefined && !delta.has(path)) continue;
    const fileset = `root-file:${path}`;
    const diff = await jjOut(
      ["diff", "--from", tip, "--to", trunk, "--summary", "--", fileset],
      repo.backing,
      true,
    );
    if (!diff.ok) return diff;
    if (diff.value.trim() === "") continue;
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
  const land = landState(ws);
  if (land !== undefined)
    return (await landBusy(land))
      ? verdict("land-temp", "land lock is held or ownership is uncertain")
      : verdict(
          "land-temp",
          "temporary land checkout; no live land lock",
          true,
        );
  const fresh = await updateStale(ws.dir);
  if (!fresh.ok) return verdict("keep", msg(fresh));
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
  for (const candidate of tips) {
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

/** TSV columns: path, kind, verdict, change id, age, reason. Legacy deletion is opt-in. */
export async function gc(
  options: GcOptions,
): Promise<Attempt<{ lines: string[]; failed: string[] }>> {
  const resolved = resolveRepo(options.repo);
  if (!resolved.ok) return resolved;
  const repo = resolved.value;
  const pre = common(repo);
  if (!pre.ok) return pre;
  const graveyard = await checkGraveyard();
  if (!graveyard.ok) return graveyard;
  return withLock(repo, "ws gc", async () => {
    const cfg = await readConfig(repo, true);
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
        dirname(ws.dir) === repo.wsRoot && ws.name.startsWith("ws_")
          ? "ws"
          : "legacy";
      const c = await classify(repo, cfg.value, ws, records.value, trunk.value);
      let label = c.verdict;
      let reason = c.reason;
      const recorded = lineageOf(records.value, realOr(ws.dir)).length > 0;
      const allowed =
        kind === "legacy"
          ? options.legacy === true
          : recorded || options.includeUnrecorded;
      if (c.collect && !allowed)
        reason +=
          kind === "legacy"
            ? "; report only; pass --legacy to collect"
            : "; unrecorded; pass --include-unrecorded to collect";
      if (c.collect && allowed && !options.dryRun) {
        const done = await collectWorkspace(repo, graveyard.value, ws);
        label = done.ok ? "collected" : "FAILED";
        reason = done.ok ? reason : msg(done);
        failed.push(...(done.ok ? [] : [ws.dir]));
      }
      // Escape control characters without breaking the column contract.
      lines.push(
        [ws.dir, kind, label, c.change, c.age, reason]
          .map((field) => field.replaceAll("\t", "\\t").replaceAll("\n", "\\n"))
          .join("\t"),
      );
    }
    return good({ lines, failed });
  });
}

/** Consumer registry is data, never executable configuration. Include pending consumers too. */
export async function gcAll(
  options: Omit<GcOptions, "repo">,
  root = resolve(import.meta.dir, "../../.."),
): Promise<Attempt<{ lines: string[]; failed: string[] }>> {
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
  const roots = new Set([
    root,
    ...registry.data.consumers.map((r) => r.root),
    ...registry.data.pending.map((r) => r.root),
  ]);
  const lines: string[] = [];
  const failed: string[] = [];
  const seen = new Set<string>();
  for (const path of roots) {
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
  return good({ lines, failed });
}
