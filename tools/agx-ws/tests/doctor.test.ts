import { expect, test } from "bun:test";
import { doctorFindings, type DoctorWorkspaceRow } from "../src/workspace.ts";

function row(
  verdict: string,
  kind: "ws" | "legacy",
  recorded: boolean,
): DoctorWorkspaceRow {
  return {
    repo: "/fixture/repo",
    dir: "/fixture/repo.ws/ws_work",
    name: "ws_work",
    kind,
    recorded,
    ageMs: 73 * 60 * 60 * 1000,
    classification: {
      verdict,
      collect: ["empty", "landed", "abandoned", "land-temp"].includes(verdict),
      change: "abc",
      age: "4 days",
      reason: "fixture",
    },
  };
}

test("workspace findings omit only timer-eligible classes and retain owner actions", () => {
  for (const verdict of ["empty", "landed"]) {
    expect(doctorFindings([row(verdict, "legacy", false)])).toEqual([]);
    expect(doctorFindings([row(verdict, "ws", true)])).toEqual([]);
    expect(doctorFindings([row(verdict, "ws", false)])).toHaveLength(1);
  }
  for (const kind of ["ws", "legacy"] as const) {
    expect(doctorFindings([row("abandoned", kind, true)]).join("\n")).toContain(
      "\tabandoned\t",
    );
    expect(doctorFindings([row("unlanded", kind, true)]).join("\n")).toContain(
      "\tunlanded-72h\t",
    );
    expect(doctorFindings([row("stale", kind, true)]).join("\n")).toContain(
      "\tstale\t",
    );
    for (const verdict of ["kept", "keep", "land-temp"])
      expect(doctorFindings([row(verdict, kind, true)])).toEqual([]);
  }
});
