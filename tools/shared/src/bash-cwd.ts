import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { strAt } from "./shape.ts";
import { parseShell } from "./shell-syntax.ts";

// The directory a Bash command ends up in: the payload cwd, then each plain `cd <dir>` the
// command itself runs (quoted or bare, after start / && / ;). Not a shell: `cd "$X"` and
// `pushd` are not followed. Shared by the gates that judge a command by where it runs.
const SIMPLE_CD = /(?:^|&&|;)\s*cd\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/gu;

function expandHome(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/")) return join(homedir(), path.slice(2));
  return path;
}

export function bashCwd(payload: unknown): string {
  const cwd = strAt(payload, "cwd");
  const initial = cwd !== undefined && cwd !== "" ? cwd : process.cwd();
  const command = strAt(payload, "tool_input", "command") ?? "";

  // Read as syntax: a `cd` in a heredoc body or a quoted word moves nothing (shell-syntax.ts).
  const parsed = parseShell(command, initial);
  if (parsed !== undefined) return parsed.endCwd;

  let current = resolve(initial);
  for (const match of command.matchAll(SIMPLE_CD)) {
    const raw = expandHome(match[1] ?? match[2] ?? match[3] ?? "");
    if (raw === "") continue;
    current = isAbsolute(raw) ? resolve(raw) : resolve(current, raw);
  }
  return current;
}
