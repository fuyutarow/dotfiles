import { describe, expect, test } from "bun:test";
import { parseDaemonStatus } from "../src/ccc-daemon-status.ts";

describe("parseDaemonStatus", () => {
  test("recognizes the observed empty daemon and an empty list", () => {
    expect(
      parseDaemonStatus(
        "Daemon version: 0.2.42\nUptime: 3610.4s\nIdle: 0.0s (timeout: 180m)\nNo projects loaded.\n",
      ),
    ).toEqual({ kind: "empty" });
    expect(parseDaemonStatus("Daemon version: 0.2.42\nProjects:\n")).toEqual({
      kind: "empty",
    });
  });
  test("reads indented and unindented projects and their states", () => {
    expect(
      parseDaemonStatus(
        "Daemon version: 0.2.42\nIdle: 0.0s (timeout: 180m)\nProjects:\n  /home/fuyu/Workspace/soks [idle]\n/work tree [indexing]\n",
      ),
    ).toEqual({
      kind: "projects",
      projects: [
        { path: "/home/fuyu/Workspace/soks", state: "idle" },
        { path: "/work tree", state: "indexing" },
      ],
    });
  });
  test("preserves unrecognized text, including malformed list entries", () => {
    for (const text of [
      "garbage",
      "",
      "Projects:\n  /foo indexing\n",
      "No projects loaded.\nProjects:\n",
    ]) {
      expect(parseDaemonStatus(text)).toEqual({ kind: "unrecognized", text });
    }
  });
});
