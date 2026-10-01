// Paths a jj change touches, from `jj diff --summary` (used by jj-commit.ts).
// `jj diff --summary` lines: "M a/b", "A a/b", "D a/b", "R a/{x => y}/b" (or "R {a => b}" when the
// whole path differs), "C …" for a copy (its source is unchanged, so only the destination counts).
export function summaryPaths(summary: string): string[] {
  const out: string[] = [];
  for (const line of summary.split("\n")) {
    const m = /^([A-Z]) (.+)$/.exec(line);
    if (!m) continue;
    const [, kind, spec] = m as unknown as [string, string, string];
    const brace = /^(.*)\{(.*) => (.*)\}(.*)$/.exec(spec);
    if (!brace) {
      out.push(spec);
      continue;
    }
    const [, pre, from, to, post] = brace as unknown as [string, string, string, string, string];
    const join = (mid: string) => `${pre}${mid}${post}`.replace(/\/{2,}/g, "/").replace(/^\//, "");
    if (kind === "R") out.push(join(from));
    out.push(join(to));
  }
  return out;
}
