import { jsonOf, z } from "../../shared/src/zod.ts";
import { shellQuote } from "../../shared/src/read-path.ts";
import { err, ok, type Result } from "neverthrow";

export type HostKind = "linux" | "wsl" | "mac";
export type SelectionPhase = "deploy" | "doctor";
export type SelectedTask = { task: string; timeoutSeconds: number };
export type Selection = {
  kind: HostKind;
  phase: SelectionPhase;
  tasks: readonly SelectedTask[];
};
export type Command = { command: string; args: readonly string[] };
export type CommandResult = {
  status: number;
  output: string;
  timedOut: boolean;
  missing: boolean;
};
export type CommandRunner = {
  run(
    command: Command,
    options: { cwd: string; timeoutMs: number },
  ): Promise<CommandResult>;
};

export function isApprovedRemoteAlias(alias: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(alias);
}

const selectionSchema = z.object({
  kind: z.enum(["linux", "wsl", "mac"]),
  phase: z.enum(["deploy", "doctor"]),
  tasks: z.array(
    z.object({
      task: z.string().min(1),
      timeoutSeconds: z.number().int().positive(),
    }),
  ),
});

function boundedOutput(output: string): string {
  const trimmed = output.trim();
  return trimmed.length <= 4_000
    ? trimmed
    : `${trimmed.slice(0, 4_000)}\n… output truncated`;
}

function commandFailure(label: string, result: CommandResult): Error {
  if (result.missing) return new Error(`${label}: command is unavailable`);
  if (result.timedOut) return new Error(`${label}: timed out`);
  const detail = boundedOutput(result.output);
  return new Error(
    `${label}: exited ${result.status}${detail === "" ? "" : `\n${detail}`}`,
  );
}

export async function readSelection(
  dotfiles: string,
  kind: HostKind,
  phase: SelectionPhase,
  runner: CommandRunner,
): Promise<Result<Selection, Error>> {
  const result = await runner.run(
    {
      command: "bun",
      args: [
        `${dotfiles}/scripts/deployment-selection.ts`,
        "--kind",
        kind,
        "--phase",
        phase,
        "--json",
      ],
    },
    { cwd: dotfiles, timeoutMs: 5_000 },
  );
  if (result.status !== 0)
    return err(commandFailure("coredev selection", result));
  const selected = jsonOf(selectionSchema).safeParse(result.output);
  if (!selected.success)
    return err(new Error("coredev selection: invalid JSON selection"));
  if (selected.data.kind !== kind || selected.data.phase !== phase)
    return err(
      new Error(
        "coredev selection: declaration did not match requested target",
      ),
    );
  return ok(selected.data);
}

export function renderSelection(target: string, selection: Selection): string {
  return [
    `target ${target} (${selection.kind})`,
    ...selection.tasks.map(
      (step) =>
        `${selection.phase} ${step.task} timeout=${step.timeoutSeconds}s`,
    ),
  ].join("\n");
}

export async function executeSelection(
  dotfiles: string,
  selection: Selection,
  runner: CommandRunner,
  write: (line: string) => void,
): Promise<Result<void, Error>> {
  for (const step of selection.tasks) {
    write(`RUN  ${step.task}`);
    const result = await runner.run(
      { command: "mise", args: ["run", step.task] },
      { cwd: dotfiles, timeoutMs: step.timeoutSeconds * 1_000 },
    );
    if (result.status !== 0)
      return err(
        commandFailure(`coredev ${selection.phase} ${step.task}`, result),
      );
    write(`PASS ${step.task}`);
  }
  return ok(undefined);
}

function remoteExecutable(command: Command): readonly string[] | undefined {
  const selector = command.args[0];
  if (
    command.command === "bun" &&
    selector !== undefined &&
    selector.endsWith("/scripts/deployment-selection.ts")
  )
    return [
      "bun",
      "./scripts/deployment-selection.ts",
      ...command.args.slice(1),
    ];
  if (command.command === "mise") return ["mise", ...command.args];
  return undefined;
}

function remoteScript(command: Command): string | undefined {
  const executable = remoteExecutable(command);
  if (executable === undefined) return undefined;
  return [
    "set -eu",
    'DOTFILES="${DOTFILES:-$HOME/dotfiles}"',
    'if [ ! -d "$DOTFILES" ] || [ ! -f "$DOTFILES/mise.toml" ]; then',
    '  printf "%s\\n" "coredev remote checkout unavailable: $DOTFILES" >&2',
    "  exit 66",
    "fi",
    'cd "$DOTFILES"',
    `exec ${executable.map((argument) => shellQuote(argument)).join(" ")}`,
  ].join("\n");
}

export function remoteRunner(
  alias: string,
  runner: CommandRunner,
): CommandRunner {
  return {
    async run(command, options) {
      const script = remoteScript(command);
      if (script === undefined)
        return {
          status: 2,
          output: `coredev remote transport (${alias}): unsupported command`,
          timedOut: false,
          missing: false,
        };
      const result = await runner.run(
        {
          command: "ssh",
          // OpenSSH joins its command arguments with spaces before handing them
          // to the remote login shell. Quote the entire -c operand so the
          // multiline payload remains one argument after that second parse.
          args: [alias, `sh -lc ${shellQuote(script)}`],
        },
        options,
      );
      if (!result.missing) return result;
      return {
        status: 127,
        output: `coredev remote transport (${alias}): ssh is unavailable`,
        timedOut: false,
        missing: false,
      };
    },
  };
}

export const systemRunner: CommandRunner = {
  async run(command, options) {
    if (Bun.which(command.command) === null)
      return { status: 127, output: "", timedOut: false, missing: true };
    const signal = AbortSignal.timeout(options.timeoutMs);
    const proc = Bun.spawn([command.command, ...command.args], {
      cwd: options.cwd,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      signal,
    });
    const [stdout, stderr, status] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return {
      status,
      output: `${stdout}${stderr}`,
      timedOut: signal.aborted,
      missing: false,
    };
  },
};
