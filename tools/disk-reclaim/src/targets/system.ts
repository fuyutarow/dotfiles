import { existsSync, readFileSync } from "node:fs";
import type { Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";
import { fromThrowable } from "../../../shared/src/zod.ts";

export type CommandResult = { code: number; out: string; err: string };
export type CommandRunner = (argv: string[]) => CommandResult;
export type SystemOptions = {
  wsl?: boolean;
  sudo?: boolean;
  rootUnitSudo?: boolean;
  fstrimUnitInstalled?: boolean;
  explicit?: boolean;
  run?: CommandRunner;
};
const defaultRun: CommandRunner = (argv) => {
  const result = Bun.spawnSync(argv, {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });
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
  const fstrimUnitInstalled =
    options.fstrimUnitInstalled ??
    existsSync("/etc/systemd/system/dotfiles-fstrim.service");
  const canStartFstrimUnit = () =>
    options.rootUnitSudo ??
    (Bun.which("sudo") !== null &&
      run([
        "sudo",
        "-n",
        "-l",
        "/usr/bin/systemctl",
        "start",
        "dotfiles-fstrim.service",
      ]).code === 0);
  const fstrimCommand = fstrimUnitInstalled
    ? ["sudo", "-n", "/usr/bin/systemctl", "start", "dotfiles-fstrim.service"]
    : ["sudo", "-n", "fstrim", "-v", "/"];
  const fstrimReason = fstrimUnitInstalled
    ? "start installed dotfiles fstrim unit"
    : "passwordless sudo fstrim fallback; dotfiles unit is not installed";
  const maintenance = [
    ["sudo", "-n", "apt-get", "clean"],
    ["sudo", "-n", "journalctl", "--vacuum-size=200M"],
  ];
  return {
    name: "system",
    tier: "sudo",
    available: (_ctx?: Context) => {
      const broadSudo = wsl && hasSudo();
      const unitSudo = wsl && fstrimUnitInstalled && canStartFstrimUnit();
      let skipReason: string | null = null;
      if (!wsl) skipReason = "not running inside WSL";
      else if (!broadSudo && !unitSudo)
        skipReason = "passwordless sudo for fstrim unavailable";
      return {
        available: wsl && (broadSudo || unitSudo),
        skip_reason: skipReason,
      };
    },
    plan: (_ctx: Context) => {
      const broadSudo = wsl && hasSudo();
      const entries: { argv: string[]; reason: string }[] = [
        ...(broadSudo
          ? maintenance.map((argv) => ({
              argv,
              reason: "sudo system maintenance step",
            }))
          : []),
        {
          argv: fstrimCommand,
          reason: fstrimReason,
        },
      ];
      return entries.map(({ argv, reason }): Candidate => ({
        id: argv.join(" "),
        path: null,
        verdict: "RECLAIM",
        reason,
        checks: [
          {
            name: "WSL and command authorization",
            ok:
              wsl &&
              (argv.includes("dotfiles-fstrim.service")
                ? canStartFstrimUnit()
                : hasSudo()),
            detail: "precondition rechecked at target availability",
          },
        ],
        bytes: null,
        bytes_kind: "estimate",
        action: { kind: "command", argv },
        result: null,
      }));
    },
    act: (candidate: Candidate, ctx: Context) => {
      ctx.reportActivity?.(
        "system",
        `waiting for ${candidate.action.argv.join(" ")}`,
      );
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
