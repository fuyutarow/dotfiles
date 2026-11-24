// Codex legacy prompt executor for /prompts:quote. Codex has no UserPromptExpansion event, so
// the prompt uses a normal inference turn to run this script. It emits status only; it never
// sends quoted answer text back into the model context.
import { errorMessage, Result } from "@dotfiles/shared/src/result.ts";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import { hostname, homedir, userInfo } from "node:os";
import { basename, join } from "node:path";
import { cli } from "cleye";
import { jsonOf, z } from "@dotfiles/hooks/zod.ts";

const MAX_TURNS = 1024;
const CLIPBOARD_TURN_LIMIT = 50;
const TURN_SEPARATOR = "\n\n---\n\n";
const HOME = process.env["HOME"] ?? homedir();
const JsonRecordSchema = z.record(z.string(), z.unknown());
const JsonRecordText = jsonOf(JsonRecordSchema);
const twoDigits = (number: number) => String(number).padStart(2, "0");
const SessionMetadataSchema = z.object({
  type: z.literal("session_meta"),
  payload: z.object({
    session_id: z.string().optional(),
    id: z.string().optional(),
  }),
});
const TaskCompleteSchema = z.object({
  type: z.literal("event_msg"),
  payload: z.object({
    type: z.literal("task_complete"),
    thread_id: z.string().optional(),
    turn_id: z.string().optional(),
  }),
});
const FinalMessageSchema = z.object({
  type: z.literal("response_item"),
  payload: z.object({
    type: z.literal("message"),
    role: z.literal("assistant"),
    phase: z.literal("final_answer"),
    internal_chat_message_metadata_passthrough: z
      .object({ turn_id: z.string().optional() })
      .optional(),
    content: z
      .array(z.object({ type: z.string(), text: z.string().optional() }))
      .optional(),
  }),
});
const ThreadIdSchema = z.uuid();
const CountSchema = z.number().int().min(1).max(MAX_TURNS);

function fail(message: string): never {
  process.stderr.write(`quote: ${message}\n`);
  process.exit(2);
}

const rejectPrototypeFlag = (type: string, flag: string): void => {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("FATAL: unknown option '--__proto__'\n");
    process.exit(2);
  }
};
const parsedArgs = cli(
  {
    name: "codex-quote",
    strictFlags: true,
    ignoreArgv: rejectPrototypeFlag,
    parameters: [],
    help: {
      description:
        "Copy completed assistant replies from one explicit Codex thread.",
    },
    flags: {
      thread: {
        type: String,
        description: "Exact Codex thread UUID (required).",
      },
      count: {
        type: Number,
        description: `Number of final replies (1-${MAX_TURNS}, default 1).`,
      },
    },
  },
  undefined,
  Bun.argv.slice(2),
);

function invocation(): { thread: string; count: number } {
  if (parsedArgs._.length > 0)
    fail(`unexpected positional argument: ${parsedArgs._[0]}`);
  const thread = ThreadIdSchema.safeParse(parsedArgs.flags.thread);
  if (!thread.success)
    fail(
      "an explicit Codex thread UUID is required with --thread; no session is auto-selected",
    );
  const count = CountSchema.safeParse(parsedArgs.flags.count ?? 1);
  if (!count.success)
    fail(`--count must be a whole number between 1 and ${MAX_TURNS}`);
  return { thread: thread.data, count: count.data };
}

async function findRollouts(root: string, id: string): Promise<string[]> {
  const found: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile() && entry.name.endsWith(`-${id}.jsonl`))
        found.push(path);
    }
  }
  const accessible = await Result.tryPromise({
    try: () => access(root),
    catch: (e: unknown) => e,
  });
  if (accessible.isOk()) await visit(root);
  return found;
}

async function completedFinals(
  file: string,
  thread: string,
): Promise<string[]> {
  const data = await readFile(file, "utf8");
  const lines = data.split("\n");
  if (!data.endsWith("\n")) lines.pop(); // ignore a partial record while Codex is writing
  const records: Record<string, unknown>[] = [];
  for (const line of lines) {
    if (line.trim() === "") continue;
    const parsed = JsonRecordText.safeParse(line);
    if (!parsed.success) fail(`rollout contains an unreadable record: ${file}`);
    records.push(parsed.data);
  }
  const metadataRow = records.find(
    (record) => record["type"] === "session_meta",
  );
  const metadata = SessionMetadataSchema.safeParse(metadataRow);
  const recordedId = metadata.success
    ? (metadata.data.payload.session_id ?? metadata.data.payload.id)
    : undefined;
  if (recordedId !== thread)
    fail("rollout metadata does not match the requested thread ID");
  const completedTurns = new Set<string>();
  for (const record of records) {
    const completion = TaskCompleteSchema.safeParse(record);
    if (!completion.success) continue;
    const eventThread = completion.data.payload.thread_id;
    const turn = completion.data.payload.turn_id;
    if (
      turn !== undefined &&
      (eventThread === undefined || eventThread === thread)
    )
      completedTurns.add(turn);
  }
  const repliesByTurn = new Map<string, string>();
  for (const record of records) {
    const finalMessage = FinalMessageSchema.safeParse(record);
    if (!finalMessage.success) continue;
    const turn =
      finalMessage.data.payload.internal_chat_message_metadata_passthrough
        ?.turn_id;
    if (turn === undefined || !completedTurns.has(turn)) continue;
    const text = (finalMessage.data.payload.content ?? [])
      .filter((part) => part.type === "output_text" && part.text !== undefined)
      .map((part) => part.text ?? "")
      .join("");
    if (text !== "") repliesByTurn.set(turn, text);
  }
  return [...repliesByTurn.values()];
}

function quoteTimestamp(): string {
  const now = Temporal.Now.zonedDateTimeISO();
  return `${twoDigits(now.month)}-${twoDigits(now.day)} ${twoDigits(now.hour)}:${twoDigits(now.minute)}${now.offset.replace(":", "")}`;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function downloadCommand(file: string): string | null {
  const configured = process.env["QUOTE_DOWNLOAD_SSH_TARGET"]?.trim();
  const explicitTarget = configured !== undefined && configured !== "";
  const connection = process.env["SSH_CONNECTION"]?.trim().split(/\s+/u);
  const host = connection?.[2];
  const port = connection?.[3];
  let target = "";
  if (explicitTarget) target = configured;
  else if (host !== undefined && host !== "")
    target = `${userInfo().username}@${host}`;
  else return null;
  if (
    port !== undefined &&
    port !== "" &&
    (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65535)
  )
    return null;
  let portFlag = "";
  if (!explicitTarget && port !== undefined && port !== "")
    portFlag = `-P ${port} `;
  return `scp ${portFlag}${shellQuote(`${target}:${file}`)} .`;
}

async function runCommand(
  command: string,
  args: string[],
  options: { input?: string; env?: Record<string, string>; timeout: number },
): Promise<{ exitCode: number; stderr: string }> {
  const child = Bun.spawn([command, ...args], {
    stdin: options.input === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...options.env },
    timeout: options.timeout,
    killSignal: "SIGTERM",
  });
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  const inputSink = child.stdin;
  const inputUnavailable = inputSink === undefined || inputSink === null;
  if (options.input !== undefined && inputUnavailable) child.kill();
  if (options.input !== undefined && !inputUnavailable) {
    await inputSink.write(options.input);
    await inputSink.end();
  }
  const [, errorText, exitCode] = await Promise.all([
    stdout,
    stderr,
    child.exited,
  ]);
  const inputFailure = options.input !== undefined && inputUnavailable;
  return {
    exitCode,
    stderr: inputFailure ? "child stdin pipe is unavailable" : errorText,
  };
}

// ONE route: the `smart-copy` command (tools/smart-copy) feeds the terminal and this machine's native
// clipboard and decides nothing. It is spawned from PATH, not imported: hooks stay zero-dep.
async function copyText(text: string): Promise<string | null> {
  if (Bun.which("smart-copy") === null)
    return "smart-copy is not on PATH; run mise run deps in the dotfiles checkout";
  const copied = await Result.tryPromise({
    try: () => runCommand("smart-copy", [], { input: text, timeout: 10000 }),
    catch: (e: unknown) => e,
  });
  if (copied.isErr())
    return `clipboard route failed: ${errorMessage(copied.error)}`;
  if (copied.value.exitCode !== 0)
    return `clipboard route failed: ${copied.value.stderr}`;
  return null;
}

async function main(): Promise<void> {
  const { thread, count } = invocation();
  const configuredCodexHome = process.env["CODEX_HOME"]?.trim();
  const codexHome =
    configuredCodexHome === undefined || configuredCodexHome === ""
      ? join(HOME, ".codex")
      : configuredCodexHome;
  const matches = await findRollouts(join(codexHome, "sessions"), thread);
  if (matches.length === 0)
    fail(`no rollout found for explicit thread ${thread}`);
  if (matches.length !== 1)
    fail(
      `thread ID collision: ${matches.length} exact rollout filenames match ${thread}`,
    );
  const [rolloutPath] = matches;
  if (rolloutPath === undefined)
    fail(`no rollout path found for explicit thread ${thread}`);
  const replies = await completedFinals(rolloutPath, thread);
  if (replies.length === 0)
    fail(`no completed assistant final answers found for thread ${thread}`);
  const selected = replies.slice(-count);
  const body = selected.join(TURN_SEPARATOR);
  const bodyBytes = Buffer.byteLength(body, "utf8");
  const where = `${userInfo().username}@${hostname()}`;
  const header = `from codex:${thread} | ${quoteTimestamp()} | turns: ${selected.length} | ${bodyBytes}B | ${where}`;
  const payload = `${header}\n${body}`;
  if (count <= CLIPBOARD_TURN_LIMIT) {
    const failure = await copyText(payload);
    if (failure !== null) fail(failure);
    process.stdout.write(
      `Copied to clipboard — ${header}${selected.length < count ? ` — only ${selected.length} completed replies captured` : ""}\n`,
    );
    return;
  }
  const exportRoot = join(codexHome, "quote-exports");
  await mkdir(exportRoot, { recursive: true, mode: 0o700 });
  const exportDirectory = await mkdtemp(join(exportRoot, "quote-"));
  const savedFile = join(exportDirectory, `${basename(exportDirectory)}.txt`);
  await writeFile(savedFile, payload, { mode: 0o600 });
  const command = downloadCommand(savedFile);
  if (command === null)
    fail(`quote saved at ${savedFile}; no SSH download target is available`);
  const failure = await copyText(command);
  if (failure !== null) fail(failure);
  process.stdout.write(
    `Download command copied to clipboard for ${header}: ${command}\n`,
  );
}

const result = await Result.tryPromise({ try: main, catch: (e: unknown) => e });
if (result.isErr()) {
  process.stderr.write(`quote: ${errorMessage(result.error)}\n`);
  process.exitCode = 2;
}
