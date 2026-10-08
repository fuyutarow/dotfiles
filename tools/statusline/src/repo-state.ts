import { ENRICHMENT_TIMEOUT_MS, execBounded } from "./bounded.ts";
import { firstNonEmpty } from "./model-context.ts";

export function repoState(cwd: string): {
  branch: string | undefined;
  branchWhy: string | undefined;
} {
  // git branch from cwd — see the top-of-file Tiger-Style note for why this call is bounded.
  // Exit 128 is git's code for EVERY fatal error (an empty repo's unknown HEAD, a dubious-
  // ownership refusal, a vanished cwd), so only git's own "not a git repository" sentence — read
  // from stderr, in the C locale — means "nothing to show". Every other failure is shown as n/a
  // with git's reason.
  const branchResult = execBounded(
    "git",
    "git",
    ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
    ENRICHMENT_TIMEOUT_MS,
    { ...process.env, LC_ALL: "C" },
  ).map((out) => out.trim());
  const notRepo =
    branchResult.isErr() &&
    branchResult.error.stderr.includes("not a git repository");
  const branch = branchResult.isOk() ? branchResult.value : undefined;
  // git's own words beat a bare "git exit 128": "fatal: <reason>" -> "<reason>", capped.
  const gitReason = branchResult.isErr()
    ? branchResult.error.stderr
        .split("\n")[0]
        ?.replace(/^fatal: /u, "")
        .slice(0, 60)
    : undefined;
  const branchWhy =
    branchResult.isErr() && !notRepo
      ? firstNonEmpty(gitReason, branchResult.error.why)
      : undefined;
  return { branch, branchWhy };
}
