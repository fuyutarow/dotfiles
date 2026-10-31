import { access, readFile } from "node:fs/promises";
import type { Candidate } from "../model.ts";
import type { Context, Target } from "./index.ts";

export type CommandResult = { code: number; out: string; err: string };
export type CommandRunner = (
  argv: string[],
) => CommandResult | Promise<CommandResult>;
export type SystemOptions = {
  wsl?: boolean;
  sudo?: boolean;
  rootUnitSudo?: boolean;
  fstrimUnitInstalled?: boolean;
  explicit?: boolean;
  run?: CommandRunner;
};
const defaultRun: CommandRunner = async (argv) => {
  const result = Bun.spawn(argv, {
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  });
  const [code, out, err] = await Promise.all([
    result.exited,
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
  ]);
  return { code, out, err };
};
export function createSystemTarget(options: SystemOptions = {}) {
  const run = options.run ?? defaultRun;
  const isWsl = async () =>
    options.wsl ??
    (await readFile("/proc/sys/kernel/osrelease", "utf8")
      .then((text) => text.toLowerCase().includes("microsoft"))
      .catch(() => false));
  const hasSudo = async () =>
    options.sudo ??
    (Bun.which("sudo") !== null &&
      (await run(["sudo", "-n", "true"])).code === 0);
  const hasFstrimUnit = async () =>
    options.fstrimUnitInstalled ??
    (await access("/etc/systemd/system/dotfiles-fstrim.service")
      .then(() => true)
      .catch(() => false));
  const canStartFstrimUnit = async () =>
    options.rootUnitSudo ??
    (Bun.which("sudo") !== null &&
      (
        await run([
          "sudo",
          "-n",
          "-l",
          "/usr/bin/systemctl",
          "start",
          "dotfiles-fstrim.service",
        ])
      ).code === 0);
  const fstrimCommand = async () =>
    (await hasFstrimUnit())
      ? ["sudo", "-n", "/usr/bin/systemctl", "start", "dotfiles-fstrim.service"]
      : ["sudo", "-n", "fstrim", "-v", "/"];
  const fstrimReason = async () =>
    (await hasFstrimUnit())
      ? "start installed dotfiles fstrim unit"
      : "passwordless sudo fstrim fallback; dotfiles unit is not installed";
  const maintenance = [
    ["sudo", "-n", "apt-get", "clean"],
    ["sudo", "-n", "journalctl", "--vacuum-size=200M"],
  ];
  return {
    name: "system",
    tier: "sudo",
    available: async (_ctx?: Context) => {
      const wsl = await isWsl();
      const unitInstalled = await hasFstrimUnit();
      const broadSudo = wsl ? await hasSudo() : false;
      const unitSudo =
        wsl && unitInstalled ? await canStartFstrimUnit() : false;
      let skipReason: string | null = null;
      if (!wsl) skipReason = "not running inside WSL";
      else if (!broadSudo && !unitSudo)
        skipReason = "passwordless sudo for fstrim unavailable";
      return {
        available: wsl ? broadSudo || unitSudo : false,
        skip_reason: skipReason,
      };
    },
    plan: async (_ctx: Context) => {
      const wsl = await isWsl();
      const hasUnit = await hasFstrimUnit();
      const broadSudo = wsl ? await hasSudo() : false;
      const entries: { argv: string[]; reason: string }[] = [
        ...(broadSudo
          ? maintenance.map((argv) => ({
              argv,
              reason: "sudo system maintenance step",
            }))
          : []),
        {
          argv: await fstrimCommand(),
          reason: await fstrimReason(),
        },
      ];
      return Promise.all(
        entries.map(async ({ argv, reason }): Promise<Candidate> => ({
          id: argv.join(" "),
          path: null,
          verdict: "RECLAIM",
          reason,
          checks: [
            {
              name: "WSL and command authorization",
              ok:
                wsl &&
                (hasUnit || !argv.includes("dotfiles-fstrim.service")) &&
                (argv.includes("dotfiles-fstrim.service")
                  ? await canStartFstrimUnit()
                  : await hasSudo()),
              detail: "precondition rechecked at target availability",
            },
          ],
          bytes: null,
          bytes_kind: "estimate",
          action: { kind: "command", argv },
          result: null,
        })),
      );
    },
    act: async (candidate: Candidate, ctx: Context) => {
      ctx.reportActivity?.(
        "system",
        `waiting for ${candidate.action.argv.join(" ")}`,
      );
      const result = await run(candidate.action.argv);
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
