import { readlink } from "node:fs/promises";
import { join } from "node:path";
import { attempt, attemptOr } from "../../shared/src/attempt.ts";
import { projectCwd } from "./attribution.ts";
import type { HookContext } from "./runtime.ts";

export type Job = {
  id: string;
  attribution: "session" | "projectUnattributed" | "foreign";
  session?: string;
  cwd?: string;
  kind?: string;
  labels: string[];
};
export type JobFilter = { session?: string; procRoot?: string };
const LIMIT_MS = 1_000;

async function systemctl(
  path: string,
  args: string[],
  ctx: HookContext,
  signal: AbortSignal,
): Promise<string | undefined> {
  const result = await attempt(async () => {
    const child = Bun.spawn([path, "--user", ...args], {
      cwd: ctx.cwd,
      stdout: "pipe",
      stderr: "pipe",
      signal,
      timeout: LIMIT_MS,
      env: process.env,
    });
    const [out, , exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return exit === 0 && !signal.aborted ? out : undefined;
  });
  return result.ok ? result.value : undefined;
}

// systemctl renders Environment as whitespace-separated, optionally quoted assignments.
function environment(text: string): Map<string, string> {
  const values = new Map<string, string>();
  const words =
    text.match(/(?:[^\s"'\\]|\\.|"(?:[^"\\]|\\.)*"|'[^']*')+/gu) ?? [];
  for (const word of words) {
    const decoded = word.replaceAll(/["']/gu, "").replaceAll(/\\(.)/gu, "$1");
    const index = decoded.indexOf("=");
    if (index > 0)
      values.set(decoded.slice(0, index), decoded.slice(index + 1));
  }
  return values;
}

function properties(text: string): Map<string, string> {
  return new Map(
    text.split("\n").flatMap((line) => {
      const index = line.indexOf("=");
      return index < 1 ? [] : [[line.slice(0, index), line.slice(index + 1)]];
    }),
  );
}

async function jobFromUnit(
  text: string,
  ctx: HookContext,
  procRoot: string,
): Promise<Job | null> {
  const unit = properties(text);
  const id = unit.get("Id");
  if (
    id === undefined ||
    unit.get("ActiveState") !== "active" ||
    unit.get("SubState") !== "running"
  )
    return null;
  const env = environment(unit.get("Environment") ?? "");
  const session = env.get("CLAUDE_CODE_SESSION_ID")?.trim();
  const declaredCwd = unit.get("WorkingDirectory");
  const pid = Number(unit.get("MainPID"));
  const processCwd =
    Number.isSafeInteger(pid) && pid > 0
      ? await attemptOr(
          () => readlink(join(procRoot, String(pid), "cwd")),
          undefined,
        )
      : undefined;
  const cwd = projectCwd(declaredCwd, ctx.repoRoot)
    ? declaredCwd
    : (processCwd ?? declaredCwd);
  let attribution: Job["attribution"] = "foreign";
  if (session !== undefined && session !== "") attribution = "session";
  else if (projectCwd(cwd, ctx.repoRoot)) attribution = "projectUnattributed";
  const kind = env.get("AGX_JOB_KIND") ?? env.get("AGX_KIND");
  return {
    id,
    attribution,
    ...(session === undefined || session === "" ? {} : { session }),
    ...(cwd === undefined || cwd === "" ? {} : { cwd }),
    ...(kind === undefined ? {} : { kind }),
    labels: (env.get("AGX_JOB_LABELS") ?? env.get("AGX_LABELS") ?? "")
      .split(/[\s,]+/u)
      .filter((label) => label !== ""),
  };
}

/** Running user services with session-first attribution; all jobs when session is omitted. */
export async function runningJobs(
  ctx: HookContext,
  filter: JobFilter = {},
): Promise<Job[]> {
  const path = Bun.which("systemctl", { PATH: process.env.PATH ?? "" });
  if (path === null) return [];
  const signal = AbortSignal.timeout(LIMIT_MS);
  const listed = await systemctl(
    path,
    [
      "list-units",
      "--type=service",
      "--state=running",
      "--plain",
      "--no-legend",
      "--no-pager",
    ],
    ctx,
    signal,
  );
  if (listed === undefined) return [];
  const ids = [
    ...new Set(
      listed
        .split("\n")
        .map((line) => line.trim().split(/\s+/u)[0] ?? "")
        .filter(
          (id) => /^[\w@.\\:-]+\.service$/u.test(id) && !id.startsWith("-"),
        ),
    ),
  ];
  if (ids.length === 0 || signal.aborted) return [];
  const shown = await systemctl(
    path,
    [
      "show",
      "--no-pager",
      "--property=Id,ActiveState,SubState,MainPID,Environment,WorkingDirectory",
      ...ids,
    ],
    ctx,
    signal,
  );
  if (shown === undefined) return [];
  const rows = await Promise.all(
    shown
      .trim()
      .split(/\n\s*\n/u)
      .map((text) => jobFromUnit(text, ctx, filter.procRoot ?? "/proc")),
  );
  if (signal.aborted) return [];
  const jobs = new Map<string, Job>();
  for (const job of rows) {
    if (job !== null && ids.includes(job.id)) jobs.set(job.id, job);
  }
  return [...jobs.values()].filter(
    (job) => filter.session === undefined || job.session === filter.session,
  );
}

/** Running services without a unit session whose cwd belongs to this project. */
export async function unattributedJobs(
  ctx: HookContext,
  options: Omit<JobFilter, "session"> = {},
): Promise<Job[]> {
  return (await runningJobs(ctx, options)).filter(
    (job) => job.attribution === "projectUnattributed",
  );
}
