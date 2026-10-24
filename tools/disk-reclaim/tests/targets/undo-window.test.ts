import { expect, test } from "bun:test";
import {
  mkdtemp,
  mkdir,
  open,
  rm,
  writeFile,
  utimes,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRipExpiryTarget } from "../../src/targets/rip-expire.ts";
import { purgeCandidates } from "../../src/targets/purge.ts";
import { deleteApproved } from "../../src/delete.ts";
import { RIP_GRAVEYARD_MAX_BYTES } from "../../src/lib/graveyards.ts";
import type { Context } from "../../src/targets/index.ts";

const now = Temporal.Instant.from("2026-10-24T12:00:00Z").epochMilliseconds;
const config = {
  repo_roots: [],
  repos: [],
  scratch_roots: [],
  delete_roots: [],
  regenerable_ignored: [],
  session_grace_hours: 24,
  ignore_unreadable_procs: [],
  graveyard_min_age_hours: 24,
  graveyard_pressure_undo_minutes: 10,
};

for (const underPressure of [false, true]) {
  for (const age of [0, 599_000, 600_000, 601_000]) {
    test(`11 GiB rip payload age=${age}ms, pressure=${underPressure}`, async () => {
      const root = await mkdtemp(join(tmpdir(), "rip-undo-boundary-"));
      await using _cleanup = {
        [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
      };
      const payload = join(root, "payload");
      const file = await open(payload, "w");
      await file.truncate(11 * 1024 ** 3);
      await file.close();
      // Old source mtimes must not override a fresh recorded burial.
      await utimes(payload, 1, 1);
      await writeFile(
        join(root, ".record"),
        `${Temporal.Instant.fromEpochMilliseconds(now - age).toString()}\t/original\t${payload}\n`,
      );
      for (const retention of [0, 24]) {
        const settings = { ...config, graveyard_min_age_hours: retention };
        const rows = await purgeCandidates({ RIP_GRAVEYARD: root }, root, {
          config: settings,
          ripOnly: true,
          now,
          underPressure,
        });
        expect(rows.find((row) => row.path === payload)?.verdict).toBe(
          age < 600_000 ? "KEEP" : "RECLAIM",
        );
        const shortfall = rows.find(
          (row) => row.id === "rip graveyard capacity shortfall",
        );
        if (age < 600_000) {
          expect(shortfall?.reason).toContain(
            "1 undo-window payloads held (at least 11811160064 bytes)",
          );
          expect(shortfall?.reason).toMatch(
            /at least 107374\d+ bytes over soft target/u,
          );
        } else expect(shortfall).toBeUndefined();
        const purgeRows = await purgeCandidates({ RIP_GRAVEYARD: root }, root, {
          config: settings,
          now,
          underPressure,
          headroom: {
            drives: [
              {
                label: "fixture",
                path: root,
                state: "deny",
                free: 1,
                total: 100,
                deny_line: 10,
                warn_line: null,
                stop_line: null,
              },
            ],
          },
        });
        expect(purgeRows.find((row) => row.path === payload)?.verdict).toBe(
          age < 600_000 || (retention === 24 && !underPressure)
            ? "KEEP"
            : "RECLAIM",
        );
      }
      const logs: string[] = [];
      const ctx: Context = {
        mode: "run",
        config,
        underPressure,
        log: (line) => {
          logs.push(line);
        },
      };
      const { target, candidates } = createRipExpiryTarget();
      const row = (
        await candidates({ RIP_GRAVEYARD: root }, root, {
          context: ctx,
          config,
          now,
        })
      ).find((entry) => entry.path === payload);
      expect(row).toBeDefined();
      if (row === undefined) return;
      const checked = await target.recheck(row, ctx);
      expect(checked?.verdict).toBe(age < 600_000 ? "KEEP" : "RECLAIM");
      if (checked?.verdict === "RECLAIM")
        expect((await target.act(checked, ctx)).ok).toBe(true);
      await target.finish(ctx);
      expect(
        await access(payload).then(
          () => true,
          () => false,
        ),
      ).toBe(age < 600_000);
      if (age < 600_000)
        expect(logs.join("\n")).toContain("capacity shortfall");
    });
  }
}

for (const record of [
  undefined,
  "broken",
  "not-a-time\t/original\tPAYLOAD\n",
]) {
  test(`unknown burial is held for age and capacity expiry: ${record ?? "missing"}`, async () => {
    const root = await mkdtemp(join(tmpdir(), "rip-unknown-burial-"));
    await using _cleanup = {
      [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
    };
    const payload = join(root, "payload");
    const file = await open(payload, "w");
    await file.truncate(RIP_GRAVEYARD_MAX_BYTES + 1);
    await file.close();
    await utimes(payload, 1, 1);
    if (record !== undefined)
      await writeFile(
        join(root, ".record"),
        record.replace("PAYLOAD", payload),
      );
    for (const ripOnly of [false, true]) {
      const rows = await purgeCandidates({ RIP_GRAVEYARD: root }, root, {
        ripOnly,
        now,
        config: { ...config, graveyard_min_age_hours: 0 },
        underPressure: true,
      });
      expect(rows.find((row) => row.path === payload)).toMatchObject({
        verdict: "KEEP",
      });
      expect(rows.find((row) => row.path === payload)?.reason).toContain(
        "burial time unknown",
      );
    }
  });
}

test("capacity expiry skips protected entries while retaining oldest-first eligible order", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-undo-order-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const records: string[] = [];
  for (const [name, age] of [
    ["z-oldest", 800_000],
    ["a-next", 700_000],
    ["fresh", 1000],
  ] as const) {
    const payload = join(root, name);
    const file = await open(payload, "w");
    await file.truncate(name === "fresh" ? 11 * 1024 ** 3 : 1024);
    await file.close();
    records.push(
      `${Temporal.Instant.fromEpochMilliseconds(now - age).toString()}\t/original\t${payload}`,
    );
  }
  await writeFile(join(root, ".record"), records.join("\n"));
  const rows = await purgeCandidates({ RIP_GRAVEYARD: root }, root, {
    ripOnly: true,
    now,
  });
  expect(
    rows.filter((row) => row.verdict === "RECLAIM").map((row) => row.path),
  ).toEqual([join(root, "z-oldest"), join(root, "a-next")]);
  expect(rows.find((row) => row.path === join(root, "fresh"))?.verdict).toBe(
    "KEEP",
  );
  expect(
    rows.find((row) => row.id === "rip graveyard capacity shortfall")?.reason,
  ).toContain("1 undo-window payloads held");
});

test("a changed burial record is checked again before expiry", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-undo-recheck-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const payload = join(root, "payload");
  await writeFile(payload, "keep");
  const record = join(root, ".record");
  await writeFile(record, `2000-01-01T00:00:00Z\t/original\t${payload}\n`);
  const ctx: Context = { mode: "run", config, log: () => {} };
  const { target, candidates } = createRipExpiryTarget();
  const row = (
    await candidates({ RIP_GRAVEYARD: root }, root, { context: ctx, now })
  ).find((item) => item.path === payload);
  expect(row?.verdict).toBe("RECLAIM");
  if (row === undefined) return;
  await writeFile(
    record,
    `${Temporal.Instant.fromEpochMilliseconds(now).toString()}\t/original\t${payload}\n`,
  );
  expect((await target.recheck(row, ctx))?.verdict).toBe("KEEP");
  await writeFile(record, "broken");
  expect((await target.recheck(row, ctx))?.reason).toContain(
    "burial time unknown",
  );
});

test("purge holds an unknown sibling under a recorded mirrored parent", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-unknown-sibling-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const parent = join(root, "mirrored");
  await mkdir(parent);
  await writeFile(join(parent, "recorded"), "old");
  await writeFile(join(parent, "unknown"), "unknown");
  await writeFile(
    join(root, ".record"),
    `2000-01-01T00:00:00Z\t/original\t${join(parent, "recorded")}\n`,
  );
  const rows = await purgeCandidates({ RIP_GRAVEYARD: root }, root, { now });
  expect(rows.find((row) => row.path === parent)?.verdict).toBe("KEEP");
});

test("explicit delete holds fresh and unknown rip entries including descendants", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-delete-undo-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const graveyard = join(root, "graveyard");
  const payload = join(graveyard, "payload");
  const procRoot = join(root, "proc");
  await mkdir(payload, { recursive: true });
  await mkdir(procRoot);
  const child = join(payload, "child");
  await writeFile(child, "keep");
  for (const record of [
    "broken",
    `${Temporal.Now.instant().toString()}\t/original\t${payload}\n`,
  ]) {
    await writeFile(join(graveyard, ".record"), record);
    for (const path of [payload, child, graveyard]) {
      const result = await deleteApproved([path], {
        config: { ...config, delete_roots: [root] },
        graveyard,
        yes: true,
        procRoot,
        state: join(root, "state"),
      });
      expect(result.exit).toBe(2);
      expect(result.lines.join("\n")).toContain("fail:graveyard-undo-window");
      expect(await access(child).then(() => true)).toBe(true);
    }
  }
});
