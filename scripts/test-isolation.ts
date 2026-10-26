import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { brewPrefix } from "./core-tools.ts";

export const TEST_TMPDIR = realpathSync(tmpdir());
export const TEST_HOST_PATH = [
  join(brewPrefix(), "bin"),
  join(brewPrefix(), "sbin"),
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
].join(delimiter);

export const HOMEBREW_AGX =
  Bun.which("agx", { PATH: TEST_HOST_PATH }) ?? undefined;

export function testPathWithStub(stubBin: string): string {
  return [stubBin, TEST_HOST_PATH].join(delimiter);
}

export function isolatedTestEnv(
  home: string,
  path: string,
  additions: Record<string, string> = {},
): Record<string, string> {
  return {
    HOME: home,
    PATH: path,
    TMPDIR: TEST_TMPDIR,
    XDG_CONFIG_HOME: join(home, ".config"),
    LANG: "en_US.UTF-8",
    LC_ALL: "en_US.UTF-8",
    TZ: "UTC",
    ...additions,
  };
}
