import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cli } from "cleye";
import {
  hasScriptAgeProvider,
  parseSecretSpecs,
  SECRETS_PUSH_CLI_OPTIONS,
} from "../src/secrets-push.ts";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

async function fixture(mismatch = false): Promise<{
  root: string;
  env: Record<string, string>;
}> {
  const root = await mkdtemp(join(tmpdir(), "secrets-push-test-"));
  roots.push(root);
  const bin = join(root, "bin");
  const target = join(root, "target-home");
  await mkdir(bin);
  await mkdir(join(target, ".config", "fnox"), { recursive: true });
  await writeFile(
    join(target, ".config", "fnox", "config.toml"),
    '[providers.age]\ntype = "age"\nkey_file = "~/.config/fnox/age.txt"\n',
  );
  await writeFile(join(target, "EXISTING_KEY"), "preserve-me");
  const fnox = [
    "#!/bin/sh",
    "set -eu",
    'printf \'%s\\n\' "$*" >> "$CALL_LOG"',
    'if [ "$1" = "-c" ]; then shift 2; fi',
    'case "$1" in',
    "  get)",
    '    name="$2"',
    '    if [ "$FNOX_ROLE" = "source" ]; then',
    "      case \"$name\" in TYPESAFE_API_KEY) printf 'local-secret\\n';; RELAY_KEY) printf 'remote-secret\\n';; FROM_FILE) printf 'file-secret';; esac",
    "      exit 0",
    "    fi",
    '    if [ ! -f "$TARGET_HOME/$name" ]; then exit 1; fi',
    '    if [ "$MISMATCH" = "1" ]; then printf X; tail -c +2 "$TARGET_HOME/$name"; else cat "$TARGET_HOME/$name"; fi',
    '    printf "\\n"',
    "    ;;",
    "  set)",
    '    name="$2"',
    '    bun -e "process.stdout.write((await Bun.stdin.text()).replace(/^\\p{White_Space}+|\\p{White_Space}+$/gu, \'\'))" > "$TARGET_HOME/$name"',
    "    printf '✓ Set secret\\\\n'",
    "    ;;",
    "  *) exit 2;;",
    "esac",
    "",
  ].join("\n");
  await writeFile(join(bin, "fnox"), fnox, { mode: 0o700 });
  const ssh = [
    "#!/bin/sh",
    "set -eu",
    'printf "%s\\n" "$*" >> "$SSH_LOG"',
    'while [ "$#" -gt 0 ]; do case "$1" in -o) shift 2;; *) break;; esac; done',
    'host="$1"; shift',
    'cmd="$1"',
    'if [ "$host" = "source-box" ]; then FNOX_ROLE=source HOME="$SOURCE_HOME" /bin/sh -c "$cmd";',
    'else FNOX_ROLE=target HOME="$TARGET_HOME" PATH="$PATH" /bin/sh -c "$cmd"; fi',
    "",
  ].join("\n");
  await writeFile(join(bin, "ssh"), ssh, { mode: 0o700 });
  await writeFile(
    join(bin, "age-keygen"),
    [
      "#!/bin/sh",
      'printf "%s\\n" "# public key: age1fixture" "AGE-SECRET-KEY-1fixture" > "$2"',
      "",
    ].join("\n"),
    { mode: 0o700 },
  );
  const sourceHome = join(root, "source-home");
  await mkdir(sourceHome);
  await writeFile(join(sourceHome, "secret.bin"), "file-secret");
  const callLog = join(root, "argv.log");
  await writeFile(callLog, "");
  return {
    root,
    env: {
      ...process.env,
      PATH: bin + ":" + (process.env.PATH ?? ""),
      HOME: sourceHome,
      SOURCE_HOME: sourceHome,
      TARGET_HOME: target,
      CALL_LOG: callLog,
      SSH_LOG: join(root, "ssh-argv.log"),
      FNOX_ROLE: "source",
      MISMATCH: mismatch ? "1" : "0",
    },
  };
}

async function run(root: string, env: Record<string, string>, args: string[]) {
  const proc = Bun.spawn(
    ["bun", join(import.meta.dir, "../src/secrets-push.ts"), ...args],
    {
      cwd: root,
      env,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { out, err, code };
}

describe("secrets:push CLI and config ownership", () => {
  test("defaults to TYPESAFE_API_KEY and accepts repeatable --secret", () => {
    const defaults = cli(SECRETS_PUSH_CLI_OPTIONS, undefined, ["target"]);
    const repeated = cli(SECRETS_PUSH_CLI_OPTIONS, undefined, [
      "--secret",
      "A",
      "--secret",
      "B=@/tmp/key",
      "target",
    ]);
    expect(defaults._.target).toBe("target");
    expect(parseSecretSpecs([])).toEqual([{ name: "TYPESAFE_API_KEY" }]);
    expect(repeated.flags.secret).toEqual(["A", "B=@/tmp/key"]);
    expect(parseSecretSpecs(repeated.flags.secret)).toEqual([
      { name: "A" },
      { name: "B", path: "/tmp/key" },
    ]);
  });

  test("recognizes only the tool-owned age provider config", () => {
    expect(
      hasScriptAgeProvider(
        '[providers.age]\ntype = "age"\nkey_file = "~/.config/fnox/age.txt"\n',
      ),
    ).toBe(true);
    expect(
      hasScriptAgeProvider('[providers.age]\nkey_file = "~/foreign-age.txt"\n'),
    ).toBe(false);
  });

  test("streams a local source into the existing target config and verifies its digest", async () => {
    const f = await fixture();
    const result = await run(f.root, f.env, ["target-box"]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(
      "TYPESAFE_API_KEY → target-box: SHA-256 matched",
    );
    expect(
      await readFile(join(f.env.TARGET_HOME ?? "", "TYPESAFE_API_KEY"), "utf8"),
    ).toBe("local-secret");
    expect(
      await readFile(join(f.env.TARGET_HOME ?? "", "EXISTING_KEY"), "utf8"),
    ).toBe("preserve-me");
    expect(await readFile(join(f.root, "argv.log"), "utf8")).not.toContain(
      "local-secret",
    );
    expect(await readFile(f.env.SSH_LOG ?? "", "utf8")).not.toContain(
      "local-secret",
    );
  });

  test("reads a named secret from an SSH source host", async () => {
    const f = await fixture();
    const result = await run(f.root, f.env, [
      "--from",
      "source-box",
      "--secret",
      "RELAY_KEY",
      "target-box",
    ]);
    expect(result.code).toBe(0);
    expect(
      await readFile(join(f.env.TARGET_HOME ?? "", "RELAY_KEY"), "utf8"),
    ).toBe("remote-secret");
    expect(await readFile(f.env.SSH_LOG ?? "", "utf8")).not.toContain(
      "remote-secret",
    );
  });

  test("reads NAME=@path verbatim on the source", async () => {
    const f = await fixture();
    const sourcePath = join(f.env.SOURCE_HOME ?? "", "secret.bin");
    const result = await run(f.root, f.env, [
      "--secret",
      "FROM_FILE=@" + sourcePath,
      "target-box",
    ]);
    expect(result.code).toBe(0);
    expect(
      await readFile(join(f.env.TARGET_HOME ?? "", "FROM_FILE"), "utf8"),
    ).toBe("file-secret");
  });

  test("reads NAME=@path from the selected SSH source host", async () => {
    const f = await fixture();
    const result = await run(f.root, f.env, [
      "--from",
      "source-box",
      "--secret",
      "FROM_FILE=@~/secret.bin",
      "target-box",
    ]);
    expect(result.code).toBe(0);
    expect(
      await readFile(join(f.env.TARGET_HOME ?? "", "FROM_FILE"), "utf8"),
    ).toBe("file-secret");
  });

  test.each(["\n", "\n\n", "\r\n"])(
    "verifies a file ending in %j and discloses fnox trimming",
    async (ending) => {
      const f = await fixture();
      const path = join(f.env.SOURCE_HOME ?? "", "secret.bin");
      await writeFile(path, "file-secret" + ending);
      const result = await run(f.root, f.env, [
        "--secret",
        "FROM_FILE=@" + path,
        "target-box",
      ]);
      expect(result.code).toBe(0);
      expect(result.out).toContain("fnox set trimmed surrounding whitespace");
      expect(
        await readFile(join(f.env.TARGET_HOME ?? "", "FROM_FILE"), "utf8"),
      ).toBe("file-secret");
    },
  );

  test.each(["", "\n"])(
    "rejects a one-byte file mutation with ending %j",
    async (ending) => {
      const f = await fixture(true);
      const path = join(f.env.SOURCE_HOME ?? "", "secret.bin");
      await writeFile(path, "file-secret" + ending);
      const result = await run(f.root, f.env, [
        "--secret",
        "FROM_FILE=@" + path,
        "target-box",
      ]);
      expect(result.code).toBe(1);
      expect(result.err).toContain("SHA-256 mismatch for FROM_FILE");
    },
  );

  test("creates a fresh age config when the target has none", async () => {
    const f = await fixture();
    await rm(join(f.env.TARGET_HOME ?? "", ".config", "fnox", "config.toml"));
    const result = await run(f.root, f.env, [
      "--secret",
      "RELAY_KEY",
      "target-box",
    ]);
    expect(result.code).toBe(0);
    expect(
      await readFile(
        join(f.env.TARGET_HOME ?? "", ".config", "fnox", "config.toml"),
        "utf8",
      ),
    ).toContain('recipients = ["age1fixture"]');
    expect(
      await readFile(
        join(f.env.TARGET_HOME ?? "", ".config", "fnox", "age.txt"),
        "utf8",
      ),
    ).toContain("AGE-SECRET-KEY-1fixture");
  });

  test("refuses a foreign config without running set", async () => {
    const f = await fixture();
    const config = join(
      f.env.TARGET_HOME ?? "",
      ".config",
      "fnox",
      "config.toml",
    );
    await writeFile(
      config,
      '[providers.age]\nkey_file = "~/foreign-age.txt"\n',
    );
    const result = await run(f.root, f.env, [
      "--secret",
      "RELAY_KEY",
      "target-box",
    ]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("foreign");
    expect(await readFile(join(f.root, "argv.log"), "utf8")).not.toContain(
      "set RELAY_KEY",
    );
  });

  test("digest mismatch exits 1 and names the secret", async () => {
    const f = await fixture(true);
    const result = await run(f.root, f.env, [
      "--secret",
      "RELAY_KEY",
      "target-box",
    ]);
    expect(result.code).toBe(1);
    expect(result.err).toContain("SHA-256 mismatch for RELAY_KEY");
    expect(result.err).not.toContain("remote-secret");
  });
});
