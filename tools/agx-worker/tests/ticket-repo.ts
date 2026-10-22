import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { expect } from "bun:test";

export async function writeLocalTicketConfig(root: string, tickets: string) {
  const directory = join(
    process.env.XDG_CONFIG_HOME ?? join(root, "fixture-config"),
    "agx/repos",
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "repo.toml"),
    `schema = 1\nroot = ${JSON.stringify(root)}\ntickets = ${JSON.stringify(tickets)}\n`,
  );
}

/** A disposable Git tree with a committed home; all files stay under the caller's temp root. */
export async function prepareTicketRepo(root: string, tickets = ".") {
  await writeFile(
    join(root, "agx.toml"),
    `schema = 1\ntickets = ${JSON.stringify(isAbsolute(tickets) ? ".agents/tickets" : tickets)}\n`,
  );
  if (isAbsolute(tickets)) await writeLocalTicketConfig(root, tickets);
  for (const args of [
    ["init", "--quiet"],
    ["add", "--", "agx.toml"],
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "Declare fixture ticket home",
    ],
  ]) {
    const child = Bun.spawn(["git", ...args], {
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
      env: {
        ...process.env,
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_DIR: undefined,
        GIT_WORK_TREE: undefined,
        GIT_INDEX_FILE: undefined,
      },
    });
    const [exit, , err] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(exit, `fixture git ${args[0]}: ${err}`).toBe(0);
  }
}
