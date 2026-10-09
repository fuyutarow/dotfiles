import { expect, test } from "bun:test";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  dispatchStateDir,
  dispatchStateReadDirs,
} from "../src/dispatch-state.ts";

test("default dispatch state reads include both migration locations", () => {
  const base = join(homedir(), ".local/state");
  expect(dispatchStateDir({})).toBe(join(base, "agx"));
  expect(dispatchStateReadDirs({})).toEqual([
    join(base, "agx"),
    join(base, "agent-router"),
  ]);
});

test("XDG state roots preserve current-first migration order", () => {
  const env = { XDG_STATE_HOME: "/fixture/state", AGX_STATE_DIR: "" };
  expect(dispatchStateReadDirs(env)).toEqual([
    "/fixture/state/agx",
    "/fixture/state/agent-router",
  ]);
});

test("an explicit dispatch directory isolates reads from migration paths", () => {
  const env = {
    AGX_STATE_DIR: "/fixture/isolated",
    XDG_STATE_HOME: "/fixture/state",
  };
  expect(dispatchStateDir(env)).toBe("/fixture/isolated");
  expect(dispatchStateReadDirs(env)).toEqual(["/fixture/isolated"]);
});
