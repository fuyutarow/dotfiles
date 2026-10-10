import { describe, expect, test } from "bun:test";
import { buildLinuxInitEnv } from "../linux-init-env.ts";

describe("linux:init child environment", () => {
  test("puts declared Homebrew ahead of legacy executable directories", () => {
    const home = "/tmp/linux-init-home";
    const env = buildLinuxInitEnv(
      home,
      {
        HOME: "/old-home",
        PATH: "/usr/bin:/bin",
        KEEP: "value",
      },
      "/home/linuxbrew/.linuxbrew",
    );

    expect(env).toEqual({
      HOME: home,
      PATH: `/home/linuxbrew/.linuxbrew/bin:/home/linuxbrew/.linuxbrew/sbin:/home/linuxbrew/.linuxbrew/opt/rustup/bin:${home}/.local/bin:${home}/.bun/bin:/usr/bin:/bin`,
      KEEP: "value",
    });
  });
});
