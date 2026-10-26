import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createRipExpiryTarget } from "../src/targets/rip-expire.ts";
import type { Context } from "../src/targets/index.ts";
import { cliEnv } from "./fixtures/cli-env.ts";
import { tempRoot } from "./fixtures/temp.ts";
import { Plan } from "../src/model.ts";
import { jsonOf } from "../../shared/src/zod.ts";

const config = {
  repo_roots: [],
  repos: [],
  scratch_roots: [],
  delete_roots: [],
  regenerable_ignored: [],
  session_grace_hours: 24,
  ignore_unreadable_procs: [],
};

test("concurrent graveyard unlinks retain payload order, undo window and external symlink targets", async () => {
  const root = tempRoot("reclaim-urgent-order-");
  using _cleanup = {
    [Symbol.dispose]: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
  const graveyard = join(root, "graveyard");
  mkdirSync(graveyard);
  const outside = join(root, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "sentinel"), "retain");
  const now = Temporal.Now.instant();
  const records: string[] = [];
  const names = ["z-oldest", "a-next", "fresh"];
  for (const [index, name] of names.entries()) {
    const payload = join(graveyard, name);
    mkdirSync(payload);
    for (let n = 0; n < 64; n++)
      writeFileSync(join(payload, `file-${n}`), "allocated");
    symlinkSync(outside, join(payload, "external"));
    const time = index === 2 ? now : now.subtract({ hours: 48 - index });
    records.push(`${time.toString()}\t/original\t${payload}`);
  }
  // A malicious restore record cannot authorize a path outside the graveyard.
  records.push(`2000-01-01T00:00:00Z\t/original\t${outside}`);
  writeFileSync(join(graveyard, ".record"), records.join("\n"));
  const ctx: Context = {
    mode: "run",
    config,
    underPressure: true,
    log: () => {},
  };
  const { target, candidates } = createRipExpiryTarget();
  const rows = await candidates({ RIP_GRAVEYARD: graveyard }, root, {
    context: ctx,
  });
  const acted: string[] = [];
  for (const row of rows) {
    const checked = await target.recheck(row, ctx);
    if (checked?.verdict !== "RECLAIM") continue;
    if (acted.length > 0) expect(existsSync(acted.at(-1) ?? "")).toBe(false);
    expect((await target.act(checked, ctx)).ok).toBe(true);
    acted.push(checked.path ?? "");
  }
  await target.finish(ctx);
  expect(acted).toEqual(names.slice(0, 2).map((name) => join(graveyard, name)));
  expect(existsSync(join(graveyard, "fresh", "file-0"))).toBe(true);
  expect(readFileSync(join(outside, "sentinel"), "utf8")).toBe("retain");
  expect(readFileSync(join(graveyard, ".record"), "utf8")).toBe(
    records.join("\n"),
  );
});

test("pressure extends only the default stage budget", async () => {
  const root = tempRoot("reclaim-urgent-budget-");
  using _cleanup = {
    [Symbol.dispose]: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
  const payload = join(root, "payload");
  writeFileSync(payload, "retained during budget probe");
  writeFileSync(
    join(root, ".record"),
    `2000-01-01T00:00:00Z\t/original\t${payload}`,
  );
  for (const [pressure, explicit] of [
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ] satisfies [boolean, boolean][]) {
    let elapsed = 0;
    const ctx: Context = {
      mode: "run",
      config,
      underPressure: pressure,
      log: () => {},
    };
    const { target, candidates } = createRipExpiryTarget({
      clock: () => elapsed,
      ...(explicit ? { budgetMs: 120_000 } : {}),
    });
    const row = (
      await candidates({ RIP_GRAVEYARD: root }, root, { context: ctx })
    ).find((item) => item.path === payload);
    expect(row).toBeDefined();
    if (row === undefined) continue;
    elapsed = 120_001;
    expect((await target.recheck(row, ctx))?.verdict).toBe(
      pressure && !explicit ? "RECLAIM" : "ASK",
    );
  }
});

test("slow deletion emits repeated stderr progress while stdout stays one JSON document", async () => {
  const root = tempRoot("reclaim-urgent-progress-");
  using _cleanup = {
    [Symbol.dispose]: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
  const proc = Bun.spawn(
    [
      process.execPath,
      join(import.meta.dir, "fixtures/delete-progress-cli.ts"),
      "run",
      "--tier",
      "blind",
      "--yes",
      "--json",
    ],
    {
      env: cliEnv(root),
      stdout: "pipe",
      stderr: "pipe",
      timeout: 15_000,
    },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  expect(code).toBe(0);
  expect(jsonOf(Plan).safeParse(stdout).success).toBe(true);
  expect(stdout.trim().split("\n")).toHaveLength(1);
  const lines = stderr
    .split("\n")
    .filter((line) =>
      line.includes(
        "25 bytes freed; current target slow-delete: fixture-payload; 1 targets remaining",
      ),
    );
  expect(lines.length).toBeGreaterThanOrEqual(2);
  expect(stderr).toContain("current target next-delete");
  expect(stderr).toContain("0 targets remaining");
}, 20_000);
