import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registeredRepos } from "../workspace-repos.ts";

test("discovers dotfiles and workspace repositories, including git files", async () => {
  const home = await mkdtemp(join(tmpdir(), "workspace-repos-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(home, { recursive: true, force: true }),
  };
  expect(await registeredRepos(home)).toEqual([]);
  await mkdir(join(home, "dotfiles", ".git"), { recursive: true });
  await mkdir(join(home, "Workspace", "repo"), { recursive: true });
  await mkdir(join(home, "Workspace", "other"), { recursive: true });
  await writeFile(
    join(home, "Workspace", "repo", ".git"),
    "gitdir: elsewhere\n",
  );
  expect(await registeredRepos(home)).toEqual([
    join(home, "dotfiles"),
    join(home, "Workspace", "repo"),
  ]);
});
