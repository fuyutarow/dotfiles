import { readFileSync } from "node:fs";
import type { Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";

export type CommandResult = { code: number; out: string; err: string };
export type CommandRunner = (argv: string[]) => CommandResult;
export type SystemOptions = {
  wsl?: boolean;
  sudo?: boolean;
  explicit?: boolean;
  run?: CommandRunner;
};
const defaultRun: CommandRunner = (argv) => {
  const result = Bun.spawnSync(argv, { stdout: "pipe", stderr: "pipe" });
  return {
    code: result.exitCode ?? 1,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
  };
};
export const systemExitCode = (
  explicit: boolean,
  available: boolean,
): number => (!available && explicit ? 4 : 0);
export function createSystemTarget(options: SystemOptions = {}) {
  const run = options.run ?? defaultRun;
  const detectedWsl = fromThrowable(() =>
    readFileSync("/proc/sys/kernel/osrelease", "utf8")
      .toLowerCase()
      .includes("microsoft"),
  )().unwrapOr(false);
  const wsl = options.wsl ?? detectedWsl;
  const hasSudo = () =>
    options.sudo ??
    (Bun.which("sudo") !== null && run(["sudo", "-n", "true"]).code === 0);
  const commands = [
    ["sudo", "-n", "apt-get", "clean"],
    ["sudo", "-n", "journalctl", "--vacuum-size=200M"],
    ["sudo", "-n", "fstrim", "-v", "/"],
  ];
  return {
    name: "system",
    tier: "sudo",
    available: (_ctx?: Context) => {
      const sudo = hasSudo();
      let skipReason: string | null = null;
      if (!wsl) skipReason = "not running inside WSL";
      else if (!sudo) skipReason = "passwordless sudo unavailable";
      return {
        available: wsl && sudo,
        skip_reason: skipReason,
      };
    },
    plan: (_ctx: Context) =>
      commands.map((argv): Candidate => ({
        id: argv.join(" "),
        path: null,
        verdict: "RECLAIM",
        reason: "sudo system maintenance step",
        checks: [
          {
            name: "WSL and passwordless sudo",
            ok: wsl && hasSudo(),
            detail: "precondition rechecked at target availability",
          },
        ],
        bytes: null,
        bytes_kind: "estimate",
        action: { kind: "command", argv },
        result: null,
      })),
    act: (candidate: Candidate, _ctx: Context) => {
      const result = run(candidate.action.argv);
      let error: string | null = null;
      if (result.code !== 0)
        error = result.err.length > 0 ? result.err : `exit ${result.code}`;
      return {
        ok: result.code === 0,
        bytes_freed: null,
        error,
      };
    },
  } satisfies Target;
}
export const system = createSystemTarget();
