import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFleetSession } from "@dotfiles/shared/src/fleet-session.ts";

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
} else if (process.argv[3] === "rename" || process.argv[3] === "report-metadata") {
  await Bun.write(process.env.CALLS_FILE, (await Bun.file(process.env.CALLS_FILE).text().catch(() => "")) + "apply\\n");
  process.exitCode = await Bun.file(process.env.FAIL_FILE).exists() ? 1 : 0;
}
`,
  );
  await chmod(fixture, 0o755);
  const agentsFile = join(root, "agents.json");
  const callsFile = join(root, "calls");
  const failFile = join(root, "fail");
  const agents: Array<{
    agent: string;
    pane_id: string;
    tab_id: string;
    cwd: string;
    agent_session?: { value: string };
  }> = [
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
  const cycle = async (args: string[] = []) => {
    const child = Bun.spawn(
      [
        process.execPath,
        join(import.meta.dir, "../src/herdr-projector.ts"),
        ...args,
      ],
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
  const preview = await cycle(["--dry-run"]);
  expect(preview.exit).toBe(0);
  expect(preview.stdout).toContain("wouldApply");
  expect(await Bun.file(callsFile).exists()).toBe(false);
  expect(await Bun.file(join(root, "herdr-projector")).exists()).toBe(false);
  expect((await cycle()).exit).toBe(0);
  expect(await readFile(callsFile, "utf8")).toBe("apply\napply\n");
  expect((await cycle()).stdout).toContain("unchanged");
  expect(await readFile(callsFile, "utf8")).toBe("apply\napply\n");
  // Same-cwd rollout and fleet records are ignored until Herdr reports that exact ID.
  expect(
    await writeFleetSession(
      {
        schema: 1,
        session_id: "sid-1",
        vendor: "codex",
        name: "project-agt_abcd",
        model: "gpt-6.1-sol",
        effort: "medium",
        ctx: { tokens: 10, pct: 1 },
        rate: { na: true, why: "not available" },
        cwd: "/project",
        pane_id: null,
        updated_at: Temporal.Now.instant().toString(),
      },
      { XDG_RUNTIME_DIR: root },
    ),
  ).toMatchObject({ ok: true });
  expect((await cycle()).stdout).toContain("unchanged");
  const agent = agents[0];
  if (agent === undefined) expect.unreachable("missing agent fixture");
  agent.agent_session = { value: "sid-1" };
  await writeAgents();
  // An untrusted non-UUID registration is erased before fingerprinting.
  expect((await cycle()).stdout).toContain("unchanged");
  agent.tab_id = "new-tab";
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
