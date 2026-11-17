// bun test for src/desktop-interop.ts and its use by smart-open's this-machine opener.
// Proposition: on WSL the opener child starts through the socket scripts/wsl-interop-session.ts
// chose — never the inherited WSL_INTEROP when a desktop-session socket is live — and when none
// qualifies the child keeps the inherited value and stderr says so once.
// A fake helper stands in for the Windows side; the opener records the WSL_INTEROP it was given.
import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { desktopInterop, helperCommand } from "../src/desktop-interop.ts";

const SMART_OPEN = join(import.meta.dir, "..", "src", "smart-open.ts");
const INHERITED = "/run/WSL/dead_interop";
const DESKTOP = "/run/WSL/desktop_interop";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const c of cleanups.splice(0)) await c();
});

async function scratch(): Promise<string> {
  // tmp-ok: removed by afterEach.
  const dir = await mkdtemp("/tmp/di-");
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function script(path: string, body: string): Promise<string> {
  await writeFile(path, `#!/bin/sh\n${body}\n`);
  await chmod(path, 0o755);
  return path;
}

describe("desktopInterop", () => {
  test("a helper that prints a socket and exits 0 yields it", async () => {
    const dir = await scratch();
    const helper = await script(join(dir, "ok.sh"), `echo ${DESKTOP}`);
    expect(await desktopInterop([helper])).toEqual({
      ok: true,
      socket: DESKTOP,
    });
  });

  test("a failing helper yields its stderr line without the program prefix", async () => {
    const dir = await scratch();
    const helper = await script(
      join(dir, "fail.sh"),
      "echo 'wsl-interop-session: no live socket' >&2; exit 1",
    );
    expect(await desktopInterop([helper])).toEqual({
      ok: false,
      reason: "no live socket",
    });
  });

  test("exit 0 with no output is a failure, not an empty socket", async () => {
    const dir = await scratch();
    const helper = await script(join(dir, "empty.sh"), "exit 0");
    const r = await desktopInterop([helper]);
    expect(r.ok).toBe(false);
  });

  test("a helper that cannot be spawned is a failure value", async () => {
    const r = await desktopInterop(["/nonexistent/helper"]);
    expect(r.ok).toBe(false);
  });

  test("a helper that outlives the bound is stopped and reported", async () => {
    const dir = await scratch();
    const helper = await script(join(dir, "slow.sh"), "exec sleep 30");
    const r = await desktopInterop([helper], 200);
    expect(r.ok).toBe(false);
  });

  test("helperCommand: the override wins, the default is the repo's scripts/wsl-interop-session.ts", () => {
    expect(helperCommand({ SMART_OPEN_INTEROP_HELPER: "a b" })).toEqual([
      "a",
      "b",
    ]);
    const dflt = helperCommand({});
    expect(dflt[1]?.endsWith("/scripts/wsl-interop-session.ts")).toBe(true);
    expect(helperCommand({ SMART_OPEN_INTEROP_HELPER: "" })).toEqual(dflt);
  });
});

// smart-open run as WSL (WSL_DISTRO_NAME set), with no forward bound, so the target lands here.
async function open(
  dir: string,
  helperBody: string,
): Promise<{ code: number; err: string; seen: string }> {
  const helper = await script(join(dir, "helper.sh"), helperBody);
  const log = join(dir, "seen.log");
  const opener = await script(
    join(dir, "opener.sh"),
    `echo "$WSL_INTEROP" > "${log}"`,
  );
  const merged = Object.fromEntries(
    Object.entries({
      ...process.env,
      SSH_CONNECTION: undefined,
      SMART_OPEN_SOCKET: join(dir, "no-forward.sock"),
      SMART_OPEN_SAY_AFTER_MS: "60000",
      WSL_DISTRO_NAME: "fixture",
      WSL_INTEROP: INHERITED,
      SMART_OPEN_INTEROP_HELPER: helper,
      SMART_OPEN_LOCAL_OPENER: opener,
    }).flatMap(([k, v]): [string, string][] =>
      v === undefined ? [] : [[k, v]],
    ),
  );
  const p = Bun.spawn(["bun", SMART_OPEN, "https://probe.invalid/x"], {
    env: merged,
    stdout: "pipe",
    stderr: "pipe",
    signal: AbortSignal.timeout(20_000),
    killSignal: "SIGKILL",
  });
  const [code, err] = await Promise.all([
    p.exited,
    new Response(p.stderr).text(),
  ]);
  const seen = (await Bun.file(log).exists())
    ? (await readFile(log, "utf8")).trim()
    : "";
  return { code, err, seen };
}

describe.skipIf(process.platform !== "linux")("smart-open on WSL", () => {
  test("a qualifying socket replaces the inherited WSL_INTEROP for the opener only", async () => {
    const dir = await scratch();
    const r = await open(dir, `echo ${DESKTOP}`);
    expect(r.code).toBe(0);
    expect(r.seen).toBe(DESKTOP);
    expect(r.err).not.toContain("interop");
  });

  test("no qualifying socket keeps the inherited WSL_INTEROP and says so once on stderr", async () => {
    const dir = await scratch();
    const r = await open(
      dir,
      "echo 'wsl-interop-session: no live socket runs in session 1' >&2; exit 1",
    );
    expect(r.code).toBe(0);
    expect(r.seen).toBe(INHERITED);
    const lines = r.err.split("\n").filter((l) => l.includes("interop socket"));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("no live socket runs in session 1");
    expect(lines[0]).toContain("inherited WSL_INTEROP");
  });
});
