import { afterAll, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const router = join(import.meta.dir, "../src/repo-retrieve.ts");
const roots: string[] = [];
afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

// A stand-in ccc whose `init` writes the settings file as the real one does and whose every other
// subcommand leaves a mark, so a test can prove registration started nothing else.
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "rr-index-init-"));
  roots.push(root);
  const bin = join(root, "bin");
  const repo = join(root, "repo");
  mkdirSync(bin);
  mkdirSync(repo);
  writeFileSync(
    join(bin, "ccc"),
    `#!/bin/sh\nif [ "$1" = init ]; then mkdir -p .cocoindex_code && : > .cocoindex_code/settings.yml; exit 0; fi\necho "$@" >> "${root}/other-ccc-calls"\n`,
  );
  chmodSync(join(bin, "ccc"), 0o755);
  return {
    root,
    repo,
    env: {
      ...process.env,
      COCOINDEX_CODE_DB_PATH_MAPPING: "",
      PATH: `${bin}:${process.env["PATH"] ?? ""}`,
    },
  };
}

async function rr(cwd: string, env: NodeJS.ProcessEnv, args: string[]) {
  const child = Bun.spawn({
    cmd: [process.execPath, router, "index", ...args],
    cwd,
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 30_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, code };
}

test("index --init registers an unregistered root and starts nothing else", async () => {
  const f = fixture();
  const result = await rr(f.repo, f.env, ["--init"]);
  expect(result).toMatchObject({ code: 0 });
  expect(result.stdout).toContain(`REGISTERED: ${f.repo}`);
  expect(result.stdout).toContain("NEXT: rr index --plan");
  expect(
    await Bun.file(join(f.repo, ".cocoindex_code", "settings.yml")).exists(),
  ).toBe(true);
  expect(await Bun.file(join(f.root, "other-ccc-calls")).exists()).toBe(false);
});

test("index --init refuses a root that is already registered, and inside one", async () => {
  const f = fixture();
  expect((await rr(f.repo, f.env, ["--init"])).code).toBe(0);
  const again = await rr(f.repo, f.env, ["--init"]);
  expect(again.code).not.toBe(0);
  expect(again.stderr).toContain("already inside ccc-registered project");
  mkdirSync(join(f.repo, "sub"));
  const nested = await rr(join(f.repo, "sub"), f.env, ["--init"]);
  expect(nested.code).not.toBe(0);
  expect(nested.stderr).toContain("already inside ccc-registered project");
});

test("index --init runs alone", async () => {
  const f = fixture();
  for (const other of ["--plan", "--status", "--detach", "--accept-plan"]) {
    const result = await rr(f.repo, f.env, ["--init", other]);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("--init registers only");
  }
  expect(await Bun.file(join(f.repo, ".cocoindex_code")).exists()).toBe(false);
});
