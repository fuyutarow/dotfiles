import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wrapper = join(import.meta.dir, "../bun-exec.sh");
const temporary: string[] = [];
afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});

test("bun-exec replaces itself with Bun and clears MISE_CONFIG_FILE", async () => {
  const temp = await mkdtemp(join(tmpdir(), "bun-exec-test-"));
  temporary.push(temp);
  const home = join(temp, "home");
  const fakeBin = join(temp, "bin");
  await mkdir(join(home, "dotfiles"), { recursive: true });
  await mkdir(fakeBin, { recursive: true });

  const mise = join(fakeBin, "mise");
  await writeFile(
    mise,
    '#!/bin/sh\n[ "$MISE_CONFIG_FILE" = "$TEST_CONFIG" ] || exit 21\n[ "$1" = which ] && [ "$2" = bun ] || exit 22\nprintf \'%s\\n\' "$TEST_BUN_PATH"\n',
  );
  await chmod(mise, 0o755);

  const child = Bun.spawn(
    [
      wrapper,
      "-e",
      "await Bun.sleep(2500); process.stdout.write(JSON.stringify({ ppid: process.ppid, config: process.env.MISE_CONFIG_FILE ?? null }));",
    ],
    {
      env: {
        ...process.env,
        HOME: home,
        DOTFILES: "",
        TEST_CONFIG: join(import.meta.dir, "../../mise.toml"),
        MISE_CONFIG_FILE: "/caller/override.toml",
        PATH: `${fakeBin}:${process.env["PATH"] ?? ""}`,
        TEST_BUN_PATH: process.execPath,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  await Bun.sleep(250);
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  expect(exitCode).toBe(0);
  expect(stdout).toBe(JSON.stringify({ ppid: process.pid, config: null }));
  expect(stderr).toBe("");
});

test("bun-exec uses DOTFILES with a temporary HOME and preserves cwd", async () => {
  const temp = await mkdtemp(join(tmpdir(), "bun-exec-render-"));
  temporary.push(temp);
  const root = join(temp, "checkout");
  const bin = join(temp, "bin");
  await mkdir(root);
  await mkdir(bin);
  await writeFile(join(root, "mise.toml"), '[tools]\nbun = "1.4"\n');
  await writeFile(
    join(bin, "mise"),
    '#!/bin/sh\n[ "$MISE_CONFIG_FILE" = "$DOTFILES/mise.toml" ] || exit 21\nprintf \'%s\\n\' "$TEST_BUN_PATH"\n',
  );
  await chmod(join(bin, "mise"), 0o755);
  const child = Bun.spawn(
    [
      wrapper,
      "-e",
      "process.stdout.write(JSON.stringify({cwd:process.cwd(),config:process.env.MISE_CONFIG_FILE??null}));",
    ],
    {
      cwd: temp,
      env: {
        ...process.env,
        HOME: join(temp, "scratch"),
        DOTFILES: root,
        PATH: `${bin}:${process.env["PATH"] ?? ""}`,
        TEST_BUN_PATH: process.execPath,
        MISE_CONFIG_FILE: "/caller/config.toml",
      },
      stdout: "pipe",
      stderr: "pipe",
      timeout: 10_000,
    },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  expect(err).toBe("");
  expect(out).toBe(JSON.stringify({ cwd: await realpath(temp), config: null }));
});
