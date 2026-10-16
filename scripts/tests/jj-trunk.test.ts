import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const workspaceRoot = join(import.meta.dirname, "../..");
const jjConfig = join(workspaceRoot, "jj/config.toml");
const temporary: string[] = [];

afterEach(async () => {
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});

async function run(
  argv: string[],
  options: { cwd?: string; jjConfig?: boolean } = {},
) {
  const proc = Bun.spawn(argv, {
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    env: {
      ...process.env,
      ...(options.jjConfig === true ? { JJ_CONFIG: jjConfig } : {}),
    },
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.timeout(10000),
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  expect(exit, `${argv.join(" ")}\n${stdout}${stderr}`).toBe(0);
  return stdout.trim();
}

async function trunkCommit(remoteBookmark?: "alpha" | "main") {
  const temp = await mkdtemp(join(tmpdir(), "jj-trunk-test-"));
  temporary.push(temp);
  const repo = join(temp, "repo");
  await run(["git", "init", "-q", "-b", remoteBookmark ?? "main", repo]);
  await run(["git", "config", "user.name", "Fixture"], { cwd: repo });
  await run(["git", "config", "user.email", "fixture@example.test"], {
    cwd: repo,
  });
  await Bun.write(join(repo, "tracked.txt"), "fixture\n");
  await run(["git", "add", "tracked.txt"], { cwd: repo });
  await run(["git", "commit", "-qm", "fixture"], { cwd: repo });
  const expected = await run(["git", "rev-parse", "HEAD"], { cwd: repo });

  if (remoteBookmark !== undefined) {
    const origin = join(temp, "origin.git");
    await run(["git", "init", "-q", "--bare", origin]);
    await run(["git", "remote", "add", "origin", origin], { cwd: repo });
    await run(["git", "push", "-qu", "origin", remoteBookmark], { cwd: repo });
  }

  await run(["jj", "git", "init", "--colocate"], {
    cwd: repo,
    jjConfig: true,
  });
  if (remoteBookmark !== undefined) {
    await run(["jj", "git", "fetch", "--remote", "origin"], {
      cwd: repo,
      jjConfig: true,
    });
  }
  const actual = await run(
    ["jj", "log", "-r", "trunk()", "--no-graph", "-T", 'commit_id ++ "\\n"'],
    { cwd: repo, jjConfig: true },
  );
  return { actual, expected };
}

test("trunk() resolves main@origin when it is the only remote bookmark", async () => {
  const { actual, expected } = await trunkCommit("main");
  expect(actual).toBe(expected);
});

test("trunk() prefers alpha@origin when it is the only remote bookmark", async () => {
  const { actual, expected } = await trunkCommit("alpha");
  expect(actual).toBe(expected);
});

test("trunk() resolves root when there is no remote bookmark", async () => {
  const { actual } = await trunkCommit();
  expect(actual).toBe("0000000000000000000000000000000000000000");
});
