import { DIM, ESC, RST } from "./ansi.ts";
import { promptParts, type PromptParts } from "./prompt-stamp.ts";
import type { Dataframe } from "./dataframe.ts";
import { fleetLine } from "./fleet-line.ts";
import { ctxSegment } from "./model-context.ts";
import { rateRow } from "./rate-limits.ts";
import { admittedJobSegment } from "./jobs.ts";
import { routeLines } from "./dispatch-display.ts";
import { sysRow } from "./host-display.ts";
import { recoverHealthBadge } from "./recover-health.ts";
import { fieldDisplay, observed, type FieldDisplay } from "./field-state.ts";
import { fromThrowable } from "neverthrow";
import { renderRows, type DisplayRows } from "./row-state.ts";
import { version } from "../package.json";

const SEP = ` ${DIM}|${RST} `;
const BR = "⎇";

// --- render: Dataframe -> row strings. ALL styling and ALL row grouping lives here — this is
// the ONLY function a future "move field X to a different row" request should touch.
//
// Current grouping (see the top-of-file note for the full list): line 1 is the PS1 mirror
// PLUS repo state (branch + diff + worktree) again — folded back in 2026-09-12, on request,
// after a same-day round trip that briefly split them onto separate rows. KNOWN, ACCEPTED
// DIVERGENCE: this makes line 1 no longer a byte-for-byte mirror of .zshrc's real PROMPT (which
// carries no git info at all — confirmed against zsh/zshrc's own `PROMPT=` line), only of its
// user@host:date|cwd portion. If that divergence ever needs to close instead, the fix is adding
// git info to the REAL PROMPT in zsh/zshrc, not reverting this — see the conversation that
// requested this cut. Line 2 pairs email with the Session uuid (both are copy/reference
// identity strings, not live state); the uuid MUST stay LAST on whatever row it appears on —
// tmux/tmux.conf sets `word-separators ' \t'`, so a row ending in the raw uuid is a one-gesture
// `claude --resume <id>` double-click copy, which breaks if the row wraps before reaching the
// uuid on a narrow pane. Keeping this row short (just email ahead of it) is what keeps that
// risk small; if a future change puts more before the uuid and this starts biting in practice,
// give Session its own row back rather than reintroducing width-fitting logic (deliberately
// absent from this whole file: every row here is an unconditional `join()` of present pieces,
// never a width-driven merge across rows).
// Line 3 pairs the agent's addressable name with its live Model/Effort AND the current Ctx
// reading — "what's running, right now, and how full its context is". Between the Ctx token
// count and its own percentage there is deliberately NO middot (MID, below): that glyph means
// "these are two different sibling values", and a raw count next to its own derived percentage
// is one fact shown twice, not two facts — a bare space reads as one unit. Line 4 is Rate,
// where the two values ARE independent siblings (the 5h window vs the 7d window), so they keep
// the middot between them — same role MID plays between Sys's CPU/RAM/VRAM readings below (each
// an independent host-resource sibling, unlike Ctx's count+percent pair). Line 5 (always present)
// is Sys — host CPU/RAM/VRAM, distinct from Rate's API budget — and Line 6 is Job, including
// an explicit idle value after a successful empty scan; each is always its own row
// so neither can ever be silently dropped by a missing sibling value.
// Rate row, 5h window: "5h NN% [⟳reset]". The three window segments carry no separator of their
// The PS1 head in PS1's own colors (%F{magenta}%n@%F{yellow}%m:%F{cyan}date|%F{green}%~). The
// uncolored shape has one home, hooks/prompt-stamp.ts, shared with the /quote header.
// Its stamp is render time = "as of" for every value on screen. settings.json's
// statusLine.refreshInterval (5s) re-renders an idle pane, so a stamp more than a minute
// behind the clock means a stuck render. Minutes only, like PS1 — seconds were tried and
// rejected as noise (2026-09-27).
export function coloredHead(
  p: PromptParts | undefined,
  field: FieldDisplay = fieldDisplay(),
): string {
  return (
    `${field("prompt-user", "user", observed(p === undefined ? undefined : `${ESC}[35m${p.user}${RST}`, "prompt unavailable"))}@${field("prompt-host", "host", observed(p === undefined ? undefined : `${ESC}[33m${p.host}${RST}`, "prompt unavailable"))}:` +
    `${field("prompt-time", "time", observed(p === undefined ? undefined : `${ESC}[36m${p.when}${RST}`, "prompt unavailable"))}${field("prompt-zone", "zone", observed(p === undefined ? undefined : `${ESC}[38;5;240m${p.zone}${RST}`, "prompt unavailable"))}|${field("prompt-cwd", "cwd", observed(p === undefined ? undefined : `${ESC}[32m${p.cwd}${RST}`, "prompt unavailable"))}`
  );
}
export function render(
  df: Dataframe,
  options: {
    codex?: boolean;
    collect?: FieldDisplay;
    layout?: "location" | "session" | "shared" | "block" | "snapshot";
  } = {},
): string {
  const codex = options.codex === true;
  const display = fieldDisplay(df.fields, options.collect);
  const field: FieldDisplay = (key, label, state) => {
    const source = key.split(":", 1)[0] ?? key;
    const age = df.ownerAges?.[key] ?? df.ownerAges?.[source] ?? 0;
    return display(
      key,
      label,
      state.kind === "fresh" && age > 0
        ? observed(state.value, undefined, age)
        : state,
    );
  };
  const joinText = (t: string, seg: string) => (t !== "" ? t + SEP : "") + seg;

  const line1 = coloredHead(
    fromThrowable(() => promptParts(df.cwd))().unwrapOr(undefined),
    field,
  );

  let identityLine = "";
  if (!codex)
    identityLine = joinText(
      identityLine,
      field(
        "account",
        "account",
        observed(
          df.email === undefined
            ? undefined
            : `${ESC}[38;5;103m${df.email}${RST}`,
          df.accountWhy,
        ),
      ),
    );
  if (df.sid !== null && df.sid !== undefined)
    identityLine = joinText(
      identityLine,
      field(
        "session",
        "Session",
        observed(`${ESC}[38;5;103mSession:${RST} ${DIM}${df.sid}${RST}`),
      ),
    );

  let agentLine = "";
  if (!codex)
    agentLine = joinText(
      agentLine,
      field(
        "name",
        "name",
        observed(
          df.sessionName === undefined
            ? undefined
            : `${ESC}[38;5;214m${df.sessionName}${RST}`,
          df.sessionNameWhy ?? "not listed yet",
        ),
      ),
    );
  agentLine = joinText(
    agentLine,
    field(
      "model",
      "Model",
      observed(
        df.model === "?" ? undefined : `${ESC}[38;5;30m${df.model}${RST}`,
        "payload has no model",
      ),
    ),
  );
  {
    const effort =
      df.effort === undefined || df.effort === ""
        ? undefined
        : `${ESC}[38;5;209m${df.effort}${RST}`;
    // Tailwind violet-500 (#8b5cf6), matched 2026-09-11 against Claude Code's own /effort
    // slider "ultracode" label. truecolor (38;2;r;g;b), not the 256-palette used elsewhere in
    // this file: the palette's nearest steps (ANSI 93/129/135/141) were all visibly off.
    agentLine = joinText(
      agentLine,
      field("effort", "effort", observed(effort, "payload has no effort")),
    );
    let workflow: string | undefined = df.wfOn
      ? `${ESC}[38;2;139;92;246m+WF${RST}`
      : "";
    const workflowWhy =
      df.effort === undefined ? "payload has no effort" : df.workflowWhy;
    if (workflowWhy !== undefined) workflow = undefined;
    if (!codex) {
      const workflowText = field(
        "workflow",
        "workflow",
        observed(workflow, workflowWhy),
      );
      if (workflowText !== "")
        agentLine = workflowText.includes("+WF")
          ? agentLine + workflowText
          : joinText(agentLine, workflowText);
    }
  }
  // Always rendered, one distinct form per state (see rcState()): an absent segment would make
  // "disconnected" and "probe broken" look identical, which is the ambiguity this exists to
  // remove. 🔗 stays unstyled — an emoji does not reliably repaint under an fg override.
  if (!codex) {
    let rc: string | undefined = df.rc === "on" ? "🔗" : `${DIM}rc:off${RST}`;
    if (df.rc === "unknown") rc = undefined;
    agentLine = joinText(agentLine, field("rc", "rc", observed(rc)));
  }

  agentLine = joinText(agentLine, ctxSegment(df, field));

  const rateLine = codex
    ? rateRow(df, undefined, ["codex"], field)
    : rateRow(df, undefined, undefined, field);

  let repoLine = "";
  let branch: string | undefined =
    df.branch === undefined ? "" : `${ESC}[38;5;96m${BR} ${df.branch}${RST}`;
  if (df.branchWhy !== undefined) branch = undefined;
  repoLine = joinText(
    repoLine,
    field("branch", "branch", observed(branch, df.branchWhy)),
  );
  if (!codex || options.layout !== undefined)
    repoLine = joinText(
      repoLine,
      field(
        "diff",
        "diff",
        observed(
          df.add === undefined || df.del === undefined
            ? undefined
            : `${ESC}[38;5;178m(+${df.add},-${df.del})${RST}`,
          "repository not sampled",
        ),
      ),
    );
  if (df.workspace !== undefined)
    repoLine = joinText(repoLine, `${ESC}[38;5;140mws: ${df.workspace}${RST}`);

  // Always present: every reading in it is either a value or an explicit n/a.
  const sysLine = sysRow(df, field);

  let jobLine: string | undefined;
  if (df.jobs.length > 0 || df.orphans > 0) {
    jobLine = `${ESC}[38;5;173mJob:${RST}`;
    if (df.jobs.length > 0) {
      jobLine += admittedJobSegment(df.jobs, df.orphans);
    } else {
      jobLine += ` ${DIM}—${RST} ${ESC}[38;5;167morphan×${df.orphans}${RST}`;
    }
  }

  const jobValue = jobLine ?? "Job: idle";
  jobLine = field(
    "jobs",
    "Job: scan",
    observed(df.jobScanWhy === undefined ? jobValue : undefined, df.jobScanWhy),
  );
  const scan = df.routes?.isOk() === true ? df.routes.value : undefined;
  const routeText =
    scan === undefined || scan.snapshotWhy !== undefined
      ? undefined
      : routeLines(scan.runs, df.sid, scan.unreadable, {
          ...scan.fleet,
          lost: scan.findings?.lost ?? scan.fleet?.lost,
        }).join("\n");
  const routeWhy =
    df.routes?.isErr() === true
      ? df.routes.error
      : (scan?.snapshotWhy ?? "snapshot unavailable");
  let dispatchWarning: string | undefined =
    df.dispatchWarning === undefined
      ? "dispatch warning: none"
      : `${ESC}[38;5;178m${df.dispatchWarning}${RST}`;
  if (df.dispatchWarningWhy !== undefined) dispatchWarning = undefined;
  let recover = recoverHealthBadge(df.recoverHealth, df.recoverHealth?.at);
  if (recover !== undefined) recover = `${ESC}[38;5;167m${recover}${RST}`;
  const recoverValue = recover ?? "recover: none";
  const runLines = [
    field(
      "agx",
      "agx",
      observed(
        routeText === "" ? "agx 0 workers" : routeText,
        routeWhy,
        (scan?.snapshotAgeSecs ?? 0) * 1000,
      ),
    ),
    field(
      "dispatch-warning",
      "dispatch warning",
      observed(dispatchWarning, df.dispatchWarningWhy),
    ),
    field(
      "recover",
      "recover",
      observed(
        df.recoverHealthWhy === undefined ? recoverValue : undefined,
        df.recoverHealthWhy,
        df.recoverHealth === undefined
          ? 0
          : Math.max(
              0,
              Temporal.Now.instant().epochMilliseconds -
                df.recoverHealth.at -
                30000,
            ),
      ),
    ),
  ];
  const [agxSummary = "", ...agxDetails] = (runLines[0] ?? "").split("\n");
  const warningLine =
    (runLines[1]?.trim() ?? "") === "" ? "dispatch warning: none" : runLines[1];
  const recoverLine =
    (runLines[2]?.trim() ?? "") === "" ? "recover: none" : runLines[2];
  const agxBlock = [
    ...agxDetails,
    [agxSummary, warningLine, recoverLine]
      .filter((part) => part !== undefined && part.trim() !== "")
      .join(` ${DIM}·${RST} `),
  ]
    .filter((line) => line !== "")
    .join("\n");

  const rows = {
    prompt: observed(
      `${repoLine === "" ? line1 : joinText(line1, repoLine)}${SEP}${DIM}v${version}${RST}`,
    ),
    identity: observed(
      identityLine === "" ? undefined : identityLine,
      "payload has no session",
    ),
    agent: observed(agentLine),
    rate: observed(rateLine),
    sys: observed(sysLine),
    job: observed(jobLine),
    agx: observed(agxBlock),
    fleet: observed(fleetLine(scan)),
    "dispatch-warning": observed(warningLine),
    recover: observed(recoverLine),
  } satisfies DisplayRows;
  if (options.layout !== undefined) {
    // Transcript snapshots select rows from this render, with the same field resolver and ages.
    if (options.layout === "snapshot")
      return [ctxSegment(df, field), rateLine, sysLine].join("\n");
    const location = rows.prompt.kind === "fresh" ? rows.prompt.value : "";
    const session = [agentLine, identityLine].filter(Boolean).join(SEP);
    const shared = renderRows(rows).split("\n").slice(3).join("\n");
    if (options.layout === "location") return location;
    if (options.layout === "session") return session;
    if (options.layout === "shared") return shared;
    return [location, session, shared].filter(Boolean).join("\n");
  }
  return renderRows(rows);
}
