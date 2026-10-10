export type DetachPlatform = "linux" | "darwin";

export interface DetachedLaunch {
  executable: string;
  args: string[];
  unit: string;
  logCommand: string;
  stdoutPath?: string;
  stderrPath?: string;
}

export interface DetachedLaunchInput {
  platform: DetachPlatform;
  unit: string;
  cwd: string;
  command: string[];
  env: Record<string, string | undefined>;
  logDir: string;
}

function exportedEnvironment(
  env: Record<string, string | undefined>,
): [string, string][] {
  const selected: Record<string, string> = {
    PATH: env.PATH ?? "",
    HOME: env.HOME ?? "",
    CLAUDE_CODE_SESSION_ID: env.CLAUDE_CODE_SESSION_ID ?? "",
    CLAUDE_PID: env.CLAUDE_PID ?? "",
  };
  for (const [name, value] of Object.entries(env))
    if (name.startsWith("AGX_") && value !== undefined) selected[name] = value;
  return Object.entries(selected).toSorted(([left], [right]) =>
    left.localeCompare(right),
  );
}

const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

/** Build the OS-owned launch vector without executing it. */
export function buildDetachedLaunch(
  input: DetachedLaunchInput,
): DetachedLaunch {
  const environment = exportedEnvironment(input.env);
  if (input.platform === "linux") {
    return {
      executable: "systemd-run",
      args: [
        "--user",
        `--unit=${input.unit}`,
        "--collect",
        `--working-directory=${input.cwd}`,
        ...environment.map(([name, value]) => `--setenv=${name}=${value}`),
        "--",
        ...input.command,
      ],
      unit: input.unit,
      logCommand: `journalctl --user -u ${input.unit} -f`,
    };
  }

  const stdoutPath = `${input.logDir}/${input.unit}.out.log`;
  const stderrPath = `${input.logDir}/${input.unit}.err.log`;
  return {
    executable: "launchctl",
    args: [
      "submit",
      "-l",
      input.unit,
      "-o",
      stdoutPath,
      "-e",
      stderrPath,
      "--",
      "/bin/sh",
      "-c",
      // launchctl submit restarts a failed job; the wrapper prevents replaying a failed run.
      'cd "$1" && shift && "$@"; exit 0',
      "agx-detach",
      input.cwd,
      "/usr/bin/env",
      ...environment.map(([name, value]) => `${name}=${value}`),
      ...input.command,
    ],
    unit: input.unit,
    logCommand: `tail -f ${shellQuote(stdoutPath)} ${shellQuote(stderrPath)}`,
    stdoutPath,
    stderrPath,
  };
}
