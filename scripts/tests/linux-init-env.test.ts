import { describe, expect, test } from "bun:test";
import { buildLinuxInitEnv } from "../linux-init-env.ts";

describe("linux:init child environment", () => {
  test("puts runtime and local executable directories first in PATH", () => {
    const home = "/tmp/linux-init-home";
    const env = buildLinuxInitEnv(home, {
      HOME: "/old-home",
      PATH: "/usr/bin:/bin",
      KEEP: "value",
    });

    expect(env).toEqual({
      HOME: home,
      PATH: `${home}/.local/share/dotfiles/runtime/bin:${home}/.local/bin:/usr/bin:/bin`,
      KEEP: "value",
    });
  });
});
