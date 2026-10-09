// `mise run secrets:push -- <host> [--rotate]` — give a box the secrets its agents use, through fnox (KEY-VIA-FNOX),
// never as a plaintext file or argv. Today: TYPESAFE_API_KEY (Jev: agx's row pick and
// `rr`'s judge). Run on the machine whose fnox holds the secrets (the Mac: Keychain).
//
// WHERE IT IS SAFE (owner, 2026-10-06: "fnox が安全にできる環境なら配りなよ"). On the box the secret
// sits age-encrypted in ~/.config/fnox/config.toml, but the age identity that opens it sits beside it
// (0600) — so the encryption holds against other users, NOT against the box's root. Push only to a
// box whose root you trust as much as the secret: a rented box of your own (destroyed afterwards),
// R99. Not a shared server whose admins hold root (sol). The command takes the host from you; it
// does not decide this.
//
// Fresh push: a fresh age identity is made HERE (the box needs no age-keygen), each secret is read from
// this machine's fnox and encrypted to it through stdin (`fnox set` — never argv), then the config
// and identity are installed on the box (0600, refusing to overwrite an existing fnox config) and
// `fnox get` there proves they open. To rotate, `--rotate` accepts only a config with this script's
// `[providers.age]` / `key_file` setting, updates each secret through ssh stdin, and proves it opens.
// The local copies are removed. The box needs fnox (Brewfile.core).
// Exit: 0 pushed and verified · 1 a step failed (named) · 2 usage.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";

const SECRETS = ["TYPESAFE_API_KEY"] as const;
const SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];
const AGE_KEY_FILE = "~/.config/fnox/age.txt";

class UsageError extends Error {}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__") {
    process.stderr.write(
      `unknown flag(s): --${flag}\nUsage: mise run secrets:push -- <host>\n`,
    );
    process.exit(2);
  }
}

export const SECRETS_PUSH_CLI_OPTIONS = {
  name: "secrets-push.ts",
  strictFlags: true,
  ignoreArgv: rejectPrototypeFlag,
  parameters: ["<host>"],
  help: {
    description:
      "Push this machine's fnox secrets to an ssh host, age-encrypted (see the header: only to a box whose root you trust).",
  },
  flags: {
    rotate: {
      type: Boolean,
      default: false,
      description:
        "update secrets in an existing config written by this script",
    },
  },
} satisfies {
  name: string;
  strictFlags: true;
  ignoreArgv: typeof rejectPrototypeFlag;
  parameters: ["<host>"];
  help: { description: string };
  flags: {
    rotate: {
      type: BooleanConstructor;
      default: false;
      description: string;
    };
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
      /^\s*key_file\s*=\s*["']~\/\.config\/fnox\/age\.txt["']\s*(?:#.*)?$/u.test(
        line,
      )
    ) {
      return true;
    }
  }
  return false;
}

const say = (line: string): void => {
  process.stdout.write(`secrets:push: ${line}\n`);
};

function fail(line: string): void {
  process.stderr.write(`secrets:push: ${line}\n`);
  process.exitCode = 1;
}

async function rotateSecrets(host: string): Promise<string | null> {
  for (const name of SECRETS) {
    const value = await $`fnox get ${name}`.nothrow().quiet();
    if (value.exitCode !== 0) return `this machine's fnox has no ${name}`;
    const set =
      await $`${SSH} ${host} ${`fnox set ${name} --provider age`} < ${value.stdout}`
        .nothrow()
        .quiet();
    if (set.exitCode !== 0) {
      return `${host}: could not update ${name} with fnox set --provider age`;
    }
    const got =
      await $`${SSH} ${host} ${`fnox get ${name} > /dev/null && echo opened`}`
        .nothrow()
        .text();
    if (!got.includes("opened")) {
      return `${host}: fnox get ${name} did not open after rotation`;
    }
    say(`${name} → ${host}: rotated and opened there`);
  }
  return null;
}

async function main(): Promise<void> {
  const parsed = cli(SECRETS_PUSH_CLI_OPTIONS, undefined, Bun.argv.slice(2));
  if (parsed._.length > 1) {
    process.stderr.write(
      `one host only; unexpected: ${parsed._.slice(1).join(" ")}\nUsage: mise run secrets:push -- <host>\n`,
    );
    process.exitCode = 2;
    return;
  }
  const host = parsed._.host;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(host)) {
    process.stderr.write(
      `not an ssh Host alias: ${host}\nUsage: mise run secrets:push -- <host>\n`,
    );
    process.exitCode = 2;
    return;
  }
  const check =
    await $`${SSH} ${host} ${"command -v fnox > /dev/null && echo fnox-ok; if test -e ~/.config/fnox/config.toml; then echo config-exists; cat ~/.config/fnox/config.toml; fi; true"}`
      .nothrow()
      .text();
  if (!check.includes("fnox-ok")) {
    fail(
      `fnox is not installed on ${host} (it is Brewfile.core: mise run linux:init there)`,
    );
    return;
  }
  if (check.includes("config-exists")) {
    if (!parsed.flags.rotate) {
      fail(
        `${host} already has ~/.config/fnox/config.toml — not overwritten; use --rotate for a config written by this script, or merge by hand`,
      );
      return;
    }
    const remoteConfig = check.slice(check.indexOf("config-exists\n") + 14);
    if (!hasScriptAgeProvider(remoteConfig)) {
      fail(
        `${host}: --rotate requires [providers.age] with key_file = "${AGE_KEY_FILE}"; merge this config by hand`,
      );
      return;
    }
    const rotationError = await rotateSecrets(host);
    if (rotationError !== null) {
      fail(rotationError);
      return;
    }
    say(
      `done. Remove ~/.config/fnox/ on ${host} before retiring it (renting-cloud-gpus: NOTHING-LEFT-BEHIND).`,
    );
    return;
  }

  if (parsed.flags.rotate) {
    fail(`${host} has no ~/.config/fnox/config.toml to rotate`);
    return;
  }

  if (Bun.which("age-keygen") === null) {
    fail("age-keygen is not installed here (brew install age)");
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "secrets-push-"));
  using _cleanup = {
    [Symbol.dispose]: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
  const identity = join(dir, "age.txt");
  await $`age-keygen -o ${identity}`.quiet();
  const recipient = /^# public key: (age1\S+)$/mu.exec(
    readFileSync(identity, "utf8"),
  )?.[1];
  if (recipient === undefined) {
    fail("age-keygen wrote no public key");
    return;
  }
  const config = join(dir, "config.toml");
  writeFileSync(
    config,
    `# fnox on ${host}, pushed by dotfiles scripts/secrets-push.ts. Values are age-encrypted to the\n` +
      `# identity in age.txt beside this file (0600). Remove both when the box is retired.\n` +
      `[providers.age]\ntype = "age"\nrecipients = ["${recipient}"]\nkey_file = "~/.config/fnox/age.txt"\n`,
  );
  for (const name of SECRETS) {
    const value = await $`fnox get ${name}`.nothrow().quiet();
    if (value.exitCode !== 0) {
      fail(`this machine's fnox has no ${name}`);
      return;
    }
    // stdin, never argv: the plaintext appears in no process listing.
    const set =
      await $`fnox -c ${config} set ${name} --provider age < ${value.stdout}`
        .env({ ...process.env, FNOX_AGE_KEY_FILE: identity })
        .nothrow()
        .quiet();
    if (set.exitCode !== 0) {
      fail(`could not encrypt ${name}: ${set.stderr.toString().trim()}`);
      return;
    }
  }

  const install =
    await $`${SSH} ${host} ${"umask 077 && mkdir -p ~/.config/fnox && cat > ~/.config/fnox/age.txt"} < ${Bun.file(identity)}`.nothrow();
  if (install.exitCode !== 0) {
    fail(`could not install the age identity on ${host}`);
    return;
  }
  const conf =
    await $`${SSH} ${host} ${"umask 077 && cat > ~/.config/fnox/config.toml"} < ${Bun.file(config)}`.nothrow();
  if (conf.exitCode !== 0) {
    fail(`could not install the fnox config on ${host}`);
    return;
  }

  for (const name of SECRETS) {
    const got =
      await $`${SSH} ${host} ${`fnox get ${name} > /dev/null && echo opened`}`
        .nothrow()
        .text();
    if (!got.includes("opened")) {
      fail(
        `${host}: fnox get ${name} did not open — config left in place for inspection`,
      );
      return;
    }
    say(
      `${name} → ${host}: age-encrypted in ~/.config/fnox/config.toml, opens there`,
    );
  }
  say(
    `done. Remove ~/.config/fnox/ on ${host} before retiring it (renting-cloud-gpus: NOTHING-LEFT-BEHIND).`,
  );
}

if (import.meta.main) {
  const r = await attempt(main);
  if (!r.ok) {
    const usage = r.error instanceof UsageError;
    process.stderr.write(
      usage
        ? `${errorMessage(r.error)}\nUsage: mise run secrets:push -- <host>\n`
        : `FATAL: ${errorMessage(r.error)}\n`,
    );
    process.exitCode = 2;
  }
}
