import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";

type ProbeSet = Readonly<{
  isContainer: () => boolean;
  unshareUserNamespace: () => Readonly<{ code: number; detail: string }>;
}>;

type DeclarationOptions = Readonly<{
  home: string;
  rented: boolean;
  hostname: string;
  date: string;
  probes: ProbeSet;
  say: (line: string) => void;
  command?: readonly string[];
}>;

export type DeclarationResult = "written" | "existing" | "skipped" | "invalid";

const HOST_COMMAND = [
  "mise",
  "-C",
  join(import.meta.dir, ".."),
  "exec",
  "--",
  "agx",
  "worker",
  "host",
];

async function runHost(
  home: string,
  command: readonly string[],
  args: string[],
) {
  const signal = AbortSignal.timeout(60_000);
  const proc = Bun.spawn([...command, ...args], {
    env: { ...process.env, HOME: home },
    stdout: "pipe",
    stderr: "pipe",
    signal,
  });
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return {
    out,
    err,
    code: !signal.aborted && (code === 0 || code === 1) ? code : 2,
  };
}

/** The released command owns path discovery, schema validation and diagnostics. */
export async function checkAgxHost(
  home: string,
  command: readonly string[] = HOST_COMMAND,
) {
  return runHost(home, command, ["check", "--json"]);
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write("unknown flag(s): --__proto__\n");
    process.exit(2);
  }
}

export function hostDeclarationProbes(): ProbeSet {
  return {
    isContainer: () => {
      if (existsSync("/.dockerenv")) return true;
      const cgroup = readFileSync("/proc/1/cgroup", "utf8");
      return /docker|containerd/iu.test(cgroup);
    },
    unshareUserNamespace: () => {
      const result = Bun.spawnSync(["unshare", "-U", "true"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      return {
        code: result.exitCode,
        detail: result.stderr
          .toString()
          .trim()
          .replaceAll(/[\r\n]+/gu, " "),
      };
    },
  };
}

/** Declare host isolation through agx only after every explicit gate is measured. */
export async function declareRentedCodexHost(
  options: DeclarationOptions,
): Promise<DeclarationResult> {
  const {
    home,
    rented,
    hostname,
    date,
    probes,
    say,
    command = HOST_COMMAND,
  } = options;
  const checked = await checkAgxHost(home, command);
  if (checked.code === 0) {
    say("existing agx host declaration; left untouched");
    return "existing";
  }
  if (checked.code !== 1) {
    say(
      `agx host check failed: ${(checked.err.trim() === "" ? checked.out : checked.err).trim()}`,
    );
    return "invalid";
  }
  if (!probes.isContainer()) {
    say(
      "not a container: /.dockerenv and /proc/1/cgroup have no container marker",
    );
    return "skipped";
  }
  const unshare = probes.unshareUserNamespace();
  if (unshare.code === 0) {
    say("user namespaces are available: unshare -U true exited 0");
    return "skipped";
  }
  if (!rented) {
    say(
      "not a rented container: pass --rented only for an owner's disposable Vast container",
    );
    return "skipped";
  }
  const refusal = `unshare -U true exited ${unshare.code}${unshare.detail === "" ? "" : ` (${unshare.detail})`}`;
  const reason = `Rented Vast container ${hostname}; ${refusal}; measured ${date}.`;
  const declared = await runHost(home, command, [
    "declare",
    "--unsandboxed-reason",
    reason,
  ]);
  if (declared.code !== 0) {
    say(
      `agx host declare failed: ${(declared.err.trim() === "" ? declared.out : declared.err).trim()}`,
    );
    return "invalid";
  }
  say(`wrote agx host declaration: ${declared.out.trim()}`);
  return "written";
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "agx-host.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      flags: {
        rented: {
          type: Boolean,
          description: "declare this owner's rented box",
        },
        check: { type: Boolean, description: "check for a valid declaration" },
      },
      help: { description: "Write or check agx's Linux host declaration." },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (
    parsed._.length > 0 ||
    (parsed.flags.check === true && parsed.flags.rented === true)
  ) {
    process.stderr.write("usage: agx-host.ts [--rented | --check]\n");
    process.exitCode = 2;
    return;
  }
  const home = process.env.HOME;
  if (home === undefined || home === "") {
    process.stderr.write("HOME is required\n");
    process.exitCode = 1;
    return;
  }
  if (parsed.flags.check === true) {
    const checked = await checkAgxHost(home);
    process.stdout.write(checked.out);
    process.stderr.write(checked.err);
    process.exitCode = checked.code;
    return;
  }
  const result = await declareRentedCodexHost({
    home,
    rented: parsed.flags.rented ?? false,
    hostname: Bun.env.HOSTNAME ?? "unknown",
    date: Temporal.Now.plainDateISO().toString(),
    probes: hostDeclarationProbes(),
    say: (line) => {
      process.stdout.write(line + "\n");
    },
  });
  if (result === "invalid") process.exitCode = 1;
}

if (import.meta.main) {
  const result = await attempt(main);
  if (!result.ok) {
    process.stderr.write(`FATAL: ${errorMessage(result.error)}\n`);
    process.exitCode = 2;
  }
}
