import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The statusline `Run:` row: agent-router's running workers, read from its markers
// (agents/routing-control/state.ts). One line per live worker (row, elapsed time, label), the
// longest-running first; a marker whose process is gone is counted as stale, never hidden; more
// than RUN_LINES workers say `+N more`; no state dir at all means no row.

const STATUSLINE = join(import.meta.dir, "..", "..", "statusline-command.ts");
const scratch = mkdtempSync(join(tmpdir(), "statusline-run-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const ANSI = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu");
const PAYLOAD = JSON.stringify({
  session_id: "00000000-0000-0000-0000-000000000000",
  cwd: scratch,
  workspace: { current_dir: scratch },
  model: { id: "claude-opus-5-5", display_name: "Opus 5.5" },
});

function marker(
  dir: string,
  name: string,
  pid: number,
  label: string,
  ageS = 90,
): void {
  mkdirSync(join(dir, "active"), { recursive: true });
  writeFileSync(
    join(dir, "active", `${name}.json`),
    JSON.stringify({
      schema: 1,
      run_id: name,
      pid,
      label,
      choice: "luna-high",
      pick_source: "jev",
      started_at: Temporal.Now.instant().subtract({ seconds: ageS }).toString(),
      cwd: scratch,
    }),
  );
}

const progress = (last: string, ageS: number): string =>
  JSON.stringify({
    schema: 1,
    at: Temporal.Now.instant().subtract({ seconds: ageS }).toString(),
    last,
    commands: 12,
    files: 3,
  });

async function render(stateDir: string): Promise<string> {
  const p = Bun.spawn([process.execPath, STATUSLINE], {
    stdin: new Blob([PAYLOAD]),
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, AGENT_ROUTER_STATE_DIR: stateDir },
    timeout: 30_000,
  });
  const out = await new Response(p.stdout).text();
  await p.exited;
  return out.replace(ANSI, "");
}

describe("statusline Run row", () => {
  test("a live worker shows its row, elapsed time and label", async () => {
    const dir = join(scratch, "live");
    marker(dir, "a", process.pid, "lint batch 7");
    const out = await render(dir);
    expect(out).toMatch(
      /^Run: luna-high 1m3\d+s lint batch 7 │ no event yet$/mu,
    );
  });

  test("several workers: one line each, longest-running first, aligned under Run:", async () => {
    const dir = join(scratch, "several");
    marker(dir, "short", process.pid, "short one", 30);
    marker(dir, "long", process.pid, "long one", 600);
    const lines = (await render(dir)).split("\n");
    const at = lines.findIndex((l) => l.startsWith("Run: "));
    expect(lines[at]).toMatch(
      /^Run: luna-high 10m0\ds long one │ no event yet$/u,
    );
    expect(lines[at + 1]).toMatch(
      /^ {5}luna-high 0m3\ds short one │ no event yet$/u,
    );
  });

  test("a worker with a progress file shows its latest event and its counts", async () => {
    const dir = join(scratch, "progress");
    marker(dir, "p", process.pid, "nothrow-0");
    writeFileSync(
      join(dir, "active", "p.progress.json"),
      progress("$ bun test kernel.test.ts", 2),
    );
    expect(await render(dir)).toMatch(
      /^Run: luna-high 1m3\d+s nothrow-0 │ \$ bun test kernel\.test\.ts · 12 cmd · 3 files$/mu,
    );
    // a quiet worker (reasoning) is shown with the age of its last event, not as if it were live
    writeFileSync(
      join(dir, "active", "p.progress.json"),
      progress("✎ kernel.ts", 125),
    );
    expect(await render(dir)).toMatch(
      /│ ✎ kernel\.ts \(2m0\ds ago\) · 12 cmd · 3 files$/mu,
    );
    // the progress file is never mistaken for a second worker
    expect(
      (await render(dir)).split("\n").filter((l) => l.includes("luna-high"))
        .length,
    ).toBe(1);
  });

  test("more workers than the cap: the rest are counted, not dropped silently", async () => {
    const dir = join(scratch, "many");
    for (let i = 0; i < 8; i++)
      marker(dir, `w${i}`, process.pid, `worker ${i}`, 60 + i);
    const out = await render(dir);
    expect(out.split("\n").filter((l) => l.includes("luna-high")).length).toBe(
      6,
    );
    expect(out).toContain("+2 more");
  });

  test("a marker whose process is gone is counted as stale, not hidden", async () => {
    const dir = join(scratch, "stale");
    marker(dir, "b", 2_147_483_000, "killed");
    const out = await render(dir);
    expect(out).toContain("Run: stale×1");
    expect(out).not.toContain("killed");
  });

  test("no agent-router state on this machine: no Run row at all", async () => {
    const out = await render(join(scratch, "never"));
    expect(out).not.toContain("Run:");
  });
});
