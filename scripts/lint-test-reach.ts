// `mise run lint:test-reach` — every tracked *.test.ts / *.test.zsh is run by `test`, or is named,
// with a reason, in lint/test-reach-exceptions.toml. A test no task reaches rots unseen: it
// passes in nobody's gate, so its failures are found by nobody.
//
// Reach is read from the mise task graph (`mise tasks ls --json --hidden`), never from a
// second list: a file is reached when a path or glob in the `run` body of a task reachable
// from `test` covers it, when a launcher script such as scripts/test-zsh.ts names it, or when
// a reached zsh test sources it (zsh/tests/terminal-hygiene.test.zsh sources its siblings).
import { resolve } from "node:path";
import { fromThrowable } from "neverthrow";
import { jsonOf, z } from "../tools/shared/src/zod.ts";
import { trackedFiles } from "./tracked-files.ts";

const ROOT_TASK = "test";
const TEST_FILE = /\.test\.(?:ts|zsh)$/u;
const PATH_TOKEN = /[\w.@${}*-]+(?:\/[\w.@${}*-]+)+/gu;
const GLOB_CHARS = /[*?{]/u;
const LAUNCHER = /(?:^|[\s"'])(\S+\.(?:ts|zsh|sh))(?=$|[\s"'])/gu;

export type Task = { name: string; depends: string[]; run: string[] };
type Read = (path: string) => Promise<string | undefined>;
export type Reach = { tasks: Task[]; files: string[]; read: Read };
export type Verdict = { unreached: string[]; stale: string[] };
type Loaded<T> = { ok: true; value: T } | { ok: false; message: string };

export function reachableTasks(tasks: Task[], root = ROOT_TASK): Task[] {
  const byName = new Map(tasks.map((task) => [task.name, task]));
  const seen = new Set<string>();
  const queue = [root];
  while (queue.length > 0) {
    const name = queue.pop();
    if (name === undefined || seen.has(name)) continue;
    seen.add(name);
    queue.push(...(byName.get(name)?.depends ?? []));
  }
  return tasks.filter((task) => seen.has(task.name));
}

function normalize(token: string): string {
  return token.replace(/^\.\//u, "").replace(/\/+$/u, "");
}

function unquote(word: string): string {
  return word.replaceAll(/^["']|["']$/gu, "");
}

function slashTokens(text: string): string[] {
  return [...text.matchAll(PATH_TOKEN)].map((match) => normalize(match[0]));
}

// Every bare word after `bun test`: a Bun filter such as `standard-presets` has no slash.
function bunTestWords(segment: string): string[] {
  const words = segment.trim().split(/\s+/u);
  const at = words.findIndex(
    (word, index) => word === "bun" && words[index + 1] === "test",
  );
  if (at < 0) return [];
  return words
    .slice(at + 2)
    .map((word) => unquote(word))
    .filter((word) => word !== "" && !word.startsWith("-"))
    .map((word) => normalize(word));
}

export function runReferences(run: string): string[] {
  return [
    ...slashTokens(run),
    ...run.split(/&&|\|\||;|\|/u).flatMap((segment) => bunTestWords(segment)),
  ];
}

// A reference `$ROOT/zsh/tests/x.test.zsh` names the file once its unknown leading
// segments are dropped, so try every suffix of two or more segments (never for a glob:
// the suffix `*/tests` of `tools/*/tests` would cover every tests directory).
function suffixes(reference: string): string[] {
  if (GLOB_CHARS.test(reference)) return [];
  const parts = reference.split("/");
  return parts.flatMap((_, index) =>
    parts.length - index >= 2 ? [parts.slice(index).join("/")] : [],
  );
}

function withSuffixes(references: string[]): string[] {
  return references.flatMap((reference) => [reference, ...suffixes(reference)]);
}

function covers(reference: string, file: string): boolean {
  if (file === reference || file.startsWith(`${reference}/`)) return true;
  if (!GLOB_CHARS.test(reference)) return false;
  const glob = new Bun.Glob(reference);
  const parts = file.split("/");
  return parts.some((_, index) =>
    glob.match(parts.slice(0, index + 1).join("/")),
  );
}

// Only a `source x` / `. x` line makes one zsh test run another; a path merely mentioned in a
// test (a registry listing, a comment) reaches nothing.
function sourcedReferences(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => /^\s*(?:source|\.)\s/u.test(line))
    .flatMap((line) => slashTokens(line));
}

async function scriptReferences(script: string, read: Read): Promise<string[]> {
  for (const candidate of suffixes(script)) {
    const source = await read(candidate);
    if (source !== undefined) return slashTokens(source);
  }
  return [];
}

async function launcherReferences(
  run: string,
  read: Read,
  scanned: Set<string>,
): Promise<string[]> {
  const references: string[] = [];
  for (const match of run.matchAll(LAUNCHER)) {
    const script = normalize(match[1] ?? "");
    if (scanned.has(script)) continue;
    scanned.add(script);
    references.push(...(await scriptReferences(script, read)));
  }
  return references;
}

async function taskReferences(
  task: Task,
  read: Read,
  scanned: Set<string>,
): Promise<string[]> {
  const references = task.run.flatMap((run) => runReferences(run));
  for (const run of task.run) {
    references.push(...(await launcherReferences(run, read, scanned)));
  }
  return references;
}

// Reaches every unreached file the references cover; a newly reached zsh test adds the files it
// sources. Returns whether anything was reached, so the caller loops to a fixpoint.
async function step(
  files: string[],
  reached: Set<string>,
  references: string[],
  read: Read,
): Promise<boolean> {
  const pending = files.filter(
    (file) =>
      !reached.has(file) &&
      references.some((reference) => covers(reference, file)),
  );
  for (const file of pending) {
    reached.add(file);
    const source = file.endsWith(".zsh") ? await read(file) : undefined;
    references.push(...withSuffixes(sourcedReferences(source ?? "")));
  }
  return pending.length > 0;
}

export async function reachedFiles({
  tasks,
  files,
  read,
}: Reach): Promise<Set<string>> {
  const scanned = new Set<string>();
  const references: string[] = [];
  for (const task of reachableTasks(tasks)) {
    const found = await taskReferences(task, read, scanned);
    references.push(...withSuffixes(found));
  }
  const reached = new Set<string>();
  while (await step(files, reached, references, read));
  return reached;
}

function excepted(pattern: string, file: string): boolean {
  return pattern === file || new Bun.Glob(pattern).match(file);
}

export async function judge(
  reach: Reach,
  exceptions: Record<string, string>,
): Promise<Verdict> {
  const reached = await reachedFiles(reach);
  const patterns = Object.keys(exceptions);
  return {
    unreached: reach.files.filter(
      (file) =>
        !reached.has(file) &&
        !patterns.some((pattern) => excepted(pattern, file)),
    ),
    // An entry is stale when it covers no unreached tracked file.
    stale: patterns.filter(
      (pattern) =>
        !reach.files.some(
          (file) => excepted(pattern, file) && !reached.has(file),
        ),
    ),
  };
}

const TaskRows = z.array(
  z.looseObject({
    name: z.string(),
    depends: z.array(z.string()),
    run: z.array(z.unknown()),
  }),
);

async function miseTasks(root: string): Promise<Loaded<Task[]>> {
  const child = Bun.spawn(["mise", "tasks", "ls", "--json", "--hidden"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    timeout: 60_000,
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exit !== 0)
    return { ok: false, message: `mise tasks failed (${exit}): ${stderr}` };
  const rows = jsonOf(TaskRows).safeParse(stdout);
  if (!rows.success)
    return { ok: false, message: "mise tasks returned invalid JSON" };
  return {
    ok: true,
    value: rows.data.map((row) => ({
      name: row.name,
      depends: row.depends,
      run: row.run.flatMap((entry) =>
        typeof entry === "string" ? [entry] : [],
      ),
    })),
  };
}

const parseToml = fromThrowable(
  (text: string): unknown => Bun.TOML.parse(text),
  String,
);

const ExceptionsFile = z.object({
  exceptions: z.record(z.string(), z.string().min(1)),
});

async function readExceptions(
  root: string,
): Promise<Loaded<Record<string, string>>> {
  const text = await Bun.file(
    resolve(root, "lint/test-reach-exceptions.toml"),
  ).text();
  const parsed = parseToml(text);
  if (parsed.isErr())
    return { ok: false, message: `exceptions file: ${parsed.error}` };
  const table = ExceptionsFile.safeParse(parsed.value);
  if (!table.success)
    return {
      ok: false,
      message: "exceptions file needs an [exceptions] table of path = reason",
    };
  return { ok: true, value: table.data.exceptions };
}

function report(verdict: Verdict): void {
  for (const file of verdict.unreached)
    process.stderr.write(
      `FAIL ${file}: no task reachable from \`test\` runs it; add it to a test task or name it in lint/test-reach-exceptions.toml with a reason\n`,
    );
  for (const path of verdict.stale)
    process.stderr.write(
      `FAIL ${path}: lint/test-reach-exceptions.toml covers no unreached tracked file; remove the entry\n`,
    );
}

async function main(): Promise<number> {
  const root = resolve(import.meta.dir, "..");
  const listed = await trackedFiles(
    {
      pathspecs: [":(glob)**/*.test.ts", ":(glob)**/*.test.zsh"],
      gitIndex: false,
      expectNonEmpty: true,
    },
    root,
  );
  const tasks = await miseTasks(root);
  const exceptions = await readExceptions(root);
  if (!listed.ok || !tasks.ok || !exceptions.ok) {
    const message = [listed, tasks, exceptions].flatMap((part) =>
      part.ok ? [] : [part.message],
    );
    process.stderr.write(`lint:test-reach: ${message.join("; ")}\n`);
    return 2;
  }
  const files = listed.files.filter((file) => TEST_FILE.test(file)).toSorted();
  const read: Read = async (path) => {
    const file = Bun.file(resolve(root, path));
    return (await file.exists()) ? file.text() : undefined;
  };
  const verdict = await judge(
    { tasks: tasks.value, files, read },
    exceptions.value,
  );
  report(verdict);
  if (verdict.unreached.length > 0 || verdict.stale.length > 0) return 1;
  process.stdout.write(
    `PASS: ${files.length} test files, each reached by \`test\` or excepted\n`,
  );
  return 0;
}

if (import.meta.main) process.exit(await main());
