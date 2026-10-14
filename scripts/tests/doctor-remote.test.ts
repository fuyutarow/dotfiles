import { expect, test } from "bun:test";
import { managedSmartOpenConfigFinding } from "../doctor-remote.ts";

test("managed WSL block without smart-open is FAIL with the repair task", () => {
  const config = [
    "# BEGIN dotfiles-wsl:r99-u26",
    "# WSL-Distro: Ubuntu-26.04",
    "Host r99-u26 r99-u26-code",
    "    HostName 100.110.117.86",
    "    Port 2226",
    "    User fuyu",
    "# END dotfiles-wsl:r99-u26",
  ].join("\n");

  expect(managedSmartOpenConfigFinding("r99-u26", config)).toEqual({
    name: "smart-open",
    verdict: "FAIL",
    detail: "r99-u26 is a managed dotfiles WSL block without Tag smart-open",
    fix: "mise run wsl:repair",
  });
});

test("untagged unmanaged hosts keep the existing SKIP path", () => {
  const config = "Host private-box\n    HostName private.invalid\n";
  expect(managedSmartOpenConfigFinding("private-box", config)).toBeUndefined();
});

test("tagged managed blocks do not produce the stale-tag failure", () => {
  const config = [
    "# BEGIN dotfiles-wsl:r99-u26",
    "# WSL-Distro: Ubuntu-26.04",
    "Host r99-u26 r99-u26-code",
    "    Tag smart-open",
    "    HostName 100.110.117.86",
    "    Port 2226",
    "    User fuyu",
    "# END dotfiles-wsl:r99-u26",
  ].join("\n");
  expect(managedSmartOpenConfigFinding("r99-u26", config)).toBeUndefined();
});
