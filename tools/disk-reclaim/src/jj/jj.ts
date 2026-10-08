import { fromThrowable } from "../../../shared/src/zod.ts";

export type JjResult = { ok: boolean; stdout: string; stderr: string };

/** Run `jj` with an explicit argv. Never inherits a cwd: every call names its repo with -R. */
export function jj(args: string[], cwd = "/"): JjResult {
  const result = fromThrowable(() =>
    Bun.spawnSync(["jj", "--color=never", "--no-pager", ...args], {
      cwd,
      stdin: "ignore",
      timeout: 120_000,
    }),
  )();
  return result.match(
    (run) => ({
      ok: run.exitCode === 0,
      stdout: run.stdout.toString(),
      stderr: run.stderr.toString(),
    }),
    (error) => ({
      ok: false,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
    }),
  );
}

/** The quoted `<name>@` revset for a workspace's working-copy commit. */
export const workingCopyRevset = (name: string): string =>
  `${JSON.stringify(name)}@`;

/** What counts as "on a remote": the git pseudo-remote mirrors local bookmarks, so it is excluded. */
export const REMOTE_SET = '(remote_bookmarks(remote=~exact:"git") | trunk())';
export const unpushedRevset = (name: string): string =>
  `(::${workingCopyRevset(name)} ~ ::${REMOTE_SET})`;
