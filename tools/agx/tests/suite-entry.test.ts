import { expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { loadRoster } from "../../../agents/models/roster.ts";
import { jsonOf, z } from "../../shared/src/zod.ts";

const ENTRY = fileURLToPath(new URL("../src/agx.ts", import.meta.url));
const JsonValue = jsonOf(z.unknown());

async function invoke(...args: string[]) {
  const child = Bun.spawn([process.execPath, ENTRY, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

async function invokeWithInput(
  input: string,
  env: NodeJS.ProcessEnv,
  ...args: string[]
) {
  const child = Bun.spawn([process.execPath, ENTRY, ...args], {
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  await child.stdin.write(input);
  await child.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { stdout, stderr, exitCode };
}

test("suite entry runs run, ws, and ticket help through their CLIs", async () => {
  const cases = [
    { args: ["--version"], output: /^agx \d+\.\d+\.\d+\n$/u },
    {
      args: ["--help"],
      output: /agx dispatch <ticket.md>[\s\S]*USAGE:[\s\S]*jev[\s\S]*roster/u,
    },
    { args: ["run", "--help"], output: /run/u },
    {
      args: ["dispatch", "--help"],
      output: /USAGE:[\s\S]*<ticket>[\s\S]*--continue[\s\S]*--unit[\s\S]*--ws/u,
    },
    { args: ["check", "--help"], output: /agx check/u },
    { args: ["ls", "--help"], output: /agx ls/u },
    { args: ["judge", "--help"], output: /agx judge/u },
    { args: ["stats", "--help"], output: /agx stats/u },
    { args: ["jev", "--help"], output: /stdin/u },
    { args: ["roster", "--help"], output: /JSON/u },
    { args: ["ws", "--help"], output: /ws/u },
    { args: ["ticket", "--help"], output: /tkt/u },
  ];

  for (const { args, output } of cases) {
    const result = await invoke(...args);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(output);
    expect(result.stderr).toBe("");
  }
}, 30_000);

test("agx roster --json prints the validated roster value", async () => {
  const loaded = await loadRoster();
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) return;

  const result = await invoke("roster", "--json");
  expect(result.exitCode, result.stderr).toBe(0);
  expect(result.stderr).toBe("");
  const parsed = JsonValue.safeParse(result.stdout);
  expect(parsed.success).toBe(true);
  if (parsed.success) expect(parsed.data).toEqual(loaded.value);
});

test("agx jev posts to the endpoint override and reports an HTTP error", async () => {
  const requests: unknown[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const body = await request.text();
      const parsed = JsonValue.safeParse(body);
      requests.push(parsed.success ? parsed.data : body);
      return new URL(request.url).pathname === "/error"
        ? Response.json({ error: "fixture" }, { status: 503 })
        : Response.json({ answers: { worker: { choice: "fixture" } } });
    },
  });
  const request = { state: { task: "fixture" }, questions: { worker: {} } };
  const env = {
    ...process.env,
    AGX_NEXT_JEV_URL: new URL("/answer", server.url).href,
    TYPESAFE_API_KEY: "agx-test-key",
  };
  await (async () => {
    const answer = await invokeWithInput(JSON.stringify(request), env, "jev");
    expect(answer.exitCode, answer.stderr).toBe(0);
    expect(answer.stderr).toBe("");
    const decodedAnswer = JsonValue.safeParse(answer.stdout);
    expect(decodedAnswer.success).toBe(true);
    if (!decodedAnswer.success) return;
    expect(decodedAnswer.data).toEqual({
      answers: { worker: { choice: "fixture" } },
    });
    expect(requests).toEqual([request]);

    const failure = await invokeWithInput(
      JSON.stringify(request),
      { ...env, AGX_NEXT_JEV_URL: new URL("/error", server.url).href },
      "jev",
    );
    expect(failure.exitCode).not.toBe(0);
    expect(failure.stdout).toBe("");
    expect(failure.stderr).toContain("HTTP 503");
    expect(failure.stderr.trim().split("\n")).toHaveLength(1);
    expect(requests).toEqual([request, request]);
  })().finally(() => {
    void server.stop(true);
  });
});

test("suite entry only starts part processes and holds no state", async () => {
  const source = await Bun.file(ENTRY).text();
  expect(source).toContain("Bun.spawn(");
  expect(source).not.toMatch(/from\s+["'][^"']*agx-(?:run|ws|ticket)/u);
  expect(source).not.toMatch(
    /records\.jsonl|XDG_STATE|AGX_STATE|writeFile|mkdir/u,
  );
});
