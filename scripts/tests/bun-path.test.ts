import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
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

test("a non-interactive bin selects dotfiles Bun config and keeps caller cwd without ssh", () => {
  const temp = mkdtempSync(join(tmpdir(), "bun-path-test-"));
  temporary.push(temp);
  const home = join(temp, "home");
  const localBin = join(home, ".local", "bin");
  const userBins = join(home, ".bun", "bin");
  const dotfiles = join(home, "dotfiles");
  const runtimeBin = join(dotfiles, ".runtime");
  const fakeBin = join(temp, "bin");
  const working = join(temp, "elsewhere");
  for (const path of [
    localBin,
    userBins,
    dotfiles,
    runtimeBin,
    fakeBin,
    working,
  ])
    mkdirSync(path, { recursive: true });

  const deployedBun = join(localBin, "bun");
  copyFileSync(wrapper, deployedBun);
  chmodSync(deployedBun, 0o755);

  const mise = join(fakeBin, "mise");
  writeFileSync(
    mise,
    `#!/bin/sh\n[ "$MISE_CONFIG_FILE" = "$HOME/dotfiles/mise.toml" ] || exit 21\n[ "$1" = which ] || exit 22\n[ "$2" = bun ] || exit 23\nprintf '%s\\n' "$HOME/dotfiles/.runtime/bun"\n`,
  );
  chmodSync(mise, 0o755);

  const runtime = join(runtimeBin, "bun");
  writeFileSync(
    runtime,
    `#!/bin/sh\n[ -z "$MISE_CONFIG_FILE" ] || exit 30\nprintf 'cwd=%s\\n' "$PWD"\nprintf 'argv:'\nprintf ' <%s>' "$@"\nprintf '\\n'\n`,
  );
  chmodSync(runtime, 0o755);

  const entry = join(userBins, "agx");
  writeFileSync(entry, "#!/usr/bin/env bun\n");
  chmodSync(entry, 0o755);
  const result = Bun.spawnSync([entry, "--help"], {
    cwd: working,
    env: { HOME: home, PATH: localBin + ":" + fakeBin + ":/bin:/usr/bin" },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain(
    "cwd=" + realpathSync(working) + "\n",
  );
  expect(result.stdout.toString()).toContain("argv: <" + entry + "> <--help>");
  expect(result.stderr.toString()).toBe("");
});
