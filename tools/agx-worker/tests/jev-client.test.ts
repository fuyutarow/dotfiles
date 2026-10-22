import { afterAll, describe, expect, test } from "bun:test";
import { jevEndpoint, postJev } from "../../shared/src/jev-client.ts";

describe("jevEndpoint", () => {
  test("uses JEV_URL or the caller's default", () => {
    expect(jevEndpoint("https://default.invalid", {})).toEqual({
      ok: true,
      value: "https://default.invalid",
    });
    expect(
      jevEndpoint("https://default.invalid", {
        JEV_URL: "https://override.invalid",
      }),
    ).toEqual({ ok: true, value: "https://override.invalid" });
    expect(jevEndpoint("https://default.invalid", { JEV_URL: "" })).toEqual({
      ok: true,
      value: "",
    });
  });

  test.each(
    ["AGX_NEXT_JEV_URL", "JEX_JEV_URL"].flatMap((name) =>
      ["", "https://retired.invalid"].flatMap((value) =>
        [undefined, "https://override.invalid"].map((override) => ({
          name,
          value,
          override,
        })),
      ),
    ),
  )("refuses retired override %j", ({ name, value, override }) => {
    expect(
      jevEndpoint("https://default.invalid", {
        [name]: value,
        JEV_URL: override,
      }),
    ).toEqual({
      ok: false,
      error: `${name} is no longer supported; unset it and use JEV_URL instead`,
    });
  });
  test("names both retired variables when both are set", () => {
    expect(
      jevEndpoint("https://default.invalid", {
        AGX_NEXT_JEV_URL: "",
        JEX_JEV_URL: "",
      }),
    ).toEqual({
      ok: false,
      error:
        "AGX_NEXT_JEV_URL, JEX_JEV_URL is no longer supported; unset it and use JEV_URL instead",
    });
  });
});

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
