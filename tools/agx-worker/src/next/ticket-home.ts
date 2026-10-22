import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fromPromise } from "neverthrow";
import { resolveAgxConfig } from "../../../shared/src/agx-config.ts";
import {
  AgxConfigError,
  InspectionTimeout,
  InspectionUnavailable,
} from "../../../shared/src/agx-config.ts";
import { JJ_READ_ARGS } from "../../../shared/src/jj-read.ts";
import { readonlyCommand } from "../../../shared/src/readonly-command.ts";

const inside = (path: string, home: string) => {
  const part = relative(home, path);
  return (
    part === "" ||
    (!isAbsolute(part) && part !== ".." && !part.startsWith(`..${sep}`))
  );
};

export const TREE_READ_TIMEOUT_MS = 60_000;
/** Repository contention is an operational failure, never evidence of no VCS. */
export async function treeRead(
  argv: string[],
  cwd: string,
  timeoutMs = TREE_READ_TIMEOUT_MS,
) {
  const invocation = readonlyCommand(argv, cwd);
  const result = await fromPromise(
    (async () => {
      const started = performance.now();
      const child = Bun.spawn(invocation.cmd, {
        cwd,
        env: invocation.env,
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
        timeout: timeoutMs,
        killSignal: "SIGKILL",
      });
      const [exit, out, err] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      if (
        child.signalCode === "SIGKILL" &&
        performance.now() - started >= timeoutMs
      )
        return {
          exit: 75,
          out: "",
          err: new InspectionTimeout(
            "TREE_READ_TIMEOUT_MS",
            timeoutMs,
            argv,
            cwd,
          ).message,
        };
      if (exit === 75)
        return {
          exit,
          out,
          err:
            err.trim() === ""
              ? `inspection unavailable; command=${JSON.stringify(argv)}; cwd=${cwd}; exit=75; no stderr`
              : err.trim().replaceAll(/[\r\n]+/gu, "; "),
        };
      return { exit, out, err };
    })(),
    (error) => error,
  );
  return result.isOk()
    ? result.value
    : { exit: 2, out: "", err: String(result.error) };
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
    if (probe.exit === 75) return new InspectionUnavailable(probe.err);
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
    if (probe.exit === 75) return new InspectionUnavailable(probe.err);
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
      configurationError: undefined,
    } as const;
  let root = physical;
  let vcs: "jj" | "git" | undefined;
  while (true) {
    const kind = await repositoryKind(root);
    if (kind instanceof InspectionUnavailable)
      return {
        ok: false,
        error: kind.message,
        configurationError: kind,
      } as const;
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
    if (result.exit === 75) return new InspectionUnavailable(result.err);
    return result.exit === 0 && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(id)
      ? id
      : null;
  };
  const base_rev = await revision(vcs === "jj" ? "@" : "HEAD");
  if (base_rev instanceof InspectionUnavailable)
    return {
      ok: false,
      error: base_rev.message,
      configurationError: base_rev,
    } as const;
  const config = await resolveAgxConfig(root, { vcs: vcs ?? "none" });
  if (!config.ok)
    return {
      ok: false,
      configurationError:
        config.error instanceof AgxConfigError ? config.error : undefined,
      error:
        config.error instanceof Error
          ? config.error.message
          : String(config.error),
    } as const;
  root = config.value.root;
  const home = config.value.tickets;
  return {
    ok: true,
    root,
    home,
    base_rev,
    revision,
    vcs,
    verifyAlways: config.value.verifyAlways,
  } as const;
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
