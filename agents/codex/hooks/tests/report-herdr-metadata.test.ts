import { afterEach, expect, test } from "bun:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile, utimes } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { jsonOf, z } from "../../../../tools/shared/src/zod.ts";
import { readCodexThreadStatus } from "../../../../tools/statusline/src/adapters/codex-rollout.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

function rollout(threadId: string, model: string, effort?: string): string {
  const meta = {
    type: "session_meta",
    payload: {
      id: threadId,
      session_id: threadId,
      cwd: "/same/cwd",
      model,
      originator: "codex-tui",
    },
  };
  const turn =
    effort === undefined
      ? ""
      : `${JSON.stringify({ type: "turn_context", payload: { model, effort } })}\n`;
  return `${JSON.stringify(meta)}\n${turn}`;
}

test("natural retry reports exact thread metadata and requires Herdr pane context", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-herdr-metadata-"));
  roots.push(home);
  const date = Temporal.Now.plainDateISO();
  const day = join(
    home,
    ".codex",
    "sessions",
    String(date.year),
    String(date.month).padStart(2, "0"),
    String(date.day).padStart(2, "0"),
  );
  await mkdir(day, { recursive: true });
  const target = join(day, "rollout-fixture-target-thread.jsonl");
  const sibling = join(day, "rollout-fixture-sibling-thread.jsonl");
  await writeFile(target, rollout("target-thread", "gpt-6.1-sol"));
  await writeFile(sibling, rollout("sibling-thread", "gpt-6-luna", "low"));
  await utimes(sibling, 3, 3);
  expect(
    await readCodexThreadStatus(
      "target-thread",
      join(home, ".codex", "sessions"),
    ),
  ).toMatchObject({
    sessionId: "target-thread",
    model: { name: "gpt-6.1-sol" },
  });

  const socketPath = join(home, "herdr-fixture.sock");
  const requests: unknown[] = [];
  const requestSchema = z.record(z.string(), z.unknown());
  const server = createServer((socket) => {
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk.toString("utf8");
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      const request = jsonOf(requestSchema).safeParse(input.slice(0, newline));
      if (request.success) requests.push(request.data);
      socket.end("{}\n");
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(socketPath, resolve);
  });
  server.unref();
  const hook = join(import.meta.dir, "..", "report-herdr-metadata.ts");
  const runHook = (
    event: string,
    herdrEnv: string,
    threadId = "target-thread",
  ) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(Bun.which("bun") ?? "bun", [hook], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            HOME: home,
            HERDR_ENV: herdrEnv,
            HERDR_SOCKET_PATH: socketPath,
            HERDR_PANE_ID: "fixture-pane",
            HERDR_TAB_ID: "",
          },
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 5_000);
        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.on("error", (error) => {
          reject(error);
        });
        child.on("close", (status) => {
          clearTimeout(timer);
          resolve({ status, stdout, stderr });
        });
        child.stdin.end(
          JSON.stringify({ hook_event_name: event, session_id: threadId }),
        );
      },
    );

  const missing = await runHook("Stop", "1", "missing-thread");
  expect(missing.status).toBe(0);
  expect(requests).toHaveLength(0); // same-cwd sessions are not a fallback

  const startup = await runHook("SessionStart", "1");
  expect(startup.status).toBe(0);
  expect(requests).toHaveLength(1); // model is sourced from this thread; effort stays explicit unknown
  expect(requests[0]).toMatchObject({
    params: { tokens: { model: "gpt-6.1-sol", effort: "unknown" } },
  });

  await writeFile(target, rollout("target-thread", "gpt-6.1-sol", "xhigh"));
  expect(
    await readCodexThreadStatus(
      "target-thread",
      join(home, ".codex", "sessions"),
    ),
  ).toMatchObject({ effort: "xhigh" });
  const stop = await runHook("Stop", "1");
  expect(stop.stderr).toBe("");
  expect(stop.stdout).toBe("");
  expect(stop.status).toBe(0);
  expect(requests.length).toBe(2);
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({
    method: "pane.report_metadata",
    params: {
      pane_id: "fixture-pane",
      tokens: { model: "gpt-6.1-sol", effort: "xhigh" },
    },
  });

  const outside = await runHook("Stop", "0");
  expect(outside.status).toBe(0);
  expect(requests).toHaveLength(2); // no Herdr pane, no report
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
});
