// Paths a jj change touches, from `jj diff --summary` (used by jj-commit.ts).
// `jj diff --summary` lines: "M a/b", "A a/b", "D a/b", "R a/{x => y}/b" (or "R {a => b}" when the
// whole path differs), "C …" for a copy (its source is unchanged, so only the destination counts).
export function summaryPaths(summary: string): string[] {
  const out: string[] = [];
  for (const line of summary.split("\n")) {
    const m = /^([A-Z]) (.+)$/u.exec(line);
    if (m === null) continue;
    const [, kind = "", spec = ""] = m;
    const brace = /^(.*)\{(.*) => (.*)\}(.*)$/u.exec(spec);
    if (brace === null) {
      out.push(spec);
      continue;
    }
    const [, pre = "", from = "", to = "", post = ""] = brace;
    const join = (mid: string) => `${pre}${mid}${post}`.replaceAll(/\/{2,}/gu, "/").replace(/^\//u, "");
    if (kind === "R") out.push(join(from));
    out.push(join(to));
  }
  return out;
}
