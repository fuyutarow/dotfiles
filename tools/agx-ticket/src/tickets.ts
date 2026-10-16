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
    if (
      (await exists(join(root, ".git"))).ok &&
      (await Bun.file(join(root, ".git", "HEAD")).exists())
    )
      return { root, store: null };
    const parent = dirname(root);
    if (parent === root) return { root: await realpath(path), store: null };
    root = parent;
  }
}

async function configFile(
  root: string,
  name: string,
): Promise<Attempt<unknown>> {
  const path = join(root, name);
  const present = await exists(path);
  if (!present.ok) return present;
  if (!present.value) return good({});
  return attempt(async () => Bun.TOML.parse(await readFile(path, "utf8")));
}
const Config = z.object({
  tickets: z.string().min(1).default(".agents/tickets"),
});
const WsConfig = z.object({ trunk: z.string().min(1).default("trunk()") });
export async function context(path: string) {
  const repo = await repository(path);
  const raw = await configFile(repo.root, ".agx.toml");
  if (!raw.ok) return raw;
  const config = Config.safeParse(raw.value);
  if (!config.success) return bad(`.agx.toml: ${config.error.message}`);
  const declared = config.data.tickets;
  const directory = resolve(
    repo.root,
    declared.startsWith("~/") ? join(homedir(), declared.slice(2)) : declared,
  );
  return good({ ...repo, directory });
}
type Context = Extract<
  Awaited<ReturnType<typeof context>>,
  { ok: true }
>["value"];
const slugValid = (slug: string) => /^[A-Za-z0-9][A-Za-z0-9_-]*$/u.test(slug);
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
  if (!slugValid(options.slug))
    return bad("invalid slug: use letters, digits, '_' and '-'");
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

async function command(args: string[], cwd: string): Promise<Attempt<string>> {
  process.stderr.write(`tkt: reading ${args[0]} ${args[1]}\n`);
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
async function belongs(run: Run, ctx: Context): Promise<boolean> {
  const found = await attempt(() => repository(run.workspace));
  if (found.ok && ctx.store !== null && found.value.store === ctx.store)
    return true;
  const cwd = await attempt(() => repository(run.cwd));
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
): Promise<{ landed: boolean | null; reason: string }> {
  if (ctx.store === null)
    return { landed: null, reason: "not a jj repository" };
  const raw = await configFile(ctx.root, ".ws.toml");
  if (!raw.ok) return { landed: null, reason: errorMessage(raw.error) };
  const cfg = WsConfig.safeParse(raw.value);
  if (!cfg.success) return { landed: null, reason: "invalid .ws.toml trunk" };
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
      `(::(${tips.join(" | ")}) ~ ::(${cfg.data.trunk})) ~ empty()`,
      "-T",
      'commit_id ++ "\\n"',
    ],
    ctx.root,
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
export async function list(repo: string): Promise<Attempt<TicketRow[]>> {
  const contextResult = await context(repo);
  if (!contextResult.ok) return contextResult;
  const ctx = contextResult.value;
  const records = await command(["agx", "ls", "--json", "--all"], ctx.root);
  if (!records.ok) return records;
  const runs = jsonOf(z.array(Run)).safeParse(records.value);
  if (!runs.success) return bad(`invalid agx ls --json: ${runs.error.message}`);
  const present = await exists(ctx.directory);
  if (!present.ok) return present;
  if (!present.value) return good([]);
  const entries = await readdir(ctx.directory, { withFileTypes: true });
  const rows: TicketRow[] = [];
  for (const entry of entries.toSorted((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(ctx.directory, entry.name);
    const ticket = await ticketName(path);
    const matching = runs.data.filter(
      (r) =>
        r.ticket === ticket || r.ticket === path || r.ticket === entry.name,
    );
    const membership = await Promise.all(
      matching.map((run) => belongs(run, ctx)),
    );
    const own = matching.filter((_run, index) => membership[index] === true);
    own.sort((a, b) => Temporal.Instant.compare(b.started_at, a.started_at));
    const latest = own[0];
    const active = own.find((run) => run.state === "running");
    const chosen = active ?? latest;
    const status = chosen === undefined ? "no-run" : stateOf(chosen);
    const landed =
      chosen === undefined
        ? { landed: null, reason: "no run" }
        : await landing(chosen, ctx);
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
