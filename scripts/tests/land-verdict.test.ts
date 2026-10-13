import { expect, test } from "bun:test";
import {
  foreignWip,
  landExit,
  landSummary,
  ledgerAcceptances,
  lifecycleJudgments,
} from "../land-verdict.ts";

test("land verdict covers only its commit and push", () => {
  const report = { commit: "ok", push: "ok" } satisfies Parameters<
    typeof landExit
  >[0];
  expect(landExit(report)).toBe(0);
  expect(landSummary(report, "abc")).toContain("landed and pushed");
  expect(landExit({ commit: "failed", push: "pending" })).toBe(1);
  expect(landExit({ commit: "ok", push: "failed" })).toBe(1);
});

test("lifecycle judged events map accept and reject decisions to run judgments", () => {
  expect(
    lifecycleJudgments([
      JSON.stringify({
        type: "judged",
        run_id: "accepted-run",
        decision: "accept",
        at: "2026-10-13T08:25:10.000Z",
      }),
      JSON.stringify({
        type: "judged",
        run_id: "rejected-run",
        decision: "reject",
        at: "2026-10-13T08:26:10.000Z",
      }),
      JSON.stringify({ type: "judged", run_id: "invalid", decision: "maybe" }),
    ]),
  ).toEqual([
    {
      run_id: "accepted-run",
      accept: true,
      at: "2026-10-13T08:25:10.000Z",
      order: 0,
    },
    {
      run_id: "rejected-run",
      accept: false,
      at: "2026-10-13T08:26:10.000Z",
      order: 1,
    },
  ]);
});

test("only a valid machine refusal classifies foreign WIP", () => {
  expect(
    foreignWip('FATAL: uncommitted render inputs: ["file"]'),
  ).toBeUndefined();
  expect(
    foreignWip(
      'DOTFILES_RENDER_REFUSAL_V1={"reason":"foreign-wip","paths":["a","b"]}',
    ),
  ).toEqual(["a", "b"]);
  expect(
    foreignWip(
      'DOTFILES_RENDER_REFUSAL_V1={"reason":"foreign-wip","paths":[]}',
    ),
  ).toBeUndefined();
});

test("ledger acceptance extraction ignores run rows without a final judgment", () => {
  expect(
    ledgerAcceptances([
      JSON.stringify({ kind: "run", run_id: "stopped", outcome: "stopped" }),
      JSON.stringify({ kind: "acceptance", run_id: "accepted", accept: true }),
      "not json",
      JSON.stringify({ kind: "acceptance", run_id: "rejected", accept: false }),
    ]),
  ).toEqual([
    { run_id: "accepted", accept: true, order: 1 },
    { run_id: "rejected", accept: false, order: 3 },
  ]);
});
