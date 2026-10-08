import { expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  utimesSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tempRoot } from "../fixtures/temp.ts";
import { purge } from "../../src/targets/purge.ts";
import { main as reclaimMain } from "../../src/reclaim.ts";
import { purgeCandidates } from "../../src/targets/purge.ts";
import {
  existingGraveyards,
  graveyardCandidates,
} from "../../src/lib/graveyards.ts";
import { countEntries, newlines } from "../../src/lib/purge-progress.ts";
import type { Context } from "../../src/targets/index.ts";
import type {
  LivenessFacts,
  LivenessSnapshot,
} from "../../src/liveness/facts.ts";

async function purgeTty(
  keys: string,
): Promise<{ code: number; out: string; root: string }> {
  const root = tempRoot("disk-reclaim-purge-tty-");
  const grave = join(root, "grave");
  const procDir = join(root, "proc");
  mkdirSync(procDir);
  mkdirSync(grave);
  writeFileSync(join(grave, "keep"), "fixture\n");
  mkdirSync(join(grave, "nested", "deep"), { recursive: true });
  writeFileSync(join(grave, "nested", "deep", "file"), "fixture\n");
  const old =
    Temporal.Now.instant().subtract({ hours: 48 }).epochMilliseconds / 1000;
  utimesSync(join(grave, "keep"), old, old);
  utimesSync(join(grave, "nested"), old, old);
  let raw = "";
  let typed = false;
  const script = `const { main } = await import(${JSON.stringify(new URL("../../src/reclaim.ts", import.meta.url).href)}); const { purge } = await import(${JSON.stringify(new URL("../../src/targets/purge.ts", import.meta.url).href)}); process.exitCode = await main(["run", "purge", "--interactive"], [purge]);`;
  await using terminal = new Bun.Terminal({
    cols: 80,
    rows: 24,
    data(term, data) {
      raw += new TextDecoder().decode(data);
      if (!typed && raw.includes("Type yes to continue")) {
        typed = true;
        term.write(keys);
      }
    },
  });
  const proc = Bun.spawn([process.execPath, "-e", script], {
    env: {
      ...process.env,
      HOME: root,
      GRAVEYARD: grave,
      XDG_DATA_HOME: join(root, "xdg"),
      XDG_STATE_HOME: join(root, "state"),
      RECLAIM_STATE_DIR: join(root, "state/reclaim"),
      RECLAIM_UNIT_PROC_ROOT: procDir,
    },
    terminal,
  });
  const code = await Promise.race([
    proc.exited,
    Bun.sleep(8_000).then(() => {
      proc.kill();
      return -1;
    }),
  ]);
  return { code, out: raw, root };
}

test("purge removes 555/444 tree without following a symlink outside it", async () => {
  const root = tempRoot("disk-reclaim-purge-");
  const procDir = join(root, "proc");
  mkdirSync(procDir);
  const grave = join(root, "grave");
  const tree = join(grave, "arena");
  const outside = join(root, "outside");
  mkdirSync(join(tree, "snap"), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(tree, "snap", "page"), "fixture");
  writeFileSync(join(outside, "keep"), "untouched");
  const old =
    Temporal.Now.instant().subtract({ hours: 48 }).epochMilliseconds / 1000;
  utimesSync(tree, old, old);
  symlinkSync(outside, join(tree, "live-store"));
  chmodSync(join(tree, "snap", "page"), 0o444);
  chmodSync(join(tree, "snap"), 0o555);
  chmodSync(tree, 0o555);
  const candidate = {
    id: "grave",
    path: grave,
    verdict: "RECLAIM" as const,
    reason: "fixture",
    checks: [],
    bytes: null,
    bytes_kind: "estimate" as const,
    action: { kind: "delete" as const, argv: [] },
    result: null,
  };
  const logs: string[] = [];
  const ctx: Context = {
    mode: "run",
    procDir,
    explicit: false,
    config: {
      repo_roots: [],
      repos: [],
      scratch_roots: [],
      delete_roots: [],
      regenerable_ignored: [],
      session_grace_hours: 24,
      ignore_unreadable_procs: ["sshd"],
    },
    log: (line) => {
      logs.push(line);
    },
  };
  expect(
    purgeCandidates({ GRAVEYARD: grave, USER: "x" }, root).find(
      (item) => item.path === tree,
    )?.action.argv[0],
  ).toBe("removeTree");
  const result = await purge.act(candidate, ctx);
  expect(result.ok).toBe(true);
  expect(existsSync(tree)).toBe(false);
  expect(readFileSync(join(outside, "keep"), "utf8")).toBe("untouched");
  expect(logs).toEqual(["grave: 4 entries removed"]);
});

test("typed confirmation accepts only an exact yes", async () => {
  const { typedYes } = await import("../../src/targets/purge.ts");
  expect(typedYes("yes")).toBe(true);
  expect(typedYes(" yes ")).toBe(true);
  expect(typedYes("YES")).toBe(false);
  expect(typedYes("no")).toBe(false);
  expect(typedYes("\u001B")).toBe(false);
  expect(typedYes("\n")).toBe(false);
  expect(typedYes(null)).toBe(false);
});

test("purge planning selects each configured graveyard root", () => {
  const root = tempRoot("disk-reclaim-graves-");
  const env = {
    HOME: join(root, "home"),
    USER: "fixture",
    GRAVEYARD: join(root, "grave"),
    XDG_DATA_HOME: join(root, "data"),
  };
  mkdirSync(env.GRAVEYARD, { recursive: true });
  mkdirSync(join(env.XDG_DATA_HOME, "Trash/files"), { recursive: true });
  mkdirSync(join(env.XDG_DATA_HOME, "Trash/info"), { recursive: true });
  expect(purgeCandidates(env, env.HOME)).toEqual([]);
});

const liveFacts = (uuid: string): LivenessFacts => ({
  sessions: { ok: true, value: [] },
  procStarttime: () => ({ ok: true, value: "1" }),
  environSessionIds: { ok: true, value: [uuid] },
  openPaths: { ok: true, value: [] },
  transcript: { ok: true, value: { exists: true, mtimeMs: 1 } },
  now: Temporal.Now.instant().epochMilliseconds,
  graceHours: 24,
});

function livenessSnapshot(facts: LivenessFacts): LivenessSnapshot {
  return {
    facts: () => facts,
    openPaths: () => ({ open: [], unknown: [] }),
    refresh: () => livenessSnapshot(facts),
  };
}

function recentPurgeFixture(ageMinutes: number) {
  const root = tempRoot("disk-reclaim-pressure-grave-");
  const grave = join(root, "grave");
  const entry = join(grave, "recent");
  mkdirSync(entry, { recursive: true });
  writeFileSync(join(entry, "data"), "fixture");
  const now = Temporal.Now.instant().epochMilliseconds;
  const rippedAt = now - ageMinutes * 60_000;
  const ripTime = Temporal.Instant.fromEpochMilliseconds(rippedAt);
  utimesSync(entry, rippedAt / 1000, rippedAt / 1000);
  writeFileSync(
    join(grave, ".record"),
    `${ripTime.toString()}\t/source\t${entry}\n`,
  );
  return {
    root,
    grave,
    entry,
    now,
    env: {
      HOME: join(root, "home"),
      GRAVEYARD: grave,
      USER: "fixture",
      XDG_DATA_HOME: join(root, "xdg"),
    },
    headroom: (state: "ok" | "warn" | "deny") => ({
      drives: [
        {
          label: "fixture",
          path: root,
          free: state === "deny" ? 1 : 100,
          total: 100,
          deny_line: 10,
          warn_line: null,
          stop_line: null,
          state,
        },
      ],
    }),
  };
}

test("recent graveyard entries use the injected deny state and pressure flag", () => {
  const aboveDeny = recentPurgeFixture(30);
  const above = purgeCandidates(aboveDeny.env, aboveDeny.root, {
    config: { graveyard_min_age_hours: 24, scratch_roots: [] },
    headroom: aboveDeny.headroom("ok"),
    now: aboveDeny.now,
  }).find((candidate) => candidate.path === aboveDeny.entry);
  expect(above?.verdict).toBe("KEEP");

  const belowDeny = recentPurgeFixture(30);
  const noFlag = purgeCandidates(belowDeny.env, belowDeny.root, {
    config: { graveyard_min_age_hours: 24, scratch_roots: [] },
    headroom: belowDeny.headroom("deny"),
    now: belowDeny.now,
  }).find((candidate) => candidate.path === belowDeny.entry);
  expect(noFlag?.verdict).toBe("KEEP");
  expect(noFlag?.reason).toBe(
    "recent; host is below the deny line: rerun with --under-pressure to purge",
  );

  const pressured = purgeCandidates(belowDeny.env, belowDeny.root, {
    config: { graveyard_min_age_hours: 24, scratch_roots: [] },
    headroom: belowDeny.headroom("deny"),
    underPressure: true,
    now: belowDeny.now,
  }).find((candidate) => candidate.path === belowDeny.entry);
  expect(pressured?.verdict).toBe("RECLAIM");
});

test("a graveyard entry with an open path stays kept under pressure", () => {
  const fixture = recentPurgeFixture(30);
  const base = liveFacts("3a2afd34-1111-4111-8111-111111111111");
  const liveness: LivenessSnapshot = {
    facts: () => base,
    openPaths: () => ({
      open: [{ pid: 123, via: "fd/1", path: join(fixture.entry, "data") }],
      unknown: [],
    }),
    refresh: () => liveness,
  };
  const candidate = purgeCandidates(fixture.env, fixture.root, {
    config: { graveyard_min_age_hours: 24, scratch_roots: [] },
    headroom: fixture.headroom("deny"),
    underPressure: true,
    liveness,
    now: fixture.now,
  }).find((item) => item.path === fixture.entry);
  expect(candidate?.verdict).toBe("KEEP");
  expect(candidate?.reason).toContain("locked or in use");
});

test("the configured pressure undo window keeps a newly ripped entry", () => {
  const fixture = recentPurgeFixture(5);
  const candidate = purgeCandidates(fixture.env, fixture.root, {
    config: {
      graveyard_min_age_hours: 24,
      graveyard_pressure_undo_minutes: 10,
      scratch_roots: [],
    },
    headroom: fixture.headroom("deny"),
    underPressure: true,
    now: fixture.now,
  }).find((item) => item.path === fixture.entry);
  expect(candidate?.verdict).toBe("KEEP");
  expect(candidate?.reason).toContain("undo window");
});

test("rip graveyard keeps a recent entry from a live Claude session", () => {
  const root = tempRoot("disk-reclaim-live-grave-");
  const grave = join(root, "grave");
  const uuid = "3a2afd34-1111-4111-8111-111111111111";
  const dest = join(
    grave,
    "tmp/claude-1002/project",
    uuid,
    "scratchpad/ident/ws",
  );
  mkdirSync(dest, { recursive: true });
  writeFileSync(join(dest, "source"), "recover me");
  const now = Temporal.Now.instant().epochMilliseconds;
  const rippedAt = now - 30 * 60_000;
  const ripTime = Temporal.Instant.fromEpochMilliseconds(rippedAt);
  writeFileSync(
    join(grave, ".record"),
    `Time\t Original\t Destination\n${ripTime.toString()}\t/tmp/claude-1002/project/${uuid}/scratchpad/ident/ws\t${dest}\n`,
  );
  utimesSync(join(grave, "tmp"), rippedAt / 1000, rippedAt / 1000);
  const liveness = livenessSnapshot(liveFacts(uuid));

  const candidates = purgeCandidates(
    { GRAVEYARD: grave, USER: "fixture", XDG_DATA_HOME: join(root, "xdg") },
    root,
    {
      config: {
        graveyard_min_age_hours: 24,
        scratch_roots: ["/tmp/claude-1002"],
      },
      liveness,
      headroom: {
        drives: [
          {
            label: "fixture",
            path: root,
            free: 1,
            total: 100,
            deny_line: 10,
            warn_line: null,
            stop_line: null,
            state: "deny",
          },
        ],
      },
      underPressure: true,
      now,
    },
  );
  const entry = candidates.find(
    (candidate) => candidate.path === join(grave, "tmp"),
  );
  expect(entry?.verdict).toBe("KEEP");
  expect(entry?.reason).toBe(`from live session ${uuid}`);
  expect(
    candidates.every((candidate) => !candidate.reason.startsWith("empty ")),
  ).toBe(true);
});

test("old rip graveyard entry from a dead session is reclaimable", () => {
  const root = tempRoot("disk-reclaim-old-grave-");
  const grave = join(root, "grave");
  const uuid = "3a2afd34-1111-4111-8111-111111111111";
  const entry = join(
    grave,
    "tmp/claude-1002/project",
    uuid,
    "scratchpad/ident/ws",
  );
  mkdirSync(entry, { recursive: true });
  writeFileSync(join(entry, "source"), "old");
  const old = Temporal.Now.instant().subtract({ hours: 48 });
  writeFileSync(
    join(grave, ".record"),
    `Time\t Original\t Destination\n${old.toString()}\t/tmp/claude-1002/project/${uuid}/scratchpad/ident/ws\t${entry}\n`,
  );
  utimesSync(entry, old.epochMilliseconds / 1000, old.epochMilliseconds / 1000);
  utimesSync(
    join(grave, "tmp"),
    old.epochMilliseconds / 1000,
    old.epochMilliseconds / 1000,
  );
  const liveness = livenessSnapshot({
    ...liveFacts(uuid),
    environSessionIds: { ok: true as const, value: [] },
    transcript: {
      ok: true as const,
      value: { exists: true as const, mtimeMs: 1 },
    },
    now: Temporal.Now.instant().epochMilliseconds,
  });
  const candidates = purgeCandidates(
    { GRAVEYARD: grave, USER: "fixture", XDG_DATA_HOME: join(root, "xdg") },
    root,
    {
      config: {
        graveyard_min_age_hours: 24,
        scratch_roots: ["/tmp/claude-1002"],
      },
      liveness,
    },
  );
  const candidate = candidates.find((item) => item.path === join(grave, "tmp"));
  expect(candidate?.verdict).toBe("RECLAIM");
});

test("graveyard record time is used and missing records fall back to mtime", () => {
  const root = tempRoot("disk-reclaim-record-grave-");
  const grave = join(root, "grave");
  const recorded = join(grave, "recorded");
  const fallback = join(grave, "fallback");
  mkdirSync(recorded, { recursive: true });
  mkdirSync(fallback);
  writeFileSync(join(recorded, "data"), "recorded");
  writeFileSync(join(fallback, "data"), "mtime");
  const old =
    Temporal.Now.instant().subtract({ hours: 48 }).epochMilliseconds / 1000;
  utimesSync(recorded, old, old);
  utimesSync(fallback, old, old);
  writeFileSync(
    join(grave, ".record"),
    `Time\t Original\t Destination\n${Temporal.Now.instant().toString()}\t/recorded\t${recorded}\n`,
  );
  const candidates = purgeCandidates(
    { GRAVEYARD: grave, USER: "fixture", XDG_DATA_HOME: join(root, "xdg") },
    root,
    { config: { graveyard_min_age_hours: 24, scratch_roots: [] } },
  );
  expect(candidates.find((item) => item.path === recorded)?.verdict).toBe(
    "KEEP",
  );
  expect(candidates.find((item) => item.path === fallback)?.verdict).toBe(
    "RECLAIM",
  );
});

test("graveyard candidates include rip and XDG trash content directories", () => {
  const paths = graveyardCandidates({ USER: "me" }, "/home/me").map(
    (g) => g.path,
  );
  expect(paths).toContain("/tmp/graveyard-me");
  expect(paths).toContain("/home/me/.local/share/Trash/files");
  expect(paths).toContain("/home/me/.local/share/Trash/info");
  expect(paths).not.toContain("/home/me/.local/share/Trash");
});

test("graveyard environment overrides select rip and XDG locations and labels", () => {
  const rows = graveyardCandidates(
    { USER: "me", GRAVEYARD: "/data/grave", XDG_DATA_HOME: "/data/share" },
    "/home/me",
  );
  const paths = rows.map((g) => g.path);
  expect(paths).toContain("/data/grave");
  expect(paths).not.toContain("/tmp/graveyard-me");
  expect(paths).toContain("/data/share/Trash/files");
  expect(paths).not.toContain("/home/me/.local/share/Trash/files");
  expect(rows.every((g) => g.label.length > 0)).toBe(true);
});

test("existing graveyards retain only present directories and allow no matches", () => {
  const candidates = graveyardCandidates({ USER: "me" }, "/home/me");
  const present = new Set(["/home/me/.local/share/Trash/files"]);
  expect(
    existingGraveyards(candidates, (path) => present.has(path)).map(
      (g) => g.path,
    ),
  ).toEqual([...present]);
  expect(existingGraveyards(candidates, () => false)).toEqual([]);
});

test("purge progress counts nested entries and symlinks without following links", () => {
  const root = tempRoot("disk-reclaim-count-");
  mkdirSync(join(root, "a", "b"), { recursive: true });
  writeFileSync(join(root, "a", "b", "f"), "x");
  symlinkSync("/", join(root, "loop"));
  expect(countEntries(root)).toBe(4);
  expect(countEntries(join(root, "missing"))).toBe(0);
});

test("purge progress counts one line per reported entry", () => {
  expect(newlines(new TextEncoder().encode("removed 'a'\nremoved 'b'\n"))).toBe(
    2,
  );
});

test("interactive purge refuses without a terminal before touching fixture graveyards", async () => {
  const root = tempRoot("disk-reclaim-purge-pipe-");
  const grave = join(root, "grave");
  mkdirSync(grave);
  writeFileSync(join(grave, "keep"), "fixture");
  const result = await reclaimMain(["run", "purge", "--interactive"], [purge]);
  expect(result).toBe(2);
  expect(existsSync(join(grave, "keep"))).toBe(true);
});

test("terminal yes empties fixture graveyards and the purge process exits", async () => {
  const result = await purgeTty("yes\r");
  expect(result.code).toBe(0);
  expect(result.out).toContain("rip graveyard: keep: 1 entries removed");
  expect(existsSync(join(result.root, "grave/keep"))).toBe(false);
  expect(existsSync(join(result.root, "grave"))).toBe(true);
}, 30_000);

test("terminal no, empty answer and Escape abort without removing fixture entries", async () => {
  for (const keys of ["no\r", "\r", "\u001B"]) {
    const result = await purgeTty(keys);
    expect([keys, result.code]).toEqual([keys, 1]);
    expect(existsSync(join(result.root, "grave/keep"))).toBe(true);
  }
}, 30_000);
