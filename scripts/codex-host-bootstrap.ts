import {
  closeSync,
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { cli } from "cleye";
import { readCodexHostDeclaration } from "../tools/agent-dispatch/src/workers/codex-host.ts";

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
}>;

export type DeclarationResult = "written" | "existing" | "skipped" | "invalid";

const RELATIVE_PATH = ".config/codex-run/host.toml";

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
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

/** Write codex-run's self-isolation declaration only after every explicit gate is measured. */
export function declareRentedCodexHost(
  options: DeclarationOptions,
): DeclarationResult {
  const { home, rented, hostname, date, probes, say } = options;
  const path = join(home, RELATIVE_PATH);
  if (lstatSync(path, { throwIfNoEntry: false }) !== undefined) {
    say(`existing ~/${RELATIVE_PATH}; left untouched`);
    return "existing";
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

  const directory = join(home, ".config/codex-run");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const refusal = `unshare -U true exited ${unshare.code}${unshare.detail === "" ? "" : ` (${unshare.detail})`}`;
  const reason = `Rented Vast container ${hostname}; ${refusal}; measured ${date}.`;
  const contents = `schema = 1\nunsandboxed_reason = ${JSON.stringify(reason)}\n`;
  const fd = openSync(path, "wx", 0o600);
  writeFileSync(fd, contents, "utf8");
  closeSync(fd);
  chmodSync(path, 0o600);

  const validated = readCodexHostDeclaration(path);
  if (validated.kind !== "valid") {
    say(
      `generated codex-run host declaration failed validation: ${validated.kind === "invalid" ? validated.reason : path}`,
    );
    return "invalid";
  }
  say(`wrote ~/${RELATIVE_PATH} (0600)`);
  return "written";
}

function main(): void {
  const parsed = cli(
    {
      name: "codex-host-bootstrap.ts",
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
      help: {
        description: "Write or check codex-run's Linux host declaration.",
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (
    parsed._.length > 0 ||
    (parsed.flags.check === true && parsed.flags.rented === true)
  ) {
    process.stderr.write(
      "usage: codex-host-bootstrap.ts [--rented | --check]\n",
    );
    process.exitCode = 2;
    return;
  }
  const home = process.env.HOME;
  if (home === undefined || home === "") {
    process.stderr.write("HOME is required\n");
    process.exitCode = 1;
    return;
  }
  const path = join(home, RELATIVE_PATH);
  if (parsed.flags.check === true) {
    const declaration = readCodexHostDeclaration(path);
    if (declaration.kind === "valid") {
      process.stdout.write("valid ~/".concat(RELATIVE_PATH, "\n"));
      return;
    }
    process.stderr.write(
      declaration.kind +
        " ~/" +
        RELATIVE_PATH +
        (declaration.kind === "invalid" ? ": " + declaration.reason : "") +
        "\n",
    );
    process.exitCode = 1;
    return;
  }
  const result = declareRentedCodexHost({
    home,
    rented: parsed.flags.rented ?? false,
    hostname: Bun.env.HOSTNAME ?? "unknown",
    date: Temporal.Now.plainDateISO().toString(),
    probes: hostDeclarationProbes(),
    say: (line) => {
      process.stdout.write(line + "\n");
    },
  });
  if (result === "invalid") {
    process.exitCode = 1;
    return;
  }
  if (result === "existing" && readCodexHostDeclaration(path).kind !== "valid")
    process.exitCode = 1;
}

if (import.meta.main) main();
