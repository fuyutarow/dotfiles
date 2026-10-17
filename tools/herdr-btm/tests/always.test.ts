import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { jsonOf, z } from "../../shared/src/zod.ts";

const entry = resolve(import.meta.dir, "../src/btmp.ts");
const configPath = resolve(import.meta.dir, "../../../herdr/config.toml");
const Agents = jsonOf(
  z.object({
    result: z.object({
      agents: z.array(
        z.object({
          agent: z.string(),
          pane_id: z.string(),
          tab_id: z.string(),
        }),
      ),
    }),
  }),
);

test("isolated headless startup, repeated/concurrent ensure, and pane loss converge to one btm within 20s", async () => {
  const root = await mkdtemp(join(tmpdir(), "btm-always-"));
  await using _temp = {
    [Symbol.asyncDispose]: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
  const home = root;
  await mkdir(`${home}/.bun/bin`, { recursive: true });
  await Bun.write(`${home}/.zshrc`, "");
  await symlink(entry, `${home}/.bun/bin/btmp`);
  await Bun.write(`${root}/config.toml`, await Bun.file(configPath).text());
  const env = {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: `${home}/.config`,
    // Relative Unix socket names avoid sun_path limits under the test preload's TMPDIR.
    HERDR_SOCKET_PATH: "s",
    HERDR_CONFIG_PATH: `${root}/config.toml`,
    HERDR_PANE_ID: "",
    HERDR_WORKSPACE_ID: "",
    HERDR_TAB_ID: "",
  };
  const run = async (argv: string[]) => {
    const child = Bun.spawn(argv, {
      env,
      cwd: root,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 20000,
      killSignal: "SIGKILL",
    });
    const [out, error, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect({ code, error }).toEqual({ code: 0, error: "" });
    return out;
  };
  const agents = async () => {
    const parsed = Agents.safeParse(await run(["herdr", "agent", "list"]));
    expect(parsed.success).toBe(true);
    return parsed.success
      ? parsed.data.result.agents.filter((agent) => agent.agent === "btm")
      : [];
  };
  // bounded: isolated server lives only within this test, with finally teardown.
  const server = Bun.spawn(["herdr", "server"], {
    env,
    cwd: root,
    stdin: "ignore",
    stdout: "ignore",
    stderr: "pipe",
    timeout: 55000,
    killSignal: "SIGKILL",
  });
  const serverStderr = new Response(server.stderr).text();
  await using _server = {
    [Symbol.asyncDispose]: async () => {
      server.kill("SIGTERM");
      await server.exited;
      await serverStderr;
    },
  };
  await run(["herdr", "config", "check"]);
  const waitForOne = async () => {
    const deadline = performance.now() + 20000;
    while (performance.now() < deadline) {
      if (server.exitCode !== null)
        expect(server.exitCode, await serverStderr).toBeNull();
      if (
        !(await stat(join(root, env.HERDR_SOCKET_PATH)).then(
          () => true,
          () => false,
        ))
      ) {
        await Bun.sleep(100);
        continue;
      }
      const rows = await agents();
      expect(rows.length).toBeLessThanOrEqual(1);
      if (rows.length === 1) return rows[0]!;
      await Bun.sleep(100);
    }
    return expect.unreachable("BTM-ALWAYS: no btm row within 20s");
  };
  const first = await waitForOne();
  await run(["herdr", "tab", "rename", first.tab_id, "2"]);
  await run([process.execPath, entry, "ensure"]);
  const Tab = jsonOf(
    z.object({ result: z.object({ tab: z.object({ label: z.string() }) }) }),
  );
  const tabLabel = async () => {
    const parsed = Tab.safeParse(
      await run(["herdr", "tab", "get", first.tab_id]),
    );
    if (!parsed.success) return expect.unreachable(parsed.error.message);
    return parsed.data.result.tab.label;
  };
  // Startup ensure may still hold the lock after the agent first registers.
  // A concurrent ensure skips; the server timer then performs the repair.
  const repairDeadline = performance.now() + 10000;
  let label = await tabLabel();
  while (label !== "btm" && performance.now() < repairDeadline) {
    await Bun.sleep(100);
    label = await tabLabel();
  }
  expect(label).toBe("btm");
  await run([process.execPath, entry, "ensure"]);
  await Promise.all([
    run([process.execPath, entry, "ensure"]),
    run([process.execPath, entry, "ensure"]),
  ]);
  expect(await agents()).toEqual([first]);
  await run(["herdr", "pane", "close", first.pane_id]);
  const restored = await waitForOne();
  expect(restored.pane_id).not.toBe(first.pane_id);
  // Observe another complete scheduler interval, so a delayed duplicate cannot hide.
  await Bun.sleep(5500);
  expect(await agents()).toEqual([restored]);
  await run(["herdr", "pane", "close", restored.pane_id]);
  await Promise.all([
    run([process.execPath, entry, "ensure"]),
    run([process.execPath, entry, "ensure"]),
  ]);
  expect(await agents()).toHaveLength(1);
}, 60000);

test("interactive zsh maps btm to btmp without recursion", async () => {
  const aliases = resolve(import.meta.dir, "../../../zsh/aliases.zsh");
  const root = await mkdtemp(join(tmpdir(), "btm-zsh-"));
  await using _temp = {
    [Symbol.asyncDispose]: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
  const child = Bun.spawn(
    [
      "zsh",
      "-f",
      "-i",
      "-c",
      'source "$1"; whence -v btm',
      "btm-test",
      aliases,
    ],
    {
      env: { ...process.env, HOME: root },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      timeout: 5000,
    },
  );
  const [out, , code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(code).toBe(0);
  expect(out).toContain("btm is an alias for btmp");
});
