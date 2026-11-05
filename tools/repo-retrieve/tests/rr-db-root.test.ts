import { expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  declaredDbEnv,
  DB_ROOT_DECLARATION,
  MAPPING_ENV,
} from "../src/ccc-db-dir.ts";

const entry = resolve(import.meta.dir, "../src/repo-retrieve.ts");

test("declaration is validated and conflicting mappings are refused", async () => {
  const dir = await mkdtemp(join(tmpdir(), "rr-declaration-"));
  const declaration = join(dir, "db-root");
  for (const value of ["", "/absolute", "a/../b"]) {
    await writeFile(declaration, value);
    expect((await declaredDbEnv({ HOME: dir }, declaration)).isErr()).toBe(
      true,
    );
  }
  expect(
    (await declaredDbEnv({ HOME: dir }, join(dir, "missing"))).isErr(),
  ).toBe(true);
  await writeFile(declaration, "db\n");
  expect(
    (
      await declaredDbEnv(
        { HOME: dir, [MAPPING_ENV]: `${dir}=${dir}/other` },
        declaration,
      )
    ).isErr(),
  ).toBe(true);
});

test("watermark and every ccc child use the declared mapping", async () => {
  const home = await mkdtemp(join(tmpdir(), "rr-db-root-"));
  const root = join(home, "project");
  const bin = join(home, "bin");
  const log = join(home, "children");
  const declaration = (await readFile(DB_ROOT_DECLARATION, "utf8")).trim();
  const db = join(home, declaration, "project");
  const mapping = `${home}=${join(home, declaration)}`;
  await mkdir(join(root, ".cocoindex_code"), { recursive: true });
  await mkdir(db, { recursive: true });
  await mkdir(bin);
  await writeFile(
    join(root, ".cocoindex_code", "settings.yml"),
    "include_patterns: []\n",
  );
  await writeFile(
    join(db, "INDEXED_AT"),
    JSON.stringify({
      head: null,
      source: "index",
      indexedAt: Temporal.Now.instant().toString(),
    }),
  );
  await writeFile(join(db, "fake_target.db"), "index");
  const ccc = join(bin, "ccc");
  await writeFile(
    ccc,
    `#!/bin/sh\nprintf '%s\n' "$COCOINDEX_CODE_DB_PATH_MAPPING" >> "$TRACE"\nif [ "$1" = daemon ]; then printf 'Projects:\\n%s [idle]\\n' "$PWD"; else printf '%s\\n' '--- Result 1 (score: 0.9) ---'; fi\n`,
  );
  await chmod(ccc, 0o755);
  for (const mode of ["unset", "empty", "equal", "different"]) {
    const env: Record<string, string | undefined> = {
      ...process.env,
      HOME: home,
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
      TRACE: log,
      REPO_RETRIEVE_AUTO_INDEX: "0",
    };
    delete env[MAPPING_ENV];
    if (mode === "empty") env[MAPPING_ENV] = "";
    if (mode === "equal") env[MAPPING_ENV] = mapping;
    if (mode === "different") env[MAPPING_ENV] = `${home}=${home}/wrong`;
    await writeFile(log, "");
    const child = Bun.spawn(
      [process.execPath, entry, "about", "test", "--limit", "1"],
      {
        cwd: root,
        env,
        stdout: "pipe",
        stderr: "pipe",
        signal: AbortSignal.timeout(10_000),
      },
    );
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    const calls = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean);
    if (mode === "different") {
      expect(code).toBe(2);
      expect(stderr).toContain("differently");
      expect(calls).toEqual([]);
    } else {
      expect({ code, stdout, stderr }).toMatchObject({ code: 0 });
      expect(calls.length).toBeGreaterThan(0);
      expect(calls.every((value) => value === mapping)).toBe(true);
      expect(await Bun.file(join(db, "INDEX_REQUEST.json")).exists()).toBe(
        false,
      );
      expect(
        await Bun.file(
          join(root, ".cocoindex_code", "INDEX_REQUEST.json"),
        ).exists(),
      ).toBe(false);
    }
  }
});
