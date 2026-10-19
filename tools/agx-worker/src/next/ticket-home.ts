import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { fromPromise, fromThrowable } from "neverthrow";
import { z } from "../../../shared/src/zod.ts";
import { JJ_READ_ARGS } from "../../../shared/src/jj-read.ts";
import { readonlyCommand } from "../../../shared/src/readonly-command.ts";

const inside = (path: string, home: string) => {
  const part = relative(home, path);
  return (
    part === "" ||
    (!isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`))
  );
};

/** All VCS reads use the existing kernel read barrier and a bounded child. */
export async function treeRead(argv: string[], cwd: string) {
  const invocation = readonlyCommand(argv, cwd);
  const result = await fromPromise(
    (async () => {
      const child = Bun.spawn(invocation.cmd, {
        cwd,
        env: invocation.env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: 5000,
      });
      const [exit, out, err] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { exit, out, err };
    })(),
    String,
  );
  return result.isOk() ? result.value : { exit: 2, out: "", err: result.error };
}

async function committedHome(
  vcs: "jj" | "git" | undefined,
  root: string,
  baseRev: string | null,
) {
  if (vcs === undefined || baseRev === null)
    return { ok: true, declared: ".agents/tickets" } as const;
  const names = await treeRead(
    vcs === "jj"
      ? ["jj", ...JJ_READ_ARGS, "file", "list", "-r", baseRev, ".agx.toml"]
      : [
          "git",
          "--no-optional-locks",
          "ls-tree",
          "--name-only",
          baseRev,
          "--",
          ".agx.toml",
        ],
    root,
  );
  if (names.exit !== 0)
    return {
      ok: false,
      error: `cannot read committed ${join(root, ".agx.toml")}: ${names.err.trim()}`,
    } as const;
  if (names.out.trim() === "")
    return { ok: true, declared: ".agents/tickets" } as const;
  const config = await treeRead(
    vcs === "jj"
      ? ["jj", ...JJ_READ_ARGS, "file", "show", "-r", baseRev, ".agx.toml"]
      : ["git", "--no-optional-locks", "show", `${baseRev}:.agx.toml`],
    root,
  );
  const decoded = fromThrowable(
    (): unknown => Bun.TOML.parse(config.out),
    String,
  )();
  const checked = z
    .object({ tickets: z.string().trim().min(1).default(".agents/tickets") })
    .safeParse(decoded.isOk() ? decoded.value : undefined);
  if (config.exit !== 0 || !checked.success)
    return {
      ok: false,
      error: `invalid committed ${join(root, ".agx.toml")}: tickets must be a nonempty path`,
    } as const;
  return { ok: true, declared: checked.data.tickets } as const;
}

async function repositoryKind(root: string) {
  if ((await lstat(join(root, ".jj")).catch(() => null)) !== null) {
    const probe = await treeRead(
      [
        "jj",
        ...JJ_READ_ARGS,
        "log",
        "-r",
        "@",
        "--no-graph",
        "-T",
        "commit_id",
      ],
      root,
    );
    if (
      probe.exit === 0 &&
      /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(probe.out.trim())
    ) {
      return "jj";
    }
  }
  if ((await lstat(join(root, ".git")).catch(() => null)) !== null) {
    const probe = await treeRead(
      [
        "git",
        "--no-optional-locks",
        `--git-dir=${join(root, ".git")}`,
        "rev-parse",
        "--verify",
        "HEAD^{commit}",
      ],
      root,
    );
    if (
      probe.exit === 0 &&
      /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(probe.out.trim())
    ) {
      return "git";
    }
  }
  return null;
}

export async function ticketContext(cwd: string) {
  const physical = await realpath(cwd).catch(() => null);
  if (physical === null)
    return {
      ok: false,
      error: `cannot examine ticket repository at ${resolve(cwd)}`,
    } as const;
  let root = physical;
  let vcs: "jj" | "git" | undefined;
  while (true) {
    const kind = await repositoryKind(root);
    if (kind !== null) {
      vcs = kind;
      break;
    }
    const parent = dirname(root);
    if (parent === root) {
      root = physical;
      break;
    }
    root = parent;
  }
  const workspace = root;
  if (vcs === "jj") {
    // Ticket storage belongs to the repository, not the dispatch workspace.
    // Revision reads below use the discovered workspace, skipping invalid markers.
    const repository = await treeRead(
      ["jj", ...JJ_READ_ARGS, "workspace", "root", "--name", "default"],
      workspace,
    );
    if (repository.exit !== 0 || repository.out.trim() === "")
      return {
        ok: false,
        error: `cannot resolve repository default workspace at ${workspace}: ${repository.err.trim()}`,
      } as const;
    root = await realpath(repository.out.trim());
  }
  const revision = async (rev: string) => {
    if (vcs === undefined) return null;
    const result = await treeRead(
      vcs === "jj"
        ? [
            "jj",
            ...JJ_READ_ARGS,
            "log",
            "-r",
            rev,
            "--no-graph",
            "-T",
            'commit_id ++ "\\n"',
          ]
        : [
            "git",
            "--no-optional-locks",
            "rev-parse",
            "--verify",
            "--end-of-options",
            `${rev}^{commit}`,
          ],
      workspace,
    );
    const id = result.out.trim();
    return result.exit === 0 && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(id)
      ? id
      : null;
  };
  const base_rev = await revision(vcs === "jj" ? "@" : "HEAD");
  const config_rev = await revision(vcs === "jj" ? "trunk()" : "HEAD");
  if (vcs !== undefined && config_rev === null)
    return {
      ok: false,
      error: `cannot resolve committed ticket configuration at ${root} for ${vcs === "jj" ? "trunk()" : "HEAD"}`,
    } as const;
  const config = await committedHome(vcs, root, config_rev);
  if (!config.ok) return config;
  const declared = config.declared;
  const home = resolve(
    root,
    declared.startsWith("~/") ? join(homedir(), declared.slice(2)) : declared,
  );
  return { ok: true, root, home, base_rev, revision, vcs } as const;
}

export async function ticketPlacement(
  path: string,
  ctx: { root: string; home: string },
) {
  const physical = await realpath(path).catch(() => resolve(path));
  for (const home of [join(ctx.root, ".agents/tickets"), ctx.home]) {
    const target = await realpath(home).catch(() => home);
    if (inside(resolve(path), home) && inside(physical, target)) return null;
  }
  return `refused ticket path ${resolve(path)} is volatile or outside its home; declared home: ${ctx.home}; create a ticket with agx ticket new --repo ${ctx.root} <slug>`;
}
