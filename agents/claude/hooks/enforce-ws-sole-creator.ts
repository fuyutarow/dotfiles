// PreToolUse Bash|Write|Edit|MultiEdit, shared by Claude and Codex.
// Fail closed on unreadable edits or unsupported shell syntax; ws child processes
// do not emit tool events. Only the canonical tools/jj-ws implementation may
// contain workspace creation in script writes. No exemption for direct Bash calls.
import { realpath } from "node:fs/promises";
import { resolve, relative, extname, basename } from "node:path";
import {
  effective,
  parseShell,
} from "../../../tools/shared/src/shell-syntax.ts";
import { arr, at, parseJson, strAt } from "../../hooks/narrow.ts";
import { decidePre } from "./lib.ts";

const REMEDY =
  "use: ws add <slug> --repo <repo>  (creates <repo>.ws/ws_<slug>; tools/spec/jj-ws.md); run ws in the dispatcher's foreground, outside worker units and deadline wrappers";
const IMPLEMENTATION = resolve(import.meta.dir, "../../../tools/jj-ws");
const VALUE_FLAGS = new Set([
  "-R",
  "--repository",
  "--config",
  "--config-file",
  "--color",
  "--template",
  "-T",
  "--at-operation",
  "--at-op",
  "--debug-output",
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
]);

function positionals(args: string[]): string[] {
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const word = args[i];
    if (word === undefined) continue;
    if (VALUE_FLAGS.has(word)) {
      i++;
      continue;
    }
    if (word.startsWith("-")) continue;
    positional.push(word);
  }
  return positional;
}

function createsWorkspace(source: string, cwd: string): boolean | undefined {
  const parsed = parseShell(source, cwd);
  if (parsed === undefined) return undefined;
  return parsed.commands.some((command) => {
    const exe = effective(command);
    if (exe === undefined || (exe.name !== "jj" && exe.name !== "git"))
      return false;
    // Preserve the former raw-command guard even when extra positionals precede workspace.
    const workspace = exe.args.indexOf("workspace");
    if (
      exe.name === "jj" &&
      workspace >= 0 &&
      exe.args[workspace + 1] === "add"
    )
      return true;
    const positional = positionals(exe.args);
    return (
      positional[0] === (exe.name === "jj" ? "workspace" : "worktree") &&
      positional[1] === "add"
    );
  });
}

async function implementationPath(path: string): Promise<boolean> {
  // Resolve the parent of a new file too, so a symlink cannot forge the exemption.
  const canonical = await realpath(path).catch(async () =>
    resolve(
      await realpath(resolve(path, "..")).catch(() => resolve(path, "..")),
      basename(path),
    ),
  );
  const rel = relative(IMPLEMENTATION, canonical);
  return rel !== ".." && !rel.startsWith("../") && !rel.startsWith("/");
}

function shellScript(path: string, content: string): boolean {
  if ([".sh", ".bash", ".zsh", ".ksh"].includes(extname(path))) return true;
  const first = content.split("\n", 1)[0] ?? "";
  if (!first.startsWith("#!")) return false;
  const words = first.slice(2).trim().split(/\s+/u);
  return words.some((word) =>
    ["sh", "bash", "dash", "zsh", "ksh"].includes(basename(word)),
  );
}

function replay(
  content: string,
  edits: readonly unknown[],
): string | undefined {
  for (const edit of edits) {
    const before = strAt(edit, "old_string");
    const after = strAt(edit, "new_string");
    if (
      before === undefined ||
      after === undefined ||
      before === "" ||
      !content.includes(before)
    )
      return undefined;
    content =
      at(edit, "replace_all") === true
        ? content.split(before).join(after)
        : content.replace(before, () => after);
  }
  return content;
}

async function main(): Promise<void> {
  const payload = parseJson(await Bun.stdin.text());
  const tool = strAt(payload, "tool_name");
  const input = at(payload, "tool_input");
  const cwd = strAt(payload, "cwd") ?? process.cwd();
  if (tool === "Bash") {
    const command = strAt(input, "command");
    if (command === undefined) return;
    // SINGLE-AXIS: direct workspace creation must go through ws; unknown syntax cannot establish that.
    if (createsWorkspace(command, cwd) !== false) decidePre("deny", REMEDY);
    return;
  }
  if (!["Write", "Edit", "MultiEdit"].includes(tool ?? "")) return;
  const filePath = strAt(input, "file_path");
  if (filePath === undefined) return;
  const path = resolve(cwd, filePath);
  if (await implementationPath(path)) return;
  let content = strAt(input, "content");
  if (tool !== "Write") {
    content = await Bun.file(path).text();
    const edits =
      tool === "MultiEdit" ? (arr(at(input, "edits")) ?? []) : [input];
    content = replay(content, edits);
  }
  if (content === undefined || !shellScript(path, content)) return;
  // SINGLE-AXIS: script creation cannot bypass the workspace owner.
  if (createsWorkspace(content, cwd) !== false) decidePre("deny", REMEDY);
}

await main().catch(() => {
  // FATAL: inspection failed; never silently authorize a workspace bypass.
  decidePre("deny", `cannot inspect workspace creation; ${REMEDY}`);
});
