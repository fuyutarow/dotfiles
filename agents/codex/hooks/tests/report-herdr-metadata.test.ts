import { afterEach, expect, test } from "bun:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import {
  appendFile,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
  utimes,
} from "node:fs/promises";
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
      cwd: "/fixture/standard-skills",
      originator: "codex-tui",
    },
  };
  const settings = {
    type: "event_msg",
    payload: {
      type: "thread_settings_applied",
      thread_settings: { model, reasoning_effort: effort },
    },
  };
  const filler = {
    type: "response_item",
    payload: { text: "x".repeat(600 * 1024) },
  };
  return `${JSON.stringify(meta)}\n${JSON.stringify(settings)}\n${JSON.stringify(filler)}\n`;
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
  await writeFile(target, rollout("target-thread", "gpt-6.1-sol", "medium"));
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
  const tabRenames: unknown[] = [];
  const requestSchema = z.record(z.string(), z.unknown());
  const server = createServer((socket) => {
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk.toString("utf8");
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      const request = jsonOf(requestSchema).safeParse(input.slice(0, newline));
      if (request.success && request.data.method === "pane.get") {
        socket.end(
          `${JSON.stringify({
            result: {
              pane: {
                pane_id: "fixture-pane",
                tokens: {
                  fullname: "standard-skills-agt_0mr6",
                  model: "Opus 5.5",
                  effort: "high",
                  rc: "🔗",
                },
              },
            },
          })}\n`,
        );
        return;
      }
      if (request.success && request.data.method === "tab.rename") {
        tabRenames.push(request.data);
        socket.end("{}\n");
        return;
      }
      if (request.success) requests.push(request.data);
      socket.end("{}\n");
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(socketPath, resolve);
  });
  server.unref();
  const hook = join(
    import.meta.dir,
    "..",
    "..",
    "..",
    "hooks",
    "report-codex-herdr-metadata.ts",
  );
  const runHook = (
    event: string,
    herdrEnv: string,
    threadId = "target-thread",
    paneId = "fixture-pane",
  ) =>
    new Promise<{ status: number | null; stdout: string; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(Bun.which("bun") ?? "bun", [hook], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            HOME: home,
            TMPDIR: home,
            HERDR_ENV: herdrEnv,
            HERDR_SOCKET_PATH: socketPath,
            HERDR_PANE_ID: paneId,
            HERDR_TAB_ID: "fixture-tab",
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
  expect(requests).toHaveLength(1); // both facts are from this thread, not the pane's old Claude tokens
  expect(requests[0]).toMatchObject({
    params: {
      tokens: {
        fullname: "standard-skills-agt_0mr6",
        model: "gpt-6.1-sol",
        effort: "medium",
        rc: "",
      },
    },
  });
  expect(tabRenames[0]).toMatchObject({
    params: { tab_id: "fixture-tab", label: "agt_0mr6" },
  });

  const unchanged = await runHook("PostToolUse", "1");
  expect(unchanged).toEqual({ status: 0, stdout: "", stderr: "" });
  expect(requests).toHaveLength(1);

  await writeFile(target, rollout("target-thread", "gpt-6.1-sol", "xhigh"));
  expect(
    await readCodexThreadStatus(
      "target-thread",
      join(home, ".codex", "sessions"),
    ),
  ).toMatchObject({ effort: "xhigh" });
  const during = await runHook("PostToolUse", "1");
  expect(during).toEqual({ status: 0, stdout: "", stderr: "" });
  expect(requests).toHaveLength(2);
  expect(requests[1]).toMatchObject({
    method: "pane.report_metadata",
    params: {
      pane_id: "fixture-pane",
      tokens: { model: "gpt-6.1-sol", effort: "xhigh" },
    },
  });

  expect((await runHook("PostToolUse", "1")).status).toBe(0);
  expect(requests).toHaveLength(2);
  const stop = await runHook("Stop", "1");
  expect(stop).toEqual({ status: 0, stdout: "", stderr: "" });
  expect(requests).toHaveLength(3); // lifecycle events reassert despite dedupe

  await appendFile(
    target,
    `${JSON.stringify({
      type: "event_msg",
      payload: {
        type: "thread_settings_applied",
        thread_settings: { model: "gpt-6-luna", reasoning_effort: "low" },
      },
    })}\n`,
  );
  expect((await runHook("PostToolUse", "1")).status).toBe(0);
  expect(requests).toHaveLength(4);
  expect(requests[3]).toMatchObject({
    params: { tokens: { model: "gpt-6-luna", effort: "low" } },
  });
  expect(
    (await runHook("PostToolUse", "1", "target-thread", "other-pane")).status,
  ).toBe(0);
  expect(requests).toHaveLength(5); // dedupe includes pane identity
  expect(requests[4]).not.toHaveProperty("params.tokens.fullname");
  // A reply for a different pane cannot replace this pane's name.

  const key = new Bun.CryptoHasher("sha256")
    .update(JSON.stringify([socketPath, "fixture-pane", "target-thread"]))
    .digest("hex");
  const stamp = join(
    home,
    `dotfiles-codex-herdr-${process.getuid?.() ?? "user"}`,
    `${key}.json`,
  );
  await writeFile(
    stamp,
    JSON.stringify({
      pair: JSON.stringify(["gpt-6-luna", "low", "standard-skills-agt_0mr6"]),
      at: Temporal.Now.instant().epochMilliseconds - 31_000,
    }),
  );
  expect((await runHook("PostToolUse", "1")).status).toBe(0);
  expect(requests).toHaveLength(6); // unchanged values retry after the short TTL

  for (const id of ["", "../target-thread", "missing-thread"]) {
    expect((await runHook("PostToolUse", "1", id)).status).toBe(0);
  }
  expect((await runHook("PostToolUse", "1", "target-thread", "")).status).toBe(
    0,
  );
  expect(requests).toHaveLength(6);

  const outside = await runHook("Stop", "0");
  expect(outside.status).toBe(0);
  expect(requests).toHaveLength(6); // no Herdr pane, no report

  await writeFile(target, rollout("target-thread", "gpt-6.1-sol"));
  expect((await runHook("PostToolUse", "1")).status).toBe(0);
  expect(requests).toHaveLength(7);
  expect(requests[6]).toMatchObject({
    params: {
      tokens: {
        model: "gpt-6.1-sol",
        effort: "unknown",
        fullname: "standard-skills-agt_0mr6",
        rc: "",
      },
    },
  }); // absent Codex effort never falls back to the pane's previous Claude effort
  await writeFile(target, rollout("target-thread", ""));
  expect((await runHook("PostToolUse", "1")).status).toBe(0);
  expect(requests).toHaveLength(8);
  expect(requests[7]).toMatchObject({
    params: {
      tokens: {
        model: "unknown",
        effort: "unknown",
        fullname: "standard-skills-agt_0mr6",
        rc: "",
      },
    },
  }); // unknown facts actively replace the old vendor's tokens
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
  expect(await runHook("Stop", "1")).toEqual({
    status: 0,
    stdout: "",
    stderr: "",
  }); // unavailable socket fails open
}, 30_000);
