import { expect, test } from "bun:test";
import {
  codexRouteFinding,
  managedWslConfigFinding,
} from "../doctor-remote.ts";

test("codex route passes when Codex starts in its default sandbox", () => {
  expect(
    codexRouteFinding("r99-u26", {
      code: 0,
      out: "",
      err: "",
      timedOut: false,
    }),
  ).toEqual({
    name: "codex-route",
    verdict: "PASS",
    detail: "codex exec starts with the workspace-write sandbox",
  });
});

test("codex route reports sandbox startup failures", () => {
  expect(
    codexRouteFinding("r99-u26", {
      code: 1,
      out: "",
      err: "unshare: Operation not permitted",
      timedOut: false,
    }),
  ).toEqual({
    name: "codex-route",
    verdict: "FAIL",
    detail:
      "codex exec --sandbox workspace-write could not start (exit 1): unshare: Operation not permitted",
    fix: "on r99-u26: verify the Codex sandbox prerequisites; only if the host itself is the isolation boundary, declare that in ~/.config/agx/host.toml",
  });
});

test("codex route sends authentication failures to the login repair", () => {
  expect(
    codexRouteFinding("r99-u26", {
      code: 1,
      out: "",
      err: "not logged in",
      timedOut: false,
    }).fix,
  ).toBe("from the Mac: mise run auth:push -- r99-u26");
});

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
