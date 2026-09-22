// PreToolUse gate (matcher: Write|Edit|MultiEdit) — NO-NEW-BASH, made deterministic.
//
// The rule lives in writing-bun-scripts (THE LAW, gate BG0): local automation is Bun
// TypeScript; bash survives only as a declared thin shim. Prose alone did not hold it, so:
//
//   1. Any Write/Edit that leaves a shell script behind gets a NUDGE — exit 0 + JSON
//      `additionalContext` recommending a `.ts` run by bun. That is the only channel that
//      reaches the model on PreToolUse without blocking: raw stdout goes to the debug log and
//      stderr on exit 0 is not fed back (operating-the-harness references/hooks.md). No
//      permissionDecision is set, so the normal permission flow still applies.
//   2. If the result would exceed MAX_LINES physical lines, the Write/Edit is DENIED —
//      but only when it creates the file or grows it. A legacy script already over the limit
//      may still be fixed in place without growing (a ratchet: it can shrink, never grow).
//
// "Shell script" = a `.sh`/`.bash` path, or content whose shebang names sh/bash/dash/ksh/zsh.
// zsh config (zshrc, *.zsh without a shebang) is shell CONFIG, not a script — untouched.
//
// Exempt, silently:
//   - vendored shell that an external tool overwrites — detected from its own header
//     (`installed by herdr` / `managed by herdr`), never from a marker the overwrite would erase;
//   - bootstrap shims (`# shim: bootstrap`, e.g. scripts/link-dots.sh) — they run before bun
//     exists and must stay POSIX. The marker is honoured only when the file ON DISK already
//     carries it, so a new file cannot exempt itself by declaring it.
//
// Not covered: shell written through Bash (`cat > x.sh <<EOF`, `tee`) — the command text
// does not reliably yield the final file. Edit/Write are the channel this gate owns.
//
// Fail direction: registered with run.sh --fail-closed (no bun → deny). An internal error
// exits non-zero, which Claude Code treats as a non-blocking error — the edit proceeds.

import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { decidePre, readStdinJson } from "./lib.ts";

// Overridable for the test suite only; a malformed value falls back rather than disarming.
const envMax = Number(process.env.NO_NEW_BASH_MAX_LINES);
const MAX_LINES = Number.isInteger(envMax) && envMax > 0 ? envMax : 12;
const SHELLS = new Set(["sh", "bash", "dash", "ksh", "zsh"]);
const VENDORED = /^#\s*(?:installed|managed) by herdr\b/m;
const BOOTSTRAP = /^#\s*shim:\s*bootstrap\b/m;

function shebangShell(content: string): boolean {
  const first = content.split("\n", 1)[0] ?? "";
  if (!first.startsWith("#!")) return false;
  const tokens = first.slice(2).trim().split(/\s+/);
  let interp = basename(tokens[0] ?? "");
  if (interp === "env") {
    interp = basename(tokens.slice(1).find((t) => !t.startsWith("-")) ?? "");
  }
  return SHELLS.has(interp);
}

function isShell(path: string, content: string): boolean {
  const ext = extname(path);
  return ext === ".sh" || ext === ".bash" || shebangShell(content);
}

// Physical lines; a terminating newline does not open another line.
function lineCount(content: string): number {
  if (content === "") return 0;
  const n = content.split("\n").length;
  return content.endsWith("\n") ? n - 1 : n;
}

type Edit = {
  old_string?: unknown;
  new_string?: unknown;
  replace_all?: unknown;
};

// Replays Edit/MultiEdit on the current text. null = an edit would not apply, so the tool
// itself fails and there is nothing to judge.
function applyEdits(text: string, edits: Edit[]): string | null {
  let out = text;
  for (const e of edits) {
    if (typeof e.old_string !== "string" || typeof e.new_string !== "string")
      return null;
    if (e.old_string === "" || !out.includes(e.old_string)) return null;
    out =
      e.replace_all === true
        ? out.split(e.old_string).join(e.new_string)
        : out.replace(e.old_string, () => e.new_string as string);
  }
  return out;
}

function main(): void {
  const payload = readStdinJson();
  const tool = payload?.tool_name;
  const input = payload?.tool_input ?? {};
  const path = input.file_path;
  if (typeof path !== "string" || path === "") return;

  const onDisk = existsSync(path);
  const before = onDisk ? readFileSync(path, "utf8") : null;

  let after: string | null;
  if (tool === "Write") {
    after = typeof input.content === "string" ? input.content : null;
  } else if (tool === "Edit") {
    after = before === null ? null : applyEdits(before, [input]);
  } else if (tool === "MultiEdit") {
    after =
      before === null || !Array.isArray(input.edits)
        ? null
        : applyEdits(before, input.edits);
  } else {
    return;
  }
  if (after === null) return;

  if (!isShell(path, after) && !(before !== null && isShell(path, before)))
    return;
  if (VENDORED.test(after) || (before !== null && VENDORED.test(before)))
    return;
  if (before !== null && BOOTSTRAP.test(before)) return;

  const lines = lineCount(after);
  const prev = before === null ? null : lineCount(before);
  const grows = prev === null || lines > prev;

  if (lines > MAX_LINES && grows) {
    // SINGLE-AXIS: the only denial axis is the post-edit line count; the nudge never denies.
    decidePre(
      "deny",
      `no-new-bash: refusing this ${tool} — ${path} would be ${lines} lines ` +
        `(${prev === null ? "new file" : `was ${prev}`}; limit ${MAX_LINES}). NO-NEW-BASH ` +
        `(writing-bun-scripts BG0): local automation is a Bun TypeScript file run as ` +
        `\`bun <path>.ts\`; bash survives only as a thin shim marked \`# shim: <bootstrap|` +
        `hook-entry|exec-wrapper|vendored>\`. Write the logic as .ts (Bun.$ for shell-outs, ` +
        `Bun.spawn with a native timeout for anything that can hang) and keep at most a ` +
        `${MAX_LINES}-line shim. A legacy script over the limit may be edited only without growing.`,
    );
  }

  const marker = /^#\s*shim:\s*\S+/m.test(after)
    ? ""
    : " It also carries no `# shim: <bootstrap|hook-entry|exec-wrapper|vendored>` line.";
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext:
          `no-new-bash: ${path} is a shell script (${lines} lines after this ${tool}; ` +
          `hard stop above ${MAX_LINES} when a file is created or grows). NO-NEW-BASH ` +
          `(writing-bun-scripts): prefer a .ts run by bun — the first conditional, loop, or ` +
          `JSON access in a .sh is the signal it should have been .ts.${marker}`,
      },
    }) + "\n",
  );
}

main();
