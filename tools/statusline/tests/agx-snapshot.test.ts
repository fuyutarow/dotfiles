import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { agxSnapshotPath } from "../src/agx-snapshot.ts";
import { isolatedStatuslineEnv } from "./helpers.ts";

const STATUSLINE = join(import.meta.dir, "..", "src", "statusline.ts");
const SESSION = "00000000-0000-0000-0000-000000000000";
const scratch = mkdtempSync(join(tmpdir(), "statusline-agx-snapshot-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const ANSI = new RegExp(String.fromCodePoint(27) + "\\[[0-9;]*m", "gu");

function fixture(name: string, agxBody: string) {
  const home = join(scratch, name);
  const bin = join(home, "bin");
  const state = join(home, "state");
  mkdirSync(bin, { recursive: true });
  mkdirSync(state, { recursive: true });
  const log = join(home, "agx.log");
  const agx = join(bin, "agx");
  writeFileSync(
    agx,
    "#!/bin/sh\nprintf 'agx' >> '" + log + "'\n" + agxBody + "\n",
  );
  chmodSync(agx, 0o755);
  const env = isolatedStatuslineEnv({
    HOME: home,
    PATH: bin,
    TZ: "UTC",
    AGX_STATE_DIR: state,
    AGX_DISPATCHER_SESSION: SESSION,
  });
  return { home, bin, state, log, agx, env };
}

const payload = JSON.stringify({
  session_id: SESSION,
  cwd: scratch,
  workspace: { current_dir: scratch },
  model: { id: "claude-opus-5-5", display_name: "Opus 5.5" },
});

async function render(env: NodeJS.ProcessEnv): Promise<string> {
  const child = Bun.spawn([process.execPath, STATUSLINE], {
    stdin: new Blob([payload]),
    stdout: "pipe",
    stderr: "pipe",
    env,
    timeout: 30_000,
  });
  const [out, stderr, exit] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(exit, stderr).toBe(0);
  return out.replaceAll(ANSI, "");
}

function writeGoodSnapshot(
  env: NodeJS.ProcessEnv,
  output: string,
  ageMs: number,
): string {
  const path = agxSnapshotPath(env);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({
      output,
      capturedAt: Temporal.Now.instant().epochMilliseconds - ageMs,
      exit: 0,
    }),
  );
  return path;
}

async function waitFor(
  check: () => boolean,
  timeoutMs: number,
): Promise<boolean> {
  const until = performance.now() + timeoutMs;
  while (performance.now() < until) {
    if (check()) return true;
    await Bun.sleep(40);
  }
  return check();
}

const run = JSON.stringify([
  {
    id: "run-id",
    ticket: "v4_learn",
    state: "running",
    row: "luna-high",
    dispatcher_session: SESSION,
    started_at: Temporal.Now.instant().subtract({ minutes: 18 }).toString(),
    pick_source: "fixture",
    cost_usd: 0.11,
    cwd: scratch,
    vendor_session: null,
    last_progress_path: null,
    continues: null,
  },
]);

describe("agx statusline snapshot", () => {
  test("a timed-out refresh keeps the last good rows and marks their age", async () => {
    const f = fixture("slow-after-good", "/bin/sleep 3\nprintf '[]\\n'");
    const snapshotPath = writeGoodSnapshot(f.env, run, 45_000);
    const before = readFileSync(snapshotPath, "utf8");

    const started = performance.now();
    const output = await render(f.env);
    const renderMs = performance.now() - started;
    expect(renderMs).toBeLessThan(1_500);
    expect(output).toContain("luna-high");
    expect(output).toContain("v4_learn");
    expect(output).toMatch(/agx (4[5-9]|5[0-9])s old/u);
    expect(output).not.toContain("agx n/a");

    const lock = snapshotPath + ".lock";
    expect(await waitFor(() => !existsSync(lock), 5_000)).toBe(true);
    expect(readFileSync(snapshotPath, "utf8")).toBe(before);
    expect(readFileSync(f.log, "utf8")).toBe("agx");
  });

  test("a missing snapshot renders n/a and concurrent renders launch one refresh", async () => {
    const f = fixture("concurrent-first-read", "/bin/sleep 1\nprintf '[]\\n'");
    const [first, second, third] = await Promise.all([
      render(f.env),
      render(f.env),
      render(f.env),
    ]);
    expect(first).toContain("agx n/a (snapshot unavailable)");
    expect(second).toContain("agx n/a (snapshot unavailable)");
    expect(third).toContain("agx n/a (snapshot unavailable)");

    const snapshotPath = agxSnapshotPath(f.env);
    expect(
      await waitFor(
        () => existsSync(f.log) && !existsSync(snapshotPath + ".lock"),
        5_000,
      ),
    ).toBe(true);
    expect(readFileSync(f.log, "utf8")).toBe("agx");

    const after = await render(f.env);
    expect(after).not.toContain("agx n/a");
  });
});
