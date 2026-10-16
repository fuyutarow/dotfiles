#!/usr/bin/env bun
// fmt-staged.ts — format jj working-copy changes, or verify a J1 selected snapshot.
// Direct invocation formats changed regular files in place; PRECOMMIT_VCS=jj instead
// checks immutable selected bytes in a temporary candidate tree without rewriting them.
//
//   fmt-staged --tool 'md=rumdl fmt' [--exclude 'archives/**']
// --tool '<ext>[,<ext>…]=<command>' receives matching changed paths as trailing arguments.
// --exclude '<glob>' leaves matching paths alone (repeatable).
// Requires a jj repository. Output: FORMATTED / REFUSE / FAIL / RESULT lines.
// Exit: 0 formatted/verified or nothing to do · 1 formatter failed/refused/strayed · 2 environment/usage.

import { cli } from "cleye";
import { access, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
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

// jjExport returns void until jj-precommit goes async; widening the result keeps the await valid
// (and waiting) in both states.
const exportCandidate: (...args: Parameters<typeof jjExport>) => unknown =
  jjExport;

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

async function jj(
  root: string,
  args: string[],
): Promise<{ code: number; out: string; err: string }> {
  const child = Bun.spawn(["jj", ...args], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
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
  const candidate = await Promise.try(() => jjCandidate(context));
  const changed = await Promise.try(() => jjChanged(context));
  for (const path of changed) {
    if (!candidate.has(path) || excludes.some((glob) => glob.match(path)))
      continue;
    const kind = (
      await Promise.try(() =>
        jjRead(
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
        ),
      )
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
  const tmp = await mkdtemp(join(tmpdir(), "fmt-jj-"));
  await using _cleanupTmp = {
    [Symbol.asyncDispose]: () => rm(tmp, { recursive: true, force: true }),
  };
  // Format a complete candidate copy, so formatters following module children are confined
  // to the temporary tree. The checked revision and the user's working copy stay immutable.
  await exportCandidate(context, tmp, candidate);
  if (
    await access(join(context.root, "node_modules")).then(
      () => true,
      () => false,
    )
  )
    await symlink(
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
      (await access(join(tmp, path)).then(
        () => true,
        () => false,
      )) &&
      (await readFile(join(tmp, path))).equals(
        await Promise.try(() => jjContent(context, path)),
      );
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
          description: "glob of changed paths to leave alone",
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

  const context = await Promise.try(() => jjContext());
  if (context !== undefined) return checkSnapshot(context, tools, excludes);

  const top = await jj(process.cwd(), ["root"]).catch(() => null);
  if (top === null || top.code !== 0) {
    process.stderr.write(
      "FATAL: fmt:staged requires a jj repository and the jj executable; run inside a jj repository\n",
    );
    return 2;
  }
  const root = top.out.trim();
  const read = async (args: string[]): Promise<string> => {
    const result = await jj(root, args);
    if (result.code !== 0) {
      process.stderr.write(
        `FATAL: jj ${args[0]} failed: ${result.err.trim()}\n`,
      );
      process.exit(2);
    }
    return result.out;
  };
  // Freeze the pre-format revision so edits outside the target set can be detected afterward.
  const rev = await read(["log", "--no-graph", "-r", "@", "-T", "commit_id"]);
  const changed = nul(await read(["diff", "-r", rev, "-T", 'path ++ "\\0"']));
  const regular = new Set(
    nul(
      await read([
        "file",
        "list",
        "-r",
        rev,
        "-T",
        'if(file_type == "file", path ++ "\\0")',
      ]),
    ),
  );
  for (const path of changed) {
    if (!regular.has(path) || excludes.some((glob) => glob.match(path)))
      continue;
    const ext = path.includes(".")
      ? (path.split(".").at(-1)?.toLowerCase() ?? "")
      : "";
    tools.find((tool) => tool.exts.includes(ext))?.files.push(path);
  }
  const targets = tools.flatMap((tool) => tool.files);
  if (targets.length === 0) {
    process.stdout.write(
      "RESULT: fmt:staged — no changed file matches a --tool extension\n",
    );
    return 0;
  }
  const before = await Promise.all(
    targets.map((path) => readFile(join(root, path))),
  );
  let failed = false;
  for (const tool of tools) {
    if (tool.files.length === 0) continue;
    const child = Bun.spawn(
      ["sh", "-c", `${tool.command} "$@"`, "fmt-staged", ...tool.files],
      { cwd: root, stdout: "inherit", stderr: "inherit", timeout: 300_000 },
    );
    const code = await child.exited;
    if (code !== 0) {
      failed = true;
      process.stdout.write(
        `FAIL: \`${tool.command}\` exited ${code} on ${tool.files.length} changed file(s)\n`,
      );
    }
  }
  const strayed = nul(
    await read(["diff", "--from", rev, "--to", "@", "-T", 'path ++ "\\0"']),
  ).filter((path) => !targets.includes(path));
  for (const path of strayed) {
    failed = true;
    process.stdout.write(
      `FAIL: the formatter changed ${path}, which is outside its file list; narrow that --tool command\n`,
    );
  }
  let formatted = 0;
  for (const [i, path] of targets.entries()) {
    const after = await readFile(join(root, path)).catch(() => null);
    const prior = before[i];
    if (after === null || prior === undefined) {
      failed = true;
      process.stdout.write(`FAIL: the formatter removed ${path}\n`);
    } else if (!after.equals(prior)) {
      formatted++;
      process.stdout.write(`FORMATTED: ${path}\n`);
    }
  }
  process.stdout.write(
    `RESULT: fmt:staged ${failed ? "failed; formatted" : "formatted"} ${formatted} of ${targets.length} changed file(s)\n`,
  );
  return failed ? 1 : 0;
}

const code = await main().catch((error: unknown) => {
  process.stderr.write(
    `FATAL: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  return 2;
});
process.exitCode = code;
