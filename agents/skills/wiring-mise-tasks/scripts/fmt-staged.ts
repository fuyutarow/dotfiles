// fmt-staged.ts — the body of the `fmt:staged` verb: format the STAGED files in place, then re-stage
// exactly those files. It never reads, formats, or stages anything else, so another session's
// unstaged or untracked work in a shared checkout can neither block this commit nor be swept into it.
//
//   bun ~/.claude/skills/wiring-mise-tasks/scripts/fmt-staged.ts \
//     --tool 'jl=julia --project=. -m Runic --inplace' --tool 'md=rumdl fmt' [--exclude 'archives/**']
//
// --tool '<ext>[,<ext>…]=<command>'  the command receives the matching staged files as trailing
//                                    arguments, run by `sh -c` from the repository root.
// --exclude '<glob>'                 staged paths matching it are left alone (repeatable).
//
// Contract, each clause the fix for a measured failure (wiring-mise-tasks recipes §8):
// - A staged file that ALSO has unstaged changes is REFUSED, untouched. Formatting it and re-adding
//   the whole file would commit the unstaged hunks too — the defect that retired in-place
//   formatting on 2026-09-22 (wiring-repositories ledger §9).
// - Only the staged set is formatted and re-added. The whole-tree `fmt:check` it replaces at commit
//   time refused every session's commit on any session's WIP: firedancer, 2026-09-25, four
//   blocks across ~20 sessions, 10–20 min each.
// - A formatter that changes anything OUTSIDE the staged set (rustfmt following `mod` children, a
//   tool ignoring its file list) is reported and fails the gate; nothing outside is re-added.
// - It re-stages through `git add`, so a commit's temporary index (`git commit -- <paths>` sets
//   GIT_INDEX_FILE for the hook) is the index that gets updated.
//
// Output: FORMATTED / REFUSE / FAIL / RESULT lines. Exit: 0 formatted or nothing to do · 1 refused
// or a formatter failed or strayed · 2 usage or environment error.

import { cli } from "cleye";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  jjCandidate,
  jjChanged,
  jjContent,
  jjContext,
  jjExport,
  jjRead,
  type JjPrecommit,
} from "./jj-precommit.ts";

type Tool = { exts: string[]; command: string; files: string[] };

type ParseTool = { ok: true; value: Tool } | { ok: false; error: string };

function parseTool(spec: string): ParseTool {
  const cut = spec.indexOf("=");
  const exts = spec
    .slice(0, Math.max(cut, 0))
    .split(",")
    .map((e) => e.trim().replace(/^\./u, "").toLowerCase())
    .filter((e) => e !== "");
  const command = cut < 0 ? "" : spec.slice(cut + 1).trim();
  if (exts.length === 0 || command === "") {
    return {
      ok: false,
      error: `--tool expects '<ext>[,<ext>…]=<command>', got '${spec}'`,
    };
  }
  return { ok: true, value: { exts, command, files: [] } };
}

async function git(
  root: string,
  args: string[],
): Promise<{ code: number; out: string; err: string }> {
  const child = Bun.spawn(["git", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: process.env, // keeps GIT_INDEX_FILE: a commit may be using a temporary index
    timeout: 120_000,
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out, err };
}

const nul = (s: string) => s.split("\0").filter((p) => p !== "");

// Every path whose worktree differs from the index, plus untracked files: the set a formatter must
// not grow. Compared before and after to catch a tool that strays outside its file list.
async function dirtyOutside(root: string): Promise<Set<string>> {
  const r = await git(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  const dirty = new Set<string>();
  const entries = nul(r.out);
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] ?? "";
    const [x, y] = [entry[0], entry[1]];
    if (y !== " " || x === "?") dirty.add(entry.slice(3));
    if (x === "R" || x === "C") i++; // the next NUL field is the rename source
  }
  return dirty;
}

async function hashes(root: string, files: string[]): Promise<string[]> {
  if (files.length === 0) return [];
  const r = await git(root, ["hash-object", "--", ...files]);
  return r.out.trim().split("\n");
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

async function checkSnapshot(
  context: JjPrecommit,
  tools: Tool[],
  excludes: Bun.Glob[],
): Promise<number> {
  const candidate = jjCandidate(context);
  const changed = jjChanged(context);
  for (const path of changed) {
    if (!candidate.has(path) || excludes.some((glob) => glob.match(path)))
      continue;
    const kind = jjRead(
      [
        "file",
        "list",
        "-r",
        context.rev,
        "-T",
        "file_type",
        "--",
        `root-file:${JSON.stringify(path)}`,
      ],
      context.root,
    ).toString();
    if (kind !== "file") continue;
    const ext = path.split(".").at(-1)?.toLowerCase() ?? "";
    tools.find((tool) => tool.exts.includes(ext))?.files.push(path);
  }
  const targets = tools.flatMap((tool) => tool.files);
  if (targets.length === 0) {
    process.stdout.write(
      "RESULT: fmt:staged — no selected snapshot file matches a --tool extension\n",
    );
    return 0;
  }
  const tmp = mkdtempSync(join(tmpdir(), "fmt-jj-"));
  return Promise.try(async () => {
    // Format a complete candidate copy, so formatters following module children are confined
    // to the temporary tree. The checked revision and the user's working copy stay immutable.
    jjExport(context, tmp, candidate);
    if (existsSync(join(context.root, "node_modules")))
      symlinkSync(
        join(context.root, "node_modules"),
        join(tmp, "node_modules"),
      );
    let failed = false;
    for (const tool of tools) {
      if (tool.files.length === 0) continue;
      // bounded: the formatter has a 300s process timeout below the temporary trust environment.
      const child = Bun.spawn(
        ["sh", "-c", `${tool.command} "$@"`, "fmt-staged", ...tool.files],
        {
          cwd: tmp,
          // The candidate copy comes from this already-trusted repository. Trust only this
          // disposable path in the child; never persist a mise trust entry or change HOME.
          env: {
            ...process.env,
            MISE_TRUSTED_CONFIG_PATHS: [
              process.env.MISE_TRUSTED_CONFIG_PATHS,
              tmp,
            ]
              .filter((path) => path !== undefined && path !== "")
              .join(":"),
          },
          stdout: "inherit",
          stderr: "inherit",
          timeout: 300_000,
        },
      );
      if ((await child.exited) !== 0) failed = true;
    }
    for (const path of targets) {
      const same =
        existsSync(join(tmp, path)) &&
        readFileSync(join(tmp, path)).equals(jjContent(context, path));
      if (same) continue;
      failed = true;
      process.stdout.write(
        `REFUSE: ${path} needs formatting; run mise run fmt on it and retry the commit\n`,
      );
    }
    process.stdout.write(
      `RESULT: fmt:staged jj snapshot ${failed ? "refused" : "verified"} ${targets.length} selected file(s)\n`,
    );
    return failed ? 1 : 0;
  }).finally(() => {
    rmSync(tmp, { recursive: true, force: true });
  });
}

async function main(): Promise<number> {
  const parsed = cli(
    {
      name: "fmt-staged.ts",
      parameters: [],
      flags: {
        tool: { type: [String], description: "'<ext>[,<ext>…]=<command>'" },
        exclude: {
          type: [String],
          description: "glob of staged paths to leave alone",
        },
      },
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 0) {
    process.stderr.write(
      `FATAL: unexpected argument: ${parsed._[0]} (this command takes no positionals)\n`,
    );
    return 2;
  }
  const parsedTools = parsed.flags.tool.map(parseTool);
  const invalidTool = parsedTools.find((result) => !result.ok);
  if (invalidTool !== undefined && !invalidTool.ok) {
    process.stderr.write(`FATAL: ${invalidTool.error}\n`);
    return 2;
  }
  const tools = parsedTools.flatMap((result) =>
    result.ok ? [result.value] : [],
  );
  if (tools.length === 0) {
    process.stderr.write("FATAL: at least one --tool is required\n");
    return 2;
  }
  const excludes = parsed.flags.exclude.map((g) => new Bun.Glob(g));

  const context = jjContext();
  if (context !== undefined) return checkSnapshot(context, tools, excludes);

  // J1 migration fallback; TODO(J1): remove after all consumers use the jj interface.
  const top = await git(process.cwd(), ["rev-parse", "--show-toplevel"]);
  if (top.code !== 0) {
    process.stderr.write("FATAL: not inside a git work tree\n");
    return 2;
  }
  const root = top.out.trim();

  // Added, copied, modified, renamed — a deleted path has nothing to format. Regular files only
  // (mode 100644/100755): a symlink or submodule is not source to format.
  const staged = nul(
    (
      await git(root, [
        "diff",
        "--cached",
        "--name-only",
        "-z",
        "--diff-filter=ACMR",
      ])
    ).out,
  );
  const modes = new Map(
    nul((await git(root, ["ls-files", "-s", "-z", "--", ...staged])).out).map(
      (line) => {
        const [meta = "", path = ""] = line.split("\t");
        return [path, meta.split(" ")[0] ?? ""] as const;
      },
    ),
  );
  for (const path of staged) {
    const mode = modes.get(path);
    if (mode !== "100644" && mode !== "100755") continue;
    if (excludes.some((g) => g.match(path))) continue;
    const ext = path.includes(".")
      ? (path.split(".").pop() ?? "").toLowerCase()
      : "";
    tools.find((t) => t.exts.includes(ext))?.files.push(path);
  }
  const targets = tools.flatMap((t) => t.files);
  if (targets.length === 0) {
    process.stdout.write(
      "RESULT: fmt:staged — no staged file matches a --tool extension\n",
    );
    return 0;
  }

  // A partially staged file: its worktree is not what is being committed.
  const partial = nul(
    (await git(root, ["diff", "--name-only", "-z", "--", ...targets])).out,
  );
  if (partial.length > 0) {
    for (const path of partial) {
      process.stdout.write(
        `REFUSE: ${path} has unstaged changes as well as staged ones — formatting it and re-adding ` +
          "the file would commit the unstaged hunks. Stage the rest (`git add -p`), or park it " +
          `(\`git stash push --keep-index -- ${path}\`), then commit again\n`,
      );
    }
    process.stdout.write(
      `RESULT: fmt:staged refused ${partial.length} partially staged file(s); nothing was changed\n`,
    );
    return 1;
  }

  const before = await hashes(root, targets);
  const dirtyBefore = await dirtyOutside(root);
  let failed = false;
  for (const tool of tools) {
    if (tool.files.length === 0) continue;
    const child = Bun.spawn(
      ["sh", "-c", `${tool.command} "$@"`, "fmt-staged", ...tool.files],
      {
        cwd: root,
        stdout: "inherit",
        stderr: "inherit",
        timeout: 300_000,
      },
    );
    const code = await child.exited;
    if (code !== 0) {
      failed = true;
      process.stdout.write(
        `FAIL: \`${tool.command}\` exited ${code} on ${tool.files.length} staged file(s)\n`,
      );
    }
  }

  const after = await hashes(root, targets);
  const changed = targets.filter((_, i) => before[i] !== after[i]);
  const strayed = [...(await dirtyOutside(root))].filter(
    (p) => !dirtyBefore.has(p) && !targets.includes(p),
  );
  for (const path of strayed) {
    process.stdout.write(
      `FAIL: the formatter changed ${path}, which is not staged — left as is, not re-added; ` +
        "narrow that --tool command to the files it is given\n",
    );
  }
  if (failed || strayed.length > 0) {
    for (const path of changed) {
      process.stdout.write(
        `CHANGED: ${path} (left in the worktree, not re-staged — the gate failed)\n`,
      );
    }
    process.stdout.write("RESULT: fmt:staged failed; nothing was re-staged\n");
    return 1;
  }
  if (changed.length > 0) {
    const add = await git(root, ["add", "--", ...changed]);
    if (add.code !== 0) {
      process.stdout.write(
        `FAIL: git add of the formatted files failed: ${add.err.trim()}\n`,
      );
      return 1;
    }
    for (const path of changed) process.stdout.write(`FORMATTED: ${path}\n`);
  }
  process.stdout.write(
    `RESULT: fmt:staged formatted ${changed.length} of ${targets.length} staged file(s) and ` +
      "re-staged exactly those\n",
  );
  return 0;
}

const code = await main().catch((error: unknown) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  return 2;
});
process.exitCode = code;
