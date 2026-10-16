// Run-workspace lifecycle: add, rm, gc. The tool keeps no state of its own. The workspace
// directory is the only artifact; what it must know it reads from the jj store (`jj workspace
// list`, revsets), from the repo's `.ws.toml`, and from `agx ls --json`. The one transient file
// is the per-store lock directory, removed on release.
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir, hostname } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import {
  attempt,
  errorMessage,
  type Attempt,
} from "../../shared/src/attempt.ts";
import { acquire } from "../../shared/src/dir-lock.ts";
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
export type Config = { ready: string[]; trunk: string };

export const CONFIG_FILE = ".ws.toml";
const ConfigSchema = z.strictObject({
  ready: z.array(z.string().min(1)).default([]),
  trunk: z.string().min(1).default("trunk()"),
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

export function resolveRepo(path: string): Attempt<Repo> {
  const found = jjWorkspace(path);
  if (!found.ok) return bad(msg(found));
  const backing = found.value.backingRoot;
  const name = basename(backing);
  const parent = dirname(backing);
  return good({ backing, name, parent, wsRoot: join(parent, `${name}.ws`) });
}

export async function readConfig(repo: Repo): Promise<Attempt<Config>> {
  const file = join(repo.backing, CONFIG_FILE);
  if (!existsSync(file)) return good({ ready: [], trunk: "trunk()" });
  const parsed = await attempt(() =>
    Bun.TOML.parse(readFileSync(file, "utf8")),
  );
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

export async function remove(options: {
  slug: string;
  repo: string;
}): Promise<Attempt<string>> {
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

export type Verdict = { action: "collect" | "keep"; reason: string };
export type Candidate = { dir: string; name: string | null; verdict: Verdict };

/** A legacy directory's workspace name: the one registered name jj reports for its @ and its checkout file holds. */
async function legacyName(repo: Repo, dir: string): Promise<string | null> {
  const heads = await jjOut(
    ["log", "--no-graph", "-r", "@", "-T", 'working_copies ++ "\\n"'],
    dir,
    false,
  );
  const registered = await workspaceNames(repo);
  if (!heads.ok || !registered.ok) return null;
  const store = fromThrowable(() =>
    readFileSync(join(dir, ".jj", "working_copy", "checkout")).toString(
      "latin1",
    ),
  )();
  if (store.isErr()) return null;
  const named = heads.value
    .trim()
    .split(/\s+/u)
    .map((t) => t.replace(/@$/u, ""))
    .filter((n) => registered.value.includes(n) && store.value.includes(n));
  return named.length === 1 ? (named[0] ?? null) : null;
}

function subdirs(path: string, match: (name: string) => boolean): string[] {
  const names = fromThrowable(() => readdirSync(path))();
  if (names.isErr()) return [];
  return names.value
    .filter(match)
    .map((n) => join(path, n))
    .filter((p) =>
      fromThrowable(() => statSync(p).isDirectory())().unwrapOr(false),
    );
}

export type GcOptions = {
  repo: string;
  dryRun: boolean;
  includeUnrecorded: boolean;
};

async function judge(
  repo: Repo,
  cfg: Config,
  records: RunRecord[],
  dir: string,
  options: GcOptions,
): Promise<Candidate> {
  const owner = jjWorkspace(dir);
  if (!owner.ok || owner.value.backingRoot !== repo.backing)
    return {
      dir,
      name: null,
      verdict: {
        action: "keep",
        reason: "not a jj workspace of this repository",
      },
    };
  const name =
    dirname(dir) === repo.wsRoot ? basename(dir) : await legacyName(repo, dir);
  const keep = (reason: string): Candidate => ({
    dir,
    name,
    verdict: { action: "keep", reason },
  });
  if (name === null) return keep("workspace name cannot be determined");
  const real = realOr(dir);
  const lineage = lineageOf(records, real);
  const live = lineage.find((r) => !TERMINAL_STATES.has(r.state));
  if (live !== undefined)
    return keep(`live or continuing run ${live.id} (${live.state})`);
  const occupied = busy(real);
  if (occupied !== undefined) return keep(occupied);
  const recorded = lineage.length > 0;
  if (!recorded && !options.includeUnrecorded)
    return keep(
      "unrecorded (no agx run); collect with --include-unrecorded when it has no diff",
    );
  const ends = lineage.flatMap((r) =>
    r.end_commit === undefined || r.end_commit === null || r.end_commit === ""
      ? []
      : [r.end_commit],
  );
  const work = await unlanded(repo, cfg, dir, name, ends);
  if (!work.ok) return keep(`cannot judge: ${msg(work)}`);
  if (work.value.length > 0)
    return keep(
      `unlanded: ${work.value[0]}${work.value.length > 1 ? ` (+${work.value.length - 1})` : ""}`,
    );
  return {
    dir,
    name,
    verdict: {
      action: "collect",
      reason: recorded
        ? "terminal lineage, nothing unlanded"
        : "unrecorded, no diff",
    },
  };
}

/** Judge every candidate under the store lock and, unless dry-run, collect those judged collectable. */
export async function gc(
  options: GcOptions,
): Promise<Attempt<{ lines: string[]; failed: string[] }>> {
  const repo = resolveRepo(options.repo);
  if (!repo.ok) return repo;
  const cfg = await readConfig(repo.value);
  if (!cfg.ok) return cfg;
  const pre = common(repo.value);
  if (!pre.ok) return pre;
  const graveyard = await checkGraveyard();
  if (!graveyard.ok) return graveyard;
  const dirs = [
    ...subdirs(repo.value.wsRoot, (n) => n.startsWith("ws_")),
    ...subdirs(
      repo.value.parent,
      (n) =>
        n.startsWith(`${repo.value.name}-ws-`) ||
        n.startsWith(`${repo.value.name}-arm-`),
    ),
  ];
  return withLock(repo.value, "ws gc", async () => {
    const records = await agxRecords(repo.value.backing);
    if (!records.ok) return records;
    const lines: string[] = [];
    const failed: string[] = [];
    for (const dir of dirs) {
      const c = await judge(repo.value, cfg.value, records.value, dir, options);
      if (c.verdict.action === "keep" || options.dryRun || c.name === null) {
        const label =
          options.dryRun && c.verdict.action === "collect"
            ? "would-collect"
            : c.verdict.action;
        lines.push(`${label}\t${dir}\t${c.verdict.reason}`);
        continue;
      }
      const done = await forgetAndBury(
        repo.value,
        graveyard.value,
        c.name,
        dir,
      );
      if (done.ok) lines.push(`collected\t${dir}\t${c.verdict.reason}`);
      else {
        failed.push(dir);
        lines.push(`FAILED\t${dir}\t${msg(done)}`);
      }
    }
    return good({ lines, failed });
  });
}
