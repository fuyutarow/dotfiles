import { expect, test } from "bun:test";
import { mkdtemp, writeFile, chmod, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runSteps, STEPS } from "../post-merge.ts";
import {
  checkCoreFloor,
  type FloorIO,
} from "../../tools/tool-tiers/src/core-floor.ts";

const untrusted = {
  stderr:
    "Refusing to load formula fuyutarow/tap/dx from untrusted tap fuyutarow/tap. Run `brew trust fuyutarow/tap`.",
};

test.each(["read", "installed", "upgrade"])(
  "untrusted tap during %s names the trust repair",
  async (phase) => {
    const io: FloorIO = {
      read: (tool) => {
        if (phase === "read" && tool === "dx")
          return Promise.resolve(untrusted);
        return Promise.resolve(tool === "agx" ? "agx 1.13.14" : "dx 0.1.6");
      },
      installed: (tool) =>
        Promise.resolve(
          phase === "installed" && tool === "dx" ? untrusted : true,
        ),
      upgrade: () =>
        Promise.resolve(phase === "upgrade" ? untrusted : undefined),
    };
    const result = await checkCoreFloor(io, true);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain(
      "untrusted tap fuyutarow/tap; repair: brew trust fuyutarow/tap",
    );
    expect(result.fix).toBe("brew trust fuyutarow/tap");
  },
);

test("floor upgrades only outdated tap tools and rechecks them", async () => {
  const versions = { agx: "1.13.14", dx: "0.1.6" };
  const upgraded: string[] = [];
  const io: FloorIO = {
    read: (tool) => Promise.resolve(`${tool} ${versions[tool]}`),
    installed: () => Promise.resolve(true),
    upgrade: (tool) => {
      upgraded.push(tool);
      versions[tool] = "1.22.8";
      return Promise.resolve();
    },
  };
  expect((await checkCoreFloor(io, true)).ok).toBe(true);
  expect(upgraded).toEqual(["agx"]);
  expect((await checkCoreFloor(io, true)).ok).toBe(true);
  expect(upgraded).toEqual(["agx"]);
});

test("floor fails loudly when upgrade does not reach the floor", async () => {
  const io: FloorIO = {
    read: (tool) =>
      Promise.resolve(`${tool} ${tool === "agx" ? "1.13.14" : "0.1.6"}`),
    installed: () => Promise.resolve(true),
    upgrade: () => Promise.resolve(),
  };
  expect(await checkCoreFloor(io, true)).toEqual({
    ok: false,
    detail: "agx: installed 1.13.14, required 1.22.8; repair: mise run up",
  });
});

test("floor upgrades dx when needed and rejects a still-old result", async () => {
  const upgraded: string[] = [];
  const io: FloorIO = {
    read: (tool) => Promise.resolve(tool === "dx" ? "dx 0.1.5" : "agx 1.22.8"),
    installed: () => Promise.resolve(true),
    upgrade: (tool) => {
      upgraded.push(tool);
      return Promise.resolve();
    },
  };
  expect((await checkCoreFloor(io, true)).detail).toBe(
    "dx: installed 0.1.5, required 0.1.6; repair: mise run up",
  );
  expect(upgraded).toEqual(["dx"]);
});

test.each([false, true])(
  "dx collision blocks every upgrade (formula installed: %s)",
  async (installed) => {
    const upgraded: string[] = [];
    const io: FloorIO = {
      read: (tool) =>
        Promise.resolve(tool === "dx" ? "deno 2.9.8" : "agx 1.13.14"),
      installed: (tool) => Promise.resolve(tool === "dx" ? installed : true),
      upgrade: (tool) => {
        upgraded.push(tool);
        return Promise.resolve();
      },
    };
    expect((await checkCoreFloor(io, true)).detail).toContain(
      "dx: fuyutarow/tap/dx not installed (PATH dx is another program)",
    );
    expect(upgraded).toEqual([]);
  },
);

test("a recursive PATH Bun fixture is bypassed by every script step", async () => {
  const root = await mkdtemp(join(tmpdir(), "post-merge-"));
  const previous = process.env.PATH;
  await writeFile(join(root, "bun"), '#!/bin/sh\nexec bun "$@"\n');
  await chmod(join(root, "bun"), 0o755);
  await writeFile(
    join(root, "probe.ts"),
    `
    const p = Bun.spawn(["bun", "--version"], { timeout: 1000 });
    process.exitCode = await p.exited;
  `,
  );
  process.env.PATH = `${root}:${previous ?? ""}`;
  const lines: string[] = [];
  await using _cleanup = {
    [Symbol.asyncDispose]: async () => {
      process.env.PATH = previous;
      await rm(root, { recursive: true, force: true });
    },
  };
  const code = await runSteps(
    [{ name: "codex:config", args: ["probe.ts"], boundMs: 2000 }],
    root,
    (line) => {
      lines.push(line);
    },
  );
  expect(code).toBe(0);
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatch(/^\[post-merge\] codex:config \d+\.\d{3}s$/u);
});

test("a hung step is killed, named, timed and prevents subsequent work", async () => {
  const lines: string[] = [];
  const started = performance.now();
  const code = await runSteps(
    [
      { name: "hung", args: ["-e", "await Bun.sleep(60000)"], boundMs: 100 },
      { name: "never", args: ["-e", "process.exit(0)"], boundMs: 1000 },
    ],
    tmpdir(),
    (line) => {
      lines.push(line);
    },
  );
  expect(code).toBe(124);
  expect(performance.now() - started).toBeLessThan(2000);
  expect(lines[0]).toMatch(/^\[post-merge\] hung .*s$/u);
  expect(lines[1]).toBe("[post-merge] hung timed out (bound 0.1s)");
  expect(lines.join("\n")).not.toContain("never");
});

test("a failed step stays failed and prevents subsequent work", async () => {
  const lines: string[] = [];
  expect(
    await runSteps(
      [
        { name: "bad", args: ["-e", "process.exit(7)"], boundMs: 5000 },
        { name: "never", args: ["-e", "process.exit(0)"], boundMs: 1000 },
      ],
      tmpdir(),
      (line) => {
        lines.push(line);
      },
    ),
  ).toBe(7);
  expect(lines[1]).toBe("[post-merge] bad failed (exit 7)");
  expect(lines.join("\n")).not.toContain("never");
  expect(
    STEPS.find((step) => step.name === "core-floor")?.boundMs,
  ).toBeLessThanOrEqual(50_000);
}, 15_000);

test("link findings allow remaining deploy steps and remain a non-zero outcome", async () => {
  const lines: string[] = [];
  const code = await runSteps(
    [
      { name: "link:dots", args: ["-e", "process.exit(1)"], boundMs: 1000 },
      { name: "remaining", args: ["-e", "process.exit(0)"], boundMs: 1000 },
    ],
    tmpdir(),
    (line) => {
      lines.push(line);
    },
  );
  expect(code).toBe(1);
  expect(lines.join("\n")).toContain("[post-merge] remaining");
});

test("fatal link failures still stop deployment", async () => {
  const lines: string[] = [];
  const code = await runSteps(
    [
      { name: "link:dots", args: ["-e", "process.exit(2)"], boundMs: 1000 },
      { name: "never", args: ["-e", "process.exit(0)"], boundMs: 1000 },
    ],
    tmpdir(),
    (line) => {
      lines.push(line);
    },
  );
  expect(code).toBe(2);
  expect(lines.join("\n")).not.toContain("never");
});
