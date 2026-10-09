import { DIM, ESC, RST, naSegment } from "./ansi.ts";
import { promptParts, type PromptParts } from "./prompt-stamp.ts";
import type { Dataframe } from "./dataframe.ts";
import { ctxSegment } from "./model-context.ts";
import { rateRow } from "./rate-limits.ts";
import { admittedJobSegment } from "./jobs.ts";
import { routeLines } from "./dispatch-runs.ts";
import { sysRow } from "./host-load.ts";

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
// is Sys — host CPU/RAM/VRAM, distinct from Rate's API budget — and Line 6 (conditional: only
// when a job is admitted, an orphan lives, or the scan failed) is Job; each is always its own row
// so neither can ever be silently dropped by a missing sibling value.
// Rate row, 5h window: "5h NN% [⟳reset]". The three window segments carry no separator of their
// The PS1 head in PS1's own colors (%F{magenta}%n@%F{yellow}%m:%F{cyan}date|%F{green}%~). The
// uncolored shape has one home, hooks/prompt-stamp.ts, shared with the /quote header.
// Its stamp is render time = "as of" for every value on screen. settings.json's
// statusLine.refreshInterval (5s) re-renders an idle pane, so a stamp more than a minute
// behind the clock means a stuck render. Minutes only, like PS1 — seconds were tried and
// rejected as noise (2026-09-27).
export function coloredHead(p: PromptParts): string {
  return (
    `${ESC}[35m${p.user}${RST}@${ESC}[33m${p.host}${RST}:` +
    `${ESC}[36m${p.when}${ESC}[38;5;240m${p.zone}${RST}|${ESC}[32m${p.cwd}${RST}`
  );
}
export function render(df: Dataframe): string {
  const joinText = (t: string, seg: string) => (t !== "" ? t + SEP : "") + seg;

  const line1 = coloredHead(promptParts(df.cwd));

  let identityLine = "";
  if (df.email !== null && df.email !== undefined)
    identityLine = joinText(identityLine, `${ESC}[38;5;103m${df.email}${RST}`);
  else if (df.accountWhy !== undefined && df.accountWhy !== "")
    identityLine = joinText(identityLine, naSegment("account", df.accountWhy));
  if (df.sid !== null && df.sid !== undefined)
    identityLine = joinText(
      identityLine,
      `${ESC}[38;5;103mSession:${RST} ${DIM}${df.sid}${RST}`,
    );

  let agentLine = "";
  if (df.sessionName !== null && df.sessionName !== undefined)
    agentLine = joinText(agentLine, `${ESC}[38;5;214m${df.sessionName}${RST}`);
  else if (df.sessionNameWhy !== undefined && df.sessionNameWhy !== "")
    agentLine = joinText(agentLine, naSegment("name", df.sessionNameWhy));
  agentLine = joinText(agentLine, `${ESC}[38;5;30m${df.model}${RST}`);
  if (df.effort !== undefined && df.effort !== "") {
    agentLine += `${SEP}${ESC}[38;5;209m${df.effort}${RST}`;
    // Tailwind violet-500 (#8b5cf6), matched 2026-09-11 against Claude Code's own /effort
    // slider "ultracode" label. truecolor (38;2;r;g;b), not the 256-palette used elsewhere in
    // this file: the palette's nearest steps (ANSI 93/129/135/141) were all visibly off.
    if (df.wfOn) agentLine += `${ESC}[38;2;139;92;246m+WF${RST}`;
  }
  // Always rendered, one distinct form per state (see rcState()): an absent segment would make
  // "disconnected" and "probe broken" look identical, which is the ambiguity this exists to
  // remove. 🔗 stays unstyled — an emoji does not reliably repaint under an fg override.
  if (df.rc === "on") agentLine += `${SEP}🔗`;
  else if (df.rc === "off") agentLine += `${SEP}${DIM}rc:off${RST}`;
  else agentLine += `${SEP}${ESC}[38;5;178mrc:?${RST}`;

  agentLine = joinText(agentLine, ctxSegment(df));

  const rateLine = rateRow(df);

  let repoLine = "";
  if (df.branch !== undefined && df.branch !== "")
    repoLine = joinText(repoLine, `${ESC}[38;5;96m${BR} ${df.branch}${RST}`);
  else if (df.branchWhy !== undefined && df.branchWhy !== "")
    repoLine = joinText(repoLine, `${BR} ${naSegment("branch", df.branchWhy)}`);
  repoLine = joinText(
    repoLine,
    df.add === undefined || df.del === undefined
      ? naSegment("diff", "payload has no cost block")
      : `${ESC}[38;5;178m(+${df.add},-${df.del})${RST}`,
  );
  if (df.wt !== undefined && df.wt !== "")
    repoLine = joinText(repoLine, `${ESC}[38;5;140mwt: ${df.wt}${RST}`);

  // Always present: every reading in it is either a value or an explicit n/a.
  const sysLine = sysRow(df); // the Dataframe carries the HostLoad fields under the same names

  let jobLine: string | undefined;
  if (df.jobScanWhy !== undefined) {
    // The process scan failed, so "no jobs" would be a guess; say the scan failed instead.
    jobLine = `${ESC}[38;5;173mJob:${RST} ${naSegment("scan", df.jobScanWhy)}`;
  } else if (df.jobs.length > 0 || df.orphans > 0) {
    jobLine = `${ESC}[38;5;173mJob:${RST}`;
    if (df.jobs.length > 0) {
      jobLine += admittedJobSegment(df.jobs, df.orphans);
    } else {
      // Orphan processes alive with nothing admitted: waiting, wedged, or leaked — all three
      // are states the harness reports as "idle", which is the failure this segment answers.
      jobLine += ` ${DIM}—${RST} ${ESC}[38;5;167morphan×${df.orphans}${RST}`;
    }
  }

  // Run rows: present while agx has workers (or stale markers); n/a when unreadable.
  let runLines: string[] = [];
  if (df.routes !== undefined && df.routes.isErr())
    runLines = [naSegment("agx", df.routes.error)];
  else if (df.routes !== undefined)
    runLines = routeLines(df.routes.value, df.sid);
  if (df.dispatchWarning !== undefined)
    runLines.push(`${ESC}[38;5;178m${df.dispatchWarning}${RST}`);

  return [
    joinText(line1, repoLine),
    identityLine,
    agentLine,
    rateLine,
    sysLine,
    jobLine,
    ...runLines,
  ]
    .flatMap((r) => (r !== undefined && r !== "" ? [r] : [])) // drops undefined and "" without an `r is string` guard
    .join("\n");
}
