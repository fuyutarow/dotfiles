import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The statusline Run rows (no "Run:" head; each line starts with its row id): agent-dispatch's running workers, read from its markers
// (tools/agent-dispatch/src/state.ts). One line per live worker (row, elapsed time, label), the
// longest-running first; a marker whose process is gone is counted as stale, never hidden; more
// than RUN_LINES workers say `+N more`; no state dir at all means no row.

const STATUSLINE = join(import.meta.dir, "..", "..", "statusline-command.ts");
const scratch = mkdtempSync(join(tmpdir(), "statusline-run-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const SESSION = "00000000-0000-0000-0000-000000000000";
const ANSI = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "gu");
const PAYLOAD = JSON.stringify({
  session_id: SESSION,
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
  dispatcherSession: string | null = SESSION,
  choice = "luna-high",
  pickSource = "jev",
): void {
  mkdirSync(join(dir, "active"), { recursive: true });
  writeFileSync(
    join(dir, "active", `${name}.json`),
    JSON.stringify({
      schema: 1,
      run_id: name,
      pid,
      label,
      choice,
      pick_source: pickSource,
      started_at: Temporal.Now.instant().subtract({ seconds: ageS }).toString(),
      cwd: scratch,
      ...(dispatcherSession === null
        ? {}
        : { dispatcher_session: dispatcherSession }),
    }),
  );
}

const progress = (last: string, ageS: number, session?: string): string =>
  JSON.stringify({
    schema: 1,
    at: Temporal.Now.instant().subtract({ seconds: ageS }).toString(),
    last,
    commands: 12,
    files: 3,
    ...(session === undefined ? {} : { session }),
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
    expect(out).toMatch(/^luna-high 1m3\d+s lint batch 7 │ no event yet$/mu);
  });

  test("a worker from this session shows its full row", async () => {
    const dir = join(scratch, "own-session");
    marker(dir, "own", process.pid, "my worker", 90, SESSION);
    expect(await render(dir)).toMatch(
      /^luna-high 1m3\d+s my worker │ no event yet$/mu,
    );
  });

  test("a worker from another session is represented only by the count", async () => {
    const dir = join(scratch, "other-session");
    marker(dir, "other", process.pid, "private worker", 90, "other-session-id");
    const out = await render(dir);
    expect(out).toContain("+1 in other sessions");
    expect(out).not.toContain("private worker");
    expect(out).not.toContain("luna-high");
  });

  test("a live worker without a dispatcher is counted as other", async () => {
    const dir = join(scratch, "no-dispatcher");
    marker(dir, "unowned", process.pid, "undispatched worker", 90, null);
    const out = await render(dir);
    expect(out).toContain("+1 in other sessions");
    expect(out).not.toContain("undispatched worker");
  });

  test("mixed sessions show this session's rows and count all other live workers", async () => {
    const dir = join(scratch, "mixed-sessions");
    marker(dir, "own", process.pid, "my worker", 90, SESSION);
    marker(dir, "other", process.pid, "other worker", 80, "other-session-id");
    marker(dir, "none", process.pid, "unowned worker", 70, null);
    const out = await render(dir);
    expect(out).toMatch(/^luna-high 1m3\d+s my worker │ no event yet$/mu);
    expect(out).toContain("+2 in other sessions");
    expect(out).not.toContain("other worker");
    expect(out).not.toContain("unowned worker");
  });

  test("several workers: one line each, longest-running first", async () => {
    const dir = join(scratch, "several");
    marker(dir, "short", process.pid, "short one", 30);
    marker(dir, "long", process.pid, "long one", 600);
    const lines = (await render(dir)).split("\n");
    const at = lines.findIndex((l) => l.startsWith("luna-high "));
    expect(lines[at]).toMatch(/^luna-high 10m0\ds long one +│ no event yet$/u);
    expect(lines[at + 1]).toMatch(
      /^luna-high +0m3\ds short one │ no event yet$/u,
    );
  });

  test("rows align names, elapsed, ids and labels using terminal columns", async () => {
    const dir = join(scratch, "aligned");
    marker(
      dir,
      "luna",
      process.pid,
      "link-dots reloads a launchd agent",
      14,
      SESSION,
      "luna-high",
    );
    marker(
      dir,
      "sonnet",
      process.pid,
      "tools/ migration: move rr",
      723,
      SESSION,
      "sonnet-high",
    );
    marker(
      dir,
      "japanese",
      process.pid,
      "日本語のラベル",
      3720,
      SESSION,
      "fable-xhigh",
    );
    for (const [name, session] of [
      ["luna", "01a113e0-1111-1111-1111-111111111111"],
      ["sonnet", "20e32723-2222-2222-2222-222222222222"],
      ["japanese", "30e32723-3333-3333-3333-333333333333"],
    ])
      writeFileSync(
        join(dir, "active", `${name}.progress.json`),
        progress("$ cmd", 2, session),
      );
    const lines = (await render(dir))
      .split("\n")
      .filter((line) => /^(luna|sonnet|fable)-/u.test(line));
    expect(lines).toHaveLength(3);
    const widths = lines.map((line) =>
      Bun.stringWidth(line.slice(0, line.indexOf("│"))),
    );
    expect(new Set(widths).size).toBe(1);
    const idStarts = ["01a1..", "20e3..", "30e3.."].map((id) =>
      lines.find((line) => line.includes(id))?.indexOf(id),
    );
    expect(new Set(idStarts).size).toBe(1);
    expect(lines.some((line) => line.includes("luna-high"))).toBe(true);
    expect(lines.some((line) => line.includes("sonnet-high"))).toBe(true);
    expect(lines.some((line) => line.includes("日本語のラベル"))).toBe(true);
  });

  test("a worker with a progress file shows its latest event and its counts", async () => {
    const dir = join(scratch, "progress");
    marker(dir, "p", process.pid, "nothrow-0");
    writeFileSync(
      join(dir, "active", "p.progress.json"),
      progress("$ bun test kernel.test.ts", 2),
    );
    expect(await render(dir)).toMatch(
      /^luna-high 1m3\d+s nothrow-0 │ \$ bun test kernel\.test\.ts · 12 cmd · 3 files$/mu,
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

  // I3 (owner 2026-10-06): a coordinator names a worker by the id its vendor gave it (codex thread,
  // claude session); the row shows its first 8 characters once the worker has printed it.
  test("a worker's vendor session id is shown, short, after its elapsed time", async () => {
    const dir = join(scratch, "session");
    marker(dir, "s", process.pid, "nothrow-1");
    writeFileSync(
      join(dir, "active", "s.progress.json"),
      progress("$ ls", 2, "01a1111b-7dab-7d61-8f9b-231c4cc9568a"),
    );
    expect(await render(dir)).toMatch(
      /^luna-high 1m3\d+s 01a1\.\.568a nothrow-1 │ \$ ls · 12 cmd · 3 files$/mu,
    );
  });

  test("UUIDv7 ids sharing their timestamp prefix still render distinctly", async () => {
    const dir = join(scratch, "uuidv7-prefix-collision");
    marker(dir, "a", process.pid, "first", 30, SESSION, "luna-high");
    marker(dir, "b", process.pid, "second", 20, SESSION, "sonnet-high");
    writeFileSync(
      join(dir, "active", "a.progress.json"),
      progress("$ ls", 2, "0191abcd-0000-7000-8000-11111111abcd"),
    );
    writeFileSync(
      join(dir, "active", "b.progress.json"),
      progress("$ ls", 2, "0191abcd-0000-7000-8000-22222222bcde"),
    );
    const out = await render(dir);
    expect(out).toContain("0191..abcd");
    expect(out).toContain("0191..bcde");
  });

  test("ids sharing their last four digits grow the tail until distinct", async () => {
    const dir = join(scratch, "uuid-tail-collision");
    marker(dir, "a", process.pid, "first", 30, SESSION, "luna-high");
    marker(dir, "b", process.pid, "second", 20, SESSION, "sonnet-high");
    writeFileSync(
      join(dir, "active", "a.progress.json"),
      progress("$ ls", 2, "01234567-0000-7000-8000-11111111abcd"),
    );
    writeFileSync(
      join(dir, "active", "b.progress.json"),
      progress("$ ls", 2, "01239999-0000-7000-8000-22222222abcd"),
    );
    const out = await render(dir);
    expect(out).toContain("0123..1abcd");
    expect(out).toContain("0123..2abcd");
  });

  test("resume workers mark their reused session id", async () => {
    const dir = join(scratch, "resume-session");
    marker(
      dir,
      "resume",
      process.pid,
      "resumed",
      30,
      SESSION,
      "luna-high",
      "resume",
    );
    writeFileSync(
      join(dir, "active", "resume.progress.json"),
      progress("$ ls", 2, "0191abcd-0000-7000-8000-11111111abcd"),
    );
    expect(await render(dir)).toContain("↻0191..abcd");
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
    expect(out).toMatch(/^stale×1$/mu);
    expect(out).not.toMatch(/^luna-high .* killed/mu);
  });

  test("no agent-dispatch state on this machine: no Run row at all", async () => {
    const out = await render(join(scratch, "never"));
    expect(out).not.toContain("stale×");
    expect(out).not.toContain(" │ ");
  });
});
