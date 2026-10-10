// Immutable render inputs, shared by link:dots, render-home and doctor's reference render.
// Zero-dep: a fresh host renders before node_modules is restored. No argv boundary.
import { mkdir, mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";
import { z } from "../agents/hooks/zod.ts";

export const RENDER_INPUTS = [
  "agents/claude/settings.json",
  "agents/codex/hooks.json",
  "agents/claude/CLAUDE.md",
  "agents/hooks",
  "agents/models",
  "tools/shared/src/attempt.ts",
  "tools/shared/src/narrow.ts",
  "tools/shared/src/zod.ts",
  "zsh/timezone",
  "scripts/render-home.ts",
  "scripts/render-source.ts",
  "scripts/hook-registry.ts",
  "scripts/config-registry.ts",
  "scripts/core-tools.ts",
];

async function jj(root: string, args: string[]): Promise<string | Error> {
  const result = await attempt(async () => {
    const signal = AbortSignal.timeout(10_000);
    const child = Bun.spawn(["jj", "--no-pager", "--color", "never", ...args], {
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (signal.aborted || code !== 0 || err.includes("Refused to snapshot"))
      return new Error(
        `render source: jj ${args[0]} failed (${code}): ${err.trim()}`,
      );
    return out;
  });
  return result.ok ? result.value : new Error(errorMessage(result.error));
}

async function hasJj(root: string): Promise<boolean | Error> {
  const result = await attempt(() => stat(join(root, ".jj")));
  if (result.ok) return true;
  const error = z.looseObject({ code: z.string() }).safeParse(result.error);
  return error.success && error.data.code === "ENOENT"
    ? false
    : new Error(errorMessage(result.error));
}

/** Check before link:dots changes any home path. Explicit working-copy rendering is local only. */
export async function renderRefusal(
  root: string,
  fromWorkingCopy = false,
  revision?: string,
): Promise<Error | undefined> {
  if (fromWorkingCopy && revision !== undefined)
    return new Error(
      "--from-working-copy cannot be combined with a deployment render revision",
    );
  const committed = await hasJj(root);
  if (committed instanceof Error) return committed;
  if (fromWorkingCopy || !committed) return undefined;
  const snapped = await jj(root, ["status"]);
  if (snapped instanceof Error) return snapped;
  const dirty = await jj(root, [
    "--ignore-working-copy",
    "diff",
    "--from",
    "@-",
    "--to",
    "@",
    "-T",
    'path ++ "\\0"',
    "--",
    ...RENDER_INPUTS,
  ]);
  if (dirty instanceof Error) return dirty;
  const paths = dirty.split("\0").filter(Boolean);
  if (paths.length === 0) return undefined;
  return new Error(
    `uncommitted render inputs: ${JSON.stringify(paths)}; refusing to render $HOME. Commit them first, or use mise run link:dots -- --from-working-copy for an explicit local render`,
  );
}

export type RenderSource = {
  root: string;
  description: string;
  release: () => Promise<void>;
};

export async function prepareRenderSource(
  root: string,
  fromWorkingCopy = false,
  revision?: string,
): Promise<RenderSource | Error> {
  const refused = await renderRefusal(root, fromWorkingCopy, revision);
  if (refused !== undefined) return refused;
  const committed = await hasJj(root);
  if (committed instanceof Error) return committed;
  if (fromWorkingCopy || (!committed && revision === undefined))
    return { root, description: "working copy", release: async () => {} };
  const id = await jj(root, [
    "--ignore-working-copy",
    "log",
    "--no-graph",
    "-r",
    revision ?? "alpha",
    "-T",
    "commit_id",
  ]);
  if (id instanceof Error) return id;
  const commit = id.trim();
  if (!/^[0-9a-f]{40,64}$/u.test(commit))
    return new Error("render revision must resolve to exactly one commit");
  const listed = await jj(root, [
    "--ignore-working-copy",
    "file",
    "list",
    "-r",
    commit,
    "-T",
    'path ++ "\\0"',
    "--",
    ...RENDER_INPUTS,
  ]);
  if (listed instanceof Error) return listed;
  const scratch = await mkdtemp(join(tmpdir(), "dotfiles-render-"));
  const release = () => rm(scratch, { recursive: true, force: true });
  const paths = listed.split("\0").filter(Boolean);
  // Bound parallel jj readers; no full checkout, workspace registration or live-input copying.
  const copied = await attempt(async () => {
    for (let offset = 0; offset < paths.length; offset += 8) {
      const results = await Promise.all(
        paths.slice(offset, offset + 8).map(async (path) => {
          const text = await jj(root, [
            "--ignore-working-copy",
            "file",
            "show",
            "-r",
            commit,
            "--",
            `root-file:${JSON.stringify(path)}`,
          ]);
          if (text instanceof Error) return text;
          const dest = join(scratch, path);
          await mkdir(dirname(dest), { recursive: true });
          await Bun.write(dest, text);
          return true;
        }),
      );
      const failure = results.find((value) => value instanceof Error);
      if (failure !== undefined) {
        return failure;
      }
    }
    return true;
  });
  const failure = copied.ok
    ? copied.value
    : new Error(errorMessage(copied.error));
  if (failure instanceof Error) {
    await release();
    return failure;
  }
  return { root: scratch, description: `commit ${commit}`, release };
}
