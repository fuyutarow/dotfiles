import { ok } from "neverthrow";
import type { StatusInput } from "./input.ts";
import type { Dataframe } from "./dataframe.ts";
import {
  account,
  agentName,
  readClaudeJson,
  rcState,
  reportToHerdr,
  ultracodeConfigured,
} from "./identity.ts";
import { modelWeeklyLimits } from "./rate-limits.ts";
import { contextLabel, firstNonEmpty, modelName } from "./model-context.ts";
import { repoState } from "./repo-state.ts";
import { scanOutOfHarness } from "./jobs.ts";
import { readHostLoad } from "./host-load.ts";
import { routeRuns } from "./dispatch-runs.ts";
import { readDispatchWarning } from "./dispatch-warning.ts";

// --- buildDataframe: stdin -> every displayable value, already computed. No ANSI, no rows. ---
export async function buildDataframe(data: StatusInput): Promise<Dataframe> {
  // || (not ??): an empty cwd string must ALSO fall through to PWD, matching the old sh's
  // `[ -n "$cwd" ] || cwd=$PWD` guard — "" is never a real working directory.
  const workspaceDir = data.workspace?.current_dir;
  const cwdCandidate = firstNonEmpty(
    data.cwd,
    firstNonEmpty(workspaceDir, process.env.PWD ?? ""),
  );
  const cwd = cwdCandidate;
  const sid =
    data.session_id !== undefined && data.session_id !== ""
      ? data.session_id
      : undefined; // "" is not an id either
  const sessionNameHint =
    data.session_name !== undefined && data.session_name !== ""
      ? data.session_name
      : undefined;
  const nameResult =
    sid !== undefined
      ? agentName(sid, sessionNameHint)
      : ok<string | undefined, string>(undefined);
  const sessionName = nameResult.unwrapOr(undefined);
  const sessionNameWhy = nameResult.isErr() ? nameResult.error : undefined;
  const cjResult = readClaudeJson();
  const accountResult = cjResult.andThen(account);
  const capsResult = cjResult.andThen(modelWeeklyLimits);
  const email = accountResult.unwrapOr(undefined);
  const accountWhy = accountResult.isErr() ? accountResult.error : undefined;
  const rlModel = capsResult.unwrapOr([]);
  const modelCapsWhy = capsResult.isErr() ? capsResult.error : undefined;

  const model = modelName(data.model?.display_name, data.model?.id);

  const effort = data.effort?.level; // string | undefined
  // "Dynamic workflow" (ultracode's auto multi-agent orchestration) is armed ONLY while BOTH
  // hold: the setting says so, and the live effort actually running is xhigh — ultracode forces
  // xhigh whenever it genuinely engages, and a higher-precedence effort lever (env var, an
  // interactive /effort choice, a per-model modelSettings entry the CLI itself writes back —
  // see ultracodeConfigured()'s note) can silently push effort off xhigh and turn orchestration
  // OFF even though `ultracode: true` still sits in settings. Reading the live value here (not
  // the setting alone) is what makes this catch that silent case instead of lying about it.
  const wfOn = ultracodeConfigured() && effort === "xhigh";
  // Plain-text form for herdr only ("xhigh" vs "xhigh+WF") — render() does its OWN combining
  // (with its own +WF color) from the raw `effort`/`wfOn` pair below; a dataframe field must
  // hold one raw fact, not a pre-styled/pre-joined display string, or a future render() change
  // duplicates work already done here (caught live 2026-09-12: the first cut of this split
  // stored the combined string AND re-appended "+WF" in render(), rendering "xhigh+WF+WF").
  const wfSuffix = wfOn ? "+WF" : "";
  // Remote Control, read the SAME way reportToHerdr() reads it for the sidebar's $rc token, so
  // the two surfaces can never disagree. $CLAUDE_CODE_BRIDGE_SESSION_ID is injected into every
  // child Claude Code spawns and is LIVE: verified 2026-09-22 in one session — set while
  // /remote-control was active, absent in a fresh spawn after it dropped, set again on
  // reconnect. So a render reads the current state, not a launch-time snapshot (the claude
  // process's own /proc environ never carries it at all).
  const rc = rcState();
  const effortDisplay =
    effort !== undefined && effort !== "" ? `${effort}${wfSuffix}` : effort;

  await reportToHerdr(model, sessionName, effortDisplay);

  // No `?? 0`: a payload that carries no token count is "unknown", not "zero tokens".
  const ctxTok =
    data.context_window?.total_input_tokens ??
    data.context_window?.current_usage?.input_tokens;
  const ctx = contextLabel(ctxTok);

  const { branch, branchWhy } = repoState(cwd);

  const scan = scanOutOfHarness();
  const { jobs, orphans } = scan;
  // Sys-row readings (host-load.ts) — always computed now, not gated on a job being admitted.
  const { cpuPct: cpu, ram, vram, disks } = readHostLoad();

  return {
    cwd,
    sid,
    sessionName,
    sessionNameWhy,
    email,
    model,
    effort,
    wfOn,
    rc,
    ctx,
    ctxPct: data.context_window?.used_percentage,
    rl5: data.rate_limits?.five_hour?.used_percentage,
    rl5Reset: data.rate_limits?.five_hour?.resets_at,
    rl7: data.rate_limits?.seven_day?.used_percentage,
    rl7Reset: data.rate_limits?.seven_day?.resets_at,
    rlModel,
    accountWhy,
    modelCapsWhy,
    branch,
    branchWhy,
    add: data.cost?.total_lines_added,
    del: data.cost?.total_lines_removed,
    wt: data.worktree?.name,
    jobs,
    orphans,
    jobScanWhy: scan.failed,
    routes: routeRuns(),
    dispatchWarning: readDispatchWarning(),
    vram,
    disks,
    cpuPct: cpu,
    ram,
  };
}
