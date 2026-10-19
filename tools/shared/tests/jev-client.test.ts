import { expect, test } from "bun:test";
import { jsonOf, z } from "../src/zod.ts";
import { postJev } from "../src/jev-client.ts";

test("postJev returns the model reported by the endpoint", async () => {
  const previousKey = process.env.TYPESAFE_API_KEY;
  process.env.TYPESAFE_API_KEY = "fake-jev-client-key";
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      Response.json({ model: "jev-endpoint-model", answers: { a: {} } }),
  });
  const result = await postJev(server.url.href, { model: "jev-latest" }, 1000);
  await server.stop(true);
  if (previousKey === undefined) delete process.env.TYPESAFE_API_KEY;
  else process.env.TYPESAFE_API_KEY = previousKey;
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.model).toBe("jev-endpoint-model");
  expect(jsonOf(z.unknown()).safeParse(result.text)).toMatchObject({
    success: true,
    data: { model: "jev-endpoint-model" },
  });
});
