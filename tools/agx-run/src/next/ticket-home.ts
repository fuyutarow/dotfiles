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
      error: `cannot read committed .agx.toml: ${names.err.trim()}`,
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
      error: "invalid committed .agx.toml: tickets must be a nonempty path",
    } as const;
  return { ok: true, declared: checked.data.tickets } as const;
}

export async function ticketContext(cwd: string) {
  let root = await realpath(cwd);
  let vcs: "jj" | "git" | undefined;
  while (true) {
    if ((await lstat(join(root, ".jj")).catch(() => null)) !== null) {
      vcs = "jj";
      break;
    }
    if ((await lstat(join(root, ".git")).catch(() => null)) !== null) {
      vcs = "git";
      break;
    }
    const parent = dirname(root);
    if (parent === root) {
      root = await realpath(cwd);
      break;
    }
    root = parent;
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
      cwd,
    );
    const id = result.out.trim();
    return result.exit === 0 && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(id)
      ? id
      : null;
  };
  const base_rev = await revision(vcs === "jj" ? "@" : "HEAD");
  const config = await committedHome(vcs, root, base_rev);
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
  return `WARN ticket path ${resolve(path)} is volatile or outside its home; declared home: ${ctx.home}; create a ticket with tkt new --repo ${ctx.root} <slug>`;
}
