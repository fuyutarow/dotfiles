// Linuxbrew installation and conservative retirement of the old dotfiles downloader links.
// Never removes mise installs or changes processes: existing jobs can keep their original executable/PATH.
import {
  mkdirSync,
  readlinkSync,
  realpathSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
} from "node:fs";
import { access, lstat, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { $ } from "bun";
import { LINUXBREW } from "./core-tools.ts";
import { attemptOr } from "../agents/hooks/attempt.ts";

export async function installLinuxbrew(
  prefix: string,
  say: (line: string) => void,
): Promise<void> {
  if (await Bun.file(join(prefix, "bin/brew")).exists()) return;
  if (prefix !== LINUXBREW) {
    say(
      `bootstrap: declared user prefix ${prefix}, no sudo; source builds permitted`,
    );
    mkdirSync(join(prefix, "bin"), { recursive: true });
    // Homebrew's manual install layout. The official shell installer limits path length, so
    // long shared-host HOME paths use the documented Git checkout layout instead.
    const cloned = await attemptOr(async () => {
      await access(join(prefix, "Homebrew/.git"));
      return true;
    }, false);
    if (!cloned)
      await $`git clone https://github.com/Homebrew/brew ${join(prefix, "Homebrew")}`;
    symlinkSync("../Homebrew/bin/brew", join(prefix, "bin/brew"));
    await $`${prefix}/bin/brew --version`;
    return;
  }
  say(
    "bootstrap: sudo once for prerequisites and standard prefix; Homebrew runs as this user",
  );
  await $`sudo -n true`;
  await $`sudo -n apt-get update -qq`;
  await $`sudo -n apt-get install -y build-essential procps curl file git`;
  // The official installer uses sudo only to prepare the prefix; it does not run brew as root.
  const installer =
    await $`curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh`.text();
  await $`bash -c ${installer}`.env({ ...process.env, NONINTERACTIVE: "1" });
}

export async function legacyPathUsers(
  home: string,
  ownPid: number,
  prefix: string,
  procRoot = "/proc",
): Promise<string[]> {
  const entries = await attemptOr(() => readdir(procRoot), null);
  if (entries === null)
    return ["/proc unavailable; cannot prove legacy PATH unused"];
  const users: string[] = [];
  const homes = [...new Set([home, realpathSync(home)])];
  const runtimes = homes.map(
    (directory) => join(directory, ".local/share/mise/installs") + "/",
  );
  for (const pid of entries
    .filter((name) => /^\d+$/u.test(name) && Number(name) !== ownPid)
    .toSorted((a, b) => Number(a) - Number(b))) {
    const directory = join(procRoot, pid);
    const environment = await attemptOr(
      () => Bun.file(join(directory, "environ")).text(),
      "",
    );
    const exe = await attemptOr(() => readlinkSync(join(directory, "exe")), "");
    const maps = await attemptOr(
      () => Bun.file(join(directory, "maps")).text(),
      "",
    );
    if (
      runtimes.some(
        (runtime) => exe.startsWith(runtime) || maps.includes(runtime),
      )
    ) {
      users.push(`${pid}: executable/mappings use mise runtime`);
      continue;
    }
    const path = environment
      .split("\0")
      .find((item) => item.startsWith("PATH="))
      ?.slice(5);
    if (path === undefined) continue;
    const parts = path.split(":");
    const legacy = parts.findIndex((part) =>
      homes.some(
        (taskHome) =>
          part === join(taskHome, ".local/bin") ||
          part === join(taskHome, ".local/share/dotfiles/runtime/bin"),
      ),
    );
    const brew = parts.indexOf(join(prefix, "bin"));
    if (legacy >= 0 && (brew < 0 || legacy < brew))
      users.push(`${pid}: inherited legacy PATH`);
  }
  return users;
}

export async function legacyLinks(
  home: string,
  root: string,
  prefix: string,
): Promise<string[]> {
  const links: string[] = [];
  const directories = [
    join(home, ".local/bin"),
    join(home, ".local/share/dotfiles/runtime/bin"),
  ];
  const paths = (
    await Promise.all(
      directories.map(async (directory) => {
        const entries = await attemptOr(() => readdir(directory), []);
        return entries.map((name) => join(directory, name));
      }),
    )
  ).flat();
  for (const path of paths) {
    if (await isReplacedLegacyLink(path, home, root, prefix)) links.push(path);
  }
  return links;
}

async function isReplacedLegacyLink(
  path: string,
  home: string,
  root: string,
  prefix: string,
): Promise<boolean> {
  if (!(await lstat(path)).isSymbolicLink()) return false;
  const directory = resolve(path, "..");
  const name = path.split("/").at(-1) ?? "";
  const target = resolve(directory, readlinkSync(path));
  const homes = [...new Set([home, realpathSync(home)])];
  const ours =
    homes.some((taskHome) =>
      target.startsWith(join(taskHome, ".local/share/mise/installs") + "/"),
    ) ||
    target === join(root, "scripts/bun-exec.sh") ||
    (directory.endsWith("dotfiles/runtime/bin") &&
      homes.some((taskHome) =>
        target.startsWith(join(taskHome, ".cargo/bin") + "/"),
      ));
  // Agent CLIs and cargo packages without a brew replacement remain untouched.
  const replacement = [
    join(prefix, "bin", name),
    join(prefix, "opt/rustup/bin", name),
  ].find(
    (candidate) =>
      Bun.which(candidate) !== null &&
      realpathSync(candidate).startsWith(`${realpathSync(prefix)}/`),
  );
  return ours && replacement !== undefined;
}

export async function removeLegacyLinks(
  links: readonly string[],
  home: string,
): Promise<void> {
  for (const link of links) unlinkSync(link);
  const runtime = join(home, ".local/share/dotfiles/runtime/bin");
  const entries = await attemptOr(() => readdir(runtime), null);
  if (entries !== null && entries.length === 0) rmdirSync(runtime);
}
