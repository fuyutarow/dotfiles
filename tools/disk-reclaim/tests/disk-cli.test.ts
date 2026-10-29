import { jsonText } from "../../shared/src/zod.ts";
import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { runProbe } from "../src/disk-probe.ts";

const cli = join(import.meta.dir, "../src/disk.ts");
async function run(
  args: string[],
  input = "",
  env: NodeJS.ProcessEnv = process.env,
) {
  const p = Bun.spawn([process.execPath, cli, ...args], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env,
  });
  await p.stdin.write(input);
  await p.stdin.end();
  const [out, err, exit] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  return { out, err, exit };
}
describe("disk parser and effect firewall", () => {
  test("root and verb help and version", async () => {
    for (const args of [
      [],
      ["--help"],
      ["plan", "--help"],
      ["move", "-h"],
      ["free", "--help"],
      ["inspect", "--help"],
      ["--version"],
    ])
      expect((await run(args)).exit).toBe(0);
  });
  test("every mode returns unknown without touching paths", async () => {
    const dir = await mkdtemp(join(tmpdir(), "disk-firewall-"));
    const file = join(dir, "payload");
    await writeFile(file, "keep");
    const record = JSON.stringify({
      target: "tmpfs",
      host: "local",
      path: file,
      bytes_allocated: 1,
      regen: true,
      holders: [],
      verdict: "safe",
      reason: "test",
      fingerprint: null,
    });
    const cases: [string[], string?][] = [
      [["plan", "targets"]],
      [["plan", "paths", file]],
      [["plan", "workspace-gc"]],
      [["move", "paths", file]],
      [["move", "workspace-gc"]],
      [["free", "targets", "tmpfs"]],
      [["free", "records"], record],
      [["free", "paths", file]],
      [["free", "graveyard", "--amount", "1MB"]],
      [["free", "capacity", "--path", dir, "--min-available", "1KB"]],
      [["inspect", "targets"]],
      [["inspect", "wsl"]],
    ];
    for (const [args, input] of cases) {
      const result = await run(args, input);
      expect(result.exit).toBe(4);
      expect(jsonText.safeParse(result.out).data).toMatchObject({
        schema: "disk.result/1",
        command: args[0],
        mode: args[1],
        outcome: "unknown",
        items: [],
      });
      expect(await readFile(file, "utf8")).toBe("keep");
    }
  });
  test("receipt inspection reads only the selected state and preserves errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "disk-receipts-"));
    const env = { ...process.env, RECLAIM_STATE_DIR: dir };
    const path = join(dir, "log.jsonl");
    const receipt = {
      name: "fixture",
      command: ["fixture"],
      host: "fixture",
      pid: 1,
      started: "a",
      ended: "b",
      exit: 0,
      free_before: 1,
      free_after: 2,
      output: null,
    };
    const content = `${JSON.stringify(receipt)}\n`;
    await writeFile(path, content);
    const result = await run(["inspect", "receipts"], "", env);
    expect(result.exit).toBe(0);
    expect(jsonText.safeParse(result.out).data).toMatchObject({
      outcome: "completed",
      detail: { receipts: [receipt], errors: [] },
    });
    expect(result.err).toMatch(/elapsed \d+ms \/ deadline 120000ms/u);
    expect(await readFile(path, "utf8")).toBe(content);
    await writeFile(path, "not-json\n");
    const bad = await run(["inspect", "receipts", "--no-progress"], "", env);
    expect(bad.exit).toBe(4);
    expect(jsonText.safeParse(bad.out).data).toMatchObject({
      outcome: "unknown",
      detail: { receipts: [] },
    });
    expect(bad.err).not.toBe("");
    expect(await readFile(path, "utf8")).toBe("not-json\n");
  });
  test("capacity probes do not write the hook cache and time out", async () => {
    const home = await mkdtemp(join(tmpdir(), "disk-capacity-"));
    const env = { ...process.env, HOME: home };
    const cache = join(home, ".cache", "claude-hooks", "storage-headroom");
    const inspected = await run(
      ["inspect", "capacity", "--path", home, "--no-progress"],
      "",
      env,
    );
    expect(inspected.exit).toBe(0);
    expect(jsonText.safeParse(inspected.out).data).toMatchObject({
      outcome: "completed",
      observations: { before: { source: "statfs" } },
    });
    const planned = await run(
      [
        "plan",
        "capacity",
        "--path",
        home,
        "--min-available",
        "1GB",
        "--no-progress",
      ],
      "",
      env,
    );
    expect(planned.exit).toBe(4);
    expect(jsonText.safeParse(planned.out).data).toMatchObject({
      outcome: "unknown",
      observations: { before: { source: "statfs" } },
    });
    expect(existsSync(cache)).toBe(false);
    const timed = await run(
      [
        "inspect",
        "capacity",
        "--path",
        home,
        "--within",
        "1ms",
        "--no-progress",
      ],
      "",
      env,
    );
    expect(timed.exit).toBe(4);
    expect(jsonText.safeParse(timed.out).data).toMatchObject({
      outcome: "unknown",
    });
    expect(existsSync(cache)).toBe(false);
  });
  test("deadline kills and observes a running child", async () => {
    const result = await runProbe(
      [
        process.execPath,
        "-e",
        "console.log(process.pid); setInterval(() => {}, 1000)",
      ],
      300,
    );
    expect(result.timedOut).toBe(true);
    expect(result.exit).not.toBe(0);
    const pid = Number(result.out.trim());
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid, 0)).toThrow();
  });
  test("invalid combinations fail before results", async () => {
    const cases = [
      ["plan", "paths", "/x", "--yes"],
      ["free", "records"],
      ["free", "targets", "tmpfs", "--tier", "blind"],
      ["plan", "targets", "--all", "--target", "tmpfs"],
      ["plan", "targets", "--target", "tmpfs", "--target", "tmpfs"],
      ["free", "paths", "relative"],
      ["free", "graveyard", "--amount", "0GB"],
      ["inspect", "wsl", "--within", "0s"],
      ["free", "targets", "clean", "--only", "/x"],
      ["free", "targets", "tmpfs", "--under-pressure"],
      ["inspect", "receipts", "--last", "1", "--last", "2"],
      ["plan", "paths", "--", "--help"],
      ["plan", "paths", "/x", "--__proto__"],
      ["plan", "paths", "/x", "--constructor"],
    ];
    for (const args of cases) {
      const result = await run(args);
      expect(result.exit).toBe(2);
      expect(result.out).toBe("");
      expect(result.err).not.toBe("");
    }
    expect((await run(["free", "records"], "{}\n")).exit).toBe(2);
  });
  test("Cleye boundary preserves terminated paths and quoted probe paths", async () => {
    const home = await mkdtemp(join(tmpdir(), "disk path 'quoted'-"));
    const env = { ...process.env, HOME: home };
    const result = await run(
      ["inspect", "capacity", "--path", home, "--no-progress"],
      "",
      env,
    );
    expect(result.exit).toBe(0);
    expect(jsonText.safeParse(result.out).data).toMatchObject({
      scope: { path: home },
      outcome: "completed",
    });
    const planned = await run(["plan", "paths", "--", home], "", env);
    expect(planned.exit).toBe(4);
    expect(jsonText.safeParse(planned.out).data).toMatchObject({
      scope: { paths: [home] },
    });
  });
  test("plan-only targets are refused without effects, including in mixed selections", async () => {
    const home = await mkdtemp(join(tmpdir(), "disk-plan-only-"));
    const file = join(home, "payload");
    await writeFile(file, "keep");
    const env = {
      ...process.env,
      HOME: home,
      RECLAIM_STATE_DIR: join(home, "state"),
    };
    for (const target of ["vhdx", "audit"]) {
      const result = await run(
        ["free", "targets", target, "--no-progress"],
        "",
        env,
      );
      expect(result.exit).toBe(1);
      expect(jsonText.safeParse(result.out).data).toMatchObject({
        outcome: "partial",
        items: [{ target, verdict: "deny", effect: "none" }],
        counts: {
          selected: 1,
          completed: 0,
          refused: 1,
          failed: 0,
          unknown: 0,
        },
        observations: { delta_available_bytes: null },
      });
      expect(await readFile(file, "utf8")).toBe("keep");
      expect(existsSync(join(home, "state"))).toBe(false);
    }
    const mixed = await run(
      ["free", "targets", "audit", "clean", "--no-progress"],
      "",
      env,
    );
    expect(mixed.exit).toBe(4);
    expect(jsonText.safeParse(mixed.out).data).toMatchObject({
      outcome: "unknown",
      items: [
        { target: "audit", verdict: "deny" },
        { target: "clean", verdict: "unknown" },
      ],
      counts: { selected: 2, completed: 0, refused: 1, failed: 0, unknown: 1 },
    });
    expect(await readFile(file, "utf8")).toBe("keep");
    expect(existsSync(join(home, "state"))).toBe(false);
  });
  test("stdin wait reports elapsed time and respects its deadline", async () => {
    const p = Bun.spawn(
      [process.execPath, cli, "free", "records", "--within", "50ms"],
      {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [out, err, exit] = await Promise.all([
      new Response(p.stdout).text(),
      new Response(p.stderr).text(),
      p.exited,
    ]);
    expect(exit).toBe(4);
    expect(err).toMatch(
      /waiting for input; elapsed \d+ms \/ deadline 50ms; last stage: parsing/u,
    );
    expect(jsonText.safeParse(out).data).toMatchObject({ outcome: "unknown" });
  });
});
