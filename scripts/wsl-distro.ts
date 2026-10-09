import { cli } from "cleye";
import { homedir } from "node:os";
import { join } from "node:path";

export type Options = {
  name: string;
  image: string;
  port: number;
  alias: string;
  host: "r99-lan" | "r99" | undefined;
  dryRun: boolean;
};

type PlannedCommand = { label: string; argv: string[] };

const PRIMARY = "r99-u24";
export const PRIMARY_DISTRO_RECORD = { alias: PRIMARY, distro: "Ubuntu-24.04" };
const PRIMARY_CODE = `${PRIMARY}-code`;
const OLD_PRIMARY = ["r99", "wsl"].join("-");
const OLD_PRIMARY_CODE = `${OLD_PRIMARY}-code`;

function validAlias(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);
}

function validWslName(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value);
}

function rejectPrototypeFlag(type: string, flag: string): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(`FATAL: unknown option '--${flag}'\n`);
    process.exit(2);
  }
}

function markedBlock(
  id: string,
  aliases: string[],
  distro: string,
  hostName: string,
  port: number,
  smartOpen: boolean,
): string {
  return [
    `# BEGIN dotfiles-wsl:${id}`,
    `# WSL-Distro: ${distro}`,
    `Host ${aliases.join(" ")}`,
    ...(smartOpen ? ["    Tag smart-open"] : []),
    `    HostName ${hostName}`,
    `    Port ${port}`,
    "    User fuyu",
    `# END dotfiles-wsl:${id}`,
  ].join("\n");
}

type HostBlock = {
  start: number;
  end: number;
  text: string;
  aliases: string[];
};

function hostBlocks(contents: string): HostBlock[] {
  const lines = contents.split("\n");
  const starts = lines.flatMap((line, index) =>
    /^\s*Host\s+/iu.test(line) ? [index] : [],
  );
  return starts.map((start, offset) => {
    const next = starts[offset + 1];
    const nextMatch = lines.findIndex(
      (line, index) => index > start && /^\s*Match\s+/iu.test(line),
    );
    let end = lines.length;
    if (next !== undefined) end = next;
    if (nextMatch !== -1 && nextMatch < end) end = nextMatch;
    while (end > start + 1) {
      const trailing = (lines[end - 1] ?? "").trim();
      if (trailing !== "" && !trailing.startsWith("#")) break;
      end -= 1;
    }
    end += 1;
    const aliases = (lines[start] ?? "").trim().split(/\s+/u).slice(1);
    return { start, end, text: lines.slice(start, end).join("\n"), aliases };
  });
}

function replaceRange(
  contents: string,
  start: number,
  end: number,
  replacement: string,
): string {
  const lines = contents.split("\n");
  const before = lines.slice(0, start).join("\n");
  const after = lines.slice(end).join("\n");
  const result = `${before}${before === "" ? "" : "\n"}${replacement}${after === "" ? "" : `\n${after}`}`;
  return contents.endsWith("\n") && !result.endsWith("\n")
    ? `${result}\n`
    : result;
}

function replaceMarked(
  contents: string,
  id: string,
  replacement: string,
): string | null {
  const lines = contents.split("\n");
  const begin = `# BEGIN dotfiles-wsl:${id}`;
  const end = `# END dotfiles-wsl:${id}`;
  const start = lines.indexOf(begin);
  if (start === -1) return null;
  const stop = lines.indexOf(end, start + 1);
  if (stop === -1) return null;
  return replaceRange(contents, start, stop + 1, replacement);
}

function markedContents(contents: string, id: string): string | undefined {
  const lines = contents.split("\n");
  const begin = lines.indexOf(`# BEGIN dotfiles-wsl:${id}`);
  const end = lines.indexOf(`# END dotfiles-wsl:${id}`, begin + 1);
  return begin === -1 || end === -1
    ? undefined
    : lines.slice(begin, end + 1).join("\n");
}

function blockHostName(block: string): string | undefined {
  return /^\s*HostName\s+(\S+)\s*$/imu.exec(block)?.[1];
}

function replaceHostAliases(
  contents: string,
  aliases: string[],
  replacement: string,
): string {
  const target = hostBlocks(contents).find(
    (block) =>
      aliases.every((alias) => block.aliases.includes(alias)) &&
      block.aliases.every((alias) => aliases.includes(alias)),
  );
  if (target === undefined) {
    const suffix = contents === "" || contents.endsWith("\n") ? "" : "\n";
    return `${contents}${suffix}${replacement}\n`;
  }
  return replaceRange(contents, target.start, target.end, replacement);
}

/** Rename and mark the current guest block, returning its existing shared Tailscale address. */
export function migratePrimaryConfig(
  contents: string,
): { contents: string; hostName: string } | Error {
  const currentMarked = markedContents(contents, PRIMARY);
  if (currentMarked !== undefined) {
    const hostName = blockHostName(currentMarked);
    if (hostName === undefined)
      return new Error(`the ${PRIMARY} config block has no HostName`);
    const currentPort =
      /^\s*Port\s+(\d+)\s*$/imu.exec(currentMarked)?.[1] ?? "2222";
    const distro =
      /^\s*# WSL-Distro:\s*(\S+)\s*$/imu.exec(currentMarked)?.[1] ??
      PRIMARY_DISTRO_RECORD.distro;
    const currentBlock = markedBlock(
      PRIMARY,
      [PRIMARY, PRIMARY_CODE],
      distro,
      hostName,
      Number(currentPort),
      /^\s*Tag\s+smart-open\s*$/imu.test(currentMarked),
    );
    return {
      contents: replaceMarked(contents, PRIMARY, currentBlock) ?? contents,
      hostName,
    };
  }

  const all = hostBlocks(contents);
  const old = all.find(
    (block) =>
      block.aliases.length === 2 &&
      block.aliases.includes(OLD_PRIMARY) &&
      block.aliases.includes(OLD_PRIMARY_CODE),
  );
  const current = all.find(
    (block) =>
      block.aliases.length === 2 &&
      block.aliases.includes(PRIMARY) &&
      block.aliases.includes(PRIMARY_CODE),
  );
  const source = old ?? current;
  if (source === undefined) {
    return new Error(`~/.ssh/config.local needs a ${PRIMARY} HostName block`);
  }
  const hostName = blockHostName(source.text);
  if (hostName === undefined)
    return new Error(`the ${PRIMARY} config block has no HostName`);
  const port = /^\s*Port\s+(\d+)\s*$/imu.exec(source.text)?.[1] ?? "2222";
  const distro =
    /^\s*# WSL-Distro:\s*(\S+)\s*$/imu.exec(source.text)?.[1] ??
    PRIMARY_DISTRO_RECORD.distro;
  const smartOpen = /^\s*Tag\s+smart-open\s*$/imu.test(source.text);
  const replacement = markedBlock(
    PRIMARY,
    [PRIMARY, PRIMARY_CODE],
    distro,
    hostName,
    Number(port),
    smartOpen,
  );
  const contentsAfter =
    old === undefined && current !== undefined
      ? replaceHostAliases(contents, current.aliases, replacement)
      : replaceHostAliases(
          contents,
          [OLD_PRIMARY, OLD_PRIMARY_CODE],
          replacement,
        );
  return { contents: contentsAfter, hostName };
}

/** Update only this alias's marked block; unrelated SSH blocks remain byte-for-byte intact. */
export function writeAliasBlock(
  contents: string,
  alias: string,
  distro: string,
  hostName: string,
  port: number,
): string {
  const replacement = markedBlock(
    alias,
    [alias, `${alias}-code`],
    distro,
    hostName,
    port,
    true,
  );
  const updated = replaceMarked(contents, alias, replacement);
  return (
    updated ??
    replaceHostAliases(contents, [alias, `${alias}-code`], replacement)
  );
}

export async function updateConfigLocal(
  path: string,
  alias: string,
  distro: string,
  port: number,
): Promise<void | Error> {
  const contents = await Bun.file(path)
    .text()
    .catch(() => "");
  const migrated = migratePrimaryConfig(contents);
  if (migrated instanceof Error) return migrated;
  const updated = writeAliasBlock(
    migrated.contents,
    alias,
    distro,
    migrated.hostName,
    port,
  );
  await Bun.write(path, updated);
}

export async function ensurePrimaryConfig(path: string): Promise<void | Error> {
  const contents = await Bun.file(path)
    .text()
    .catch(() => "");
  const migrated = migratePrimaryConfig(contents);
  if (migrated instanceof Error) return migrated;
  await Bun.write(path, migrated.contents);
}

function psEncoded(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function guestSetupScript(options: Options, publicKeyBase64: string): string {
  const { port } = options;
  return `set -eu
if ! id fuyu >/dev/null 2>&1; then useradd --create-home --shell /bin/bash fuyu; fi
usermod -aG sudo fuyu
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y openssh-server sudo
install -d -m 755 /etc/ssh/sshd_config.d
printf 'Port ${port}\\nListenAddress 0.0.0.0\\nPubkeyAuthentication yes\\n' > /etc/ssh/sshd_config.d/00-dotfiles-port.conf
printf '[boot]\\nsystemd=true\\n\\n[user]\\ndefault=fuyu\\n' > /etc/wsl.conf
install -d -m 700 -o fuyu -g fuyu /home/fuyu/.ssh
key=$(printf '%s' '${publicKeyBase64}' | base64 -d)
grep -Fqx -- "$key" /home/fuyu/.ssh/authorized_keys 2>/dev/null || printf '%s\\n' "$key" >> /home/fuyu/.ssh/authorized_keys
chown fuyu:fuyu /home/fuyu/.ssh/authorized_keys
chmod 600 /home/fuyu/.ssh/authorized_keys
/usr/sbin/sshd -t
systemctl enable --now ssh
systemctl is-enabled --quiet ssh
systemctl is-active --quiet ssh
`;
}

export function hostProvisionScript(
  options: Options,
  publicKeyBase64: string,
): string {
  const guestScript = guestSetupScript(options, publicKeyBase64);
  return `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Distro = '${options.name}'
$Image = '${options.image}'
$Port = ${options.port}
$Help = (wsl.exe --help 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'wsl.exe --help failed' }
if ($Help -notmatch '--name' -or $Help -notmatch '--no-launch') { throw 'Installed wsl.exe does not support --name and --no-launch' }
$Online = (wsl.exe --list --online 2>&1 | Out-String).Replace([char]0, '')
if ($LASTEXITCODE -ne 0) { throw 'wsl.exe --list --online failed' }
if ($Online -notmatch ('(?im)^\\s*' + [regex]::Escape($Image) + '(?:\\s|$)')) { throw "Image not listed online: $Image" }
$Installed = ((wsl.exe --list --quiet 2>&1 | Out-String).Replace([char]0, '') -split '\\r?\\n' | ForEach-Object { $_.Trim().TrimStart('*').Trim() })
if ($Installed -notcontains $Distro) {
  if ($Help -match '--distribution') {
    Write-Output 'install form: wsl.exe --install --distribution <image> --name <distro> --no-launch'
    wsl.exe --install --distribution $Image --name $Distro --no-launch
  } else {
    Write-Output 'install form: wsl.exe --install <image> --name <distro> --no-launch'
    wsl.exe --install $Image --name $Distro --no-launch
  }
  if ($LASTEXITCODE -ne 0) { throw 'WSL distro installation failed' }
} else { Write-Output "already installed: $Distro" }
$GuestScript = @'
${guestScript.trimEnd()}
'@
& wsl.exe -d $Distro -u root --exec bash -lc $GuestScript
if ($LASTEXITCODE -ne 0) { throw 'guest initialization or sshd verification failed' }
Write-Output "guest sshd is enabled on port $Port"
`;
}

export function generatePlan(
  options: Options,
  keyBase64 = "<public-key-base64>",
): PlannedCommand[] {
  const wakePath = join(import.meta.dir, "wsl-wake.ts");
  const wakeArgs = [
    "bun",
    wakePath,
    ...(options.host === undefined ? [] : ["--host", options.host]),
  ];
  const provision = hostProvisionScript(options, keyBase64);
  const hostCommand = `pwsh -NoProfile -EncodedCommand ${psEncoded(provision)}`;
  return [
    {
      label: `mark and rename the ${PRIMARY} block in ~/.ssh/config.local`,
      argv: ["write-config-local", join(homedir(), ".ssh", "config.local")],
    },
    {
      label: "wake r99-u24 so its Tailscale address is active",
      argv: wakeArgs,
    },
    {
      label: "check image/help and install/configure distro over Windows SSH",
      argv: ["ssh", options.host ?? "<host selected by wsl:wake>", hostCommand],
    },
    {
      label: `write marked ~/.ssh/config.local block for ${options.alias}`,
      argv: ["write-config-local", join(homedir(), ".ssh", "config.local")],
    },
    {
      label: `verify ssh ${options.alias} and print OS identity`,
      argv: ["ssh", options.alias, "uname -a; cat /etc/os-release | head -2"],
    },
  ];
}

export function validateOptions(parsed: {
  flags: {
    name: string | undefined;
    image: string | undefined;
    port: number | undefined;
    alias: string | undefined;
    host: string | undefined;
    dryRun: boolean;
  };
  _: unknown[];
}): Options | Error {
  const name = parsed.flags.name ?? "";
  const image = parsed.flags.image ?? "";
  const port = parsed.flags.port ?? Number.NaN;
  const alias = parsed.flags.alias ?? "";
  const host = parsed.flags.host ?? "";
  const { dryRun } = parsed.flags;
  if (parsed._.length > 0)
    return new Error(`Unexpected argument '${String(parsed._[0])}'`);
  if (name.trim() === "" || image.trim() === "" || alias.trim() === "") {
    return new Error("--name, --image, and --alias are required");
  }
  if (!validWslName(name) || !validWslName(image))
    return new Error(
      "--name and --image may contain only letters, numbers, dot, underscore, and hyphen",
    );
  if (
    !validAlias(alias) ||
    alias === "r99" ||
    alias === "r99-lan" ||
    alias === PRIMARY
  ) {
    return new Error(`invalid or reserved SSH alias '${alias}'`);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return new Error("--port must be an integer from 1 through 65535");
  }
  if (host !== "" && host !== "r99-lan" && host !== "r99") {
    return new Error("--host must be r99-lan or r99");
  }
  return {
    name,
    image,
    port,
    alias,
    host: host === "" ? undefined : host,
    dryRun,
  };
}

type RunResult = { code: number; out: string; timedOut: boolean };

async function runCommand(
  argv: string[],
  timeoutMs: number,
): Promise<RunResult> {
  const signal = AbortSignal.timeout(timeoutMs);
  const proc = Bun.spawn(argv, { stdout: "pipe", stderr: "pipe", signal });
  const output = Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).then(([stdout, stderr, code]) => ({ code, out: `${stdout}${stderr}` }));
  const timed = new Promise<null>((resolve) => {
    signal.addEventListener(
      "abort",
      () => {
        resolve(null);
      },
      { once: true },
    );
  });
  const result = await Promise.race([output, timed]);
  return result === null
    ? { code: -1, out: "", timedOut: true }
    : { ...result, out: result.out.replaceAll("\r", ""), timedOut: false };
}

async function main(): Promise<number | Error> {
  const parsed = cli(
    {
      name: "wsl-distro.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: [],
      help: {
        description:
          "Create a named WSL distro and SSH alias. Requires r99-u24 up: its Tailscale daemon owns the shared utility-VM address.",
      },
      flags: {
        name: { type: String, description: "WSL distro registration name" },
        image: {
          type: String,
          description: "image listed by wsl --list --online",
        },
        port: { type: Number, description: "guest sshd port" },
        alias: {
          type: String,
          description: "SSH alias to add to ~/.ssh/config.local",
        },
        host: {
          type: String,
          description: "Windows SSH alias: r99-lan or r99",
        },
        dryRun: {
          type: Boolean,
          default: false,
          description: "print every planned command without running it",
        },
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  const options = validateOptions(parsed);
  if (options instanceof Error) return options;
  const plan = generatePlan(options);
  if (options.dryRun) {
    for (const command of plan) {
      process.stdout.write(`${command.label}: ${command.argv.join(" ")}\n`);
    }
    process.stdout.write(
      "Remote PowerShell actions (one encoded host command): wsl.exe --help; wsl.exe --list --online; check image; wsl.exe --install --distribution <image> --name <distro> --no-launch (or positional image form when --distribution is absent); create sudo user; configure systemd and sshd; install the public key; enable and verify ssh.service.\n",
    );
    return 0;
  }
  const keyPath = join(homedir(), ".ssh", "id_ed25519.pub");
  const publicKey = await Bun.file(keyPath)
    .text()
    .catch(() => "");
  if (
    !publicKey.trim().startsWith("ssh-") &&
    !publicKey.trim().startsWith("ecdsa-")
  ) {
    return new Error(`missing or invalid public key: ${keyPath}`);
  }
  if (Bun.which("ssh") === null || Bun.which("bun") === null)
    return new Error("ssh and bun must be on PATH");

  const primaryConfig = await ensurePrimaryConfig(
    join(homedir(), ".ssh", "config.local"),
  );
  if (primaryConfig instanceof Error) return primaryConfig;
  process.stdout.write(`renamed and marked ${PRIMARY} SSH block\n`);

  const wakePlan = plan[1];
  process.stdout.write(`wake: ${wakePlan?.argv.join(" ")}\n`);
  const wake = await runCommand(wakePlan?.argv ?? [], 180_000);
  process.stdout.write(wake.out);
  if (wake.code !== 0 || wake.timedOut)
    return new Error("wsl:wake failed; the utility VM must be up first");
  const host = /^host:\s+(\S+)/imu.exec(wake.out)?.[1];
  if (host === undefined)
    return new Error("wsl:wake did not report its selected Windows host alias");

  const provision = hostProvisionScript(
    options,
    Buffer.from(publicKey.trim()).toString("base64"),
  );
  const hostCommand = `pwsh -NoProfile -EncodedCommand ${psEncoded(provision)}`;
  const provisionArgv = ["ssh", "-o", "ConnectTimeout=10", host, hostCommand];
  process.stdout.write(
    `provision: ssh ${host} pwsh -NoProfile -EncodedCommand <powershell-script>\n`,
  );
  const provisioned = await runCommand(provisionArgv, 900_000);
  process.stdout.write(provisioned.out);
  if (provisioned.code !== 0 || provisioned.timedOut)
    return new Error("remote WSL distro provisioning failed");

  const configResult = await updateConfigLocal(
    join(homedir(), ".ssh", "config.local"),
    options.alias,
    options.name,
    options.port,
  );
  if (configResult instanceof Error) return configResult;
  process.stdout.write(
    `updated marked SSH blocks in ${join(homedir(), ".ssh", "config.local")}\n`,
  );

  const verifyArgv = [
    "ssh",
    options.alias,
    "uname -a; cat /etc/os-release | head -2",
  ];
  process.stdout.write(`verify: ${verifyArgv.join(" ")}\n`);
  const verified = await runCommand(verifyArgv, 60_000);
  process.stdout.write(verified.out);
  return verified.code === 0 && !verified.timedOut
    ? 0
    : new Error("final SSH verification failed");
}

if (import.meta.main) {
  const result = await Promise.try(main).then(
    (value) => value,
    (error: unknown) =>
      new Error(error instanceof Error ? error.message : String(error)),
  );
  if (result instanceof Error) {
    process.stderr.write(`FATAL: ${result.message}\n`);
    process.exitCode = 2;
  } else {
    process.exitCode = result;
  }
}
