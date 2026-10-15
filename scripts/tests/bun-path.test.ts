import { afterEach, expect, test } from "bun:test";
import {
  chmod,
  copyFile,
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

test("a non-interactive bin selects dotfiles Bun config and keeps caller cwd without ssh", async () => {
  const temp = await mkdtemp(join(tmpdir(), "bun-path-test-"));
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
    await mkdir(path, { recursive: true });

  const deployedBun = join(localBin, "bun");
  await copyFile(wrapper, deployedBun);
  await chmod(deployedBun, 0o755);

  const mise = join(fakeBin, "mise");
  await writeFile(
    mise,
    `#!/bin/sh\n[ "$MISE_CONFIG_FILE" = "$HOME/dotfiles/mise.toml" ] || exit 21\n[ "$1" = which ] || exit 22\n[ "$2" = bun ] || exit 23\nprintf '%s\\n' "$HOME/dotfiles/.runtime/bun"\n`,
  );
  await chmod(mise, 0o755);

  const runtime = join(runtimeBin, "bun");
  await writeFile(
    runtime,
    `#!/bin/sh\n[ -z "$MISE_CONFIG_FILE" ] || exit 30\nprintf 'cwd=%s\\n' "$PWD"\nprintf 'argv:'\nprintf ' <%s>' "$@"\nprintf '\\n'\n`,
  );
  await chmod(runtime, 0o755);

  const entry = join(userBins, "agx");
  await writeFile(entry, "#!/usr/bin/env bun\n");
  await chmod(entry, 0o755);
  const result = await spawn([entry, "--help"], {
    cwd: working,
    env: { HOME: home, PATH: localBin + ":" + fakeBin + ":/bin:/usr/bin" },
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.exitCode).toBe(0);
  expect(result.stdout.toString()).toContain(
    "cwd=" + (await realpath(working)) + "\n",
  );
  expect(result.stdout.toString()).toContain("argv: <" + entry + "> <--help>");
  expect(result.stderr.toString()).toBe("");
});

// Drain both pipes while waiting so a child cannot block on a full output buffer.
async function spawn(
  command: string[],
  options: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    timeout?: number;
    maxBuffer?: number;
    stdin?: Blob;
    stdout?: "pipe";
    stderr?: "pipe";
  } = {},
) {
  const proc = Bun.spawn(command, {
    ...options,
    stdin: options.stdin ?? "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).arrayBuffer(),
    proc.exited,
  ]);
  return { stdout: Buffer.from(stdout), stderr: Buffer.from(stderr), exitCode };
}
