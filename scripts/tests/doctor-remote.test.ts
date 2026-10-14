import { expect, test } from "bun:test";
import { managedWslConfigFinding } from "../doctor-remote.ts";

test("managed WSL block without its -code alias is FAIL with the repair task", () => {
  const config = [
    "# BEGIN dotfiles-wsl:r99-u26",
    "# WSL-Distro: Ubuntu-26.04",
    "Host r99-u26",
    "    Tag smart-open",
    "    HostName localhost",
    "    Port 2226",
    "    User fuyu",
    "    ProxyJump r99",
    "# END dotfiles-wsl:r99-u26",
  ].join("\n");

  expect(managedWslConfigFinding("r99-u26", config)).toEqual({
    name: "wsl-config",
    verdict: "FAIL",
    detail:
      "r99-u26 is a managed dotfiles WSL block missing r99-u26-code alias",
    fix: "mise run wsl:repair",
  });
});

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

  expect(managedWslConfigFinding("r99-u26", config)).toEqual({
    name: "wsl-config",
    verdict: "FAIL",
    detail: "r99-u26 is a managed dotfiles WSL block missing Tag smart-open",
    fix: "mise run wsl:repair",
  });
});

test("doctor names every missing piece of the managed block", () => {
  const config = [
    "# BEGIN dotfiles-wsl:r99-u26",
    "# WSL-Distro: Ubuntu-26.04",
    "Host r99-u26",
    "    HostName localhost",
    "    Port 2226",
    "# END dotfiles-wsl:r99-u26",
  ].join("\n");

  expect(managedWslConfigFinding("r99-u26", config)).toEqual({
    name: "wsl-config",
    verdict: "FAIL",
    detail:
      "r99-u26 is a managed dotfiles WSL block missing r99-u26-code alias, Tag smart-open",
    fix: "mise run wsl:repair",
  });
});

test("untagged unmanaged hosts keep the existing SKIP path", () => {
  const config = "Host private-box\n    HostName private.invalid\n";
  expect(managedWslConfigFinding("private-box", config)).toBeUndefined();
});

test("normalized managed blocks do not produce a repair failure", () => {
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
  expect(managedWslConfigFinding("r99-u26", config)).toBeUndefined();
});
