import { hookJson } from "./lib.ts";
// UserPromptExpansion hook (matcher: quote) — runs /quote to completion HERE and returns
// decision:"block", so the turn ends without an inference call.
//
// WHY NOT JUST THE COMMAND FILE. A skill/command is a prompt-injection mechanism: its rendered
// body — `!command` output included — becomes a message that a model turn then processes.
// There is no frontmatter field to render-but-not-send (the full field list is in
// slash-commands.md; nothing like no-model/output-only exists), so a normal custom command
// necessarily burns a full LLM turn to restate a STATUS line. For mechanical work that is pure
// waste. UserPromptExpansion is the documented event for the direct-typing path ("Runs when a
// user-typed command expands into a prompt before reaching Claude"), it matches on COMMAND
// NAME, and its decision:"block" "prevents the command from expanding".
//
// Because it fires BEFORE expansion, the command file's own `!command` step never runs when we
// block — so the work has to happen here, and agents/commands/quote.md is reduced to a
// name-registering placeholder. Keep the matcher in settings.json in step with that name.
//
// `/quote N` means the last N turns, oldest first — a QUANTITY. Note this deliberately differs
// from the built-in `/copy N`, where N is an INDEX ("copies the Nth-latest"). The point of this
// command is handing someone a readable excerpt of what a session just said, and for that
// "the last two things" is the useful ask; "only the second-to-last, without the last" is not.
//
// Everything is best-effort: on any failure we still block (the user typed an export
// command, not a prompt for Claude — silently falling through to an inference turn would be
// the worst outcome) and say what went wrong in `reason`.

import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir, userInfo } from "node:os";
import { basename, join } from "node:path";
import { readStdinJson } from "./lib.ts";
import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { at, parseJson, str, strAt } from "../../hooks/narrow.ts";
import { promptParts, stampMDHMZ } from "./prompt-stamp.ts";
import {
  CLIPBOARD_TURN_LIMIT,
  MAX_QUOTE_TURNS as MAX_TURNS,
} from "./quote.config.ts";

const HOME = process.env["HOME"] ?? "";
const HOOKS = `${HOME}/.claude/hooks`;
const TURN_SEPARATOR = "\n\n---\n\n";
// MAX_TURNS comes from quote.config.ts, shared with capture-last-response.ts's KEEP — that
// file only ever HAS this many turns to give, so validating against a different number here
// would let a request past this check just to fail confusingly later.

function block(reason: string): never {
  process.stdout.write(`${hookJson({ decision: "block", reason })}\n`);
  process.exit(0);
}

async function runChild(
  cmd: string,
  args: string[],
  options: {
    readonly env?: Record<string, string | undefined>;
    readonly stdin?: string;
    readonly timeoutMs: number;
  },
): Promise<
  | { readonly ok: true; readonly stdout: string }
  | { readonly ok: false; readonly reason: string }
> {
  const child = Bun.spawn([cmd, ...args], {
    stdin: options.stdin === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
    ...(options.env === undefined ? {} : { env: options.env }),
  });
  let timedOut = false;
  if (options.stdin !== undefined) {
    const stdin = child.stdin;
    if (stdin === undefined)
      return { ok: false, reason: `${cmd} stdin pipe was unavailable` };
    const write = stdin.write(options.stdin);
    void stdin.end();
    await write;
  }
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
  }, options.timeoutMs);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  if (timedOut) {
    return {
      ok: false,
      reason: `process timed out after ${options.timeoutMs}ms`,
    };
  }
  if (exitCode === 0) return { ok: true, stdout };
  const errorText = stderr.trim();
  return {
    ok: false,
    reason:
      errorText.length > 0
        ? errorText
        : `${cmd} exited with code ${String(exitCode)}`,
  };
}

async function copyViaHerdr(
  text: string,
): Promise<
  | { readonly ok: true; readonly pane: string }
  | { readonly ok: false; readonly reason: string }
> {
  const file = join(await mkdtemp(join(tmpdir(), "quote-")), "payload.txt");
  await writeFile(file, text);
  const result = await runChild("bun", [`${HOOKS}/copy-via-herdr-pane.ts`], {
    env: { ...process.env, COPY_PAYLOAD_FILE: file },
    timeoutMs: 15_000,
  });
  return result.ok
    ? { ok: true, pane: result.stdout.trim() }
    : { ok: false, reason: result.reason };
}

function failureReason(error: unknown): string {
  const stderr = str(at(error, "stderr"));
  if (stderr !== undefined && stderr.trim() !== "") return stderr.trim();
  return errorMessage(error);
}

type CopyResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

async function copyViaSshOsc52(text: string): Promise<CopyResult> {
  const tty = process.env["SSH_TTY"]?.trim();
  if (tty === undefined || tty === "") {
    return {
      ok: false,
      reason:
        "SSH_TTY is not set, so there is no client terminal to receive OSC 52",
    };
  }
  if (!tty.startsWith("/dev/")) {
    return { ok: false, reason: `SSH_TTY is not a /dev terminal path: ${tty}` };
  }
  const device = await attempt(async () =>
    (await stat(tty)).isCharacterDevice(),
  );
  if (!device.ok) return { ok: false, reason: failureReason(device.error) };
  if (!device.value) {
    return {
      ok: false,
      reason: `SSH_TTY does not name a terminal device: ${tty}`,
    };
  }
  const write = await attempt(async () => {
    await writeFile(
      tty,
      `\u001B]52;c;${Buffer.from(text, "utf8").toString("base64")}\u0007`,
      { flag: "a" },
    );
  });
  return write.ok
    ? { ok: true }
    : { ok: false, reason: failureReason(write.error) };
}

async function copyViaPbcopy(text: string): Promise<CopyResult> {
  const result = await runChild("pbcopy", [], {
    stdin: text,
    timeoutMs: 5_000,
  });
  return result.ok
    ? { ok: true }
    : { ok: false, reason: `pbcopy: ${result.reason}` };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function downloadCommand(file: string): string | undefined {
  const configuredTarget = process.env["QUOTE_DOWNLOAD_SSH_TARGET"]?.trim();
  const connection = process.env["SSH_CONNECTION"]?.trim().split(/\s+/u);
  const serverIp = connection?.[2];
  const serverPort = connection?.[3];
  let inferredTarget: string | undefined;
  if (serverIp !== undefined && serverIp !== "" && isIP(serverIp) !== 0) {
    const host = isIP(serverIp) === 6 ? `[${serverIp}]` : serverIp;
    inferredTarget = `${userInfo().username}@${host}`;
  }
  const target =
    configuredTarget !== undefined && configuredTarget !== ""
      ? configuredTarget
      : inferredTarget;
  if (target === undefined || target === "") return undefined;
  const configuredPort = process.env["QUOTE_DOWNLOAD_SSH_PORT"]?.trim();
  let port = serverPort;
  if (configuredPort !== undefined && configuredPort !== "") {
    port = configuredPort;
  } else if (configuredTarget !== undefined && configuredTarget !== "") {
    port = undefined;
  }
  if (
    port !== undefined &&
    port !== "" &&
    (!/^\d+$/u.test(port) || Number(port) < 1 || Number(port) > 65535)
  ) {
    return undefined;
  }
  const portFlag = port !== undefined && port !== "" ? `-P ${port} ` : "";
  return `scp ${portFlag}${shellQuote(`${target}:${file}`)} .`;
}

let sid = "";
let count = 1;
let rawArgs = "";
const stdinRead = await attempt(() => readStdinJson());
if (!stdinRead.ok || stdinRead.value === undefined) {
  block("/quote could not read its hook input.");
} else {
  const payload = stdinRead.value;
  sid = strAt(payload, "session_id") ?? sid;
  const args = at(payload, "command_args");
  const argText =
    typeof args === "number" || typeof args === "boolean"
      ? String(args)
      : (str(args) ?? "");
  rawArgs = argText.trim();
}
// No argument -> default to 1, the common case, and not an error. An argument that IS given
// but isn't a clean positive whole number is rejected rather than coerced: a mistyped count
// should say so, not silently copy something the user didn't ask for.
if (rawArgs !== "") {
  if (!/^\d+$/u.test(rawArgs)) {
    block(
      `/quote's argument must be a whole number of turns, or omitted entirely. Got "${rawArgs}". ` +
        `Try "/quote" for the last turn, or "/quote 3" for the last 3.`,
    );
  }
  const n = Math.trunc(Number(rawArgs));
  if (n < 1 || n > MAX_TURNS) {
    block(
      `/quote N must be between 1 and ${MAX_TURNS} — capture-last-response.ts only keeps the ` +
        `last ${MAX_TURNS} turns of history, so anything beyond that could never be honored. ` +
        `Got ${n}. Try "/quote ${MAX_TURNS}" to go back as far as possible.`,
    );
  }
  count = n;
}

// Written every turn by capture-last-response.ts (Stop hook); newest last.
// no history file -> handled as "nothing captured" below
const turnsRead = await attempt(async () => {
  const turns: string[] = [];
  for (const line of (
    await readFile(`${HOME}/.cache/claude/last-response/${sid}.jsonl`, "utf8")
  )
    .split("\n")
    .filter((value) => value.trim() !== "")) {
    const parsed = parseJson(line);
    if (parsed === undefined) return null;
    const text = strAt(parsed, "text");
    if (text !== undefined) turns.push(text);
  }
  return turns;
});
const turns: string[] =
  turnsRead.ok && turnsRead.value !== null ? turnsRead.value : [];

if (turns.length === 0) {
  block(
    "Nothing captured for this session yet — capture-last-response.ts writes it on each Stop, " +
      "so there is nothing to quote until Claude has finished a turn here.",
  );
}

const selected = turns.slice(-count);

// The cross-session addressable name ("example-research-fe"), not the AI-generated title — that
// distinction is the whole point of the from header. Falls back to the raw session id.
let name = sid;
// leave the session id as the name on failure
const resolvedName = await runChild("bun", [`${HOOKS}/resolve-agent-name.ts`], {
  env: { ...process.env, AGENT_NAME_SESSION_ID: sid },
  timeoutMs: 5_000,
});
if (resolvedName.ok && resolvedName.stdout.trim() !== "")
  name = resolvedName.stdout.trim();

// Header carries what the reader needs to place the quote without asking: which session said it;
// when it was quoted (`MM-DD HH:MM`, the prompt's own stamp — one home: prompt-stamp.ts); how many
// turns are included (the count actually captured, not necessarily the count requested — see the
// `short` fallback below); how much text they're about to read; and LAST, which machine it came
// from (user@host, owner 2026-10-06): sessions now run on several boxes (the Mac, R99, a rented GPU
// box, a shared server) and a session name alone no longer says where. Not the cwd — still noise.
const body = selected.join(TURN_SEPARATOR);
const bodyBytes = Buffer.byteLength(body, "utf8");
const where = promptParts(process.cwd());
const header = `from ${name} | ${stampMDHMZ(Temporal.Now.zonedDateTimeISO())} | turns: ${selected.length} | ${bodyBytes}B | ${where.user}@${where.host}`;
const payloadText = `${header}\n${body}`;
let short = "";
if (selected.length < count) {
  const plural = selected.length === 1 ? "" : "s";
  short = ` — only ${selected.length} turn${plural} captured so far`;
}

// A request over 50 turns can be much larger than a useful clipboard payload. Save the
// contents on this host and copy a small scp command through the SAME Herdr/OSC 52 route
// used below. The human runs it on their current local machine, so a stale SSH_CONNECTION
// inherited by a persistent Herdr server cannot cause an unsolicited push to an old client.
if (count > CLIPBOARD_TURN_LIMIT) {
  const saved = await attempt(async () => {
    const exportDir = join(HOME, ".cache", "claude", "quote-exports");
    await mkdir(exportDir, { recursive: true, mode: 0o700 });
    const privateDir = await mkdtemp(join(exportDir, "quote-"));
    const savedFile = join(privateDir, `${basename(privateDir)}.txt`);
    await writeFile(savedFile, payloadText, { mode: 0o600 });
    return savedFile;
  });
  if (!saved.ok) {
    block("Could not save the quote to a text file.");
  }
  const file = saved.value;
  const command = downloadCommand(file);
  if (command === undefined || command === "") {
    block(
      `Quote saved at ${file}${short}. No SSH download target is available. ` +
        "If this is a remote Herdr session, set QUOTE_DOWNLOAD_SSH_TARGET to its SSH host alias and retry.",
    );
  }
  const copied = await copyViaHerdr(command);
  if (copied.ok) {
    block(
      `Download command copied to your local clipboard for ${header}${short}. ` +
        `Run it in a local terminal to save the file in that terminal's current directory:\n${command}\n[${copied.pane}]`,
    );
  } else {
    block(
      `Quote saved on the remote host at ${file}${short}. Copy and run this command in a local terminal to download it:\n${command}`,
    );
  }
}

// The Herdr path needs a live pane with a real pty; see copy-via-herdr-pane.ts. If it is
// unavailable, native pbcopy works on a local macOS host, while a remote SSH session can emit
// OSC 52 to its inherited SSH_TTY device. The payload passed to Herdr travels as a FILE PATH,
// handed over in the child's environment: it is arbitrary assistant prose, and shell-quoting it
// into a command line would be a needless injection surface. The helper takes its input from the
// environment rather than argv — hooks are zero-dep, and BG1 rules out hand-parsing process.argv
// in a file that cannot import Cleye.
const paneCopy = await copyViaHerdr(payloadText);
if (paneCopy.ok) {
  block(
    // The header itself, not a paraphrase of it: what the human sees here is exactly the first line
    // of what they will paste (owner, 2026-10-06).
    `Copied to clipboard — ${header}${short} [${paneCopy.pane}]`,
  );
}

const failures = [`Herdr pane: ${paneCopy.reason}`];
const remote =
  (process.env["SSH_CONNECTION"]?.trim() ?? "") !== "" ||
  (process.env["SSH_TTY"]?.trim() ?? "") !== "";
if (remote) {
  const osc52 = await copyViaSshOsc52(payloadText);
  if (osc52.ok) {
    block(`Copied to clipboard via SSH OSC 52 — ${header}${short}`);
  }
  failures.push(`SSH OSC 52: ${osc52.reason}`);
} else if (process.platform === "darwin") {
  const pbcopy = await copyViaPbcopy(payloadText);
  if (pbcopy.ok) {
    block(`Copied to clipboard via pbcopy — ${header}${short}`);
  } else failures.push(`macOS pbcopy: ${pbcopy.reason}`);
} else {
  failures.push(
    `Direct clipboard fallback: unavailable on ${process.platform} outside SSH`,
  );
}

block(
  `Could not copy this quote. Tried:\n- ${failures.join("\n- ")}\n\nSelect this to copy it by hand:\n\n${payloadText}`,
);
