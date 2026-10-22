import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  unlink,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { homedir } from "node:os";
import {
  attempt,
  errorMessage,
  type Attempt,
} from "../../shared/src/attempt.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";
import { JJ_READ_ARGS } from "../../shared/src/jj-read.ts";
import { resolveAgxConfig } from "../../shared/src/agx-config.ts";
import { validateSlug } from "../../shared/src/slug.ts";

for (const retired of ["AGX_DOCTOR_HOME", "AGX_DOCTOR_WORKSPACE"]) {
  if (process.env[retired] !== undefined) {
    process.stderr.write(
      `agx-ticket: ${retired} is retired; unset it and use AGX_REPOS_ROOT instead\n`,
    );
    process.exit(2);
  }
}

const bad = (error: string): Attempt<never> => ({ ok: false, error });
const good = <T>(value: T): Attempt<T> => ({ ok: true, value });
const absent = (error: unknown) =>
  z.object({ code: z.literal("ENOENT") }).safeParse(error).success;
const exists = async (path: string) => {
  const info = await attempt(() => lstat(path));
  if (info.ok) return good(true);
  return absent(info.error) ? good(false) : info;
};
const inside = (path: string, root: string) => {
  const rel = relative(root, path);
  return (
    rel === "" ||
    (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`))
  );
};

/** Metadata only: no jj invocation or working-copy snapshot on the read path. */
async function repository(
  path: string,
): Promise<{ root: string; store: string | null }> {
  let root = await realpath(path);
  while (true) {
    const marker = join(root, ".jj", "repo");
    const info = await attempt(() => lstat(marker));
    if (info.ok) {
      const store = info.value.isDirectory()
        ? marker
        : resolve(dirname(marker), (await readFile(marker, "utf8")).trim());
      return { root, store: await realpath(store) };
    }
    const git = await exists(join(root, ".git"));
    if (git.ok && git.value) return { root, store: null };
    const parent = dirname(root);
    if (parent === root) return { root: await realpath(path), store: null };
    root = parent;
  }
}

export async function context(path: string) {
  const repo = await repository(path);
  const config = await resolveAgxConfig(repo.root, {
    vcs: repo.store === null ? "git" : "jj",
  });
  if (!config.ok) return config;
  return good({
    ...repo,
    root: config.value.root,
    directory: config.value.tickets,
  });
}
type Context = Extract<
  Awaited<ReturnType<typeof context>>,
  { ok: true }
>["value"];
const DEFAULT_TEMPLATE = `+++\nschema = 2\nname = {{slug:json}}\noutcome = {{slug:json}}\nwrites = []\nverify = []\n\n[proposition]\nid = {{slug:json}}\nclaim = {{slug:json}}\nrefuted_by = "Describe the observation that refutes this claim"\n+++\n\n# {{slug}}\n`;

function render(
  template: string,
  values: Map<string, string>,
): Attempt<string> {
  const missing = new Set<string>();
  const text = template.replaceAll(
    /\{\{\s*([A-Za-z_]\w*)(:json)?\s*\}\}/gu,
    (_match, key: string, json: string | undefined) => {
      const value = values.get(key);
      if (value === undefined) missing.add(key);
      return json === undefined ? (value ?? "") : JSON.stringify(value ?? "");
    },
  );
  return missing.size === 0
    ? good(text)
    : bad(`missing template values: ${[...missing].join(", ")}`);
}

export async function create(options: {
  repo: string;
  slug: string;
  from?: string | undefined;
  set: string[];
  each?: string | undefined;
}): Promise<Attempt<string[]>> {
  const checkedSlug = validateSlug(options.slug, "agx ticket new");
  if (!checkedSlug.ok) return checkedSlug;
  const ctx = await context(options.repo);
  if (!ctx.ok) return ctx;
  const values = new Map<string, string>();
  for (const pair of options.set) {
    const match = /^([A-Za-z_]\w*)=(.*)$/su.exec(pair);
    if (match === null) return bad(`invalid --set '${pair}': expected k=v`);
    values.set(match[1]!, match[2]!);
  }
  const template =
    options.from === undefined
      ? DEFAULT_TEMPLATE
      : await readFile(resolve(options.from), "utf8");
  const inputs =
    options.each === undefined
      ? [undefined]
      : (await readFile(resolve(options.each), "utf8"))
          .split(/\r?\n/u)
          .filter((line) => line.trim() !== "");
  if (inputs.length === 0) return bad("--each has no nonblank input lines");
  const planned: { path: string; text: string }[] = [];
  for (const [i, input] of inputs.entries()) {
    const slug =
      input === undefined ? options.slug : `${options.slug}-${i + 1}`;
    const row = new Map([...values, ["slug", slug], ["index", String(i + 1)]]);
    if (input !== undefined) row.set("input", input);
    const text = render(template, row);
    if (!text.ok) return text;
    const path = join(ctx.value.directory, `${slug}.md`);
    const present = await exists(path);
    if (!present.ok) return present;
    if (present.value)
      return bad(`${path} already exists; refusing to overwrite`);
    planned.push({ path, text: text.value });
  }
  await mkdir(ctx.value.directory, { recursive: true });
  const written: string[] = [];
  for (const item of planned) {
    const saved = await attempt(async () => {
      await using file = await open(item.path, "wx");
      await file.writeFile(item.text);
    });
    if (!saved.ok)
      return bad(
        `${item.path}: ${errorMessage(saved.error)}; created ${written.length} ticket(s): ${written.join(", ")}`,
      );
    written.push(item.path);
  }
  return good(written);
}

const Run = z.looseObject({
  id: z.string().min(1),
  ticket: z.string().min(1),
  started_at: z.iso.datetime({ offset: true }),
  state: z.enum(["running", "ended", "orphaned"]),
  judgment: z.object({ decision: z.string() }).nullable().optional(),
  cwd: z.string(),
  workspace: z.string(),
  workspace_name: z.string().optional(),
  end_commit: z.string().nullable().optional(),
  ticket_path: z.string().optional(),
});
type Run = z.output<typeof Run>;
export type TicketRow = {
  ticket: string;
  path: string;
  state: "no-run" | "running" | "ended-unjudged" | "accepted" | "rejected";
  landed: boolean | null;
  run: string | null;
  reason: string;
  volatile: boolean;
};

async function command(
  args: string[],
  cwd: string,
  quiet = false,
): Promise<Attempt<string>> {
  if (!quiet) process.stderr.write(`tkt: reading ${args[0]} ${args[1]}\n`);
  const ran = await attempt(async () => {
    const child = Bun.spawn(args, {
      cwd,
      stdin: "ignore",
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
  if (!ran.ok) return ran;
  return ran.value.code === 0
    ? good(ran.value.out)
    : bad(
        `${args.join(" ")} failed (exit ${ran.value.code}): ${ran.value.err.trim()}`,
      );
}
function repositoryReader() {
  const cache = new Map<string, ReturnType<typeof repository>>();
  return (path: string) => {
    let read = cache.get(path);
    if (read === undefined) {
      read = repository(path);
      cache.set(path, read);
    }
    return read;
  };
}
async function belongs(
  run: Run,
  ctx: Context,
  readRepository = repository,
): Promise<boolean> {
  const found = await attempt(() => readRepository(run.workspace));
  if (found.ok && ctx.store !== null && found.value.store === ctx.store)
    return true;
  const cwd = await attempt(() => readRepository(run.cwd));
  if (cwd.ok && cwd.value.root === ctx.root) return true;
  // ws GC can remove the tree before ticket GC. Preserve run identity from ws
  // convention, but landing still fails closed when jj forgot the workspace.
  if (found.ok || ctx.store === null) return false;
  const backing = dirname(dirname(ctx.store));
  const workspaceRoot = join(dirname(backing), basename(backing) + ".ws");
  return inside(resolve(run.workspace), workspaceRoot);
}
const stateOf = (run: Run): TicketRow["state"] => {
  if (run.state === "running") return "running";
  if (run.state !== "ended") return "ended-unjudged";
  if (run.judgment?.decision === "accept") return "accepted";
  if (run.judgment?.decision === "reject") return "rejected";
  return "ended-unjudged";
};
async function landing(
  run: Run,
  ctx: Context,
  quiet = false,
): Promise<{ landed: boolean | null; reason: string }> {
  if (ctx.store === null)
    return { landed: null, reason: "not a jj repository" };
  const name = run.workspace_name ?? basename(run.workspace);
  if (!/^[A-Za-z0-9_-]+$/u.test(name))
    return { landed: null, reason: "invalid workspace name" };
  const tips = [`${name}@`];
  if (run.end_commit !== undefined && run.end_commit !== null) {
    if (!/^[a-f0-9]+$/u.test(run.end_commit))
      return { landed: null, reason: "invalid end_commit" };
    tips.push(run.end_commit);
  }
  const out = await command(
    [
      "jj",
      "--ignore-working-copy",
      "--no-pager",
      "--color=never",
      "log",
      "--no-graph",
      "-r",
      `(::(${tips.join(" | ")}) ~ ::trunk()) ~ empty()`,
      "-T",
      'commit_id ++ "\\n"',
    ],
    ctx.root,
    quiet,
  );
  if (!out.ok) return { landed: null, reason: errorMessage(out.error) };
  return {
    landed: out.value.trim() === "",
    reason: out.value.trim() === "" ? "landed" : "unlanded commits",
  };
}
async function ticketName(path: string): Promise<string> {
  const text = await readFile(path, "utf8");
  const front = /^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+/u.exec(text);
  if (front === null) return basename(path, ".md");
  const raw = await attempt(() => Bun.TOML.parse(front[1]!));
  if (!raw.ok) return basename(path, ".md");
  const name = z
    .object({ name: z.string().min(1).optional() })
    .safeParse(raw.value);
  return name.success
    ? (name.data.name ?? basename(path, ".md"))
    : basename(path, ".md");
}
export async function list(
  repo: string,
  options: { quiet?: boolean } = {},
): Promise<Attempt<TicketRow[]>> {
  const contextResult = await context(repo);
  if (!contextResult.ok) return contextResult;
  const ctx = contextResult.value;
  const records = await command(
    ["agx", "worker", "ls", "--json", "--all"],
    ctx.root,
    options.quiet,
  );
  if (!records.ok) return records;
  const runs = jsonOf(z.array(Run)).safeParse(records.value);
  if (!runs.success)
    return bad(`invalid agx worker ls --json: ${runs.error.message}`);
  return listWithRuns(ctx, runs.data, options);
}

/** One history read per fleet diagnostic, indexed once per repository. */
async function listWithRuns(
  ctx: Context,
  runs: Run[],
  options: { quiet?: boolean; findingsOnly?: boolean },
  files = new Map<string, { name: string; ticket: string; path: string }[]>(),
  readRepository = repositoryReader(),
  readLanding = landing,
): Promise<Attempt<TicketRow[]>> {
  const byTicket = new Map<string, Run[]>();
  for (const run of runs) {
    const group = byTicket.get(run.ticket) ?? [];
    group.push(run);
    byTicket.set(run.ticket, group);
  }
  let entries = files.get(ctx.directory);
  if (entries === undefined) {
    const inventory = await ticketFiles(ctx.directory);
    if (!inventory.ok) return inventory;
    entries = inventory.value;
    files.set(ctx.directory, entries);
  }
  const rows: TicketRow[] = [];
  for (const entry of entries) {
    const { path, ticket } = entry;
    const matching = [...new Set([ticket, path, entry.name])].flatMap(
      (key) => byTicket.get(key) ?? [],
    );
    const membership = await Promise.all(
      matching.map((run) => belongs(run, ctx, readRepository)),
    );
    const own = matching.filter((_run, index) => membership[index] === true);
    own.sort((a, b) => Temporal.Instant.compare(b.started_at, a.started_at));
    const latest = own[0];
    const active = own.find((run) => run.state === "running");
    const chosen = active ?? latest;
    const status = chosen === undefined ? "no-run" : stateOf(chosen);
    if (options.findingsOnly === true && status !== "accepted") continue;
    const landed =
      chosen === undefined
        ? { landed: null, reason: "no run" }
        : await readLanding(chosen, ctx, options.quiet);
    const physical = await realpath(path);
    const volatile = [
      "/tmp",
      "/var/tmp",
      "/dev/shm",
      "/run",
      "/private/tmp",
    ].some((root) => inside(physical, root));
    rows.push({
      ticket,
      path,
      state: status,
      ...landed,
      run: chosen?.id ?? null,
      volatile,
    });
  }
  return good(rows);
}

async function ticketFiles(
  directory: string,
): Promise<Attempt<{ name: string; ticket: string; path: string }[]>> {
  const present = await exists(directory);
  if (!present.ok) return present;
  if (!present.value) return good([]);
  const entries = await readdir(directory, { withFileTypes: true });
  const files: { name: string; ticket: string; path: string }[] = [];
  for (const entry of entries.toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(directory, entry.name);
    files.push({ name: entry.name, ticket: await ticketName(path), path });
  }
  return good(files);
}

export async function collect(
  repo: string,
  dryRun: boolean,
): Promise<Attempt<string[]>> {
  const rows = await list(repo);
  if (!rows.ok) return rows;
  const lines: string[] = [];
  for (const row of rows.value.filter(
    (r) => r.state === "accepted" && r.landed === true,
  )) {
    const deleted = dryRun ? good(true) : await deleteEligible(repo, row);
    if (!deleted.ok)
      return bad(
        errorMessage(deleted.error) + "; completed: " + lines.join("; "),
      );
    if (!deleted.value) continue;
    lines.push(
      `${dryRun ? "would-collect" : "collected"}\t${row.path}${row.volatile ? "\tvolatile path (history may be unavailable)" : ""}`,
    );
  }
  return good(lines);
}

const doctorClean = (value: string) => value.replaceAll(/[\t\r\n]/gu, " ");
const isTicketFile = async (path: string): Promise<boolean> => {
  const text = await readFile(path, "utf8").catch(() => "");
  const front = /^\+\+\+\r?\n([\s\S]*?)\r?\n\+\+\+/u.exec(text);
  if (front === null) return false;
  const parsed = await attempt(() => Bun.TOML.parse(front[1]!));
  if (!parsed.ok) return false;
  return z
    .object({
      schema: z.literal(2),
      proposition: z.record(z.string(), z.unknown()),
    })
    .safeParse(parsed.value).success;
};

/** Read-only fleet check for ticket placement and accepted, landed tickets. */
export async function doctor(): Promise<Attempt<string[]>> {
  const override = process.env.AGX_REPOS_ROOT;
  const workspaceHome = override ?? join(homedir(), "Workspace");
  const repos = override === undefined ? [join(homedir(), "dotfiles")] : [];
  const workspaceEntries = await readdir(workspaceHome, {
    withFileTypes: true,
  }).catch(() => []);
  repos.push(
    ...workspaceEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(workspaceHome, entry.name)),
  );
  const findings: string[] = [];
  const seen = new Set<string>();
  const contexts: (Context & { backing: string })[] = [];
  for (const candidate of repos) {
    const git = await exists(join(candidate, ".git"));
    if (!git.ok || !git.value) continue;
    const ctx = await context(candidate);
    if (!ctx.ok) return ctx;
    const backing =
      ctx.value.store === null
        ? ctx.value.root
        : resolve(dirname(dirname(ctx.value.store)));
    if (resolve(ctx.value.root) !== backing || seen.has(backing)) continue;
    seen.add(backing);
    contexts.push({ ...ctx.value, backing });
  }
  const homes = contexts.flatMap((ctx) => [
    ctx.directory,
    join(ctx.backing, ".agents/tickets"),
  ]);
  const outside = new Map<string, { backing: string; directory: string }>();
  const first = contexts[0];
  const records =
    first === undefined
      ? good("[]")
      : await command(
          ["agx", "worker", "ls", "--json", "--all"],
          first.backing,
          true,
        );
  if (!records.ok) return records;
  const runs = jsonOf(z.array(Run)).safeParse(records.value);
  if (!runs.success) return bad("invalid agx worker ls --json");
  const files = new Map<
    string,
    { name: string; ticket: string; path: string }[]
  >();
  const readRepository = repositoryReader();
  const readLanding = diagnosticLandingReader();
  for (const ctx of contexts) {
    const rows = await listWithRuns(
      ctx,
      runs.data,
      { quiet: true, findingsOnly: true },
      files,
      readRepository,
      readLanding,
    );
    if (!rows.ok) return rows;
    findings.push(...acceptedLandedFindings(ctx.backing, rows.value));
  }
  const actionable = runs.data.filter(
    (run) =>
      run.ticket_path !== undefined &&
      (run.state === "running" ||
        run.judgment === undefined ||
        run.judgment === null),
  );
  for (const run of actionable) {
    const path = resolve(run.cwd, run.ticket_path ?? run.ticket);
    const membership = await Promise.all(
      contexts.map((candidate) => belongs(run, candidate, readRepository)),
    );
    const ctx = contexts.find(
      (_candidate, index) => membership[index] === true,
    );
    if (
      ctx !== undefined &&
      !homes.some((ticketHome) => inside(path, ticketHome))
    )
      outside.set(path, ctx);
  }
  for (const ctx of contexts) {
    for (const path of await outOfHomePaths(ctx.backing, homes))
      outside.set(path, ctx);
  }
  for (const [path, { backing, directory }] of outside)
    findings.push(
      [
        "agx-ticket",
        backing,
        basename(path, ".md"),
        "outside-home",
        `mv ${path} ${directory}/`,
      ]
        .map((value) => doctorClean(value))
        .join("\t"),
    );
  return good(findings);
}

/** Forgetting a workspace makes landing unknown. Discover missing names once,
 * rather than spawning jj for every historical ticket. Caches last one run. */
function diagnosticLandingReader(): typeof landing {
  const workspaces = new Map<string, Promise<Attempt<string>>>();
  const results = new Map<string, ReturnType<typeof landing>>();
  return async (run, ctx, quiet) => {
    if (ctx.store === null) return landing(run, ctx, quiet);
    let inventory = workspaces.get(ctx.root);
    if (inventory === undefined) {
      inventory = command(
        ["jj", ...JJ_READ_ARGS, "workspace", "list", "-T", 'name ++ "\\n"'],
        ctx.root,
        quiet,
      );
      workspaces.set(ctx.root, inventory);
    }
    const names = await inventory;
    if (!names.ok) return { landed: null, reason: errorMessage(names.error) };
    const name = run.workspace_name ?? basename(run.workspace);
    if (!names.value.split("\n").includes(name))
      return { landed: null, reason: "workspace is no longer registered" };
    const key = JSON.stringify([ctx.root, name, run.end_commit]);
    let result = results.get(key);
    if (result === undefined) {
      result = landing(run, ctx, quiet);
      results.set(key, result);
    }
    return result;
  };
}

function acceptedLandedFindings(backing: string, rows: TicketRow[]): string[] {
  return rows
    .filter((row) => row.state === "accepted" && row.landed === true)
    .map((row) =>
      [
        "agx-ticket",
        backing,
        row.ticket,
        "accepted-landed-present",
        `agx ticket gc --repo ${backing}`,
      ]
        .map((value) => doctorClean(value))
        .join("\t"),
    );
}

async function outOfHomePaths(
  backing: string,
  homes: string[],
): Promise<string[]> {
  const findings: string[] = [];
  const ignored = new Set([".git", ".jj", "node_modules", ".ws"]);
  for await (const relativePath of new Bun.Glob("**/*.md").scan({
    cwd: backing,
    dot: true,
    onlyFiles: true,
  })) {
    if (relativePath.split("/").some((part) => ignored.has(part))) continue;
    const path = resolve(backing, relativePath);
    if (homes.some((home) => inside(path, home))) continue;
    if (!(await isTicketFile(path))) continue;
    findings.push(path);
  }
  return findings;
}

async function deleteEligible(
  repo: string,
  row: TicketRow,
): Promise<Attempt<boolean>> {
  const current = await list(repo);
  if (!current.ok) return current;
  const same = current.value.find((r) => r.path === row.path);
  if (
    same?.state !== "accepted" ||
    same.landed !== true ||
    same.run !== row.run
  )
    return good(false);
  const removed = await attempt(async () => {
    const info = await lstat(row.path);
    if (!info.isFile() || info.isSymbolicLink()) return false;
    await unlink(row.path);
    return true;
  });
  return removed;
}
