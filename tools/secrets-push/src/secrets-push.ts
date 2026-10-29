#!/usr/bin/env bun
// Relay selected secrets between fnox contexts. Values are held only in process memory and sent
// through stdin; keys and source paths may appear in argv, secret values never do.
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli as cleyeCli } from "cleye";
import { standardCli } from "@dotfiles/shared/src/cli.ts";
import cliPackage from "../package.json" with { type: "json" };
import { attempt, errorMessage } from "@dotfiles/shared/src/attempt.ts";

const cliArgv = () => process.argv.slice(2);
const cli = standardCli(cleyeCli, cliPackage, cliArgv);

const SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];
const TARGET_CONFIG = '"$HOME/.config/fnox/config.toml"';
const AGE_KEY_FILE = "~/.config/fnox/age.txt";
const NAME_RE = /^[A-Z_][A-Z0-9_]*$/u;
const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/u;
const DEFAULT_SECRETS = ["TYPESAFE_API_KEY"];

type SecretSpec = { name: string; path?: string };
type SourceValue = { bytes: Uint8Array; sha256: string; normalized: boolean };
type RunResult = { code: number; bytes: Uint8Array };

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`unknown flag(s): --${flag}\n`);
    process.exit(2);
  }
}

export const SECRETS_PUSH_CLI_OPTIONS = {
  name: "secrets-push",
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  parameters: ["[target]"],
  help: {
    description:
      "Relay named fnox secrets from this machine or an SSH host to an SSH target over stdin.",
  },
  flags: {
    from: { type: String, description: "SSH source host (default: local)" },
    secret: {
      type: [String],
      description: "Secret name or NAME=@path on the source; repeatable",
    },
  },
} satisfies {
  name: string;
  strictFlags: true;
  ignoreArgv: typeof rejectPrototypeFlag;
  parameters: ["[target]"];
  help: { description: string };
  flags: {
    from: { type: StringConstructor; description: string };
    secret: { type: [StringConstructor]; description: string };
  };
};

export function hasScriptAgeProvider(config: string): boolean {
  let inAgeProvider = false;
  for (const line of config.split(/\r?\n/u)) {
    const header = /^\s*\[([^\]]+)\]\s*(?:#.*)?$/u.exec(line);
    if (inAgeProvider && header !== null) return false;
    if (header !== null) {
      inAgeProvider = header[1] === "providers.age";
      continue;
    }
    if (
      inAgeProvider &&
      /^\s*key_file\s*=\s*["']~\/.config\/fnox\/age\.txt["']\s*(?:#.*)?$/u.test(
        line,
      )
    ) {
      return true;
    }
  }
  return false;
}

export function parseSecretSpecs(values: string[]): SecretSpec[] | string {
  values = values.length === 0 ? DEFAULT_SECRETS : values;
  const specs: SecretSpec[] = [];
  const names = new Set<string>();
  for (const value of values) {
    const sep = value.indexOf("=@");
    const name = sep < 0 ? value : value.slice(0, sep);
    const path = sep < 0 ? undefined : value.slice(sep + 2);
    if (!NAME_RE.test(name)) return `invalid secret name: ${name}`;
    if (path !== undefined && path.length === 0)
      return `${name}: --secret NAME=@path needs a source path`;
    if (names.has(name)) return `duplicate --secret name: ${name}`;
    names.add(name);
    specs.push({ name, ...(path === undefined ? {} : { path }) });
  }
  return specs;
}

const sha256 = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

// fnox get prints the stored value followed by exactly one LF.
function fnoxValue(bytes: Uint8Array): Uint8Array {
  return bytes.at(-1) === 10 ? bytes.subarray(0, -1) : bytes;
}

// fnox 1.39 stdin set uses Rust str::trim (Unicode White_Space).
// Keep this separate from get framing: a stored trailing LF is real value data.
function storedValue(bytes: Uint8Array): Uint8Array {
  return new TextEncoder().encode(
    new TextDecoder()
      .decode(bytes)
      .replaceAll(/^\p{White_Space}+|\p{White_Space}+$/gu, ""),
  );
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function sourceFileCommand(path: string): string {
  if (path.startsWith("~/"))
    return `cat -- "$HOME"/${shellQuote(path.slice(2))}`;
  return `cat -- ${shellQuote(path)}`;
}

async function readProcess(
  argv: string[],
  input?: Uint8Array,
  env?: Record<string, string>,
): Promise<RunResult> {
  const proc = Bun.spawn(argv, {
    stdin: input === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "ignore",
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  });
  const out = new Response(proc.stdout).arrayBuffer();
  if (input !== undefined) {
    const stdin = proc.stdin;
    if (stdin === undefined) {
      proc.kill();
      const [, code] = await Promise.all([out, proc.exited]);
      return { code, bytes: new Uint8Array() };
    }
    await stdin.write(input);
    await stdin.end();
  }
  const [bytes, code] = await Promise.all([out, proc.exited]);
  return { code, bytes: new Uint8Array(bytes) };
}

async function readSource(
  source: string | undefined,
  spec: SecretSpec,
): Promise<SourceValue | string> {
  let bytes: Uint8Array;
  if (spec.path === undefined) {
    const command = ["fnox", "get", spec.name];
    const result = await readProcess(
      source === undefined ? command : [...SSH, source, command.join(" ")],
    );
    if (result.code !== 0)
      return `${source ?? "this machine"}: fnox has no ${spec.name}`;
    bytes = fnoxValue(result.bytes);
  } else if (source === undefined) {
    const file = Bun.file(
      spec.path.replace(/^~(?=\/)/u, Bun.env["HOME"] ?? "~"),
    );
    if (!(await file.exists()))
      return `source file for ${spec.name} does not exist`;
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    const result = await readProcess([
      ...SSH,
      source,
      sourceFileCommand(spec.path),
    ]);
    if (result.code !== 0)
      return `${source}: could not read source file for ${spec.name}`;
    bytes = result.bytes;
  }
  const digest = sha256(storedValue(bytes));
  return { bytes, sha256: digest, normalized: digest !== sha256(bytes) };
}

async function setRemote(
  host: string,
  name: string,
  bytes: Uint8Array,
  configMode: "existing" | "fresh-local",
  localConfig?: string,
  identity?: string,
): Promise<string | null> {
  if (configMode === "existing") {
    const command = `fnox -c ${TARGET_CONFIG} set ${name} --provider age`;
    const result = await readProcess([...SSH, host, command], bytes);
    return result.code === 0
      ? null
      : `${host}: could not set ${name} with fnox`;
  }
  if (localConfig === undefined || identity === undefined)
    return `internal error: fresh config for ${name} is incomplete`;
  const result = await readProcess(
    ["fnox", "-c", localConfig, "set", name, "--provider", "age"],
    bytes,
    { FNOX_AGE_KEY_FILE: identity },
  );
  return result.code === 0 ? null : `could not encrypt ${name} with fnox`;
}

async function getTarget(host: string, name: string): Promise<RunResult> {
  // An explicit config path disables project discovery; -c is the same on set and get.
  return readProcess([...SSH, host, `fnox -c ${TARGET_CONFIG} get ${name}`]);
}

const say = (line: string): void => {
  process.stdout.write(`secrets:push: ${line}\n`);
};
const fail = (line: string): void => {
  process.stderr.write(`secrets:push: ${line}\n`);
  process.exitCode = 1;
};

const cleanupTemp = async (dir: string | undefined): Promise<void> => {
  if (dir !== undefined) await rm(dir, { recursive: true, force: true });
};

async function targetConfig(host: string): Promise<string> {
  const result = await readProcess([
    ...SSH,
    host,
    `if ! command -v fnox >/dev/null 2>&1; then printf '%s\\n' __MISSING_FNOX__; elif test -e "$HOME/.config/fnox/config.toml"; then printf '%s\\n' __EXISTS__; cat -- "$HOME/.config/fnox/config.toml"; else printf '%s\\n' __ABSENT__; fi`,
  ]);
  if (result.code !== 0) return "unreachable";
  const output = new TextDecoder().decode(result.bytes);
  if (output.includes("__MISSING_FNOX__")) return "missing";
  if (output.includes("__ABSENT__")) return "absent";
  if (output.includes("__EXISTS__"))
    return output.slice(output.indexOf("__EXISTS__\n") + "__EXISTS__\n".length);
  return "invalid";
}

async function main(): Promise<void> {
  const parsed = cli(SECRETS_PUSH_CLI_OPTIONS, undefined, cliArgv());
  const host = parsed._.target;
  const source = parsed.flags.from;
  if (parsed._.length !== (host === undefined ? 0 : 1) || host === undefined) {
    process.stderr.write(
      "one target ssh host is required\nUsage: mise run secrets:push -- [--from HOST] [--secret NAME …] <target>\n",
    );
    process.exitCode = 2;
    return;
  }
  if (
    !HOST_RE.test(host) ||
    (source !== undefined && source !== "local" && !HOST_RE.test(source))
  ) {
    process.stderr.write(
      "source and target must be ssh Host aliases (source may be local)\n",
    );
    process.exitCode = 2;
    return;
  }
  if (source === host) {
    process.stderr.write("source and target must differ\n");
    process.exitCode = 2;
    return;
  }
  const specs = parseSecretSpecs(
    parsed.flags.secret.length === 0 ? DEFAULT_SECRETS : parsed.flags.secret,
  );
  if (typeof specs === "string") {
    process.stderr.write(`${specs}\n`);
    process.exitCode = 2;
    return;
  }

  const found = await targetConfig(host);
  if (found === "unreachable") {
    fail(`${host}: SSH target probe failed`);
    return;
  }
  if (found === "missing") {
    fail(
      `fnox is not installed on ${host} (it is Brewfile.core: mise run linux:init there)`,
    );
    return;
  }
  if (found === "invalid") {
    fail(`${host}: could not read ~/.config/fnox/config.toml`);
    return;
  }
  const existing = found !== "absent";
  if (existing && !hasScriptAgeProvider(found)) {
    fail(
      `${host} has a foreign ~/.config/fnox/config.toml; refusing to change it`,
    );
    return;
  }

  let dir: string | undefined;
  let identity: string | undefined;
  let localConfig: string | undefined;
  if (!existing) {
    if (Bun.which("age-keygen") === null) {
      fail("age-keygen is not installed here (brew install age)");
      return;
    }
    dir = await mkdtemp(join(tmpdir(), "secrets-push-"));
    identity = join(dir, "age.txt");
    await Bun.$`age-keygen -o ${identity}`.quiet();
    const recipient = /^# public key: (age1\S+)$/mu.exec(
      await readFile(identity, "utf8"),
    )?.[1];
    if (recipient === undefined) {
      await rm(dir, { recursive: true, force: true });
      fail("age-keygen wrote no public key");
      return;
    }
    localConfig = join(dir, "config.toml");
    await writeFile(
      localConfig,
      `# fnox secrets encrypted for ${host}; remove this config and age identity when retiring the box.\n[providers.age]\ntype = "age"\nrecipients = ["${recipient}"]\nkey_file = "${AGE_KEY_FILE}"\n`,
      { mode: 0o600 },
    );
  }

  const results: { spec: SecretSpec; value: SourceValue }[] = [];
  for (const spec of specs) {
    const value = await readSource(
      source === "local" ? undefined : source,
      spec,
    );
    if (typeof value === "string") {
      await cleanupTemp(dir);
      fail(value);
      return;
    }
    const setError = await setRemote(
      host,
      spec.name,
      value.bytes,
      existing ? "existing" : "fresh-local",
      localConfig,
      identity,
    );
    if (setError !== null) {
      await cleanupTemp(dir);
      fail(setError);
      return;
    }
    results.push({ spec, value });
  }

  if (
    !existing &&
    dir !== undefined &&
    identity !== undefined &&
    localConfig !== undefined
  ) {
    const installIdentity = await readProcess(
      [
        ...SSH,
        host,
        'umask 077 && mkdir -p "$HOME/.config/fnox" && cat > "$HOME/.config/fnox/age.txt"',
      ],
      new Uint8Array(await readFile(identity)),
    );
    const installConfig = await readProcess(
      [
        ...SSH,
        host,
        'umask 077 && mkdir -p "$HOME/.config/fnox" && cat > "$HOME/.config/fnox/config.toml"',
      ],
      new Uint8Array(await readFile(localConfig)),
    );
    await rm(dir, { recursive: true, force: true });
    if (installIdentity.code !== 0 || installConfig.code !== 0) {
      fail(`could not install fnox age identity/config on ${host}`);
      return;
    }
  }

  for (const { spec, value } of results) {
    const got = await getTarget(host, spec.name);
    if (got.code !== 0) {
      fail(`${host}: fnox get ${spec.name} did not open after set`);
      return;
    }
    if (sha256(fnoxValue(got.bytes)) !== value.sha256) {
      fail(`${host}: SHA-256 mismatch for ${spec.name}`);
      return;
    }
    const note = value.normalized
      ? "; fnox set trimmed surrounding whitespace"
      : "";
    say(`${spec.name} → ${host}: SHA-256 matched (${value.sha256})${note}`);
  }
  say(`done: ${results.length} secret(s) verified`);
}

if (import.meta.main) {
  const result = await attempt(main);
  if (!result.ok) {
    process.stderr.write(`FATAL: ${errorMessage(result.error)}\n`);
    process.exitCode = 2;
  }
}
