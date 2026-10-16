import { afterAll, describe, expect, test } from "bun:test";
import { postJev } from "../src/jev-client.ts";

const testKey = "jev-client-fixture-secret";
const previousKey = process.env.TYPESAFE_API_KEY;
process.env.TYPESAFE_API_KEY = testKey;
let connectionHeader: string | null = null;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch: (request) => {
    connectionHeader = request.headers.get("connection");
    return Response.json(
      {
        error: {
          type: "authentication_error",
          message: "invalid API key",
        },
      },
      { status: 401, headers: { connection: "close" } },
    );
  },
});

afterAll(() => {
  void server.stop(true);
  if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = previousKey;
});

describe("postJev HTTP handling", () => {
  test("preserves a 401 response when Bun.serve closes its connection", async () => {
    const response = await postJev(
      new URL("/judge", server.url).href,
      { task: "fixture" },
      2_000,
    );

    expect(response.ok).toBe(true);
    if (!response.ok) return;
    expect(response.status).toBe(401);
    expect(response.text).toContain("authentication_error");
    expect(response.trace.status).toBe(401);
    expect(connectionHeader).toBe("close");
    expect(JSON.stringify(response)).not.toContain(testKey);
  });
});
