import { expect, test } from "bun:test";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  FleetSessionUnavailableSchema,
  readFleetSession,
} from "../../../../tools/shared/src/fleet-session.ts";
import { projectAgents } from "../../../../tools/herdr-projector/src/herdr-projector.ts";
import { jsonOf, z } from "../../../../tools/shared/src/zod.ts";
import { codexAgentName, readHerdrPaneName } from "../herdr-identity.ts";

const requestSchema = z.record(z.string(), z.unknown());
const restoreEnvironment = (previous: Map<string, string | undefined>) => {
  for (const [key, value] of previous) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
};

function rollout(id: string, model: string, effort: string) {
  return [
    {
      type: "session_meta",
      payload: {
        id,
        session_id: id,
        cwd: "/fixture/example-repo",
        originator: "codex-tui",
      },
    },
    {
      type: "turn_context",
      payload: { model, effort },
    },
  ]
    .map((record) => JSON.stringify(record))
    .join("\n")
    .concat("\n");
}

test("Codex hook writes and reports the exact rollout session id", async () => {
  const home = await mkdtemp(join(tmpdir(), "codex-herdr-metadata-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(home, { recursive: true, force: true }),
  };
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
  await Promise.all([
    writeFile(
      join(day, "rollout-target-thread.jsonl"),
      rollout("target-thread", "gpt-6.1-sol", "medium"),
    ),
    writeFile(
      join(day, "rollout-sibling-thread.jsonl"),
      rollout("sibling-thread", "gpt-6-luna", "low"),
    ),
    writeFile(
      join(day, "rollout-slow-reply-thread.jsonl"),
      rollout("slow-reply-thread", "gpt-6.1-sol", "medium"),
    ),
    writeFile(
      join(day, "rollout-missing-reply-thread.jsonl"),
      rollout("missing-reply-thread", "gpt-6.1-sol", "medium"),
    ),
  ]);

  const bin = join(home, "bin");
  const herdrArgs = join(home, "herdr-args.txt");
  const runtime = join(home, "runtime");
  const socketPath = join(home, "herdr.sock");
  await mkdir(bin);
  const herdr = join(bin, "herdr");
  await writeFile(
    herdr,
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$HERDR_ARGS_FILE"\n',
  );
  await chmod(herdr, 0o755);

  const server = createServer((socket) => {
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk.toString("utf8");
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      const parsed = jsonOf(requestSchema).safeParse(input.slice(0, newline));
      if (parsed.success && parsed.data["method"] === "pane.get") {
        const paneRequest = jsonOf(z.object({ pane_id: z.string() })).safeParse(
          parsed.data["params"],
        );
        if (!paneRequest.success) {
          socket.end("{}\n");
          return;
        }
        const paneId = paneRequest.data.pane_id;
        if (paneId === "missing-pane") {
          socket.end();
          return;
        }
        const reply = `${JSON.stringify({
          result: {
            pane: {
              pane_id: paneId,
              tokens: { fullname: "example-repo-agt_0mr6" },
            },
          },
        })}\n`;
        if (paneId === "slow-pane")
          setTimeout(() => {
            socket.end(reply);
          }, 350);
        else socket.end(reply);
        return;
      }
      socket.end("{}\n");
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(socketPath, resolve);
  });
  server.unref();
  await using _server = {
    [Symbol.asyncDispose]: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      }),
  };

  const hook = join(import.meta.dir, "..", "report-herdr-metadata.ts");
  const runHook = (threadId: string, paneId = "fixture-pane") =>
    new Promise<{ status: number | null; stderr: string }>(
      (resolve, reject) => {
        const child = spawn(Bun.which("bun") ?? "bun", [hook], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            HOME: home,
            TMPDIR: home,
            PATH: `${bin}:${process.env["PATH"] ?? ""}`,
            XDG_RUNTIME_DIR: runtime,
            HERDR_ENV: "1",
            HERDR_SOCKET_PATH: socketPath,
            HERDR_PANE_ID: paneId,
            HERDR_ARGS_FILE: herdrArgs,
          },
          stdio: ["pipe", "ignore", "pipe"],
        });
        let stderr = "";
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
        }, 5000);
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
        });
        child.on("error", reject);
        child.on("close", (status) => {
          clearTimeout(timer);
          resolve({ status, stderr });
        });
        child.stdin.end(
          JSON.stringify({
            hook_event_name: "SessionStart",
            session_id: threadId,
          }),
        );
      },
    );

  expect(await runHook("target-thread")).toEqual({ status: 0, stderr: "" });
  const fleetSession = await readFleetSession("target-thread", {
    XDG_RUNTIME_DIR: runtime,
  });
  expect(fleetSession).toMatchObject({
    session_id: "target-thread",
    vendor: "codex",
    name: codexAgentName("/fixture/example-repo", "target-thread"),
    model: "gpt-6.1-sol",
    effort: "medium",
    cwd: "/fixture/example-repo",
  });
  const calls: string[][] = [];
  await projectAgents(
    [
      {
        agent: "codex",
        pane_id: "fixture-pane",
        tab_id: "fixture-tab",
        agent_session: { value: "target-thread" },
        cwd: "/fixture/example-repo",
      },
    ],
    new Map([["target-thread", fleetSession]]),
    (args) => Promise.resolve(calls.push(args)).then(() => true),
  );
  expect(calls[1]).toContain("model=gpt-6.1-sol");
  expect(calls[1]).toContain("effort=medium");
  expect(calls[1]).toContain("fleet_session_id=target-thread");
  expect(await readFile(herdrArgs, "utf8")).toBe(
    "pane report-agent-session --source dotfiles:codex-session --agent codex --agent-session-id target-thread fixture-pane\n",
  );

  const readPaneName = (paneId: string) => {
    const settings = {
      HERDR_ENV: "1",
      HERDR_SOCKET_PATH: socketPath,
      HERDR_PANE_ID: paneId,
    };
    const previous = new Map(
      Object.keys(settings).map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, settings);
    return readHerdrPaneName().finally(() => {
      restoreEnvironment(previous);
    });
  };

  for (const [threadId, paneId] of [
    ["slow-reply-thread", "slow-pane"],
    ["missing-reply-thread", "missing-pane"],
  ] as const) {
    expect(await readPaneName(paneId)).toBeUndefined();
    expect(await runHook(threadId, paneId)).toEqual({ status: 0, stderr: "" });
    expect(
      await readFleetSession(threadId, { XDG_RUNTIME_DIR: runtime }),
    ).toMatchObject({
      session_id: threadId,
      vendor: "codex",
      name: codexAgentName("/fixture/example-repo", threadId),
      cwd: "/fixture/example-repo",
    });
  }

  expect(await runHook("missing-thread")).toEqual({ status: 0, stderr: "" });
  expect(await readFile(herdrArgs, "utf8")).toContain(
    "--agent-session-id target-thread",
  );
  const missing = await readFleetSession("missing-thread", {
    XDG_RUNTIME_DIR: runtime,
  });
  const unavailable = FleetSessionUnavailableSchema.safeParse(missing);
  expect(unavailable.success).toBe(true);
  if (unavailable.success) expect(unavailable.data.why).toContain("missing");
});
