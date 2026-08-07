// PreToolUse gate (matcher: Bash) — ban work that RUNS AWAY FROM THE HARNESS.
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
// multi-hour job dies with its caller too. Meanwhile the supervised route (Agent/Workflow) is
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
// FAIL CLOSED on hook errors (registered with run.sh --fail-closed).

import { decidePre, readStdinJson } from "./lib.ts";

// Command position: start of line, or after a shell separator / then / do. Keeps the gate off
// mere MENTIONS — `repo-search literal --query 'setsid'` is an argument, not a command.
const POS = String.raw`(^|[|;&(]|&&|\|\||\bthen\b|\bdo\b)\s*`;
const PREFIX = String.raw`(?:(?:sudo|command|time|nice|exec)\s+|(?:\S*\/)?env(?:\s+[A-Za-z_]\w*=\S+)*\s+)*`;
const detacher = (name: string) =>
  new RegExp(`${POS}${PREFIX}(?:\\S*\\/)?${name}\\b`);

// setsid is the one detacher with a supervised form, so it is matched with its tail attached.
const SETSID_CALL = new RegExp(
  `${POS}${PREFIX}(?:\\S*\\/)?setsid\\b([^|;&]*)`,
  "g",
);
const SETSID_WAITS = /^\s+(?:--wait\b|-\w*w)/;

// A detacher hidden inside a nested shell string never reaches a separator, so POS misses it.
const NESTED_SHELL =
  /\b(?:ba|z|da)?sh\s+-c\s+(?:"[^"\n]*\b(?:setsid|nohup|disown)\b|'[^'\n]*\b(?:setsid|nohup|disown)\b)/;

// Detached-launch forms only. Plain tmux/screen usage (attach, list, send-keys, pane work) is
// untouched: the banned act is starting WORK where nothing can observe it.
const MUX_DETACHED =
  /(^|[|;&(]|&&|\|\|)\s*(?:\S*\/)?(?:tmux\s+new(?:-session)?\b[^|;&]*\s-\w*d|screen\b[^|;&]*\s-\w*d\w*m)/;
// Handing work to a scheduler is the same escape with a timer in front of it.
const SCHEDULED =
  /(^|[|;&(]|&&|\|\|)\s*(?:\S*\/)?(?:at|batch)\s+(?:-|now\b|\d|noon\b|midnight\b|teatime\b)|(^|[|;&(]|&&|\|\|)\s*(?:\S*\/)?crontab\s+(?!-l\b|-e\b)/;

type Finding = { what: string; hint: string };

function detachmentIn(command: string): Finding | null {
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

function main(): void {
  const payload = readStdinJson();
  if (payload?.tool_name !== "Bash") return;
  const command = payload?.tool_input?.command;
  if (typeof command !== "string" || command === "") return;

  const found = detachmentIn(command);
  if (!found) return;

  // SINGLE-AXIS: detachmentIn() classifies one command into one detachment form; the forms are
  // alternatives, not independent axes, and every one of them gets the same three-route remedy.
  decidePre(
    "deny",
    `supervised-execution: this command detaches work from the harness via ${found.what} ` +
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
      `is the failure mode being prevented, not an implementation detail.`,
  );
}

try {
  main();
  process.exit(0);
} catch (error) {
  decidePre(
    "deny",
    `supervised-execution: hook error while classifying the command ` +
      `(${error instanceof Error ? error.message : String(error)}) — failing closed. ` +
      `Fix ~/.claude/hooks/enforce-supervised-execution.ts before retrying.`,
  );
}
