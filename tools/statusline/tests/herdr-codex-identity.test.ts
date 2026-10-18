// Keep the vendor hook regression in the statusline verification command as well.
import "../../../agents/codex/hooks/tests/report-herdr-metadata.test.ts";
import { expect, test } from "bun:test";
import { jsonText, z } from "../src/zod.ts";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp, rm } from "node:fs/promises";
import { codexAgentName } from "../../../agents/codex/hooks/herdr-identity.ts";
import { clearHerdrMetadata, reportToHerdr } from "../src/identity.ts";

test("Codex names use the shared project rule and keep an existing pane suffix", () => {
  expect(codexAgentName("/fixture/standard-skills", "thread", "agt_0mr6")).toBe(
    "standard-skills-agt_0mr6",
  );
  expect(
    codexAgentName(
      "/fixture/standard-skills",
      "thread",
      "standard-skills-agt_0mr6",
    ),
  ).toBe("standard-skills-agt_0mr6");
  const name = codexAgentName("/fixture/Poly_Search.v1", "thread");
  expect(name).toMatch(/^poly-search-v1-agt_[0-9a-hj-km-np-tv-z]{4}$/u);
  expect(codexAgentName("/fixture/Poly_Search.v1", "thread")).toBe(name);
  expect(codexAgentName("/fixture/Poly_Search.v1", "sibling-thread")).not.toBe(
    name,
  );
});

test("Claude metadata and compact tab label remain unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "herdr-claude-"));
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
  const settings = {
    HERDR_ENV: "1",
    HERDR_SOCKET_PATH: socketPath,
    HERDR_PANE_ID: "claude-pane",
    HERDR_TAB_ID: "claude-tab",
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
  await reportToHerdr("Opus 5.5", "standard-skills-agt_0mr6", "medium", "on");
  // Socket sends are fire-and-forget; observe receipt before checking the payload.
  for (let i = 0; i < 100 && requests.length < 2; i++) await Bun.sleep(5);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({
    method: "pane.report_metadata",
    params: {
      tokens: {
        model: "Opus 5.5",
        effort: "medium",
        fullname: "standard-skills-agt_0mr6",
        rc: "🔗",
      },
    },
  });
  expect(requests[1]).toMatchObject({
    method: "tab.rename",
    params: { label: "agt_0mr6" },
  });
});

test("Claude session start clears a prior occupant before the statusline reports its identity", async () => {
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
  const settings = {
    HERDR_ENV: "1",
    HERDR_SOCKET_PATH: socketPath,
    HERDR_PANE_ID: "claude-pane",
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

  // SessionStart has no dependable model/effort fields, including when its
  // payload has no session id, so clear before the first statusline report.
  await clearHerdrMetadata();
  await reportToHerdr(
    "Sonnet 5.5",
    "research-record-v2-agt_6yz6",
    "high",
    "off",
  );
  for (let i = 0; i < 100 && requests.length < 2; i++) await Bun.sleep(5);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({
    method: "pane.report_metadata",
    params: {
      tokens: { fullname: "", model: "", effort: "", rc: "" },
    },
  });
  expect(requests[1]).toMatchObject({
    method: "pane.report_metadata",
    params: {
      tokens: {
        fullname: "research-record-v2-agt_6yz6",
        model: "Sonnet 5.5",
        effort: "high",
        rc: "rc:off",
      },
    },
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
