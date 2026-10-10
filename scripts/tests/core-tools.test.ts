import { afterEach, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { brewPrefix, coreCommands, corePathProblems } from "../core-tools.ts";
import {
  legacyLinks,
  legacyPathUsers,
  removeLegacyLinks,
  buildCpuList,
} from "../linux-brew.ts";

const roots: string[] = [];
test("installer affinity honors sparse or restricted CPU sets", () => {
  expect(buildCpuList("8-15,32-63")).toBe("8,9");
  expect(buildCpuList("3,11,19")).toBe("3,11");
  expect(buildCpuList("7")).toBe("7");
  expect(buildCpuList("")).toBe("");
});
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "core-brew-"));
  roots.push(root);
  return root;
}
function exe(path: string): void {
  writeFileSync(path, "#!/bin/sh\nexit 0\n");
  chmodSync(path, 0o755);
}

test("host declarations select shared-user or standard Linux prefix", () => {
  expect(brewPrefix("/home/user", "sol.cc.uec.ac.jp", "linux")).toBe(
    "/home/user/.linuxbrew",
  );
  expect(brewPrefix("/home/user", "R99", "linux")).toBe(
    "/home/linuxbrew/.linuxbrew",
  );
  expect(brewPrefix("/home/user", "fresh", "linux")).toBe(
    "/home/linuxbrew/.linuxbrew",
  );
});
test("core provenance rejects legacy shadowing and an outside-target symlink", () => {
  const root = fixture();
  const prefix = join(root, "brew");
  const old = join(root, "old");
  mkdirSync(prefix);
  mkdirSync(old);
  exe(join(prefix, "bat"));
  mkdirSync(join(prefix, "bin"));
  exe(join(prefix, "bin/brew"));
  exe(join(old, "bat"));
  expect(corePathProblems(["bat"], prefix, prefix)).toEqual([]);
  expect(corePathProblems(["bat"], prefix, `${old}:${prefix}`)).toHaveLength(1);
  symlinkSync(join(old, "bat"), join(prefix, "bun"));
  expect(corePathProblems(["bun"], prefix, prefix)).toHaveLength(1);
});
test("legacy cleanup retires only replaced downloader links and preserves experiment installs", async () => {
  const home = fixture();
  const prefix = join(home, "brew");
  const old = join(home, ".local/share/mise/installs/bat");
  const bin = join(home, ".local/bin");
  for (const directory of [join(prefix, "bin"), old, bin])
    mkdirSync(directory, { recursive: true });
  exe(join(old, "bat"));
  exe(join(prefix, "bin/bat"));
  symlinkSync(join(old, "bat"), join(bin, "bat"));
  exe(join(bin, "codex"));
  const links = await legacyLinks(home, join(home, "dotfiles"), prefix);
  expect(links).toEqual([join(bin, "bat")]);
  await removeLegacyLinks(links, home);
  expect(readFileSync(join(old, "bat"), "utf8")).toContain("exit 0");
  expect(readFileSync(join(bin, "codex"), "utf8")).toContain("exit 0");
});
test("process scan guards executable, mapped runtime and inherited PATH without ps", async () => {
  const home = fixture();
  const proc = join(home, "proc");
  const prefix = join(home, "brew");
  for (const pid of ["10", "11", "12", "13"])
    mkdirSync(join(proc, pid), { recursive: true });
  const runtime = join(home, ".local/share/mise/installs/bun/1.4/bin/bun");
  symlinkSync(runtime, join(proc, "10/exe"));
  writeFileSync(join(proc, "11/maps"), `001 001 r-xp ${runtime}\n`);
  writeFileSync(join(proc, "12/environ"), `PATH=${home}/.local/bin:/usr/bin\0`);
  writeFileSync(
    join(proc, "13/environ"),
    `PATH=${prefix}/bin:${home}/.local/bin\0`,
  );
  expect(await legacyPathUsers(home, 99, prefix, proc)).toEqual([
    "10: executable/mappings use mise runtime",
    "11: executable/mappings use mise runtime",
    "12: inherited legacy PATH",
  ]);
});
test("quiet zshenv uses the rendered prefix in both shell modes", () => {
  const home = fixture();
  const prefix = join(home, "brew");
  mkdirSync(join(prefix, "bin"), { recursive: true });
  mkdirSync(join(home, ".config/dotfiles"), { recursive: true });
  exe(join(prefix, "bin/brew"));
  exe(join(prefix, "bin/bun"));
  writeFileSync(join(home, ".config/dotfiles/brew-prefix"), `${prefix}\n`);
  const source = join(import.meta.dir, "../../zsh/zshenv");
  for (const mode of ["-fc", "-fic"]) {
    const result = Bun.spawnSync(
      ["zsh", mode, 'source "$SOURCE"; command -v bun'],
      {
        env: { HOME: home, PATH: "/usr/bin:/bin", SOURCE: source },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toBe(`${prefix}/bin/bun\n`);
  }
});
test("command count includes extra runtime entrypoints", async () => {
  const root = fixture();
  writeFileSync(
    join(root, "Brewfile.core"),
    'brew "bun"\nbrew "uv"\nbrew "rustup"\n',
  );
  expect(await coreCommands(root)).toEqual([
    "bun",
    "bunx",
    "uv",
    "uvx",
    "rustup",
    "cargo",
  ]);
});

test("conditional Bun providers retain one pair of Homebrew runtime commands", async () => {
  const root = fixture();
  writeFileSync(
    join(root, "Brewfile.core"),
    'if OS.linux?\n  brew "oven-sh/bun/bun", trusted: true\nelse\n  brew "bun"\nend\nbrew "uv"\n',
  );
  expect(await coreCommands(root)).toEqual(["bun", "bunx", "uv", "uvx"]);
  const commands = await coreCommands(join(import.meta.dir, "../.."));
  expect(commands).toHaveLength(39);
  expect(commands.filter((name) => name.includes("/"))).toEqual([]);
});
