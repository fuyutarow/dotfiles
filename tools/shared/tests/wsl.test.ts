import { expect, test } from "bun:test";
import { isWslDistro } from "../src/wsl.ts";

const wslKernel = "6.18.58.1-microsoft-standard-WSL2";

test("a WSL distribution is the WSL kernel plus WSL's own runtime directory", () => {
  expect(isWslDistro(wslKernel, true)).toBe(true);
  // WSL1 spelled it with a capital.
  expect(isWslDistro("4.4.0-19041-Microsoft", true)).toBe(true);
});

test("a container on the WSL kernel is not a WSL distribution", () => {
  // Measured in `wslc run ubuntu:24.04`: same kernel name, no /run/WSL.
  expect(isWslDistro(wslKernel, false)).toBe(false);
});

test("another kernel is not WSL, whatever else is present", () => {
  expect(isWslDistro("6.8.0-generic", true)).toBe(false);
  expect(isWslDistro("24.6.0", false)).toBe(false);
});

test("the answer needs no session environment, so an SSH shell agrees", () => {
  // Callers used to consult WSL_DISTRO_NAME, which sshd and systemd units do not carry.
  const saved = process.env["WSL_DISTRO_NAME"];
  delete process.env["WSL_DISTRO_NAME"];
  const without = isWslDistro();
  process.env["WSL_DISTRO_NAME"] = "anything";
  const withName = isWslDistro();
  if (saved === undefined) delete process.env["WSL_DISTRO_NAME"];
  else process.env["WSL_DISTRO_NAME"] = saved;
  expect(withName).toBe(without);
});
