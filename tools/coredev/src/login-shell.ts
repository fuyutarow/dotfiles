import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fromThrowable } from "neverthrow";

export type Probe =
  | { status: "satisfied"; reason: string }
  | { status: "not-satisfied"; reason: string }
  | { status: "skipped"; reason: string };

export type ServerProcess = { pid: number };

export type LoginShellDependencies = {
  readPasswdShell(user: string): string | null;
  readShells(): string;
  runCommand(args: readonly string[]): void;
};

export type HerdrDependencies = {
  processLister(user: string): readonly ServerProcess[] | null;
  readEnviron(pid: number): Readonly<Record<string, string>> | null;
  sendSignal(pid: number, signal: "SIGTERM"): boolean;
  wait(milliseconds: number): Promise<void>;
};

const shellName = (path: string): string | undefined => path.split("/").at(-1);

export function probeLoginShell(
  user: string,
  dependencies: Pick<LoginShellDependencies, "readPasswdShell" | "readShells">,
): Probe {
  const current = dependencies.readPasswdShell(user);
  if (current === null)
    return { status: "not-satisfied", reason: "passwd entry unavailable" };
  const shells = dependencies.readShells().split(/\r?\n/u);
  if (shellName(current) === "zsh" && shells.includes(current))
    return { status: "satisfied", reason: `login shell is ${current}` };
  const zsh = shells.find((path) => shellName(path) === "zsh");
  const command = `sudo chsh -s ${zsh ?? "<zsh-path-from-/etc/shells>"} $USER`;
  return {
    status: "not-satisfied",
    reason: `current shell is ${current}; run \`${command}\``,
  };
}

export function changeLoginShell(
  user: string,
  dependencies: LoginShellDependencies,
): { ok: true } | { ok: false; reason: string } {
  const shells = dependencies.readShells().split(/\r?\n/u);
  const zsh = shells.find((path) => shellName(path) === "zsh");
  if (zsh === undefined)
    return {
      ok: false,
      reason: "no zsh path is listed in /etc/shells; cannot change login shell",
    };
  dependencies.runCommand(["sudo", "chsh", "-s", zsh, user]);
  return { ok: true };
}

export function verifyLoginShell(
  user: string,
  dependencies: Pick<LoginShellDependencies, "readPasswdShell" | "readShells">,
): boolean {
  return probeLoginShell(user, dependencies).status === "satisfied";
}

export function probeHerdrServer(
  user: string,
  loginShell: string,
  dependencies: Pick<HerdrDependencies, "processLister" | "readEnviron">,
): Probe {
  const servers = dependencies.processLister(user);
  if (servers === null) return { status: "skipped", reason: "no /proc" };
  if (servers.length === 0) return { status: "satisfied", reason: "no server" };
  for (const server of servers) {
    const environment = dependencies.readEnviron(server.pid);
    if (environment === null) continue;
    const shell = environment.SHELL ?? "unset";
    if (shell !== loginShell)
      return {
        status: "not-satisfied",
        reason: `stale herdr server pid ${server.pid} started with SHELL=${shell}; login shell is ${loginShell}`,
      };
  }
  return { status: "satisfied", reason: "no stale server" };
}

export function verifyHerdrServer(
  user: string,
  loginShell: string,
  dependencies: Pick<HerdrDependencies, "processLister" | "readEnviron">,
): Probe {
  return probeHerdrServer(user, loginShell, dependencies);
}

export async function stopStaleHerdrServers(
  user: string,
  loginShell: string,
  dependencies: HerdrDependencies,
): Promise<readonly number[]> {
  const servers = dependencies.processLister(user);
  if (servers === null || servers.length === 0) return [];
  const stale: number[] = [];
  for (const server of servers) {
    const environment = dependencies.readEnviron(server.pid);
    if (environment !== null && environment.SHELL !== loginShell)
      stale.push(server.pid);
  }
  for (const pid of stale) dependencies.sendSignal(pid, "SIGTERM");
  const deadline = Temporal.Now.instant().epochMilliseconds + 5000;
  while (
    stale.some(
      (pid) =>
        dependencies
          .processLister(user)
          ?.some((server) => server.pid === pid) ?? false,
    )
  ) {
    if (Temporal.Now.instant().epochMilliseconds >= deadline) return [];
    await dependencies.wait(100);
  }
  return stale;
}

export function createSystemLoginShellDependencies(): LoginShellDependencies {
  return {
    readPasswdShell(user) {
      const result = fromThrowable(() =>
        execFileSync("getent", ["passwd", user], { encoding: "utf8" }),
      )();
      return result.isOk() ? (result.value.trim().split(":")[6] ?? null) : null;
    },
    readShells() {
      return readFileSync("/etc/shells", "utf8");
    },
    runCommand(args) {
      execFileSync(args[0] ?? "", args.slice(1), { stdio: "inherit" });
    },
  };
}

export function createSystemHerdrDependencies(): HerdrDependencies {
  return {
    processLister(user) {
      if (!existsSync("/proc")) return null;
      const result = fromThrowable(() =>
        execFileSync("ps", ["-u", user, "-o", "pid=,args="], {
          encoding: "utf8",
        }),
      )();
      if (result.isErr()) return [];
      return result.value.split(/\r?\n/u).flatMap((line) => {
        const match = /^\s*(\d+)\s+(.+)$/u.exec(line);
        if (match === null || !/\bherdr\s+server\b/u.test(match[2] ?? ""))
          return [];
        return [{ pid: Number(match[1]) }];
      });
    },
    readEnviron(pid) {
      const result = fromThrowable(() =>
        readFileSync(`/proc/${pid}/environ`, "utf8"),
      )();
      if (result.isErr()) return null;
      return Object.fromEntries(
        result.value.split("\0").flatMap((entry) => {
          const separator = entry.indexOf("=");
          if (separator < 0) return [];
          return [[entry.slice(0, separator), entry.slice(separator + 1)]];
        }),
      );
    },
    sendSignal(pid, signal) {
      return fromThrowable(() => process.kill(pid, signal))().isOk();
    },
    wait(milliseconds) {
      return Bun.sleep(milliseconds);
    },
  };
}
