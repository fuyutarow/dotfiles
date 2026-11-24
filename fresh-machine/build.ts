// `mise run test:fresh` — does an empty Linux machine become a working one through
// scripts/bootstrap-linux.sh? Builds fresh-machine/Dockerfile from the files jj tracks in
// this checkout (uncommitted edits included), so an init change is tried before it is pushed.
//
// Not part of `test`: the build installs Homebrew and Brewfile.core from nothing and takes many
// minutes. Run it when the init path changes. A container cannot show systemd user units, /etc
// links, the login shell or WSL's services; a pass here does not cover those.
// Exit: 0 the image built · 1 the bootstrap failed (its output says where) · 2 no runner or usage.
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { Result } from "@dotfiles/shared/src/result.ts";

const ROOT = join(import.meta.dir, "..");
const say = (line: string): void => {
  process.stdout.write(`test:fresh: ${line}\n`);
};

async function capture(argv: string[], cwd: string) {
  const child = Bun.spawn(argv, {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return code === 0
    ? Result.ok(out)
    : Result.err(`${argv.join(" ")} exited ${code}: ${err.trim()}`);
}

async function main(): Promise<number> {
  // wslc.exe is WSL's own container CLI; it takes a Windows path for the build context.
  const runner = ["docker", "podman", "wslc.exe"].find(
    (name) => Bun.which(name) !== null,
  );
  if (runner === undefined) {
    say("no container runner on PATH (docker, podman or wslc.exe)");
    return 2;
  }
  const tracked = await capture(
    ["jj", "file", "list", "-T", 'path ++ "\\0"'],
    ROOT,
  );
  if (tracked.isErr()) {
    say(tracked.error);
    return 2;
  }
  const context = await mkdtemp(join(tmpdir(), "dotfiles-fresh-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(context, { recursive: true, force: true }),
  };
  const paths = tracked.value.split("\0").filter(Boolean);
  for (const path of paths) {
    const target = join(context, "dotfiles", path);
    await mkdir(dirname(target), { recursive: true });
    // A tracked path deleted in the working copy is simply absent from the seed. Tracked
    // symlinks are copied as their targets: wslc sends the context through a Windows share
    // that cannot read a link ("readlink …: function not implemented").
    await cp(join(ROOT, path), target, {
      dereference: true,
      recursive: true,
    }).catch(() => {});
  }
  await cp(join(ROOT, "fresh-machine/Dockerfile"), join(context, "Dockerfile"));
  let where = context;
  if (runner === "wslc.exe") {
    const windows = await capture(["wslpath", "-w", context], ROOT);
    if (windows.isErr()) {
      say(windows.error);
      return 2;
    }
    where = windows.value.trim();
  }
  say(
    `${runner} build: ${paths.length} tracked files, fresh-machine/Dockerfile`,
  );
  const build = Bun.spawn([runner, "build", "-t", "dotfiles-fresh", where], {
    cwd: ROOT,
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
    timeout: 3_600_000,
  });
  const code = await build.exited;
  say(code === 0 ? "PASS — the bootstrap completed" : `FAIL — exit ${code}`);
  return code === 0 ? 0 : 1;
}

process.exitCode = await main();
