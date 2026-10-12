import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  applyRecords,
  fingerprint,
  recordsFromPlan,
  type ReclaimRecord,
} from "../src/records.ts";
import { Plan } from "../src/model.ts";
import { tempRoot } from "./fixtures/temp.ts";

async function record(
  path: string,
  verdict: ReclaimRecord["verdict"] = "safe",
) {
  return {
    target: "builds",
    host: "fixture-host",
    path,
    bytes_allocated: 12,
    regen: true,
    holders: [],
    verdict,
    reason: "fixture",
    fingerprint: await fingerprint(path),
  } satisfies ReclaimRecord;
}

test("apply touches only safe records present in stdin", async () => {
  const root = tempRoot("reclaim-records-input-");
  const selected = join(root, "selected");
  const absent = join(root, "absent");
  mkdirSync(selected);
  mkdirSync(absent);
  const calls: string[] = [];
  const planned = await record(selected);
  const receipts = await applyRecords(`${JSON.stringify(planned)}\n`, {
    apply: (item) => {
      calls.push(item.path);
      rmSync(item.path, { recursive: true, force: true });
      return Promise.resolve({ ok: true, reason: "fixture delete" });
    },
  });
  expect(calls).toEqual([selected]);
  expect(receipts.map((item) => item.outcome)).toEqual(["deleted"]);
  expect(existsSync(selected)).toBe(false);
  expect(existsSync(absent)).toBe(true);
  rmSync(root, { recursive: true, force: true });
});

test("apply emits one outcome for duplicate paths and refuses conflicting verdicts", async () => {
  const root = tempRoot("reclaim-records-duplicates-");
  const path = join(root, "candidate");
  mkdirSync(path);
  const safe = await record(path);
  const keep: ReclaimRecord = { ...safe, target: "rust", verdict: "keep" };
  let calls = 0;
  const conflict = await applyRecords(
    `${JSON.stringify(safe)}\n${JSON.stringify(keep)}\n`,
    {
      apply: () => {
        calls += 1;
        return Promise.resolve({ ok: true, reason: "fixture" });
      },
    },
  );
  expect(calls).toBe(0);
  expect(conflict).toHaveLength(1);
  expect(conflict[0]).toMatchObject({
    path,
    outcome: "skipped",
    reason: "duplicate records disagree; verdict is keep",
  });

  const duplicateSafe = await applyRecords(
    `${JSON.stringify(safe)}\n${JSON.stringify(safe)}\n`,
    {
      apply: () => {
        calls += 1;
        rmSync(path, { recursive: true, force: true });
        return Promise.resolve({
          ok: true,
          reason: "fixture delete",
          bytes_freed: 12,
        });
      },
    },
  );
  expect(calls).toBe(1);
  expect(duplicateSafe).toHaveLength(1);
  expect(duplicateSafe[0]).toMatchObject({
    path,
    outcome: "deleted",
    bytes_freed: 12,
  });
  rmSync(root, { recursive: true, force: true });
});

test("apply rejects a path replaced after plan", async () => {
  const root = tempRoot("reclaim-records-replaced-");
  const path = join(root, "candidate");
  const old = join(root, "old");
  mkdirSync(path);
  writeFileSync(join(path, "file"), "before");
  const planned = await record(path);
  renameSync(path, old);
  mkdirSync(path);
  writeFileSync(join(path, "file"), "after");
  let calls = 0;
  const receipts = await applyRecords(`${JSON.stringify(planned)}\n`, {
    apply: () => {
      calls += 1;
      return Promise.resolve({ ok: true, reason: "unexpected" });
    },
  });
  expect(calls).toBe(0);
  expect(receipts[0]?.reason).toBe("fingerprint changed since plan");
  rmSync(root, { recursive: true, force: true });
});

test("ask, deny, and keep records never reach the action", async () => {
  const root = tempRoot("reclaim-records-verdict-");
  const path = join(root, "candidate");
  mkdirSync(path);
  const calls: string[] = [];
  const serialized = (["ask", "deny", "keep"] as const).map(async (verdict) =>
    JSON.stringify(await record(path, verdict)),
  );
  const lines = (await Promise.all(serialized)).join("\n");
  const receipts = await applyRecords(lines, {
    apply: (item) => {
      calls.push(item.path);
      return Promise.resolve({ ok: true, reason: "unexpected" });
    },
  });
  expect(calls).toEqual([]);
  expect(receipts.every((item) => item.outcome === "skipped")).toBe(true);
  rmSync(root, { recursive: true, force: true });
});

test("owner records require their matching approval", async () => {
  const root = tempRoot("reclaim-records-approval-");
  const path = join(root, "candidate");
  mkdirSync(path);
  const ownerRecord = { ...(await record(path)), owner_item: "recycle-bin" };
  let calls = 0;
  const denied = await applyRecords(`${JSON.stringify(ownerRecord)}\n`, {
    apply: () => {
      calls += 1;
      return Promise.resolve({ ok: true, reason: "fixture" });
    },
  });
  expect(calls).toBe(0);
  expect(denied[0]?.reason).toContain("--approve recycle-bin");
  rmSync(root, { recursive: true, force: true });
});

test("plan candidates become one flat record with allocation and holder facts", async () => {
  const root = tempRoot("reclaim-records-plan-");
  const path = join(root, "candidate");
  mkdirSync(path);
  const parsedPlan = Plan.safeParse({
    schema: "reclaim.plan/1",
    host: "fixture-host",
    generated_at: "2026-10-11T00:00:00Z",
    mode: "plan",
    headroom: { drives: [] },
    targets: [
      {
        name: "builds",
        tier: "blind",
        available: true,
        skip_reason: null,
        exit: null,
        candidates: [
          {
            id: "fixture",
            path,
            verdict: "RECLAIM",
            reason: "regenerable build output",
            checks: [
              { name: "not in use", ok: true, detail: "no open holders" },
            ],
            bytes: 4096,
            bytes_kind: "freed_now",
            action: { kind: "delete", argv: [] },
            result: null,
          },
        ],
        totals: { reclaim: 1, ask: 0, keep: 0 },
      },
    ],
    totals: { reclaim_bytes: 4096, ask_bytes: 0, freed_bytes: null },
    receipt: null,
  });
  expect(parsedPlan.success).toBe(true);
  if (!parsedPlan.success) return;
  const rows = await recordsFromPlan(parsedPlan.data);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    target: "builds",
    host: "fixture-host",
    path,
    bytes_allocated: 4096,
    regen: true,
    holders: [],
    verdict: "safe",
  });
  expect(rows[0]?.fingerprint).toEqual(await fingerprint(path));
  const ownerOnlyPlan = structuredClone(parsedPlan.data);
  const firstTarget = ownerOnlyPlan.targets[0];
  const firstCandidate = firstTarget?.candidates[0];
  if (firstTarget === undefined || firstCandidate === undefined) return;
  firstTarget.name = "purge";
  firstTarget.tier = "irreversible";
  firstCandidate.id = "XDG trash: files/old-entry";
  const ownerRows = await recordsFromPlan(ownerOnlyPlan);
  expect(ownerRows[0]).toMatchObject({
    verdict: "ask",
    owner_item: "xdg-trash",
  });
  expect(ownerRows[0]?.reason).toContain("--approve xdg-trash");
  firstTarget.name = "rip-expire";
  firstTarget.tier = "blind";
  firstCandidate.id = "rip graveyard: expired-entry";
  const ripRows = await recordsFromPlan(ownerOnlyPlan);
  expect(ripRows[0]).toMatchObject({
    target: "rip-expire",
    verdict: "safe",
    regen: false,
  });
  rmSync(root, { recursive: true, force: true });
});

test("host lever candidates emit Windows-path JSONL records without local fingerprints", async () => {
  const path = "C:\\Users\\fixture\\AppData\\Local\\npm-cache";
  const parsedPlan = Plan.safeParse({
    schema: "reclaim.plan/1",
    host: "fixture-host",
    generated_at: "2026-10-11T00:00:00Z",
    mode: "plan",
    headroom: { drives: [] },
    targets: [
      {
        name: "host",
        tier: "owner",
        available: true,
        skip_reason: null,
        exit: null,
        candidates: [
          {
            id: "npm-cache",
            path: null,
            verdict: "RECLAIM",
            reason: "regenerable npm cache",
            checks: [{ name: "host-tier", ok: true, detail: "npm-cache" }],
            bytes: 22,
            bytes_kind: "estimate",
            host_lever: {
              path,
              tier: "npm-cache",
              live_safe: true,
              approval: null,
            },
            action: { kind: "command", argv: ["npm-cache", path] },
            result: null,
          },
        ],
        totals: { reclaim: 1, ask: 0, keep: 0 },
      },
    ],
    totals: { reclaim_bytes: 22, ask_bytes: 0, freed_bytes: null },
    receipt: null,
  });
  expect(parsedPlan.success).toBe(true);
  if (!parsedPlan.success) return;
  const rows = await recordsFromPlan(parsedPlan.data);
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    target: "npm-cache",
    host: "fixture-host",
    path,
    bytes_allocated: 22,
    verdict: "safe",
    fingerprint: null,
  });
  const receipts = await applyRecords(`${JSON.stringify(rows[0])}\n`, {
    apply: () => Promise.resolve({ ok: true, reason: "must not run" }),
  });
  expect(receipts[0]?.outcome).toBe("skipped");
  expect(receipts[0]?.reason).toContain("remote host records");
});
