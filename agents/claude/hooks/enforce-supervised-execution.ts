// PreToolUse gate (matcher: Bash) — ban work that RUNS AWAY FROM THE HARNESS, and polling that
// can never see the work it waits on.
//
// Claude Code gates tool CALLS, not the processes they spawn. A child started under
// setsid/nohup/disown is reparented to PID 1, which buys exactly one thing (surviving the
// session) and pays for it with everything else: no TUI row, no TaskOutput, no TaskStop, no
// exit notification, no exit STATUS — the only channel left is a log file the model reads and
// paraphrases. Observed 2026-08-06: two detached queue drivers still running under init from a
// closed session of another project, a 63h-old orphaned `tail -F`, and a job that BREACHed on
// interrupt while its driver printed `done` over it. None of it was visible anywhere.
//
// THE GRADIENT THIS UNDOES. Detaching is not mischief; it is the cheapest legal move:
// foreground Bash caps at ~10 min, `run_in_background` dies with the session, and
// agent-resource-run admits through `systemd-run --scope` (caller-owned), so an admitted
// multi-hour job dies with its caller too. Meanwhile the supervised route (the Agent tool) is
// the one carrying fail-closed declaration gates. Cheaper AND unsupervised is a gradient, and
// gradients get descended. So this hook does NOT ban durability — it bans UNOBSERVABLE
// durability, and leaves the observable kind (a NAMED transient systemd user unit) wide open.
// Ban the escape without leaving an exit and the next attempt is `at`, cron, or a hand-rolled
// daemon; those are named here for that reason.
//
// EXPLICITLY ALLOWED, and why:
//   setsid --wait / -w      the parent still waits — no detachment. agent-resource-run.ts
//                           itself runs `setsid --wait systemd-run …`; denying it would break
//                           the very runner this policy wants everything to go through.
//   systemd-run --user …    manager-owned, so it survives the session BY DESIGN while staying
//                           stoppable (`systemctl --user stop`), streamed (`journalctl -u`),
//                           and exit-status-recorded (`Result=`) — a BREACH cannot be reported
//                           as `done`. This is the sanctioned durable path; keep it open.
//
// SECOND AXIS — SELF-MATCHING POLLS. `pgrep -f` matches whole command lines, and the Bash tool
// runs every command as `<shell> -c '<the whole command>'`, so a `pgrep -f <pattern>` issued from
// that command always finds the very shell carrying the pattern in its own argv: `while pgrep -f
// X` never ends, and `while ! pgrep -f X` ends at once. Observed 2026-09-26 in one fleet: six such
// shells killed by hand, aged 3 min to 12.7 h, written by subagents despite a memory rule against
// it — advisory text never reaches a subagent's tool call; a PreToolUse hook does. It lives in this
// file, not its own, because it shares remedy route (1) below and costs no extra process per Bash
// call. Deliberately narrow: a while/until at command position plus a `pgrep` carrying -f/--full.
// The gate cannot tell whether that pgrep sits inside the loop or just before it, and does not
// need to — resolving the PID with a self-matching pgrep can pick the shell's own PID, and then
// `kill -0` on it never fails either. A bracketed pattern (`pgrep -f '[j]ob.jl'`) is the standard
// self-exclusion idiom — the regex no longer matches its own text — so it passes. A command with
// no while/until loop is NOT denied: a one-shot pgrep -f returns an extra PID, it does not hang.
//
// FAIL CLOSED on hook errors (registered with run.sh --fail-closed).

import { attempt, errorMessage } from "../../hooks/attempt.ts";
import { strAt } from "../../hooks/narrow.ts";
import { effective, parseShell } from "../../hooks/shell-syntax.ts";
import { decidePre, readStdinJson } from "./lib.ts";

// Command position: start of line, or after a shell separator / then / do. Keeps the gate off
// mere MENTIONS — `repo-retrieve literal --query 'setsid'` is an argument, not a command.
const POS = String.raw`(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*`;
const PREFIX = String.raw`(?:(?:sudo|command|time|nice|exec)\s+|(?:\S*\/)?env(?:\s+[A-Za-z_]\w*=\S+)*\s+)*`;
const detacher = (name: string) =>
  new RegExp(`${POS}${PREFIX}(?:\\S*\\/)?${name}\\b`, "u");

// setsid is the one detacher with a supervised form, so it is matched with its tail attached.
const SETSID_CALL = new RegExp(
  `${POS}${PREFIX}(?:\\S*\\/)?setsid\\b([^|;&]*)`,
  "gu",
);
const SETSID_WAITS = /^\s+(?:--wait\b|-\w*w)/u;

// A detacher hidden inside a nested shell string never reaches a separator, so POS misses it.
const NESTED_SHELL =
  /\b(?:ba|z|da)?sh\s+-c\s+(?:"[^"\n]*\b(?:setsid|nohup|disown)\b|'[^'\n]*\b(?:setsid|nohup|disown)\b)/u;

// Detached-launch forms only. Plain tmux/screen usage (attach, list, send-keys, pane work) is
// untouched: the banned act is starting WORK where nothing can observe it.
const MUX_DETACHED =
  /(^|[|;&(]|&&|\|\|)\s*(?:\S*\/)?(?:tmux\s+new(?:-session)?\b[^|;&]*\s-\w*d|screen\b[^|;&]*\s-\w*d\w*m)/u;
// Handing work to a scheduler is the same escape with a timer in front of it.
const SCHEDULED =
  /(^|[|;&(]|&&|\|\|)\s*(?:\S*\/)?(?:at|batch)\s+(?:-|now\b|\d|noon\b|midnight\b|teatime\b)|(^|[|;&(]|&&|\|\|)\s*(?:\S*\/)?crontab\s+(?!-l\b|-e\b)/u;

// Multiline: an agent-written loop usually starts on its own line after a `cd` or an assignment.
const POLL_LOOP = new RegExp(`${POS}(?:while|until)\\b`, "mu");
// One pgrep invocation and its arguments, up to the next separator, `)`, backtick, or newline.
const PGREP_CALL = /(?:^|[\s(`!])(?:\S*\/)?pgrep\b([^|;&)`\n]*)/gu;
const FULL_CMDLINE_FLAG = /\s(?:-[A-Za-z]*f[A-Za-z]*|--full)(?=\s|$)/u;

type Finding = { what: string; hint: string };

// Syntax route: a command is judged by the commands it EXECUTES (shell-syntax.ts), so a word or a
// heredoc body that merely spells `at` / `nohup` is not one. undefined = the parser is not sure.
function detachmentBySyntax(command: string): Finding | null | undefined {
  const parsed = parseShell(command);
  if (parsed === undefined) return undefined;
  for (const c of parsed.commands) {
    const eff = effective(c);
    if (eff === undefined) continue;
    const { name, args } = eff;
    const found = (what: string, hint: string): Finding => ({
      what: c.nested ? "a detacher inside a nested shell string" : what,
      hint: c.nested ? "quoting it does not change what it does" : hint,
    });
    if (name === "setsid" && !SETSID_WAITS.test(` ${args[0] ?? ""}`))
      return found(
        "setsid",
        "setsid --wait keeps the parent waiting and is allowed; bare setsid is the detach",
      );
    if (name === "nohup")
      return found("nohup", "nohup exists only to outlive the caller's hangup");
    if (name === "disown")
      return found(
        "disown",
        "disown drops the job from the shell that could report it",
      );
    if (
      (name === "tmux" &&
        (args[0] === "new" || args[0] === "new-session") &&
        args.slice(1).some((a) => /^-\w*d/u.test(a))) ||
      (name === "screen" && args.some((a) => /^-\w*d\w*m/u.test(a)))
    )
      return found(
        "a detached tmux/screen session",
        "a human viewport is not supervision — the harness still sees nothing",
      );
    const first = args[0] ?? "";
    if (
      ((name === "at" || name === "batch") &&
        /^(?:-|now\b|\d|noon\b|midnight\b|teatime\b)/u.test(first)) ||
      (name === "crontab" && first !== "" && !/^(?:-l|-e)\b/u.test(first))
    )
      return found(
        "at/batch/crontab scheduling",
        "deferred execution detaches the same way, just later",
      );
  }
  return null;
}

function detachmentIn(command: string): Finding | null {
  const bySyntax = detachmentBySyntax(command);
  if (bySyntax !== undefined) return bySyntax;
  return detachmentByText(command);
}

function detachmentByText(command: string): Finding | null {
  for (const m of command.matchAll(SETSID_CALL)) {
    if (!SETSID_WAITS.test(m[2] ?? "")) {
      return {
        what: "setsid",
        hint: "setsid --wait keeps the parent waiting and is allowed; bare setsid is the detach",
      };
    }
  }
  if (detacher("nohup").test(command))
    return {
      what: "nohup",
      hint: "nohup exists only to outlive the caller's hangup",
    };
  if (detacher("disown").test(command))
    return {
      what: "disown",
      hint: "disown drops the job from the shell that could report it",
    };
  if (NESTED_SHELL.test(command))
    return {
      what: "a detacher inside a nested shell string",
      hint: "quoting it does not change what it does",
    };
  if (MUX_DETACHED.test(command))
    return {
      what: "a detached tmux/screen session",
      hint: "a human viewport is not supervision — the harness still sees nothing",
    };
  if (SCHEDULED.test(command))
    return {
      what: "at/batch/crontab scheduling",
      hint: "deferred execution detaches the same way, just later",
    };
  return null;
}

function selfMatchingPollIn(command: string): boolean {
  const parsed = parseShell(command);
  if (parsed !== undefined) {
    const polls = parsed.commands.some(
      (c) => c.leading.includes("while") || c.leading.includes("until"),
    );
    return (
      polls &&
      parsed.commands.some((c) => {
        const eff = effective(c);
        return (
          eff?.name === "pgrep" &&
          eff.args.some((a) => /^(?:-[A-Za-z]*f[A-Za-z]*|--full)$/u.test(a)) &&
          !eff.args.some((a) => a.includes("["))
        );
      })
    );
  }
  if (!POLL_LOOP.test(command)) return false;
  for (const m of command.matchAll(PGREP_CALL)) {
    const args = m[1] ?? "";
    if (FULL_CMDLINE_FLAG.test(args) && !args.includes("[")) return true;
  }
  return false;
}

function detachmentReason(found: Finding): string {
  return (
    `this command detaches work from the harness via ${found.what} ` +
    `(${found.hint}). A process reparented to init has no TUI row, no TaskOutput, no ` +
    `TaskStop, no exit notification and no recorded exit status — its only channel is a log ` +
    `file you would then paraphrase, which is not evidence. Use instead, in order: ` +
    `(1) Bash with run_in_background:true — for anything that must be WATCHED this session; ` +
    `(2) compute/GPU work — agent-resource-run --manifest <abs>.resource.json, which admits ` +
    `resources and registers a systemd unit the statusline can see; ` +
    `(3) work that must OUTLIVE this session — a NAMED transient user unit ` +
    `(systemd-run --user --unit=<name> …), which is manager-owned: stoppable via ` +
    `systemctl --user stop, streamed via journalctl --user -u <name> -f, and exit-status ` +
    `recorded, so a failure cannot be reported as success. ` +
    `If none of those fit, STOP and say so in plain words — do not reach for at(1), cron, ` +
    `a hand-rolled daemon, or another way around this gate. Running where nobody can look ` +
    `is the failure mode being prevented, not an implementation detail.`
  );
}

const SELF_MATCHING_POLL_REASON =
  "this command polls with `pgrep -f` inside a while/until loop. `pgrep -f` matches whole " +
  "command lines, and the Bash tool runs your command as `<shell> -c '<this whole command>'`, " +
  "so the pattern always matches that shell's own argv: `while pgrep -f X` never ends, and " +
  "`while ! pgrep -f X` ends at once. Launch the job with run_in_background:true and wait for " +
  "its completion notification instead. For a process you did not launch, get its numeric PID " +
  "once — from its launcher's output, or `pgrep -f '[j]ob.jl'` (the bracket stops the regex " +
  "from matching its own text) — and poll `kill -0 <PID>`.";

function main(): void {
  const payload = readStdinJson();
  if (payload === undefined) {
    // FATAL: the payload is not JSON, so no axis could be evaluated; fail closed with the one fix
    decidePre(
      "deny",
      "supervised-execution: hook error while classifying the command " +
        "(invalid JSON payload) — failing closed. " +
        "Fix ~/.claude/hooks/enforce-supervised-execution.ts before retrying.",
    );
  }
  if (strAt(payload, "tool_name") !== "Bash") return;
  const command = strAt(payload, "tool_input", "command");
  if (command === undefined || command === "") return;

  const reasons: string[] = [];
  const detached = detachmentIn(command);
  if (detached !== null) reasons.push(detachmentReason(detached));
  if (selfMatchingPollIn(command)) reasons.push(SELF_MATCHING_POLL_REASON);
  if (reasons.length === 0) return;

  // BATCHED(detachment, self-matching-poll): neither check consumes the other's result, so a
  // command failing both hears about both in one decision. Within the detachment axis,
  // detachmentIn() still returns a single form — those forms are alternatives sharing one remedy.
  decidePre(
    "deny",
    reasons.length === 1
      ? `supervised-execution: ${reasons[0]}`
      : `supervised-execution: ${reasons.length} independent problems — fix all of them ` +
          `before retrying. ` +
          reasons.map((reason, i) => `(${i + 1}) ${reason}`).join(" "),
  );
}

const r = await attempt(main);
if (!r.ok) {
  // FATAL: the hook itself failed, so no axis could be evaluated; fail closed with the one fix
  // (report the error) rather than guessing which checks would have fired.
  decidePre(
    "deny",
    `supervised-execution: hook error while classifying the command ` +
      `(${errorMessage(r.error)}) — failing closed. ` +
      `Fix ~/.claude/hooks/enforce-supervised-execution.ts before retrying.`,
  );
}
process.exit(0);
