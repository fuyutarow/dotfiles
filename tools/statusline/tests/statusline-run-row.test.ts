import { afterAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync as writeFile,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The statusline Run rows (no "Run:" head; each line starts with its row id): agent-dispatch's running workers, read from its markers
// (tools/agent-dispatch/src/state.ts). One line per live worker (row, elapsed time, label), the
// longest-running first; a marker whose process is gone is counted as stale, never hidden; more
// than RUN_LINES workers say `+N more`; no state dir at all means no row.

const STATUSLINE = join(import.meta.dir, "..", "src", "statusline.ts");
const scratch = mkdtempSync(join(tmpdir(), "statusline-run-"));
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});
const bin = join(scratch, "bin");
mkdirSync(bin);
for (const [name, body] of Object.entries({
  claude: "echo '[]'",
  ps: "exit 0",
  git: "echo 'fatal: not a git repository' >&2; exit 128",
})) {
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
}
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
  displayId?: string,
): void {
  mkdirSync(join(dir, "active"), { recursive: true });
  writeFileSync(
    join(dir, "active", `${name}.json`),
    JSON.stringify({
      schema: 1,
      run_id: name,
      ...(displayId === undefined ? {} : { display_id: displayId }),
      pid,
      label,
      choice,
      pick_source: pickSource,
      started_at: Temporal.Now.instant().subtract({ seconds: ageS }).toString(),
      cwd: scratch,
      ...(dispatcherSession === null
        ? {}
        : { dispatcher_session: dispatcherSession }),
      ticket: { writes: ["tools/statusline/**"] },
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

const tokenLine = (
  input: number,
  cached: number,
  output: number,
  reasoning: number,
): string =>
  JSON.stringify({
    type: "event_msg",
    payload: {
      type: "token_count",
      info: {
        total_token_usage: {
          input_tokens: input,
          cached_input_tokens: cached,
          output_tokens: output,
          reasoning_output_tokens: reasoning,
          total_tokens: input + output + reasoning,
        },
      },
    },
  });

async function render(stateDir: string): Promise<string> {
  const p = Bun.spawn([process.execPath, STATUSLINE], {
    stdin: new Blob([PAYLOAD]),
    stdout: "pipe",
    stderr: "pipe",
    env: {
      HOME: scratch,
      PATH: bin,
      TZ: "UTC",
      AGENT_ROUTER_STATE_DIR: stateDir,
    },
    timeout: 30_000,
  });
  const out = await new Response(p.stdout).text();
  const stderr = await new Response(p.stderr).text();
  const exitCode = await p.exited;
  expect(exitCode, stderr).toBe(0);
  return out.replace(ANSI, "");
}

describe("statusline Run row", () => {
  test("a live worker shows its row, elapsed time and label", async () => {
    const dir = join(scratch, "live");
    marker(dir, "a", process.pid, "lint batch 7");
    const out = await render(dir);
    expect(out).toMatch(
      /^luna-high 1m3\d+s \$– lint batch 7 │ no event yet$/mu,
    );
  });

  test("a worker from this session shows its full row", async () => {
    const dir = join(scratch, "own-session");
    marker(dir, "own", process.pid, "my worker", 90, SESSION);
    expect(await render(dir)).toMatch(
      /^luna-high 1m3\d+s \$– my worker │ no event yet$/mu,
    );
  });

  test.each([
    [0, "$0"],
    [0.004, "<$0.01"],
    [0.0123, "$0.0123"],
    [0.0312, "$0.0312"],
    [0.0999, "$0.0999"],
    [0.1, "$0.100"],
    [0.31, "$0.310"],
    [1.234, "$1.23"],
    [12.34, "$12.3"],
    [123.4, "$123"],
    [1234, "$1.23k"],
    [12345, "$12.3k"],
    [123456, "$123k"],
    [1234567, "$1.23M"],
  ])("formats reported cost %s as %s", async (costUsd, expected) => {
    const dir = join(scratch, `cost-column-${costUsd}`);
    marker(dir, "priced", process.pid, "priced worker");
    writeFileSync(
      join(dir, "active", "priced.progress.json"),
      JSON.stringify({
        schema: 1,
        at: Temporal.Now.instant().toString(),
        last: "$ bun test",
        commands: 1,
        files: 0,
        usage: { input_tokens: 1_000_000, output_tokens: 100_000 },
        cost_usd: costUsd,
      }),
    );
    const line = (await render(dir))
      .split("\n")
      .find((value) => value.startsWith("luna-high "));
    expect(line).toContain(` ${expected} priced worker │`);
  });

  test("marks the cost unknown when usage is unknown", async () => {
    const unknown = join(scratch, "unknown-cost-column");
    marker(unknown, "unknown", process.pid, "unknown worker");
    writeFileSync(
      join(unknown, "active", "unknown.progress.json"),
      progress("$ bun test", 1),
    );
    const out = await render(unknown);
    expect(out).toMatch(/^luna-high 1m3\ds \$– unknown worker │/mu);
  });

  test("prices the latest live rollout token total for a Codex row", async () => {
    const dir = join(scratch, "rollout-cost");
    const session = "livecost-unique-session-20261009";
    marker(dir, "rollout", process.pid, "live codex", 10, SESSION, "luna-high");
    writeFileSync(
      join(dir, "active", "rollout.progress.json"),
      progress("$ bun test", 1, session),
    );
    const day = Temporal.Now.plainDateISO();
    const rolloutDir = join(
      scratch,
      ".codex",
      "sessions",
      String(day.year),
      String(day.month).padStart(2, "0"),
      String(day.day).padStart(2, "0"),
    );
    mkdirSync(rolloutDir, { recursive: true });
    writeFile(
      join(rolloutDir, `rollout-2026-10-09T00-00-00-${session}.jsonl`),
      [
        tokenLine(100_000, 40_000, 7_000, 3_000),
        tokenLine(500_000, 200_000, 30_000, 10_000),
        tokenLine(1_000_000, 400_000, 100_000, 50_000),
      ].join("\n") + "\n",
    );
    const line = (await render(dir))
      .split("\n")
      .find((value) => value.startsWith("luna-high "));
    expect(line).toContain("$0.139");
    expect(line).toContain("live codex");
  });

  test("does not invent a cost when the session rollout is absent", async () => {
    const dir = join(scratch, "no-rollout-cost");
    marker(dir, "norollout", process.pid, "missing rollout");
    writeFileSync(
      join(dir, "active", "norollout.progress.json"),
      progress("$ bun test", 1, "session-with-no-rollout"),
    );
    const line = (await render(dir))
      .split("\n")
      .find((value) => value.startsWith("luna-high "));
    expect(line).toContain("missing rollout");
    expect(line).not.toMatch(/\$\d/u);
  });

  test("a display ID replaces the session ID while legacy markers keep their session ID", async () => {
    const dir = join(scratch, "display-id-row");
    marker(
      dir,
      "named",
      process.pid,
      "Repo: dotfiles",
      90,
      SESSION,
      "luna-high",
      "jev",
      "agt_lfix",
    );
    writeFileSync(
      join(dir, "active", "named.progress.json"),
      progress("$ bun test", 2, "0191abcd-0000-7000-8000-11111111abcd"),
    );
    const out = await render(dir);
    expect(out).toMatch(
      /^luna-high 1m3\ds \$– agt_lfix Repo: dotfiles │ \$ bun test/mu,
    );

    const legacyDir = join(scratch, "legacy-session-row");
    marker(legacyDir, "legacy", process.pid, "legacy row");
    writeFileSync(
      join(legacyDir, "active", "legacy.progress.json"),
      progress("$ ls", 2, "0191abcd-0000-7000-8000-11111111abcd"),
    );
    expect(await render(legacyDir)).toContain("0191..abcd legacy row");
  });

  test("a resumed ticketed worker from this session shows its full row", async () => {
    const dir = join(scratch, "resumed-own-session");
    marker(
      dir,
      "resumed",
      process.pid,
      "resume: J1 gated commit",
      90,
      SESSION,
      "sol-max",
      "resume",
    );
    const out = await render(dir);
    expect(out).toMatch(
      /^sol-max 1m3\d+s \$– resume: J1 gated commit │ no event yet$/mu,
    );
    expect(out).not.toContain("in other sessions");
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
    expect(out).toMatch(/^luna-high 1m3\d+s \$– my worker │ no event yet$/mu);
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
    expect(lines[at]).toMatch(
      /^luna-high 10m0\ds \$– long one +│ no event yet$/u,
    );
    expect(lines[at + 1]).toMatch(
      /^luna-high +0m3\ds \$– short one │ no event yet$/u,
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
    const idStarts = ["01a1..1111", "20e3..2222", "30e3..3333"].map((id) =>
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
      /^luna-high 1m3\d+s \$– nothrow-0 │ \$ bun test kernel\.test\.ts · 12 cmd · 3 files$/mu,
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

  test("a worker's vendor session id is shown as head and tail", async () => {
    const dir = join(scratch, "session");
    marker(dir, "s", process.pid, "nothrow-1");
    writeFileSync(
      join(dir, "active", "s.progress.json"),
      progress("$ ls", 2, "01a1111b-7dab-7d61-8f9b-231c4cc9568a"),
    );
    expect(await render(dir)).toMatch(
      /^luna-high 1m3\d+s \$– 01a1\.\.568a nothrow-1 │ \$ ls · 12 cmd · 3 files$/mu,
    );
  });

  test("six ids sharing a UUIDv7 prefix stay distinguishable", async () => {
    const dir = join(scratch, "six-colliding-prefixes");
    const ids = Array.from(
      { length: 6 },
      (_, i) => `01a11a74-0000-7000-8000-00000000000${i + 1}`,
    );
    ids.forEach((id, i) => {
      const name = `w${i}`;
      marker(
        dir,
        name,
        process.pid,
        `worker ${i}`,
        60 + i,
        SESSION,
        `choice-${i}`,
      );
      writeFileSync(
        join(dir, "active", `${name}.progress.json`),
        progress("$ cmd", 2, id),
      );
    });
    const lines = (await render(dir)).split("\n");
    const rendered = ids.map((id) => {
      const short = `01a1..${id.slice(-4)}`;
      expect(lines.some((line) => line.includes(short))).toBe(true);
      return short;
    });
    expect(new Set(rendered).size).toBe(6);
  });

  test("colliding tails grow together until the ids differ", async () => {
    const dir = join(scratch, "growing-tails");
    const ids = [
      "01a11a74-0000-7000-8000-00000001abc0",
      "01a11a74-0000-7000-8000-00000002abc0",
    ];
    ids.forEach((id, i) => {
      const name = `tail${i}`;
      marker(dir, name, process.pid, `tail ${i}`, 60 + i, SESSION, `tail-${i}`);
      writeFileSync(
        join(dir, "active", `${name}.progress.json`),
        progress("$ cmd", 2, id),
      );
    });
    const out = await render(dir);
    expect(out).toContain("01a1..1abc0");
    expect(out).toContain("01a1..2abc0");
  });

  test("resume label identifies a resumed worker", async () => {
    const dir = join(scratch, "resume");
    marker(
      dir,
      "resume",
      process.pid,
      "resume: continued worker",
      90,
      SESSION,
      "luna-high",
      "resume",
    );
    writeFileSync(
      join(dir, "active", "resume.progress.json"),
      progress("$ ls", 2, "01a11a74-cd83-7de1-b627-16537d8de67d"),
    );
    expect(await render(dir)).toMatch(
      /^luna-high 1m3\d+s \$– 01a1\.\.e67d resume: continued worker │ \$ ls · 12 cmd · 3 files$/mu,
    );
  });

  // Ported from the pre-port suite (agents/claude/hooks/tests/statusline-run-row.test.ts, cbc82bdc).
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

  test("resume workers show their reused session id without a duplicate marker", async () => {
    const dir = join(scratch, "resume-session");
    marker(
      dir,
      "resume",
      process.pid,
      "resume: resumed",
      30,
      SESSION,
      "luna-high",
      "resume",
    );
    writeFileSync(
      join(dir, "active", "resume.progress.json"),
      progress("$ ls", 2, "0191abcd-0000-7000-8000-11111111abcd"),
    );
    const out = await render(dir);
    expect(out).toContain("0191..abcd resume: resumed");
    expect(out).not.toContain("↻");
    expect(out.match(/resume:/gu)).toHaveLength(1);
  });

  test("fresh and prefix-colliding resumed rows retain ids and align", async () => {
    const dir = join(scratch, "aligned-resumes");
    const rows = [
      {
        name: "fresh",
        choice: "sonnet-high",
        label: "Scope: put nncp v3.3 on firedancer",
        pickSource: "jev",
        session: "8066abcd-0000-7000-8000-11111111e1b6",
        age: 619,
      },
      {
        name: "resume-a",
        choice: "sol-max",
        label: "resume: Scope: one new FireOps method",
        pickSource: "explicit",
        session: "01a113e0-1111-1111-1111-1111111115b6",
        age: 530,
      },
      {
        name: "resume-b",
        choice: "sol-max",
        label: "resume: Scope: the lineage editing",
        pickSource: "resume",
        session: "01a113e0-2222-2222-2222-2222222214f5",
        age: 530,
      },
    ];
    rows.forEach((row) => {
      marker(
        dir,
        row.name,
        process.pid,
        row.label,
        row.age,
        SESSION,
        row.choice,
        row.pickSource,
      );
      writeFileSync(
        join(dir, "active", `${row.name}.progress.json`),
        progress("$ command", 2, row.session),
      );
    });

    const lines = (await render(dir))
      .split("\n")
      .filter((line) => /^(sonnet|sol)-/u.test(line));
    expect(lines).toHaveLength(3);
    expect(lines.some((line) => line.includes("8066..e1b6"))).toBe(true);
    expect(lines.some((line) => line.includes("01a1..15b6"))).toBe(true);
    expect(lines.some((line) => line.includes("01a1..14f5"))).toBe(true);
    expect(lines.every((line) => !line.includes("↻"))).toBe(true);
    expect(lines.filter((line) => line.includes("resume:")).length).toBe(2);
    expect(
      new Set(
        lines.map((line) => Bun.stringWidth(line.slice(0, line.indexOf("│")))),
      ).size,
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
    expect(out).toMatch(/^stale×1$/mu);
    expect(out).not.toMatch(/^luna-high .* killed/mu);
  });

  test("no agent-dispatch state on this machine: no Run row at all", async () => {
    const out = await render(join(scratch, "never"));
    expect(out).not.toContain("stale×");
    expect(out).not.toContain(" │ ");
  });
});
