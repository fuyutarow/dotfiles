import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const wrapper = join(import.meta.dir, "../bun-exec.sh");
const temporary: string[] = [];
afterEach(() => {
  for (const path of temporary.splice(0))
    rmSync(path, { recursive: true, force: true });
});

test("bun-exec replaces itself with Bun and clears MISE_CONFIG_FILE", async () => {
  const temp = mkdtempSync(join(tmpdir(), "bun-exec-test-"));
  temporary.push(temp);
  const home = join(temp, "home");
  const fakeBin = join(temp, "bin");
  mkdirSync(join(home, "dotfiles"), { recursive: true });
  mkdirSync(fakeBin, { recursive: true });

  const mise = join(fakeBin, "mise");
  writeFileSync(
    mise,
    '#!/bin/sh\n[ "$MISE_CONFIG_FILE" = "$HOME/dotfiles/mise.toml" ] || exit 21\n[ "$1" = which ] && [ "$2" = bun ] || exit 22\nprintf \'%s\\n\' "$TEST_BUN_PATH"\n',
  );
  chmodSync(mise, 0o755);

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
        MISE_CONFIG_FILE: "/caller/override.toml",
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        TEST_BUN_PATH: process.execPath,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  await Bun.sleep(250);
  const exitCode = await child.exited;
  const stdout = await new Response(child.stdout).text();
  const stderr = await new Response(child.stderr).text();

  expect(exitCode).toBe(0);
  expect(stdout).toBe(JSON.stringify({ ppid: process.pid, config: null }));
  expect(stderr).toBe("");
});
