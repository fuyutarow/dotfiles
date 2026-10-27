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
import { join, resolve } from "node:path";
import { loadConfig } from "../../src/engine.ts";
import { loadCollectionPolicy } from "../../src/policy.ts";
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
      const rows = await purgeCandidates({ RIP_GRAVEYARD: root }, root, {
        config,
        ripOnly: true,
        now,
        underPressure,
        availableBytes: () => 0,
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
        config,
        now,
        underPressure,
        availableBytes: () => 0,
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
        age < 600_000 ? "KEEP" : "RECLAIM",
      );
      const logs: string[] = [];
      const ctx: Context = {
        mode: "run",
        config,
        underPressure,
        log: (line) => {
          logs.push(line);
        },
      };
      const { target, candidates } = createRipExpiryTarget({
        availableBytes: () => 0,
      });
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

test("rip expiry timer resolves its age from engine config and filesystem space", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-policy-age-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const policyPath = resolve(import.meta.dir, "../../reclaim.toml");
  const loadedConfig = loadConfig(policyPath);
  expect(loadedConfig.error).toBeNull();
  expect(loadedConfig.config).not.toBeNull();
  const loadedPolicy = await loadCollectionPolicy(policyPath);
  expect(loadedPolicy.isOk()).toBe(true);
  if (loadedConfig.config === null || loadedPolicy.isErr()) return;

  const relaxedMinutes = loadedPolicy.value.graveyardMinAgeMinutesAt(
    loadedPolicy.value.recoverHeadroomGiB,
  );
  const policyNow = Temporal.Now.instant().epochMilliseconds;
  const pressuredGiB =
    (loadedPolicy.value.recoverHeadroomGiB +
      loadedPolicy.value.denyHeadroomGiB) /
    2;
  const pressuredMinutes =
    loadedPolicy.value.graveyardMinAgeMinutesAt(pressuredGiB);
  expect(relaxedMinutes).toBe(loadedConfig.config.graveyard_min_age_hours * 60);
  expect(pressuredMinutes).toBeLessThan(relaxedMinutes);
  expect(pressuredMinutes).toBeGreaterThanOrEqual(
    loadedPolicy.value.undoWindowMinutes,
  );

  const entries = [
    ["younger", Math.floor(pressuredMinutes) - 1],
    ["pressure-expired", Math.ceil(pressuredMinutes) + 1],
    ["relaxed-expired", Math.ceil(relaxedMinutes) + 1],
  ] as const;
  const records: string[] = [];
  for (const [name, ageMinutes] of entries) {
    const path = join(root, name);
    await writeFile(path, name);
    const buriedAt = policyNow - ageMinutes * 60_000;
    records.push(
      `${Temporal.Instant.fromEpochMilliseconds(buriedAt).toString()}\t/original\t${path}`,
    );
  }
  await writeFile(join(root, ".record"), records.join("\n"));

  const previousRoot = process.env.RIP_GRAVEYARD;
  process.env.RIP_GRAVEYARD = root;
  using _restoreRoot = {
    [Symbol.dispose]: () => {
      if (previousRoot === undefined) delete process.env.RIP_GRAVEYARD;
      else process.env.RIP_GRAVEYARD = previousRoot;
    },
  };
  const target = createRipExpiryTarget({
    policyPath,
    availableBytes: (path) => {
      expect(path).toBe(root);
      return loadedPolicy.value.recoverHeadroomGiB * 1024 ** 3;
    },
  }).target;
  const highSpaceContext: Context = {
    mode: "plan",
    config: loadedConfig.config,
    log: () => {},
  };
  const highSpaceRows = await target.plan(highSpaceContext);
  await target.finish?.(highSpaceContext);
  expect(
    highSpaceRows.find((row) => row.path === join(root, "younger"))?.verdict,
  ).toBe("KEEP");
  expect(
    highSpaceRows.find((row) => row.path === join(root, "pressure-expired"))
      ?.verdict,
  ).toBe("KEEP");
  expect(
    highSpaceRows.find((row) => row.path === join(root, "relaxed-expired"))
      ?.verdict,
  ).toBe("RECLAIM");

  const pressuredTarget = createRipExpiryTarget({
    policyPath,
    availableBytes: () => pressuredGiB * 1024 ** 3,
  }).target;
  const pressuredContext: Context = {
    mode: "plan",
    config: loadedConfig.config,
    log: () => {},
  };
  const pressuredRows = await pressuredTarget.plan(pressuredContext);
  await pressuredTarget.finish?.(pressuredContext);
  expect(
    pressuredRows.find((row) => row.path === join(root, "younger"))?.verdict,
  ).toBe("KEEP");
  expect(
    pressuredRows.find((row) => row.path === join(root, "pressure-expired"))
      ?.verdict,
  ).toBe("RECLAIM");
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

test("rip expiry returns an unreadable graveyard age policy as an ASK candidate", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-unreadable-policy-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const payload = join(root, "old-payload");
  await writeFile(payload, "fixture");
  await writeFile(
    join(root, ".record"),
    `2000-01-01T00:00:00Z\t/original\t${payload}\n`,
  );
  const policyPath = join(root, "missing-policy.toml");
  const context: Context = { mode: "plan", config, log: () => {} };
  const { target, candidates } = createRipExpiryTarget();

  const rows = await candidates({ RIP_GRAVEYARD: root }, root, {
    context,
    now,
    policyPath,
  });

  expect(rows).toHaveLength(1);
  const failure = rows[0];
  expect(failure?.path).toBeNull();
  expect(failure?.verdict).toBe("ASK");
  expect(failure?.reason).toContain("graveyard age policy");
  expect(failure?.reason).toContain("collection policy: cannot read");
  expect(failure?.reason).toContain(policyPath);
  if (failure === undefined) return;
  expect(await target.recheck(failure, context)).toEqual(failure);
});

test("rip expiry uses a ceiled fractional policy age for deletion eligibility", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-fractional-policy-age-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const policyPath = resolve(import.meta.dir, "../../reclaim.toml");
  const loaded = await loadCollectionPolicy(policyPath);
  expect(loaded.isOk()).toBe(true);
  if (loaded.isErr()) return;

  const targetAgeMinutes = 437.300025;
  const position =
    (targetAgeMinutes - loaded.value.undoWindowMinutes) /
    (loaded.value.graveyardMinAgeHours * 60 - loaded.value.undoWindowMinutes);
  const availableGiB =
    loaded.value.denyHeadroomGiB +
    (loaded.value.recoverHeadroomGiB - loaded.value.denyHeadroomGiB) * position;
  const availableBytes = availableGiB * 1024 ** 3;
  const minimumAgeMinutes = loaded.value.graveyardMinAgeMinutesAt(
    availableBytes / 1024 ** 3,
  );
  const exactMinimumAgeMs = minimumAgeMinutes * 60_000;
  expect(Number.isInteger(exactMinimumAgeMs)).toBe(false);
  const minimumAgeMs = Math.ceil(exactMinimumAgeMs);
  const young = join(root, "fractional-young");
  const old = join(root, "fractional-old");
  await writeFile(young, "young fixture");
  await writeFile(old, "old fixture");
  await utimes(young, 1, 1);
  await utimes(old, 1, 1);
  await writeFile(
    join(root, ".record"),
    (
      [
        ["fractional-young", minimumAgeMs - 1],
        ["fractional-old", minimumAgeMs + 1],
      ] as const
    )
      .map(
        ([name, age]) =>
          `${Temporal.Instant.fromEpochMilliseconds(now - age).toString()}\t/original/${name}\t${join(root, name)}`,
      )
      .join("\n"),
  );

  const ctx: Context = { mode: "run", config, log: () => {} };
  const { target, candidates } = createRipExpiryTarget({
    availableBytes: () => availableBytes,
    policyPath,
  });
  const rows = await candidates({ RIP_GRAVEYARD: root }, root, {
    context: ctx,
    config,
    now,
  });
  const youngCandidate = rows.find((candidate) => candidate.path === young);
  const oldCandidate = rows.find((candidate) => candidate.path === old);
  expect(youngCandidate).toBeDefined();
  expect(oldCandidate).toBeDefined();
  if (youngCandidate === undefined || oldCandidate === undefined) return;

  const youngChecked = await target.recheck(youngCandidate, ctx);
  const oldChecked = await target.recheck(oldCandidate, ctx);
  expect(youngChecked?.verdict).toBe("KEEP");
  expect(oldChecked?.verdict).toBe("RECLAIM");
  if (oldChecked?.verdict !== "RECLAIM") return;
  expect((await target.act(oldChecked, ctx)).ok).toBe(true);
  await target.finish(ctx);
  expect(
    await access(young).then(
      () => true,
      () => false,
    ),
  ).toBe(true);
  expect(
    await access(old).then(
      () => true,
      () => false,
    ),
  ).toBe(false);
});
