import { lstat, readlink } from "node:fs/promises";
// Commit-gate backstop: compare tracked shell content with the parent, never a mutable baseline.
import { join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import {
  selected,
  validPath,
} from "../agents/skills/wiring-mise-tasks/scripts/jj-precommit.ts";
import {
  physicalLines,
  shellExempt,
  shellFile,
  shellGrowth,
  shellRemedy,
} from "../tools/shared/src/no-new-bash.ts";

async function command(
  args: string[],
  cwd: string,
  optional = false,
): Promise<string | null> {
  const proc = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    proc.stdout.text(),
    proc.stderr.text(),
    proc.exited,
  ]);
  if (code === 0) return stdout;
  if (optional) return null;
  process.stderr.write(
    `lint:no-new-bash: ${args[0]} failed: ${stderr.trim()}\n`,
  );
  return process.exit(2);
}

export async function lintShell(root = process.cwd()): Promise<number> {
  const vcs = process.env.PRECOMMIT_VCS;
  let files: string[];
  let before: (path: string) => Promise<string | null>;
  let after: (path: string) => Promise<string | null>;
  if (vcs !== undefined) {
    const {
      PRECOMMIT_BASE: base,
      PRECOMMIT_REV: rev,
      PRECOMMIT_PATHS_FILE: pathsFile,
    } = process.env;
    if (
      vcs !== "jj" ||
      base === undefined ||
      rev === undefined ||
      pathsFile === undefined ||
      ![base, rev].every((id) => /^[0-9a-f]{40,64}$/u.test(id))
    ) {
      process.stderr.write("lint:no-new-bash: invalid jj precommit context\n");
      return 2;
    }
    const selection = await Bun.file(pathsFile).text();
    const paths = selection.slice(0, -1).split("\0");
    if (!selection.endsWith("\0") || !paths.every((path) => validPath(path)))
      return 2;
    const jj = (args: string[], optional = false) =>
      command(["jj", "--ignore-working-copy", ...args], root, optional);
    files = (
      (await jj(["file", "list", "-r", rev, "-T", 'path ++ "\\0"'])) ?? ""
    )
      .split("\0")
      .filter((p) => p !== "" && selected(paths, p));
    const baseFiles = new Set(
      (
        (await jj(["file", "list", "-r", base, "-T", 'path ++ "\\0"'])) ?? ""
      ).split("\0"),
    );
    const show = (version: string, path: string) =>
      jj([
        "file",
        "show",
        "-r",
        version,
        "--",
        `root-file:${JSON.stringify(path)}`,
      ]);
    before = (path) =>
      baseFiles.has(path) ? show(base, path) : Promise.resolve(null);
    after = (path) => show(rev, path);
  } else {
    // Git-index fallback for J1 migration: fallback also checks unstaged growth in tracked files.
    files = ((await command(["git", "ls-files", "-z", "--cached"], root)) ?? "")
      .split("\0")
      .filter(Boolean);
    const head = await command(
      ["git", "rev-parse", "--verify", "HEAD"],
      root,
      true,
    );
    const baseFiles =
      head === null
        ? new Set<string>()
        : new Set(
            (
              (await command(
                ["git", "ls-tree", "-r", "--name-only", "-z", "HEAD"],
                root,
              )) ?? ""
            ).split("\0"),
          );
    before = (path) =>
      baseFiles.has(path)
        ? command(["git", "show", `HEAD:${path}`], root)
        : Promise.resolve(null);
    after = async (path) => {
      const file = Bun.file(join(root, path));
      if (!(await file.exists())) return null;
      // Compare symlink declaration bytes with Git, rather than dereferencing a legacy target.
      if ((await lstat(join(root, path))).isSymbolicLink())
        return readlink(join(root, path));
      return file.text();
    };
  }
  let findings = 0;
  const newShellFiles: Array<{ path: string; lines: number }> = [];
  for (const path of files) {
    const content = await after(path);
    if (content === null) continue;
    const previous = await before(path);
    if (
      previous === null &&
      shellFile(path, content) &&
      !shellExempt(previous, content)
    ) {
      newShellFiles.push({ path, lines: physicalLines(content) });
    }
    if (physicalLines(content) > 12 && shellGrowth(path, previous, content)) {
      process.stdout.write(
        `${path}: shell script exceeds 12 lines and was added or grew. ${shellRemedy()}\n`,
      );
      findings++;
    }
  }
  const splitLines = newShellFiles.reduce(
    (total, file) => total + file.lines,
    0,
  );
  if (newShellFiles.length >= 2 && splitLines > 12) {
    process.stdout.write(
      `new shell files add ${splitLines} lines across ${newShellFiles.length} files. ${shellRemedy()}\n`,
    );
    findings++;
  }
  process.stdout.write(`lint:no-new-bash: ${findings} finding(s)\n`);
  return findings === 0 ? 0 : 1;
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") process.exit(2);
}

if (import.meta.main) {
  const argv = cli({
    name: "lint-no-new-bash",
    strictFlags: true,
    parameters: [],
    ignoreArgv: rejectPrototypeFlag,
  });
  if (argv._.length > 0) process.exit(2);
  const result = await attempt(() => lintShell());
  if (result.ok) process.exitCode = result.value;
  else {
    process.stderr.write(`FATAL: ${errorMessage(result.error)}\n`);
    process.exitCode = 2;
  }
}
