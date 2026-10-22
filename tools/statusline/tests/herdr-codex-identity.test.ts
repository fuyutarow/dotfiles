import { expect, test } from "bun:test";
import { jsonText, z } from "../src/zod.ts";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import {
  codexAgentName,
  readHerdrPaneName,
} from "../../../agents/codex/hooks/herdr-identity.ts";
import { readFleetSession } from "../../shared/src/fleet-session.ts";
import { writeStatuslineFleetSession } from "../src/fleet-session.ts";

test("Codex names derive their suffixes from the exact thread, not pane display text", () => {
  const cwd = "/fixture/Poly_Search.v1";
  const threadId = "thread";
  const name = codexAgentName(cwd, threadId);
  expect(name).toMatch(/^poly-search-v1-agt_[0-9a-hj-km-np-tv-z]{4}$/u);
  expect(codexAgentName(cwd, threadId, "agt_0mr6")).toBe(name);
  expect(codexAgentName(cwd, threadId, "other-project-agt_0mr6")).toBe(name);
  expect(codexAgentName(cwd, threadId, "claude-session-agt_abcd")).toBe(name);
  expect(codexAgentName(cwd, "sibling-thread")).not.toBe(name);
});

test("Codex strips old Herdr display fullnames before generating its name", async () => {
  const root = await mkdtemp(join(tmpdir(), "herdr-codex-name-"));
  await using _directory = {
    [Symbol.asyncDispose]: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
  const socketPath = join(root, "fixture.sock");
  const fullnames = ["other-project-agt_0mr6", "claude-session-agt_abcd"];
  const server = createServer((socket) => {
    socket.once("data", () => {
      const fullname = fullnames.shift() ?? "unexpected-agt_none";
      socket.end(
        `${JSON.stringify({
          result: {
            pane: { pane_id: "fixture-pane", tokens: { fullname } },
          },
        })}\n`,
      );
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(socketPath, resolve);
  });
  await using _server = {
    [Symbol.asyncDispose]: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      });
    },
  };
  const settings = {
    HERDR_ENV: "1",
    HERDR_SOCKET_PATH: socketPath,
    HERDR_PANE_ID: "fixture-pane",
  };
  const previous = new Map(
    Object.keys(settings).map((key) => [key, process.env[key]]),
  );
  using _environment = {
    [Symbol.dispose]: () => {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
  Object.assign(process.env, settings);

  const first = await readHerdrPaneName();
  const second = await readHerdrPaneName();
  expect(first).toEqual({ name: undefined });
  expect(second).toEqual({ name: undefined });
  const firstName = codexAgentName(
    "/fixture/example-skills",
    "thread",
    first?.name,
  );
  const secondName = codexAgentName(
    "/fixture/example-skills",
    "thread",
    second?.name,
  );
  expect(secondName).toBe(firstName);
});

test("Claude status writes the fleet session and leaves Herdr metadata to its projector", async () => {
  const root = await mkdtemp(join(tmpdir(), "herdr-claude-fleet-"));
  await using _directory = {
    [Symbol.asyncDispose]: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
  const runtime = join(root, "runtime");
  const socketPath = join(root, "fixture.sock");
  const requests: unknown[] = [];
  const server = createServer((socket) => {
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk.toString();
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      const parsed = jsonText.safeParse(input.slice(0, newline));
      if (parsed.success) requests.push(parsed.data);
      socket.end("{}\n");
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(socketPath, resolve);
  });
  await using _server = {
    [Symbol.asyncDispose]: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      });
    },
  };
  const settings = {
    HERDR_ENV: "1",
    HERDR_SOCKET_PATH: socketPath,
    HERDR_PANE_ID: "claude-pane",
    HERDR_TAB_ID: "claude-tab",
    XDG_RUNTIME_DIR: runtime,
  };
  const previous = new Map(
    Object.keys(settings).map((key) => [key, process.env[key]]),
  );
  using _environment = {
    [Symbol.dispose]: () => {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
  Object.assign(process.env, settings);
  await writeStatuslineFleetSession(
    {
      sessionId: "claude-session",
      sessionName: "display-hint-only",
      cwd: "/work/example-skills",
      model: { name: "Opus 5.5" },
      effort: "medium",
      context: { inputTokens: 1200, usedPercent: 12.5 },
    },
    "claude",
  );
  await Bun.sleep(25);
  expect(requests).toEqual([]);
  expect(
    await readFleetSession("claude-session", { XDG_RUNTIME_DIR: runtime }),
  ).toMatchObject({
    vendor: "claude",
    model: "Opus 5.5",
    effort: "medium",
    ctx: { tokens: 1200, pct: 12.5 },
    cwd: "/work/example-skills",
  });
});

test("Claude status does not clear or report pane metadata on session start", async () => {
  const root = await mkdtemp(join(tmpdir(), "herdr-claude-start-"));
  await using _directory = {
    [Symbol.asyncDispose]: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
  const socketPath = join(root, "fixture.sock");
  const requests: unknown[] = [];
  const server = createServer((socket) => {
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk.toString();
      const newline = input.indexOf("\n");
      if (newline < 0) return;
      const parsed = jsonText.safeParse(input.slice(0, newline));
      if (parsed.success) requests.push(parsed.data);
      socket.end("{}\n");
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(socketPath, resolve);
  });
  await using _server = {
    [Symbol.asyncDispose]: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve();
          else reject(error);
        });
      });
    },
  };
  const runtime = join(root, "runtime");
  const settings = {
    HERDR_ENV: "1",
    HERDR_SOCKET_PATH: socketPath,
    HERDR_PANE_ID: "claude-pane",
    XDG_RUNTIME_DIR: runtime,
  };
  const previous = new Map(
    Object.keys(settings).map((key) => [key, process.env[key]]),
  );
  using _environment = {
    [Symbol.dispose]: () => {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    },
  };
  Object.assign(process.env, settings);

  await writeStatuslineFleetSession(
    {
      sessionId: "claude-session-start",
      cwd: "/work/example-records-v2",
      model: { name: "Sonnet 5.5" },
      effort: "high",
    },
    "claude",
  );
  await Bun.sleep(25);
  expect(requests).toEqual([]);
  expect(
    await readFleetSession("claude-session-start", {
      XDG_RUNTIME_DIR: runtime,
    }),
  ).toMatchObject({
    vendor: "claude",
    model: "Sonnet 5.5",
    effort: "high",
    cwd: "/work/example-records-v2",
  });
});

test("Codex and Claude sidebar rows use the same full name and vendor metadata tokens", async () => {
  const text = await Bun.file(
    new URL("../../../herdr/config.toml", import.meta.url),
  ).text();
  const toml = await Promise.try(() => Bun.TOML.parse(text)).catch(() => null);
  const config = z
    .object({
      ui: z.object({
        sidebar: z.object({
          agents: z.object({
            rows_by_agent: z.record(z.string(), z.unknown()),
          }),
        }),
      }),
    })
    .safeParse(toml);
  expect(config.success).toBe(true);
  if (!config.success) return;
  const rows = config.data.ui.sidebar.agents.rows_by_agent;
  expect(rows.codex).toEqual(rows.claude);
});
