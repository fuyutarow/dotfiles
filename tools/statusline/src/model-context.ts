import { ESC, RST, pctFmt } from "./ansi.ts";
import type { Dataframe } from "./dataframe.ts";
import { fieldDisplay, observed, type FieldDisplay } from "./field-state.ts";

function tokenLabel(n: number): string {
  const rounded = Number(n.toPrecision(3));
  if (rounded >= 1_000_000) return `${(rounded / 1_000_000).toPrecision(3)}M`;
  if (rounded >= 1000) return `${(rounded / 1000).toPrecision(3)}k`;
  return String(rounded);
}
function firstNonEmpty(primary: string | undefined, fallback: string): string {
  return primary !== undefined && primary !== "" ? primary : fallback;
}

// Ctx segment: "Ctx: <tokens> NN%". One builder for the bar's agent row and the snapshot.
export function ctxSegment(
  df: Pick<Dataframe, "ctx" | "ctxPct" | "ctxWindow" | "fields">,
  field: FieldDisplay = fieldDisplay(df.fields),
): string {
  const label = `${ESC}[38;5;66mCtx:${RST}`;
  // Neither figure in the payload (before the first API response): one n/a, not two.
  const tokens = field(
    "context-tokens",
    "",
    observed(df.ctx, "input has no context token count"),
  );
  let seg = `${label} ${tokens}`;
  // No MID here on purpose — see render()'s header note: this is one fact (context usage)
  // shown two ways, not two sibling facts, so a bare space separates them, not the middot.
  if (df.ctxPct !== null && df.ctxPct !== undefined) {
    const { text: pct, col } = pctFmt(df.ctxPct);
    const percentage = field(
      "context-percent",
      "context",
      observed(`${ESC}[${col}m${pct}%${RST}`),
    );
    if (df.ctxWindow !== undefined && df.ctx !== undefined) {
      seg = `${label} ${percentage} (${tokens}/${tokenLabel(df.ctxWindow)})`;
    } else {
      const suffix =
        df.ctxWindow === undefined ? "" : `/${df.ctxWindow / 1000}k`;
      seg += ` ${percentage}${suffix}`;
    }
  } else {
    seg += ` ${field("context-percent", "", observed(undefined, "input has no context percentage"))}`;
  }
  return seg;
}

export function modelName(
  display: string | undefined,
  id: string | undefined,
): string {
  let model = firstNonEmpty(display, id ?? "");
  const modelId = id ?? model;
  const claude =
    /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)(?:-\d{8})?(\[1m\])?$/u.exec(model);
  if (claude !== null) {
    const family = claude[1] ?? "";
    model = `${family.charAt(0).toUpperCase()}${family.slice(1)} ${claude[2]}.${claude[3]}${claude[4] === undefined ? "" : " (1M)"}`;
  }
  if (model.startsWith("gpt-")) {
    model = model
      .replace(/^gpt-/u, "GPT-")
      .replaceAll(
        /-([a-z])/gu,
        (_match: string, letter: string) => `-${letter.toUpperCase()}`,
      );
  }
  // model name (guarantee e.g. "Opus 4.8"): keep display_name if it already has a version,
  // else derive "Family X.Y" from the id (claude-opus-4-8[1m] -> Opus 4.8).
  if (!/[0-9]/u.test(model) && modelId.startsWith("claude-")) {
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
