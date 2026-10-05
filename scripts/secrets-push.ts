// `mise run secrets:push -- <host>` — give a box the secrets its agents use, through fnox (KEY-VIA-FNOX),
// never as a plaintext file or argv. Today: TYPESAFE_API_KEY (Jev: agent-router's row pick and
// `rr`'s judge). Run on the machine whose fnox holds the secrets (the Mac: Keychain).
//
// WHERE IT IS SAFE (owner, 2026-10-06: "fnox が安全にできる環境なら配りなよ"). On the box the secret
// sits age-encrypted in ~/.config/fnox/config.toml, but the age identity that opens it sits beside it
// (0600) — so the encryption holds against other users, NOT against the box's root. Push only to a
// box whose root you trust as much as the secret: a rented box of your own (destroyed afterwards),
// R99. Not a shared server whose admins hold root (sol). The command takes the host from you; it
// does not decide this.
//
// Steps: a fresh age identity is made HERE (the box needs no age-keygen), each secret is read from
// this machine's fnox and encrypted to it through stdin (`fnox set` — never argv), then the config
// and identity are installed on the box (0600, refusing to overwrite an existing fnox config) and
// `fnox get` there proves they open. The local copies are removed. The box needs fnox (Brewfile.core).
// Exit: 0 pushed and verified · 1 a step failed (named) · 2 usage.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";
import { cli } from "cleye";
import { attempt, errorMessage } from "../agents/hooks/attempt.ts";

const SECRETS = ["TYPESAFE_API_KEY"] as const;
const SSH = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15"];

class UsageError extends Error {}

function rejectPrototypeFlag(
  type: "known-flag" | "unknown-flag" | "argument",
  flag: string,
): void {
  if (type === "unknown-flag" && flag === "__proto__")
    throw new UsageError(`unknown flag(s): --${flag}`);
}

const say = (line: string): void => {
  process.stdout.write(`secrets:push: ${line}\n`);
};

function fail(line: string): never {
  process.stderr.write(`secrets:push: ${line}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const parsed = cli(
    {
      name: "secrets-push.ts",
      strictFlags: true,
      ignoreArgv: rejectPrototypeFlag,
      parameters: ["<host>"],
      help: {
        description:
          "Push this machine's fnox secrets to an ssh host, age-encrypted (see the header: only to a box whose root you trust).",
      },
    },
    undefined,
    Bun.argv.slice(2),
  );
  if (parsed._.length > 1)
    throw new UsageError(
      `one host only; unexpected: ${parsed._.slice(1).join(" ")}`,
    );
  const host = parsed._.host;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(host))
    throw new UsageError(`not an ssh Host alias: ${host}`);
  if (Bun.which("age-keygen") === null)
    fail("age-keygen is not installed here (brew install age)");

  const check =
    await $`${SSH} ${host} ${"command -v fnox > /dev/null && echo fnox-ok; test -e ~/.config/fnox/config.toml && echo config-exists; true"}`
      .nothrow()
      .text();
  if (!check.includes("fnox-ok"))
    fail(
      `fnox is not installed on ${host} (it is Brewfile.core: mise run linux:init there)`,
    );
  if (check.includes("config-exists"))
    fail(
      `${host} already has ~/.config/fnox/config.toml — not overwritten; merge by hand or move it aside`,
    );

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
  if (recipient === undefined) fail("age-keygen wrote no public key");
  const config = join(dir, "config.toml");
  writeFileSync(
    config,
    `# fnox on ${host}, pushed by dotfiles scripts/secrets-push.ts. Values are age-encrypted to the\n` +
      `# identity in age.txt beside this file (0600). Remove both when the box is retired.\n` +
      `[providers.age]\ntype = "age"\nrecipients = ["${recipient}"]\nkey_file = "~/.config/fnox/age.txt"\n`,
  );
  for (const name of SECRETS) {
    const value = await $`fnox get ${name}`.nothrow().quiet();
    if (value.exitCode !== 0) fail(`this machine's fnox has no ${name}`);
    // stdin, never argv: the plaintext appears in no process listing.
    const set =
      await $`fnox -c ${config} set ${name} --provider age < ${value.stdout}`
        .env({ ...process.env, FNOX_AGE_KEY_FILE: identity })
        .nothrow()
        .quiet();
    if (set.exitCode !== 0)
      fail(`could not encrypt ${name}: ${set.stderr.toString().trim()}`);
  }

  const install =
    await $`${SSH} ${host} ${"umask 077 && mkdir -p ~/.config/fnox && cat > ~/.config/fnox/age.txt"} < ${Bun.file(identity)}`.nothrow();
  if (install.exitCode !== 0)
    fail(`could not install the age identity on ${host}`);
  const conf =
    await $`${SSH} ${host} ${"umask 077 && cat > ~/.config/fnox/config.toml"} < ${Bun.file(config)}`.nothrow();
  if (conf.exitCode !== 0) fail(`could not install the fnox config on ${host}`);

  for (const name of SECRETS) {
    const got =
      await $`${SSH} ${host} ${`fnox get ${name} > /dev/null && echo opened`}`
        .nothrow()
        .text();
    if (!got.includes("opened"))
      fail(
        `${host}: fnox get ${name} did not open — config left in place for inspection`,
      );
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
