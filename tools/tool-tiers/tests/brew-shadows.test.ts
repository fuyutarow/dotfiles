import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findToolCommandShadows } from "../src/tool-tiers.ts";

const repo = join(import.meta.dir, "../../..");

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "brew-shadow-order-"));
  const brew = join(home, "brew/bin");
  const system = join(home, "usr/bin");
  const local = join(home, ".local/bin");
  for (const directory of [brew, system, local]) {
    await mkdir(directory, { recursive: true });
    await Bun.write(join(directory, "mise"), "fixture mise");
  }
  await Bun.write(join(brew, "brew"), "#!/bin/sh\nexit 0\n");
  await chmod(join(brew, "brew"), 0o755);
  return { home, brew, system, local };
}

test("later system copies pass; earlier copies and later user bins are shadows", async () => {
  const { home, brew, system } = await fixture();
  expect(
    await findToolCommandShadows(["mise"], `${brew}:${system}`, brew, home),
  ).toEqual([]);
  expect(
    await findToolCommandShadows(["mise"], `${system}:${brew}`, brew, home),
  ).toEqual([
    {
      command: "mise",
      shadow: join(system, "mise"),
      homebrew: join(brew, "mise"),
    },
  ]);
  for (const relative of [".local/bin", ".cargo/bin", ".bun/bin", "go/bin"]) {
    const userBin = join(home, relative);
    await mkdir(userBin, { recursive: true });
    await Bun.write(join(userBin, "mise"), "old mise");
    expect(
      await findToolCommandShadows(
        ["mise"],
        `${brew}:${userBin}:${userBin}`,
        brew,
        home,
      ),
    ).toEqual([
      {
        command: "mise",
        shadow: join(userBin, "mise"),
        homebrew: join(brew, "mise"),
      },
    ]);
  }
});

test("only regular PATH entries count; directories and symlinks do not", async () => {
  const { home, brew } = await fixture();
  const bin = join(home, "other/bin");
  await mkdir(join(bin, "mise"), { recursive: true });
  expect(
    await findToolCommandShadows(["mise"], `${bin}:${brew}`, brew, home),
  ).toEqual([]);
  await Bun.write(join(brew, "bun"), "fixture bun");
  await symlink(join(brew, "bun"), join(bin, "bun"));
  expect(
    await findToolCommandShadows(["bun"], `${bin}:${brew}`, brew, home),
  ).toEqual([]);
});

test("doctor fails naming both paths and rip; without the shadow it passes", async () => {
  const { home, brew, system, local } = await fixture();
  for (const path of [
    `${local}:${brew}:${system}`,
    `${brew}:${local}:${system}`,
    `${brew}:${system}`,
  ]) {
    const child = Bun.spawn(
      [process.execPath, join(repo, "scripts/doctor.ts")],
      {
        env: {
          ...process.env,
          HOME: home,
          DOTFILES: repo,
          PATH: path,
          DOCTOR_ONLY: "brew-shadows",
          BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(home, "cache"),
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 30_000,
      },
    );
    const [out, err, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(err).toBe("");
    if (path.includes(local)) {
      expect(code).toBe(1);
      expect(out).toContain("FAIL  brew-shadows");
      expect(out).toContain(join(local, "mise"));
      expect(out).toContain(join(brew, "mise"));
      expect(out).toContain("rip <shadow>");
      expect(out).not.toContain(join(system, "mise"));
    } else {
      expect(code).toBe(0);
      expect(out).toContain("PASS  brew-shadows");
    }
  }
});
