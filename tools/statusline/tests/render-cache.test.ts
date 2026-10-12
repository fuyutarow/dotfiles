import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../src/zod.ts";
import { cachedSource } from "../src/render-cache.ts";

describe("statusline render cache", () => {
  test("reuses a persistent value until its TTL expires", async () => {
    const root = mkdtempSync(join(tmpdir(), "statusline-cache-"));
    using _cleanup: Disposable = {
      [Symbol.dispose]: () => {
        rmSync(root, { recursive: true, force: true });
      },
    };
    let loads = 0;
    const load = () => Promise.resolve({ value: ++loads });
    const options = {
      key: "fixture",
      ttlMs: 60_000,
      schema: z.object({ value: z.number() }),
      load,
      root,
    };
    expect(await cachedSource(options)).toEqual({ value: 1 });
    expect(await cachedSource(options)).toEqual({ value: 1 });
    expect(loads).toBe(1);
    const name = new Bun.CryptoHasher("sha256").update("fixture").digest("hex");
    const path = join(root, `${name}.json`);
    const saved = jsonOf(
      z.object({ at: z.number(), value: z.object({ value: z.number() }) }),
    ).safeParse(readFileSync(path, "utf8"));
    expect(saved.success).toBe(true);
    if (!saved.success) return;
    writeFileSync(path, JSON.stringify({ ...saved.data, at: 0 }));
    expect(await cachedSource(options)).toEqual({ value: 2 });
    expect(loads).toBe(2);
  });

  test("collapses concurrent renders across processes for the same session", async () => {
    const root = mkdtempSync(join(tmpdir(), "statusline-render-"));
    using _cleanup: Disposable = {
      [Symbol.dispose]: () => {
        rmSync(root, { recursive: true, force: true });
      },
    };
    const modulePath = join(import.meta.dir, "../src/render-cache.ts");
    const worker = `
      import { withSessionRender } from ${JSON.stringify(modulePath)};
      const output = await withSessionRender("session-1", async () => {
        await Bun.sleep(300);
        return String(process.pid);
      }, { root: process.env.STATUSLINE_RENDER_TEST_ROOT });
      process.stdout.write(output);
    `;
    const runWorker = async (): Promise<string> => {
      const child = Bun.spawn([process.execPath, "-e", worker], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, STATUSLINE_RENDER_TEST_ROOT: root },
      });
      const [output, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(exitCode, stderr).toBe(0);
      return output;
    };
    const outputs = await Promise.all([runWorker(), runWorker()]);
    expect(outputs[0]).not.toBe("");
    expect(outputs[1]).toBe(outputs[0]);
  });
});
