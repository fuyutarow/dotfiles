import { expect, test } from "bun:test";
import { buildDetachedLaunch } from "../src/detach.ts";

test("both OS launch vectors explicitly carry the captured dispatcher session", () => {
  for (const platform of ["linux", "darwin"] satisfies ("linux" | "darwin")[]) {
    const launch = buildDetachedLaunch({
      platform,
      unit: "agx-fixture",
      cwd: "/tmp",
      command: ["bun", "agx.ts"],
      logDir: "/tmp",
      env: {
        CLAUDE_CODE_SESSION_ID: "caller",
        AGX_DISPATCHER_SESSION: "captured-caller",
      },
    });
    expect(launch.args).toContain(
      platform === "linux"
        ? "--setenv=AGX_DISPATCHER_SESSION=captured-caller"
        : "AGX_DISPATCHER_SESSION=captured-caller",
    );
    expect(launch.args).toContain(
      platform === "linux"
        ? "--setenv=CLAUDE_CODE_SESSION_ID=caller"
        : "CLAUDE_CODE_SESSION_ID=caller",
    );
  }
});
