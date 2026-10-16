import { expect, test } from "bun:test";
import { mkdir, mkdtemp, open, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { purgeCandidates } from "../../src/targets/purge.ts";
import { RIP_GRAVEYARD_MAX_BYTES } from "../../src/lib/graveyards.ts";
import type { LivenessSnapshot } from "../../src/liveness/facts.ts";

test("capacity expiry uses newest rip record time and preserves locked payloads and restore metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-cap-record-age-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const graveyard = join(root, "graveyard");
  await mkdir(graveyard);
  const now = Temporal.Now.instant();
  const old = now.subtract({ hours: 48 }).epochMilliseconds / 1000;
  for (const name of ["locked", "oldest", "newest"]) {
    const path = join(graveyard, name);
    const file = await open(path, "w");
    await file.truncate(RIP_GRAVEYARD_MAX_BYTES / 2);
    await file.close();
    await utimes(path, old, old);
  }
  const record = ["locked", "oldest", "newest"]
    .map(
      (name, index) =>
        `${now.subtract({ hours: 3 - index }).toString()}\t/original/${name}\t${join(graveyard, name)}`,
    )
    .join("\n");
  await writeFile(join(graveyard, ".record"), record);
  const liveness: LivenessSnapshot = {
    facts: () => expect.unreachable("no scratch origins"),
    openPaths: (path) => ({
      open: [],
      unknown: path === join(graveyard, "locked") ? [path] : [],
    }),
    refresh: () => liveness,
  };
  const rows = await purgeCandidates({ RIP_GRAVEYARD: graveyard }, root, {
    ripOnly: true,
    now: now.epochMilliseconds,
    liveness,
  });
  // The record itself also consumes bytes: after the locked 5 GiB is kept,
  // both safe 5 GiB rows must expire for retained bytes to fit the ceiling.
  expect(
    rows.filter((row) => row.verdict === "RECLAIM").map((row) => row.path),
  ).toEqual([join(graveyard, "oldest"), join(graveyard, "newest")]);
  expect(
    rows.find((row) => row.path === join(graveyard, "locked")),
  ).toMatchObject({ verdict: "KEEP", reason: "entry is locked or in use" });
  expect(
    rows.find((row) => row.path === join(graveyard, ".record")),
  ).toMatchObject({
    verdict: "KEEP",
    reason: "required to restore kept graveyard entries",
  });
});

test("an oversized sparse subtree cannot remain below the logical-byte ceiling", async () => {
  const root = await mkdtemp(join(tmpdir(), "rip-cap-oversized-"));
  await using _cleanup = {
    [Symbol.asyncDispose]: () => rm(root, { recursive: true, force: true }),
  };
  const payload = join(root, "oversized");
  await mkdir(payload);
  const file = await open(join(payload, "sparse"), "w");
  await file.truncate(RIP_GRAVEYARD_MAX_BYTES + 1);
  await file.close();
  const rows = await purgeCandidates({ RIP_GRAVEYARD: root }, root, {
    ripOnly: true,
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ path: payload, verdict: "RECLAIM" });
  expect(rows[0]?.reason).toContain("oldest-first capacity expiry");
});
