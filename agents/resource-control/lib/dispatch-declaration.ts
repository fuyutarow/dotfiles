import { isAbsolute } from "node:path";

export const RESOURCE_DECLARATION_HELP =
  "exactly one `RESOURCE-CLASS(NONCOMPUTE): <why>` or " +
  "`RESOURCE-ENVELOPE(/absolute/path.json): agent-resource-run only`";

export type ResourceDeclaration =
  | { kind: "noncompute"; reason: string }
  | { kind: "envelope"; path: string };

export type ResourceDeclarationResult =
  | { ok: true; declaration: ResourceDeclaration }
  | { ok: false; reason: string };

export function resourceDeclarationResult(
  text: string,
): ResourceDeclarationResult {
  const tokens = text.match(/RESOURCE-(?:CLASS|ENVELOPE)\s*\(/gi) ?? [];
  if (tokens.length !== 1) {
    return {
      ok: false,
      reason: `found ${tokens.length} resource declaration token(s); require ${RESOURCE_DECLARATION_HELP}`,
    };
  }

  const noncompute =
    /RESOURCE-CLASS\s*\(\s*NONCOMPUTE\s*\)\s*:\s*([^\r\n]+)/i.exec(text);
  if (noncompute !== null) {
    const reason = noncompute[1]?.trim() ?? "";
    if (reason.replace(/[\s*/'"`]/g, "") !== "") {
      return { ok: true, declaration: { kind: "noncompute", reason } };
    }
    return {
      ok: false,
      reason: `NONCOMPUTE needs a non-empty reason; require ${RESOURCE_DECLARATION_HELP}`,
    };
  }

  const envelope =
    /RESOURCE-ENVELOPE\s*\(([^)\r\n]+)\)\s*:\s*agent-resource-run only(?:\s|$)/i.exec(
      text,
    );
  if (envelope !== null) {
    const path = envelope[1]?.trim() ?? "";
    if (isAbsolute(path)) {
      return { ok: true, declaration: { kind: "envelope", path } };
    }
    return {
      ok: false,
      reason: `resource envelope path must be absolute; require ${RESOURCE_DECLARATION_HELP}`,
    };
  }

  return {
    ok: false,
    reason: `resource declaration is malformed; require ${RESOURCE_DECLARATION_HELP}`,
  };
}
