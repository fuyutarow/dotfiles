import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "../src/zod.ts";
import { cachedSource, withSessionRender } from "../src/render-cache.ts";

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

  test("renders fresh output when a dead owner left a lock and old frame", async () => {
    const root = mkdtempSync(join(tmpdir(), "statusline-render-stale-"));
    using _cleanup: Disposable = {
      [Symbol.dispose]: () => {
        rmSync(root, { recursive: true, force: true });
      },
    };
    const sid = "session-dead-owner";
    const name = new Bun.CryptoHasher("sha256").update(sid).digest("hex");
    const outputPath = join(root, `${name}.json`);
    const lockPath = `${outputPath}.lock`;
    const old = {
      at: Temporal.Now.instant().epochMilliseconds - 360_000,
      input: { cwd: "/old" },
      output: "old frame",
    };
    await Bun.write(outputPath, JSON.stringify(old));
    mkdirSync(lockPath);
    await Bun.write(
      `${lockPath}/owner.json`,
      JSON.stringify({
        pid: 2_147_483_647,
        host: hostname(),
        at: Temporal.Now.instant().epochMilliseconds,
      }),
    );

    let renders = 0;
    const output = await withSessionRender(
      sid,
      () => Promise.resolve(`fresh frame ${++renders}`),
      { root, input: { cwd: "/current" } },
    );

    expect(output).toBe("fresh frame 1");
    expect(renders).toBe(1);
  });

  test("renders fresh output when an ownerless lock is older than two seconds", async () => {
    const root = mkdtempSync(join(tmpdir(), "statusline-render-ownerless-"));
    using _cleanup: Disposable = {
      [Symbol.dispose]: () => {
        rmSync(root, { recursive: true, force: true });
      },
    };
    const sid = "session-ownerless-lock";
    const name = new Bun.CryptoHasher("sha256").update(sid).digest("hex");
    const lockPath = join(root, `${name}.json.lock`);
    mkdirSync(lockPath);
    const oldTime = (Temporal.Now.instant().epochMilliseconds - 3_000) / 1_000;
    utimesSync(lockPath, oldTime, oldTime);

    let renders = 0;
    const output = await withSessionRender(
      sid,
      () => Promise.resolve(`fresh frame ${++renders}`),
      { root, input: { cwd: "/current" } },
    );

    expect(output).toBe("fresh frame 1");
    expect(renders).toBe(1);
  });

  test("persists the current input and render time with each frame", async () => {
    const root = mkdtempSync(join(tmpdir(), "statusline-render-frame-"));
    using _cleanup: Disposable = {
      [Symbol.dispose]: () => {
        rmSync(root, { recursive: true, force: true });
      },
    };
    const sid = "session-current-frame";
    const input = {
      cwd: "/current/worktree",
      stdin: { session_id: sid, model: { display_name: "Current" } },
    };
    const before = Temporal.Now.instant().epochMilliseconds;
    const output = await withSessionRender(
      sid,
      () => Promise.resolve("current frame"),
      { root, input },
    );
    const name = new Bun.CryptoHasher("sha256").update(sid).digest("hex");
    const frame = jsonOf(
      z.object({
        at: z.number(),
        input: z.unknown(),
        output: z.string(),
      }),
    ).safeParse(readFileSync(join(root, `${name}.json`), "utf8"));

    expect(output).toBe("current frame");
    expect(frame.success).toBe(true);
    if (!frame.success) return;
    expect(frame.data.at).toBeGreaterThanOrEqual(before);
    expect(frame.data.at).toBeLessThanOrEqual(
      Temporal.Now.instant().epochMilliseconds,
    );
    expect(frame.data.input).toEqual(input);
    expect(frame.data.output).toBe(output);
  });
});
