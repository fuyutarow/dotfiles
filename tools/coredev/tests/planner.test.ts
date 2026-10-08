import { describe, expect, test } from "bun:test";
import { readApprovedHost } from "../src/hosts.ts";
import { buildPlan, renderDryRun } from "../src/planner.ts";

describe("coredev planner", () => {
  test("composes profile steps in prerequisite order", () => {
    const planResult = buildPlan("desk", "wsl", ["wsl"]);
    expect(planResult.isOk()).toBe(true);
    if (planResult.isErr()) return;
    const plan = planResult.value;
    expect(plan.steps.map((step) => step.id)).toEqual([
      "runtime",
      "c-toolchain",
      "tools",
      "links",
      "login-shell",
      "credentials",
      "sccache",
      "herdr-server",
      "soks-govern",
      "wsl-services",
    ]);
    expect(plan.steps[2]?.adapter).toBe("wsl-tools");
    expect(
      plan.steps.find((step) => step.id === "login-shell")?.prerequisites,
    ).toEqual(["links"]);
    expect(
      plan.steps.find((step) => step.id === "herdr-server")?.prerequisites,
    ).toEqual(["login-shell"]);
  });

  test("places credentials after links and the C toolchain before tools", () => {
    const result = buildPlan("box", "linux");
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const ids = result.value.steps.map((step) => step.id);
    expect(ids.indexOf("c-toolchain")).toBeLessThan(ids.indexOf("tools"));
    expect(ids.indexOf("links")).toBeLessThan(ids.indexOf("credentials"));
    expect(
      result.value.steps.find((step) => step.id === "credentials")
        ?.prerequisites,
    ).toEqual(["links"]);
  });

  test("orders sccache after c-toolchain and soks-govern after credentials", () => {
    const result = buildPlan("box", "linux");
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    const ids = result.value.steps.map((step) => step.id);
    expect(ids.indexOf("c-toolchain")).toBeLessThan(ids.indexOf("sccache"));
    expect(ids.indexOf("c-toolchain")).toBeLessThan(ids.indexOf("soks-govern"));
    expect(ids.indexOf("credentials")).toBeLessThan(ids.indexOf("soks-govern"));
    expect(
      result.value.steps.find((step) => step.id === "soks-govern")
        ?.prerequisites,
    ).toEqual(["c-toolchain", "credentials"]);
  });

  test("overlay deterministically replaces duplicate step ids", () => {
    const planResult = buildPlan("macbook", "mac", ["mac"]);
    expect(planResult.isOk()).toBe(true);
    if (planResult.isErr()) return;
    const plan = planResult.value;
    expect(plan.steps.filter((step) => step.id === "tools")).toHaveLength(1);
    expect(plan.steps.find((step) => step.id === "tools")?.adapter).toBe(
      "mac-tools",
    );
  });

  test("refuses invalid target and overlay combinations", () => {
    const mac = buildPlan("linux-box", "linux", ["mac"]);
    const wsl = buildPlan("macbook", "mac", ["wsl"]);
    expect(mac.isErr() && mac.error.message).toContain(
      "+mac requires a mac target",
    );
    expect(wsl.isErr() && wsl.error.message).toContain(
      "+wsl requires a wsl target",
    );
  });

  test("prints stable dry-run labels without secret material", () => {
    const result = buildPlan("desk", "wsl", ["wsl"]);
    expect(result.isOk()).toBe(true);
    if (result.isErr()) return;
    expect(renderDryRun(result.value)).toBe(
      [
        "target desk (wsl)",
        "runtime | wsl | probe:runtime-present | action:ensure-runtime | verify:runtime-version",
        "c-toolchain | wsl | probe:cc-make-pkg-config-present | action:apt-install-build-essential-pkg-config | verify:cc-make-pkg-config-present",
        "tools | wsl | probe:wsl-tools-present | action:install-wsl-tools | verify:wsl-tools",
        "links | wsl | probe:dotfiles-linked | action:realize-dotfiles | verify:dotfiles-check",
        "login-shell | wsl | probe:passwd-zsh-listed-in-shells | action:sudo-chsh-zsh | verify:passwd-zsh-listed-in-shells",
        "credentials | wsl | probe:configured-transfers-present | action:push-configured-credentials | verify:configured-transfers-present",
        "sccache | wsl | probe:real-sccache-on-path | action:install-sccache-runtime-bin | verify:real-sccache-on-path",
        "herdr-server | wsl | probe:herdr-server-shell-current | action:stop-stale-herdr-servers | verify:no-stale-herdr-server",
        "soks-govern | wsl | probe:soks-govern-version | action:clone-and-cargo-install-soks-govern | verify:soks-govern-version",
        "wsl-services | wsl | probe:services-ready | action:enable-wsl-services | verify:wsl-services",
      ].join("\n"),
    );
  });

  test("fails closed when a host is absent from the registry", () => {
    const host = readApprovedHost(
      "missing",
      "/definitely-not-a-coredev-host-registry.toml",
    );
    expect(host.isErr()).toBe(true);
  });
});
