import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { checkCodexRoute, managedWslConfigFinding } from "../doctor-remote.ts";

const PROBE_FIXTURE = join(import.meta.dir, "fixtures/remote-agx-probe.ts");

function fixtureRunner(
  mode: "pass" | "fail" | "missing-agx",
  seen: string[][],
) {
  return (cmd: readonly string[], _input: string | null, _ms: number) => {
    seen.push([...cmd]);
    const proc = spawnSync(process.execPath, [PROBE_FIXTURE, mode], {
      encoding: "utf8",
    });
    return Promise.resolve({
      code: proc.status ?? -1,
      out: proc.stdout,
      err: proc.stderr,
      timedOut: false,
    });
  };
}

test("Codex route delegates to the remote pinned agx probe and renders success", async () => {
  const seen: string[][] = [];
  const result = await checkCodexRoute("r99-u26", fixtureRunner("pass", seen));
  expect(seen).toEqual([
    [
      "ssh",
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=15",
      "r99-u26",
      'mise -C ~/dotfiles exec -- agx worker probe --vendor codex --sandbox workspace-write --cd "$HOME" --timeout-ms 30000 --json',
    ],
  ]);
  expect(result).toEqual({
    name: "codex-route",
    verdict: "PASS",
    detail: "agx worker probe completed successfully (workspace-write)",
  });
});

test("Codex route renders an agx failure as FAIL with its diagnostic", async () => {
  const result = await checkCodexRoute("r99-u26", fixtureRunner("fail", []));
  expect(result).toEqual({
    name: "codex-route",
    verdict: "FAIL",
    detail:
      "agx worker probe outcome failed (exit 1): Codex diagnostic failed; unshare: Operation not permitted",
    fix: 'on r99-u26: verify the Codex sandbox prerequisites and ~/.config/agx/host.toml; rerun mise -C ~/dotfiles exec -- agx worker probe --vendor codex --sandbox workspace-write --cd "$HOME" --timeout-ms 30000 --json',
  });
});

test("missing remote agx is FAIL with an installation repair", async () => {
  const result = await checkCodexRoute(
    "r99-u26",
    fixtureRunner("missing-agx", []),
  );
  expect(result).toEqual({
    name: "codex-route",
    verdict: "FAIL",
    detail:
      "remote agx probe is unavailable (exit 127): mise: command not found",
    fix: "on r99-u26: run mise run linux:init in ~/dotfiles, then verify mise -C ~/dotfiles exec -- agx worker probe --help",
  });
});

test("invalid or successful-but-nonzero probe output cannot become PASS", async () => {
  expect(
    await checkCodexRoute("r99-u26", () =>
      Promise.resolve({
        code: 0,
        out: "not JSON",
        err: "",
        timedOut: false,
      }),
    ),
  ).toMatchObject({
    verdict: "FAIL",
    detail: "agx worker probe returned no valid JSON (exit 0): not JSON",
  });
  expect(
    await checkCodexRoute("r99-u26", () =>
      Promise.resolve({
        code: 1,
        out: '{"schema":1,"vendor":"codex","outcome":"success"}',
        err: "",
        timedOut: false,
      }),
    ),
  ).toMatchObject({
    verdict: "FAIL",
    detail: "agx worker probe outcome success (exit 1): no diagnostic",
  });
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
