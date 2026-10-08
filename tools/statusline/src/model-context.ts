import { ESC, NA_COLOR, RST, pctFmt } from "./ansi.ts";
import type { Dataframe } from "./dataframe.ts";

function tokenLabel(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
function firstNonEmpty(primary: string | undefined, fallback: string): string {
  return primary !== undefined && primary !== "" ? primary : fallback;
}

// Ctx segment: "Ctx: <tokens> NN%". One builder for the bar's agent row and the snapshot.
export function ctxSegment(df: Pick<Dataframe, "ctx" | "ctxPct">): string {
  const label = `${ESC}[38;5;66mCtx:${RST}`;
  const na = `${NA_COLOR}n/a${RST}`;
  // Neither figure in the payload (before the first API response): one n/a, not two.
  if (df.ctx === undefined && df.ctxPct === null) return `${label} ${na}`;
  let seg = `${label} ${df.ctx ?? na}`;
  // No MID here on purpose — see render()'s header note: this is one fact (context usage)
  // shown two ways, not two sibling facts, so a bare space separates them, not the middot.
  if (df.ctxPct !== null && df.ctxPct !== undefined) {
    const { text: pct, col } = pctFmt(df.ctxPct);
    seg += ` ${ESC}[${col}m${pct}%${RST}`;
  } else {
    seg += ` ${na}`;
  }
  return seg;
}

export function modelName(
  display: string | undefined,
  id: string | undefined,
): string {
  let model = display ?? "";
  const modelId = id ?? "";
  // model name (guarantee e.g. "Opus 4.8"): keep display_name if it already has a version,
  // else derive "Family X.Y" from the id (claude-opus-4-8[1m] -> Opus 4.8).
  if (!/[0-9]/u.test(model)) {
    // String.split always returns at least one element, so this is never actually undefined;
    // the fallback is only to satisfy noUncheckedIndexedAccess.
    const base = modelId.replace(/^claude-/u, "").split("[")[0] ?? "";
    const dash = base.indexOf("-");
    const fam = dash === -1 ? base : base.slice(0, dash);
    const ver = (dash === -1 ? "" : base.slice(dash + 1)).replaceAll("-", ".");
    if (fam !== "") {
      const famCap = fam.charAt(0).toUpperCase() + fam.slice(1);
      model = ver !== "" ? `${famCap} ${ver}` : famCap;
    }
  }
  if (model === "") model = "?";
  // Trim the verbose extended-context tag: "Opus 4.8 (1M context)" -> "Opus 4.8 (1M)".
  if (model.endsWith(" context)"))
    model = `${model.slice(0, -" context)".length)})`;
  return model;
}

export function contextLabel(tokens: number | undefined): string | undefined {
  return tokens === undefined ? undefined : tokenLabel(tokens);
}

export { firstNonEmpty };
