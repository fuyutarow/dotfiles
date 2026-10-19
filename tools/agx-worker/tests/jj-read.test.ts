import { afterAll, expect, test } from "bun:test";
import {
  stat,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { JJ_READ_ARGS } from "../../shared/src/jj-read.ts";
import { checkPremises } from "../src/premises.ts";
import { readonlyCommand } from "../../shared/src/readonly-command.ts";

const root = await mkdtemp(join(tmpdir(), "agx-jj-read-fixture-"));
const repo = join(root, "repo");
const config = join(root, "config.toml");
await writeFile(
  config,
  '[user]\nname = "Ref read fixture"\nemail = "fixture@example.invalid"\n[git]\ncolocate = false\n',
);
const env = { ...process.env, JJ_CONFIG: config };
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

// Real jj is used only against this disposable, unshared store. Ref mutations
// during fixture setup have no deadline and can never reach a user's repository.
async function jj(args: string[]) {
  const cwd = await stat(repo).then(
    () => repo,
    () => root,
  );
  const invocation = args.includes("--ignore-working-copy")
    ? readonlyCommand(["jj", ...args], cwd, env)
    : { cmd: ["jj", ...args], env };
  const result = Bun.spawn(invocation.cmd, {
    cwd,
    env: invocation.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exit, out, err] = await Promise.all([
    result.exited,
    new Response(result.stdout).text(),
    new Response(result.stderr).text(),
  ]);
  expect(exit, err).toBe(0);
  return out;
}

async function files(path: string): Promise<[string, string][]> {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
  const rows: [string, string][] = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) rows.push(...(await files(child)));
    else rows.push([child, (await readFile(child)).toString("hex")]);
  }
  return rows.toSorted(([a], [b]) => a.localeCompare(b));
}

test("installed jj reads neither snapshot, import/export refs nor integrate operations", async () => {
  await jj(["git", "init", "--colocate", repo]);
  await writeFile(join(repo, "tracked.txt"), "recorded\n");
  await jj(["bookmark", "create", "fixture-bookmark", "-r", "@"]);
  const heads = await files(join(repo, ".jj", "repo", "op_heads"));
  const refs = await files(join(repo, ".git", "refs"));
  const head = await readFile(join(repo, ".git", "HEAD"));
  // A dirty bookmarked working copy would normally trigger snapshot + export.
  await writeFile(join(repo, "tracked.txt"), "must remain unsnapshotted\n");
  const lock = join(repo, ".git", "packed-refs.lock");
  await writeFile(lock, "ownerless fixture\n");
  for (const args of [
    ["root"],
    ["bookmark", "list", "--all-remotes"],
    ["log", "-r", "@", "--no-graph", "-T", "commit_id"],
    ["file", "list"],
    ["file", "list", "-r", "@-"],
  ])
    await jj([...JJ_READ_ARGS, ...args]);
  expect(
    await jj([...JJ_READ_ARGS, "file", "show", "-r", "@", "tracked.txt"]),
  ).toBe("recorded\n");
  expect(await files(join(repo, ".jj", "repo", "op_heads"))).toEqual(heads);
  expect(await files(join(repo, ".git", "refs"))).toEqual(refs);
  expect(await readFile(join(repo, ".git", "HEAD"))).toEqual(head);
  expect(await readFile(lock, "utf8")).toBe("ownerless fixture\n");
  expect(checkPremises(["rev:@"], repo)).toEqual({ status: "ok" });
}, 30_000);
