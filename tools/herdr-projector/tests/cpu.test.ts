import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  codexDiscoveryStamp,
  findCodexSessionId,
} from "../src/codex-session-id.ts";

test("Codex identity discovery ignores rollout body and excludes other clients", async () => {
  const root = await mkdtemp(join(tmpdir(), "projector-rollouts-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const day = join(root, "2026", "10", "19");
  await mkdir(day, { recursive: true });
  const tui = join(day, "rollout-tui.jsonl");
  await Bun.write(
    tui,
    `${JSON.stringify({ type: "session_meta", payload: { originator: "codex-tui", cwd: "/project", id: "thread-id" } })}\n${"invalid body\n".repeat(100000)}`,
  );
  await utimes(tui, 1, 1);
  await Bun.write(
    join(day, "rollout-exec.jsonl"),
    `${JSON.stringify({ type: "session_meta", payload: { originator: "codex-exec", cwd: "/project", id: "wrong" } })}\n`,
  );
  const today = Temporal.PlainDate.from("2026-10-19");
  expect(await findCodexSessionId("/project", root, today)).toBe("thread-id");
  const before = await codexDiscoveryStamp(root, today);
  await Bun.write(join(day, "rollout-new.jsonl"), "{}\n");
  expect(await codexDiscoveryStamp(root, today)).not.toEqual(before);
  expect(await findCodexSessionId("/missing", root, today)).toBeUndefined();
});

test("CLI caches unchanged cycles, invalidates inputs, and retries failed writes", async () => {
  const root = await mkdtemp(join(tmpdir(), "projector-cycle-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const fixture = join(root, "herdr");
  await Bun.write(
    fixture,
    `#!${process.execPath}
if (process.argv[2] === "agent") {
  process.stdout.write(await Bun.file(process.env.AGENTS_FILE).text());
} else {
  await Bun.write(process.env.CALLS_FILE, (await Bun.file(process.env.CALLS_FILE).text().catch(() => "")) + "apply\\n");
  process.exitCode = await Bun.file(process.env.FAIL_FILE).exists() ? 1 : 0;
}
`,
  );
  await chmod(fixture, 0o755);
  const agentsFile = join(root, "agents.json");
  const callsFile = join(root, "calls");
  const failFile = join(root, "fail");
  const agents = [
    {
      agent: "codex",
      pane_id: "pane",
      tab_id: "tab",
      cwd: "/project",
    },
  ];
  const today = Temporal.Now.plainDateISO();
  const day = join(
    root,
    ".codex",
    "sessions",
    String(today.year),
    String(today.month).padStart(2, "0"),
    String(today.day).padStart(2, "0"),
  );
  await mkdir(day, { recursive: true });
  await Bun.write(
    join(day, "rollout-tui.jsonl"),
    `${JSON.stringify({ type: "session_meta", payload: { originator: "codex-tui", cwd: "/project", id: "sid-1" } })}\n`,
  );
  const writeAgents = () =>
    Bun.write(agentsFile, JSON.stringify({ result: { agents } }));
  await writeAgents();
  const cycle = async () => {
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dir, "../src/herdr-projector.ts")],
      {
        env: {
          ...process.env,
          PATH: root,
          HOME: root,
          XDG_RUNTIME_DIR: root,
          AGENTS_FILE: agentsFile,
          CALLS_FILE: callsFile,
          FAIL_FILE: failFile,
        },
        stdout: "pipe",
        stderr: "pipe",
        timeout: 10000,
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, exit };
  };
  expect((await cycle()).exit).toBe(0);
  expect(await readFile(callsFile, "utf8")).toBe("apply\napply\n");
  expect((await cycle()).stdout).toContain("unchanged");
  expect(await readFile(callsFile, "utf8")).toBe("apply\napply\n");
  // An atomically published inferred session must wake projection too.
  await mkdir(join(root, "fleet", "sessions"), { recursive: true });
  await Bun.write(join(root, "fleet", "sessions", "sid-1.json"), "{}");
  expect((await cycle()).stdout).not.toContain("unchanged");
  agents[0]!.tab_id = "new-tab";
  await writeAgents();
  await Bun.write(failFile, "fail");
  expect((await cycle()).exit).toBe(1);
  expect((await cycle()).exit).toBe(1);
  await rm(failFile);
  expect((await cycle()).exit).toBe(0);
  expect((await cycle()).stdout).toContain("unchanged");
  // Corrupt runtime cache is a miss, never a reason to skip projection.
  const cache = new Bun.Glob("*.json").scan({
    cwd: join(root, "herdr-projector"),
    absolute: true,
  });
  for await (const path of cache) await Bun.write(path, "corrupt");
  expect((await cycle()).stdout).not.toContain("unchanged");
});
