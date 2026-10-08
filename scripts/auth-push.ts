// `mise run auth:push -- <host> [--only codex,claude,gh] [--force]` — transfer this
// machine's agent CLI logins to an owner's disposable remote box over ssh stdin.
// Credential bytes are held in memory, never argv or output. This is separate from fnox secrets.
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";

export type CliName = "codex" | "claude" | "gh";
type Ran = Readonly<{ code: number; out: string; err: string }>;
export type AuthPushDependencies = Readonly<{
  home: string;
  platform: NodeJS.Platform;
  user: string;
  readFile: (path: string) => Promise<string | null>;
  run: (argv: readonly string[], stdin?: string) => Promise<Ran>;
}>;

type Source = Readonly<{ content: string | null; reason?: string }>;
const CLIS: Readonly<Record<string, CliName>> = {
  codex: "codex",
  claude: "claude",
  gh: "gh",
};
const CLI_STATUS: Readonly<Record<CliName, string>> = {
  codex: "codex login status",
  claude: "claude auth status",
  gh: "gh auth status",
};
const SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];
const PATHS = {
  codex: ".codex/auth.json",
  claude: ".claude/.credentials.json",
} as const;

const hash = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("unknown flag(s): --__proto__\n");
    process.exit(2);
  }
}

const remotePath = (cliName: CliName): string | null =>
  cliName === "gh" ? null : `"$HOME/${PATHS[cliName]}"`;

function remoteHashCommand(cliName: CliName): string {
  if (cliName === "gh")
    return `token=$(gh auth token 2>/dev/null) || { echo MISSING; exit 0; }; printf %s "$token" | sha256sum | cut -d ' ' -f1`;
  const path = remotePath(cliName);
  return `if [ -f ${path} ]; then sha256sum ${path} | cut -d ' ' -f1; else echo MISSING; fi`;
}

function installCommand(cliName: CliName): string {
  if (cliName === "gh")
    return 'umask 077; mkdir -p -m 700 "$HOME/.config/gh" && chmod 700 "$HOME/.config/gh" && gh auth login --with-token && gh auth setup-git && { [ ! -f "$HOME/.config/gh/hosts.yml" ] || chmod 600 "$HOME/.config/gh/hosts.yml"; }';
  const path = PATHS[cliName];
  const dir = path.slice(0, path.lastIndexOf("/"));
  return `umask 077; mkdir -p -m 700 "$HOME/${dir}" && chmod 700 "$HOME/${dir}" && cat > "$HOME/${path}" && chmod 600 "$HOME/${path}"`;
}

const statusCommand = (cliName: CliName): string => CLI_STATUS[cliName];

async function sourceFor(
  cliName: CliName,
  deps: AuthPushDependencies,
): Promise<Source> {
  if (
    cliName === "codex" ||
    (cliName === "claude" && deps.platform !== "darwin")
  ) {
    const path = join(
      deps.home,
      cliName === "codex" ? PATHS.codex : PATHS.claude,
    );
    const content = await deps.readFile(path);
    return content === null || content.length === 0
      ? { content: null, reason: `source ${path} is missing or empty` }
      : { content };
  }
  if (cliName === "claude") {
    const result = await deps.run([
      "/usr/bin/security",
      "find-generic-password",
      "-s",
      "Claude Code-credentials",
      "-a",
      deps.user,
      "-w",
    ]);
    return result.code === 0 && result.out.length > 0
      ? { content: result.out }
      : {
          content: null,
          reason:
            "macOS Keychain item Claude Code-credentials is unavailable to this session",
        };
  }
  const result = await deps.run(["gh", "auth", "token"]);
  return result.code === 0 && result.out.trim().length > 0
    ? { content: result.out.trim() }
    : { content: null, reason: "gh auth token is unavailable here" };
}

const say = (line: string): void => {
  process.stdout.write(`auth:push: ${line}\n`);
};

async function transferIfNeeded(
  host: string,
  cliName: CliName,
  content: string,
  targetHash: string,
  force: boolean,
  deps: AuthPushDependencies,
): Promise<string | null> {
  if (targetHash === hash(content)) return "same content; no transfer";
  if (targetHash !== "MISSING" && !force) {
    say(`FAIL  ${cliName}  target differs; refusing overwrite (use --force)`);
    return null;
  }
  const written = await deps.run(
    [...SSH, host, installCommand(cliName)],
    content,
  );
  if (written.code !== 0) {
    say(`FAIL  ${cliName}  transfer to ${host} failed`);
    return null;
  }
  return "transferred";
}

/** Injectable transfer core. Runner output is never relayed except sanitized status diagnostics. */
export async function pushAuth(
  host: string,
  selected: readonly CliName[],
  force: boolean,
  deps: AuthPushDependencies,
): Promise<number> {
  let failed = false;
  for (const cliName of selected) {
    const source = await sourceFor(cliName, deps);
    if (source.content === null) {
      say(`SKIP  ${cliName}  ${source.reason ?? "source unavailable"}`);
      continue;
    }
    const content = source.content;
    const remote = await deps.run([...SSH, host, remoteHashCommand(cliName)]);
    if (remote.code !== 0) {
      say(`FAIL  ${cliName}  could not inspect ${host}'s login state`);
      failed = true;
      continue;
    }
    const targetHash = remote.out.trim().split("\n").at(-1) ?? "MISSING";
    const detail = await transferIfNeeded(
      host,
      cliName,
      content,
      targetHash,
      force,
      deps,
    );
    if (detail === null) {
      failed = true;
      continue;
    }
    const status = await deps.run([...SSH, host, statusCommand(cliName)]);
    if (status.code === 0)
      say(`PASS  ${cliName}  ${detail}; logged in on ${host}`);
    else {
      say(
        `FAIL  ${cliName}  ${detail}; ${cliName} login status failed on ${host}`,
      );
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

async function spawn(argv: readonly string[], input?: string): Promise<Ran> {
  const proc = Bun.spawn([...argv], {
    stdin: input === undefined ? "ignore" : new Blob([input]),
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.timeout(30_000),
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, out: out.replaceAll("\r", "").trimEnd(), err };
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "auth-push.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<host>"],
      flags: {
        only: { type: String, description: "comma-separated CLI names" },
        force: {
          type: Boolean,
          description: "overwrite different target credentials",
        },
      },
      help: {
        description:
          "Transfer this machine's agent CLI logins to an ssh host over stdin.",
        usage:
          "mise run auth:push -- <host> [--only codex,claude,gh] [--force]",
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  const host = parsed._.host;
  if (parsed._.length > 1 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(host)) {
    process.stderr.write(
      "one valid ssh Host alias is required\nUsage: mise run auth:push -- <host> [--only codex,claude,gh] [--force]\n",
    );
    process.exitCode = 2;
    return;
  }
  const selected = (parsed.flags.only ?? "codex,claude,gh")
    .split(",")
    .map((name) => CLIS[name]);
  if (selected.some((name) => name === undefined)) {
    process.stderr.write("--only accepts codex,claude,gh\n");
    process.exitCode = 2;
    return;
  }
  const validSelected = selected.filter((name) => name !== undefined);
  process.exitCode = await pushAuth(
    host,
    [...new Set(validSelected)],
    parsed.flags.force ?? false,
    {
      home: homedir(),
      platform: process.platform,
      user: process.env.USER ?? "",
      readFile: async (path) =>
        (await Bun.file(path).exists()) ? Bun.file(path).text() : null,
      run: spawn,
    },
  );
}

if (import.meta.main) {
  const result = await attempt(main);
  if (!result.ok) {
    process.stderr.write(`FATAL: ${errorMessage(result.error)}\n`);
    process.exitCode = 2;
  }
}
