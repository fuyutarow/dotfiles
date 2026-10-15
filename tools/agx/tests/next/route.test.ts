import { afterEach, describe, expect, test } from "bun:test";
import { jsonOf, z } from "../../../shared/src/zod.ts";
import { route } from "../../src/next/route.ts";
import { parseNextTicket } from "../../src/next/ticket.ts";

const priorUrl = process.env.AGX_NEXT_JEV_URL;
const servers: ReturnType<typeof Bun.serve>[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop(true);
  if (priorUrl === undefined) delete process.env.AGX_NEXT_JEV_URL;
  else process.env.AGX_NEXT_JEV_URL = priorUrl;
});

describe("capability constrained routing", () => {
  test("th_purge replay rejects luna-medium and sends timeout as task size", async () => {
    const RoutingRequest = z.looseObject({
      state: z.looseObject({
        task_size: z.looseObject({ timeout_s: z.number(), class: z.string() }),
      }),
      questions: z.looseObject({
        worker: z.looseObject({ criteria: z.record(z.string(), z.string()) }),
      }),
    });
    let requestBody: z.output<typeof RoutingRequest> | undefined;
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        const parsed = jsonOf(RoutingRequest).safeParse(await request.text());
        if (parsed.success) requestBody = parsed.data;
        return Response.json({
          answers: {
            worker: {
              choice: "luna-medium",
              probabilities: { "luna-medium": 0.99, "sol-low": 0.01 },
            },
          },
        });
      },
    });
    servers.push(server);
    process.env.AGX_NEXT_JEV_URL = `http://127.0.0.1:${server.port}/choice`;
    const parsed = parseNextTicket(
      `+++\nschema = 2\nname = "th_purge"\nwrites = ["PURGE-MANIFEST.tsv", "admission/**"]\noutcome = "inventory, classify, retain, and verify every theory file"\ntimeout_s = 14400\ncapabilities = ["terminal-agentic", "long-tool-loop", "bulk-classification"]\n[proposition]\nid = "TH-PURGE-1"\nclaim = "every THEORY file is retained byte-exact in canonical v1"\nrefuted_by = "a THEORY row lacks a verified v1 id or has a byte mismatch"\n+++\nInventory all prose research artifacts.\n`,
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const selected = await route(
      "inventory and classify the repo",
      parsed.ticket.capabilities,
      parsed.ticket.timeout_s,
    );
    expect(selected.id).toBe("sol-low");
    expect(requestBody?.state.task_size).toEqual({
      timeout_s: 14_400,
      class: "multi-hour",
    });
    expect(
      requestBody?.questions.worker.criteria["luna-medium"],
    ).toBeUndefined();
    expect(requestBody?.questions.worker.criteria["sol-low"]).toContain("TB4");
    const retry = await route(
      "inventory and classify the repo",
      parsed.ticket.capabilities,
      parsed.ticket.timeout_s,
      ["sol-low"],
    );
    expect(retry.id).not.toBe("sol-low");
    expect(retry.id).not.toBe("luna-medium");
  });
});
