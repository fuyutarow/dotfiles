import { describe, expect, test } from "bun:test";
import {
  changeLoginShell,
  probeHerdrServer,
  probeLoginShell,
  stopStaleHerdrServers,
  verifyLoginShell,
  verifyHerdrServer,
  type HerdrDependencies,
} from "../src/login-shell.ts";

const shells = "/bin/bash\n/usr/bin/zsh\n";

describe("coredev login shell", () => {
  test("accepts a zsh passwd shell listed in /etc/shells", () => {
    const result = probeLoginShell("fuyu", {
      readPasswdShell: () => "/usr/bin/zsh",
      readShells: () => shells,
    });
    expect(result).toEqual({
      status: "satisfied",
      reason: "login shell is /usr/bin/zsh",
    });
  });

  test("reports a bash shell and runs chsh with the listed zsh", () => {
    const dependencies = {
      readPasswdShell: () => "/bin/bash",
      readShells: () => shells,
      runCommand: (args: readonly string[]) => commands.push(args),
    };
    const commands: (readonly string[])[] = [];
    expect(probeLoginShell("fuyu", dependencies)).toEqual({
      status: "not-satisfied",
      reason:
        "current shell is /bin/bash; run `sudo chsh -s /usr/bin/zsh $USER`",
    });
    expect(changeLoginShell("fuyu", dependencies)).toEqual({ ok: true });
    expect(commands).toEqual([["sudo", "chsh", "-s", "/usr/bin/zsh", "fuyu"]]);
  });

  test("verifies by rereading the passwd shell", () => {
    let shell = "/bin/bash";
    const dependencies = {
      readPasswdShell: () => shell,
      readShells: () => shells,
    };
    expect(verifyLoginShell("fuyu", dependencies)).toBe(false);
    shell = "/usr/bin/zsh";
    expect(verifyLoginShell("fuyu", dependencies)).toBe(true);
  });
});

describe("coredev herdr server shell", () => {
  test("reports then stops a stale server with SIGTERM", async () => {
    let running = true;
    const signalled: number[] = [];
    const dependencies: HerdrDependencies = {
      processLister: () => (running ? [{ pid: 42 }] : []),
      readEnviron: () => ({ SHELL: "/bin/bash" }),
      sendSignal: (pid, signal) => {
        expect(signal).toBe("SIGTERM");
        signalled.push(pid);
        running = false;
        return true;
      },
      wait: async () => {},
    };
    expect(probeHerdrServer("fuyu", "/usr/bin/zsh", dependencies)).toEqual({
      status: "not-satisfied",
      reason:
        "stale herdr server pid 42 started with SHELL=/bin/bash; login shell is /usr/bin/zsh",
    });
    expect(
      await stopStaleHerdrServers("fuyu", "/usr/bin/zsh", dependencies),
    ).toEqual([42]);
    expect(verifyHerdrServer("fuyu", "/usr/bin/zsh", dependencies)).toEqual({
      status: "satisfied",
      reason: "no server",
    });
    expect(signalled).toEqual([42]);
  });

  test("leaves a matching server alone", async () => {
    const signalled: number[] = [];
    const dependencies: HerdrDependencies = {
      processLister: () => [{ pid: 7 }],
      readEnviron: () => ({ SHELL: "/usr/bin/zsh" }),
      sendSignal: (pid) => {
        signalled.push(pid);
        return true;
      },
      wait: async () => {},
    };
    expect(probeHerdrServer("fuyu", "/usr/bin/zsh", dependencies)).toEqual({
      status: "satisfied",
      reason: "no stale server",
    });
    expect(
      await stopStaleHerdrServers("fuyu", "/usr/bin/zsh", dependencies),
    ).toEqual([]);
    expect(signalled).toEqual([]);
  });

  test("reports no server and skips when /proc is unavailable", () => {
    const noServer: HerdrDependencies = {
      processLister: () => [],
      readEnviron: () => null,
      sendSignal: () => true,
      wait: async () => {},
    };
    const noProc: HerdrDependencies = {
      ...noServer,
      processLister: () => null,
    };
    expect(probeHerdrServer("fuyu", "/usr/bin/zsh", noServer)).toEqual({
      status: "satisfied",
      reason: "no server",
    });
    expect(probeHerdrServer("fuyu", "/usr/bin/zsh", noProc)).toEqual({
      status: "skipped",
      reason: "no /proc",
    });
  });
});
