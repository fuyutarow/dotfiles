// bun test: the ccc index DB location has ONE declaration, cocoindex/db-root, and every consumer
// follows it. The client (zsh/zshenv), the supervised daemon (cocoindex/ccc-daemon-launch.py via
// ccc_db_mapping.py) and disk-reclaim's ccc-index-db target must resolve the same directory; a
// second hand-written copy of the value anywhere in the repo fails here.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { declaredDbRoot } from "../../tools/disk-reclaim/src/targets/ccc-index-db.ts";

const REPO = resolve(import.meta.dir, "../..");
const DECLARATION = join(REPO, "cocoindex/db-root");
const homes: string[] = [];
afterAll(async () => {
  await Promise.all(
    homes.map((home) => rm(home, { recursive: true, force: true })),
  );
});

async function fakeHome(): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), "ccc-db-location-"));
  homes.push(home);
  return home;
}

async function declaredRelative(): Promise<string> {
  return (await readFile(DECLARATION, "utf8")).trim();
}

/** The mapping a fresh zsh exports for a client, via the real zsh/zshenv linked as ~/.zshenv. */
async function clientMapping(home: string): Promise<string> {
  await symlink(join(REPO, "zsh/zshenv"), join(home, ".zshenv"));
  const child = Bun.spawn(
    ["zsh", "-c", 'print -r -- "${COCOINDEX_CODE_DB_PATH_MAPPING-UNSET}"'],
    {
      env: {
        HOME: home,
        ZDOTDIR: home,
        PATH: process.env["PATH"] ?? "/usr/bin:/bin",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [out, code] = await Promise.all([child.stdout.text(), child.exited]);
  expect(code).toBe(0);
  return out.trim();
}

/** The mapping the daemon launcher exports, via the same module ccc-daemon-launch.py imports. */
async function daemonMapping(home: string): Promise<string> {
  const child = Bun.spawn(
    [
      "python3",
      "-I",
      "-c",
      [
        "import sys",
        `sys.path.insert(0, ${JSON.stringify(join(REPO, "cocoindex"))})`,
        "import ccc_db_mapping",
        `print(ccc_db_mapping.mapping(${JSON.stringify(home)}))`,
      ].join("; "),
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, code] = await Promise.all([child.stdout.text(), child.exited]);
  expect(code).toBe(0);
  return out.trim();
}

async function mentions(path: string, needle: string): Promise<boolean> {
  const text = await readFile(path, "utf8").catch(() => "");
  return text.includes(needle);
}

/** Exit code of ccc_db_mapping.mapping() reading `declaration`. */
async function daemonModuleExit(
  home: string,
  declaration: string,
): Promise<number> {
  const child = Bun.spawn(
    [
      "python3",
      "-I",
      "-c",
      [
        "import sys, pathlib",
        `sys.path.insert(0, ${JSON.stringify(join(REPO, "cocoindex"))})`,
        "import ccc_db_mapping",
        `ccc_db_mapping.mapping(${JSON.stringify(home)}, pathlib.Path(${JSON.stringify(declaration)}))`,
      ].join("; "),
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  return child.exited;
}

describe("ccc index DB location: one declaration", () => {
  test("the declaration is one home-relative line outside ~/.cache", async () => {
    const raw = await readFile(DECLARATION, "utf8");
    expect(raw.split("\n").filter((line) => line !== "")).toHaveLength(1);
    const relative = raw.trim();
    expect(relative).toBe(".local/share/cocoindex-code/db");
    expect(relative.startsWith("/")).toBe(false);
    expect(relative.split("/")).not.toContain("..");
    expect(relative.startsWith(".cache/")).toBe(false);
  });

  test("client and daemon export the same mapping from the declaration", async () => {
    const home = await fakeHome();
    const client = await clientMapping(home);
    const daemon = await daemonMapping(home);
    expect(client).toBe(`${home}=${home}/${await declaredRelative()}`);
    expect(daemon).toBe(client);
  });

  test("disk-reclaim's ccc-index-db root resolves the declared directory", async () => {
    const home = await fakeHome();
    const target = (await clientMapping(home)).split("=")[1] ?? "";
    expect(target).not.toBe("");
    const reclaim = await declaredDbRoot(home);
    expect(reclaim.isOk() ? reclaim.value : reclaim.error.message).toBe(target);
  });

  test("a malformed declaration is refused by the daemon module and disk-reclaim alike", async () => {
    const home = await fakeHome();
    for (const bad of ["", "/abs/db", "../escape"]) {
      const declaration = join(home, "bad-db-root");
      await Bun.write(declaration, `${bad}\n`);
      const reclaim = await declaredDbRoot(home, declaration);
      expect(reclaim.isErr()).toBe(true);
      expect(await daemonModuleExit(home, declaration)).not.toBe(0);
    }
  });

  test("the daemon unit carries no second copy and the launcher installs the declared mapping", async () => {
    const unit = await readFile(
      join(REPO, "cocoindex/ccc-daemon.service.wsl"),
      "utf8",
    );
    expect(unit).not.toMatch(/^Environment="?COCOINDEX_CODE_DB_PATH_MAPPING/mu);
    const launcher = await readFile(
      join(REPO, "cocoindex/ccc-daemon-launch.py"),
      "utf8",
    );
    expect(launcher).toContain("from ccc_db_mapping import install");
    expect(launcher).toMatch(/^install_db_mapping\(\)$/mu);
  });

  test("no tracked file names the old ~/.cache location", async () => {
    const needle = [".cache", "cocoindex-code"].join("/");
    const skipped = new Set([
      ".git",
      ".jj",
      "node_modules",
      ".agents",
      ".cocoindex_code",
    ]);
    const hits: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory() && !skipped.has(entry.name)) await walk(path);
        if (entry.isFile() && (await mentions(path, needle)))
          hits.push(path.slice(REPO.length + 1));
      }
    };
    await walk(REPO);
    expect(hits).toEqual([]);
  });
});
