import { Candidate } from "../../src/model.ts";
import type { Target } from "../../src/targets/index.ts";

export function candidate(
  id: string,
  verdict: Candidate["verdict"] = "RECLAIM",
): Candidate {
  return {
    id,
    path: `/tmp/reclaim-fixture/${id}`,
    verdict,
    reason: verdict,
    checks: [
      {
        name: "safe",
        ok: verdict === "ASK" ? null : verdict === "RECLAIM",
        detail: "fixture",
      },
    ],
    bytes: 100,
    bytes_kind: "estimate",
    action: { kind: "delete", argv: [] },
    result: null,
  };
}
export function fakeTarget(
  options: {
    name?: string;
    candidates?: Candidate[];
    flip?: boolean;
    failIds?: string[];
    available?: boolean;
    tier?: Target["tier"];
  } = {},
) {
  const acted: string[] = [];
  const target: Target = {
    name: options.name ?? "fake",
    tier: options.tier ?? "blind",
    available: () => ({
      available: options.available ?? true,
      skip_reason: options.available === false ? "missing tool" : null,
    }),
    plan: (ctx) =>
      (
        options.candidates ?? [
          candidate("delete"),
          candidate("keep", "KEEP"),
          candidate("ask", "ASK"),
        ]
      ).map((c) =>
        ctx.mode === "run" && options.flip === true
          ? candidate(c.id, "KEEP")
          : structuredClone(c),
      ),
    act: (c) => {
      acted.push(c.id);
      return options.failIds?.includes(c.id) === true
        ? { ok: false, bytes_freed: 0, error: "fixture failure" }
        : { ok: true, bytes_freed: 100, error: null };
    },
  };
  return { target, acted };
}
