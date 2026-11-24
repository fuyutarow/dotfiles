import { afterEach, describe, expect, test } from "bun:test";
import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jsonOf, z } from "@dotfiles/shared/src/zod.ts";
import {
  alive,
  fileCache,
  listSockets,
  parseProbe,
  selectSocket,
  type Selection,
  type Deps,
  type Probed,
} from "#root/wsl-interop-session.ts";

const Stored = jsonOf(z.object({ socket: z.string() }));

/** A probe that never settles: the caller must cut it. */
function never<T>(): Promise<T> {
  return new Promise<T>(() => {
    // intentionally never resolved
  });
}

/** The socket a selection chose; a failed selection yields its reason instead. */
async function chosen(selection: Promise<Selection>): Promise<string> {
  const outcome = await selection;
  return outcome.ok ? outcome.socket : `FAILED: ${outcome.reason}`;
}

// A fake machine: sockets newest-first, each with its Windows session (or "dead" / "hang").
type Fake = { session: number | "dead" | "hang"; explorer?: number[] };
function machine(table: Record<string, Fake>, extra: Partial<Deps> = {}) {
  const probed: string[] = [];
  const probeBudgets: number[] = [];
  const consoleAsked: string[] = [];
  const written: string[] = [];
  let clock = 0;
  const deps: Deps = {
    sockets: () => Promise.resolve(Object.keys(table)),
    alive: (s) =>
      Promise.resolve(table[s] !== undefined && table[s].session !== "dead"),
    probe: (s, ms) => {
      probed.push(s);
      probeBudgets.push(ms);
      const entry = table[s];
      if (entry === undefined || entry.session === "dead") {
        return Promise.resolve(null);
      }
      if (entry.session === "hang") return never<Probed | null>();
      clock += 500;
      return Promise.resolve({
        session: entry.session,
        explorer: entry.explorer ?? [1],
      });
    },
    consoleSession: (s) => {
      consoleAsked.push(s);
      return Promise.resolve(2);
    },
    readCache: () => Promise.resolve(null),
    writeCache: (s) => {
      written.push(s);
      return Promise.resolve();
    },
    now: () => clock,
    probeMs: 50,
    budgetMs: 12_000,
    ...extra,
  };
  return { deps, probed, probeBudgets, consoleAsked, written };
}

describe("selectSocket", () => {
  test("session-0 sockets are skipped and the newest session-1 socket wins (newest-first order)", async () => {
    const m = machine({
      "/run/WSL/9_interop": { session: 0 },
      "/run/WSL/8_interop": { session: 0 },
      "/run/WSL/7_interop": { session: 1 },
      "/run/WSL/6_interop": { session: 1 },
    });
    expect(await chosen(selectSocket(m.deps))).toBe("/run/WSL/7_interop");
    expect(m.probed).toEqual([
      "/run/WSL/9_interop",
      "/run/WSL/8_interop",
      "/run/WSL/7_interop",
    ]);
    expect(m.written).toEqual(["/run/WSL/7_interop"]);
  });

  test("a dead inherited socket that is not even listed does not matter", async () => {
    // WSL_INTEROP=/run/WSL/554_interop is absent from the directory listing; selection never reads it.
    const m = machine({ "/run/WSL/2292346_interop": { session: 1 } });
    expect(await chosen(selectSocket(m.deps))).toBe("/run/WSL/2292346_interop");
  });

  test("dead sockets cost no probe", async () => {
    const m = machine({
      "/run/WSL/9_interop": { session: "dead" },
      "/run/WSL/8_interop": { session: 1 },
    });
    expect(await chosen(selectSocket(m.deps))).toBe("/run/WSL/8_interop");
    expect(m.probed).toEqual(["/run/WSL/8_interop"]);
  });

  test("only session-0 sockets live → failure naming the wanted session and each socket", async () => {
    const m = machine({
      "/run/WSL/9_interop": { session: 0 },
      "/run/WSL/8_interop": { session: 0 },
    });
    const error = { message: await chosen(selectSocket(m.deps)) };
    expect(error.message).toContain("desktop session 1");
    expect(error.message).toContain("/run/WSL/9_interop: session 0, want 1");
    expect(m.written).toEqual([]);
  });

  test("no explorer.exe → refuses instead of guessing", async () => {
    const m = machine({ "/run/WSL/9_interop": { session: 0, explorer: [] } });
    const error = { message: await chosen(selectSocket(m.deps)) };
    expect(error.message).toContain("explorer.exe is not running");
  });

  test("several explorer sessions → the active console session decides", async () => {
    const m = machine({
      "/run/WSL/9_interop": { session: 1, explorer: [1, 2] },
      "/run/WSL/8_interop": { session: 2, explorer: [1, 2] },
    });
    expect(await chosen(selectSocket(m.deps))).toBe("/run/WSL/8_interop");
    expect(m.consoleAsked).toEqual(["/run/WSL/9_interop"]);
  });

  test("a cached socket that still exists and answers is reused with no probe", async () => {
    const m = machine(
      {
        "/run/WSL/9_interop": { session: 0 },
        "/run/WSL/8_interop": { session: 1 },
      },
      { readCache: () => Promise.resolve("/run/WSL/8_interop") },
    );
    expect(await chosen(selectSocket(m.deps))).toBe("/run/WSL/8_interop");
    expect(m.probed).toEqual([]);
  });

  test("a cached socket that was deleted triggers a re-probe", async () => {
    const m = machine(
      {
        "/run/WSL/9_interop": { session: 0 },
        "/run/WSL/7_interop": { session: 1 },
      },
      { readCache: () => Promise.resolve("/run/WSL/8_interop") },
    );
    expect(await chosen(selectSocket(m.deps))).toBe("/run/WSL/7_interop");
    expect(m.probed).toEqual(["/run/WSL/9_interop", "/run/WSL/7_interop"]);
    expect(m.written).toEqual(["/run/WSL/7_interop"]);
  });

  test("a cached socket that exists but refuses connect triggers a re-probe", async () => {
    const m = machine(
      {
        "/run/WSL/9_interop": { session: "dead" },
        "/run/WSL/7_interop": { session: 1 },
      },
      { readCache: () => Promise.resolve("/run/WSL/9_interop") },
    );
    expect(await chosen(selectSocket(m.deps))).toBe("/run/WSL/7_interop");
  });

  test("a probe that never settles is cut at the per-probe bound and the next socket is tried", async () => {
    const m = machine({
      "/run/WSL/9_interop": { session: "hang" },
      "/run/WSL/8_interop": { session: 1 },
    });
    const started = performance.now();
    expect(await chosen(selectSocket(m.deps))).toBe("/run/WSL/8_interop");
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(Math.max(...m.probeBudgets)).toBeLessThanOrEqual(50);
  });

  test("the whole selection stops at the budget, and each probe gets only what is left", async () => {
    const m = machine(
      {
        "/run/WSL/9_interop": { session: 0 },
        "/run/WSL/8_interop": { session: 0 },
        "/run/WSL/7_interop": { session: 0 },
        "/run/WSL/6_interop": { session: 1 },
      },
      { budgetMs: 1_200, probeMs: 4_000 },
    );
    const error = { message: await chosen(selectSocket(m.deps)) };
    expect(error.message).toContain("budget 1200 ms spent");
    expect(m.probed).toEqual([
      "/run/WSL/9_interop",
      "/run/WSL/8_interop",
      "/run/WSL/7_interop",
    ]);
    expect(m.probeBudgets).toEqual([1_200, 700, 200]);
  });
});

describe("parseProbe", () => {
  test("reads own session and explorer sessions, CRLF included", () => {
    expect(parseProbe("1|1\r\n")).toEqual({ session: 1, explorer: [1] });
    expect(parseProbe("0|1,3")).toEqual({ session: 0, explorer: [1, 3] });
    expect(parseProbe("0|")).toEqual({ session: 0, explorer: [] });
  });
  test("rejects anything else", () => {
    expect(parseProbe("")).toBeNull();
    expect(parseProbe("Invalid argument")).toBeNull();
    expect(parseProbe("1|x")).toBeNull();
  });
});

describe("real sockets and cache file", () => {
  const dirs: string[] = [];
  const servers: Server[] = [];
  afterEach(async () => {
    for (const s of servers.splice(0)) s.close();
    for (const d of dirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });
  const listen = (path: string) =>
    new Promise<void>((resolve) => {
      const server = createServer((c) => {
        c.destroy();
      });
      servers.push(server);
      server.listen(path, () => {
        resolve();
      });
    });

  test("listSockets: sockets only, symlink aliases dropped, newest mtime first", async () => {
    const dir = await mkdtemp(join(tmpdir(), "interop-"));
    dirs.push(dir);
    await listen(join(dir, "1_interop"));
    await listen(join(dir, "2_interop"));
    await listen(join(dir, "3_interop"));
    await utimes(join(dir, "1_interop"), 300, 300);
    await utimes(join(dir, "2_interop"), 100, 100);
    await utimes(join(dir, "3_interop"), 200, 200);
    await symlink(join(dir, "2_interop"), join(dir, "9_interop"));
    await writeFile(join(dir, "7_interop"), "not a socket");
    await writeFile(join(dir, "note.txt"), "x");
    expect(await listSockets(dir)).toEqual([
      join(dir, "1_interop"),
      join(dir, "3_interop"),
      join(dir, "2_interop"),
    ]);
  });

  test("alive: a listening socket accepts, a regular file or missing path does not", async () => {
    const dir = await mkdtemp(join(tmpdir(), "interop-"));
    dirs.push(dir);
    await listen(join(dir, "1_interop"));
    await writeFile(join(dir, "2_interop"), "x");
    expect(await alive(join(dir, "1_interop"))).toBe(true);
    expect(await alive(join(dir, "2_interop"))).toBe(false);
    expect(await alive(join(dir, "missing_interop"))).toBe(false);
  });

  test("fileCache round-trips under the runtime dir, and is inert without one", async () => {
    const dir = await mkdtemp(join(tmpdir(), "interop-"));
    dirs.push(dir);
    const cache = fileCache(dir);
    expect(await cache.readCache()).toBeNull();
    await cache.writeCache("/run/WSL/5_interop");
    expect(await cache.readCache()).toBe("/run/WSL/5_interop");
    const stored = Stored.safeParse(
      await readFile(join(dir, "wsl-interop-session.json"), "utf8"),
    );
    expect(stored.success ? stored.data : null).toEqual({
      socket: "/run/WSL/5_interop",
    });
    await writeFile(join(dir, "wsl-interop-session.json"), "{broken");
    expect(await cache.readCache()).toBeNull();
    const inert = fileCache(undefined);
    await inert.writeCache("/x");
    expect(await inert.readCache()).toBeNull();
  });
});
